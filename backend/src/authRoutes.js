import { Router } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import {
  authenticate, createSession, deleteSession, normalizeEmail, purgeExpiredSessions,
  registerCustomer, validateLogin, validateRegistration
} from "./auth.js";
import { HttpError } from "./errors.js";
import { mergeGuestCart } from "./cartRoutes.js";
import { GUEST_CART_COOKIE, SESSION_COOKIE, requireAuth } from "./middleware.js";

export function createAuthRouter(db, { bcryptRounds, cookieSecure, loginLimit, registerLimit }) {
  const router = Router();
  const cookieOptions = { httpOnly: true, sameSite: "lax", secure: cookieSecure, path: "/" };

  // Failed attempts only, counted per IP + email: one person's typos cannot lock out others.
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: loginLimit,
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `${ipKeyGenerator(req.ip)}|${normalizeEmail(req.body?.email)}`,
    message: { error: "Too many sign-in attempts. Please try again later." }
  });
  const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: registerLimit,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many sign-up attempts. Please try again later." }
  });

  // A new token on every sign-in, and the old one is revoked, so a token planted
  // before login (session fixation) is never upgraded to a signed-in session.
  function startSession(req, res, userId) {
    const previous = req.cookies?.[SESSION_COOKIE];
    if (typeof previous === "string") deleteSession(db, previous);
    purgeExpiredSessions(db);
    mergeGuestCart(db, req, userId);
    if (req.cookies?.[GUEST_CART_COOKIE]) res.clearCookie(GUEST_CART_COOKIE, cookieOptions);
    const { token, expiresAt } = createSession(db, userId);
    res.cookie(SESSION_COOKIE, token, { ...cookieOptions, expires: new Date(expiresAt) });
  }

  router.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });

  router.post("/register", registerLimiter, async (req, res) => {
    const input = validateRegistration(req.body);
    const user = await registerCustomer(db, input, { rounds: bcryptRounds });
    startSession(req, res, user.id);
    res.status(201).json({ user });
  });

  router.post("/login", loginLimiter, async (req, res) => {
    const credentials = validateLogin(req.body);
    const user = await authenticate(db, credentials, { rounds: bcryptRounds });
    // One message for both cases, so the response does not reveal which emails are registered.
    if (!user) throw new HttpError(401, "Invalid email or password.");
    startSession(req, res, user.id);
    res.json({ user });
  });

  // Returns JSON rather than 204 because the frontend's fetchJson always parses the body.
  router.post("/logout", (req, res) => {
    const token = req.cookies?.[SESSION_COOKIE];
    if (typeof token === "string") deleteSession(db, token);
    res.clearCookie(SESSION_COOKIE, cookieOptions);
    res.json({ ok: true });
  });

  router.get("/me", requireAuth, (req, res) => {
    res.json({ user: req.user });
  });

  return router;
}
