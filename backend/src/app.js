import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { DEFAULT_BCRYPT_ROUNDS } from "./auth.js";
import { createAuthRouter } from "./authRoutes.js";
import { HttpError } from "./errors.js";
import { loadSession, rejectForeignOrigins } from "./middleware.js";
import { createProductAdminRouter } from "./productAdminRoutes.js";
import { getCategories, getProduct, getProducts, isValidCartInput, validateCart } from "./catalog.js";
import { parseCatalogFilters } from "./catalogFilters.js";

const DEFAULT_ORIGINS = "http://localhost:5173,http://127.0.0.1:5173";

export function parseOrigins(value) {
  return (value || DEFAULT_ORIGINS).split(",").map((origin) => origin.trim()).filter(Boolean);
}

export function createApp(db, options = {}) {
  const {
    allowedOrigins = parseOrigins(process.env.CORS_ORIGIN),
    cookieSecure = process.env.NODE_ENV === "production",
    bcryptRounds = DEFAULT_BCRYPT_ROUNDS,
    loginLimit = 10,
    registerLimit = 30
  } = options;

  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  // credentials: true lets a browser send the session cookie to an allowed origin.
  app.use(cors({ origin: allowedOrigins, credentials: true }));
  app.use(cookieParser());
  app.use(rejectForeignOrigins(allowedOrigins));
  app.use(express.json({ limit: "32kb" }));
  app.use(loadSession(db));

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", service: "cs308-store-api" });
  });

  app.use("/api/auth", createAuthRouter(db, { bcryptRounds, cookieSecure, loginLimit, registerLimit }));

  app.get("/api/categories", (_req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({ categories: getCategories(db) });
  });

  app.get("/api/products", (req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({ products: getProducts(db, parseCatalogFilters(req.query)) });
  });

  app.get("/api/products/:id", (req, res) => {
    res.set("Cache-Control", "no-store");
    const product = getProduct(db, req.params.id);
    if (!product) return res.status(404).json({ error: "Product not found" });
    res.json({ product });
  });

  app.use("/api/products", createProductAdminRouter(db));

  app.post("/api/cart/validate", (req, res) => {
    if (!isValidCartInput(req.body?.items)) {
      return res.status(400).json({ error: "Invalid cart. Use distinct product IDs and quantities from 1 to 20." });
    }
    res.json(validateCart(db, req.body.items));
  });

  app.use((_req, res) => res.status(404).json({ error: "Route not found" }));
  app.use((err, _req, res, _next) => {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: err.message, ...(err.fields && { fields: err.fields }) });
    }
    if (err?.type === "entity.parse.failed") return res.status(400).json({ error: "Malformed JSON" });
    // Body-parser rejections (too large, bad charset...) are client errors, not crashes.
    if (err?.expose && err.status >= 400 && err.status < 500) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: "Unexpected server error" });
  });
  return app;
}
