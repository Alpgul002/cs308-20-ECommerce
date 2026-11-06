import { Router } from "express";
import { ROLES } from "./auth.js";
import { HttpError } from "./errors.js";
import { requireRole } from "./middleware.js";
import { createProduct, removeProduct, validateProductInput } from "./productAdmin.js";

// PDF item 12: adding and removing products belongs to the product manager alone.
export function createProductAdminRouter(db) {
  const router = Router();
  const productManagerOnly = requireRole(ROLES.PRODUCT_MANAGER);

  router.post("/", productManagerOnly, (req, res) => {
    const product = createProduct(db, validateProductInput(db, req.body));
    res.status(201).location(`/api/products/${product.id}`).json({ product });
  });

  // Returns JSON rather than 204 because the frontend's fetchJson always parses the body.
  router.delete("/:id", productManagerOnly, (req, res) => {
    if (!removeProduct(db, req.params.id)) throw new HttpError(404, "Product not found");
    res.json({ deleted: true, id: req.params.id });
  });

  return router;
}
