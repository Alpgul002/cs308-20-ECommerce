import { createHash, randomBytes } from "node:crypto";
import { Router } from "express";
import { getProduct, isValidCartInput } from "./catalog.js";
import { HttpError } from "./errors.js";

import { GUEST_CART_COOKIE } from "./middleware.js";
const hash = (token) => createHash("sha256").update(token).digest("hex");

function guestCart(db, req) {
  const token = req.cookies?.[GUEST_CART_COOKIE];
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) return null;
  return db.prepare("SELECT id FROM carts WHERE guest_hash = ?").get(hash(token));
}

function accountCart(db, userId) {
  return db.prepare("SELECT id FROM carts WHERE user_id = ?").get(userId);
}

function createAccountCart(db, userId) {
  return accountCart(db, userId) ?? {
    id: db.prepare("INSERT INTO carts (user_id) VALUES (?)").run(userId).lastInsertRowid
  };
}

function cartItems(db, cart) {
  if (!cart) return [];
  return db.prepare(`
    SELECT product_id AS productId, quantity FROM cart_items WHERE cart_id = ? ORDER BY rowid
  `).all(cart.id);
}

function importItems(db, cart, items) {
  const current = new Map(cartItems(db, cart).map((line) => [line.productId, line.quantity]));
  const upsert = db.prepare(`
    INSERT INTO cart_items (cart_id, product_id, quantity) VALUES (?, ?, ?)
    ON CONFLICT (cart_id, product_id) DO UPDATE SET quantity = excluded.quantity
  `);
  for (const { productId, quantity } of items) {
    const existing = current.get(productId);
    const product = getProduct(db, productId);
    if (!product || (!existing && current.size >= 40)) continue;
    const available = Math.min(20, product.stock, quantity);
    if (available > (existing ?? 0)) {
      upsert.run(cart.id, productId, available);
      current.set(productId, available);
    }
  }
}

export function mergeGuestCart(db, req, userId) {
  return db.transaction(() => {
    const guest = guestCart(db, req);
    if (!guest) return [];
    const guestItems = cartItems(db, guest);
    if (guestItems.length === 0) {
      db.prepare("DELETE FROM carts WHERE id = ?").run(guest.id);
      return [];
    }

    const account = accountCart(db, userId);
    const destination = account ?? guest;
    const existing = new Map(cartItems(db, destination).map(({ productId, quantity }) => [productId, quantity]));
    // Keep account lines ahead of guest-only lines when the combined bag is full.
    const requested = account ? new Map(existing) : new Map();
    for (const { productId, quantity } of guestItems) {
      requested.set(productId, (requested.get(productId) ?? 0) + quantity);
    }

    const findProduct = db.prepare("SELECT name, stock, deleted_at FROM products WHERE id = ?");
    const remove = db.prepare("DELETE FROM cart_items WHERE cart_id = ? AND product_id = ?");
    const upsert = db.prepare(`
      INSERT INTO cart_items (cart_id, product_id, quantity) VALUES (?, ?, ?)
      ON CONFLICT (cart_id, product_id) DO UPDATE SET quantity = excluded.quantity
    `);
    const adjustments = [];
    let kept = 0;
    for (const [productId, requestedQuantity] of requested) {
      const product = findProduct.get(productId);
      const unavailable = !product || product.deleted_at !== null;
      let quantity = unavailable ? 0 : Math.min(requestedQuantity, product.stock, 20);
      const bagFull = quantity > 0 && kept >= 40;
      if (bagFull) quantity = 0;

      if (quantity === 0) {
        remove.run(destination.id, productId);
      } else {
        if (existing.get(productId) !== quantity) upsert.run(destination.id, productId, quantity);
        kept += 1;
      }
      if (quantity < requestedQuantity) {
        let reason = "stock";
        if (unavailable) reason = "removed";
        else if (bagFull) reason = "bag_limit";
        else if (quantity === 20) reason = "item_limit";
        adjustments.push({ productId, name: product?.name ?? productId, requestedQuantity, quantity, reason });
      }
    }

    if (account) {
      db.prepare("DELETE FROM carts WHERE id = ?").run(guest.id);
    } else {
      db.prepare("UPDATE carts SET user_id = ?, guest_hash = NULL WHERE id = ?").run(userId, guest.id);
    }
    return adjustments;
  }).immediate();
}

export function createCartRouter(db, cookieSecure) {
  const router = Router();
  const cookieOptions = { httpOnly: true, sameSite: "lax", secure: cookieSecure, path: "/", maxAge: 30 * 86400000 };
  const findCart = (req) => req.user ? accountCart(db, req.user.id) : guestCart(db, req);

  function mutate(req, res, update) {
    let token;
    const items = db.transaction(() => {
      let cart = findCart(req);
      if (!cart && req.user) cart = createAccountCart(db, req.user.id);
      if (!cart) {
        token = randomBytes(32).toString("hex");
        cart = { id: db.prepare("INSERT INTO carts (guest_hash) VALUES (?)").run(hash(token)).lastInsertRowid };
      }
      update(cart);
      return cartItems(db, cart);
    }).immediate();
    if (token) res.cookie(GUEST_CART_COOKIE, token, cookieOptions);
    res.json({ items });
  }

  router.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });

  router.get("/", (req, res) => res.json({ items: cartItems(db, findCart(req)) }));

  router.post("/import", (req, res) => {
    if (!isValidCartInput(req.body?.items)) throw new HttpError(400, "Invalid cart items.");
    mutate(req, res, (cart) => importItems(db, cart, req.body.items));
  });

  router.put("/items/:productId", (req, res) => {
    const { productId } = req.params;
    const quantity = req.body?.quantity;
    if (!isValidCartInput([{ productId, quantity }])) throw new HttpError(400, "Invalid cart quantity.");
    mutate(req, res, (cart) => {
      const product = getProduct(db, productId);
      if (!product) throw new HttpError(404, "Product not found.");
      if (quantity > product.stock) throw new HttpError(409, "The requested quantity is unavailable.");
      const items = cartItems(db, cart);
      if (items.length >= 40 && !items.some((item) => item.productId === productId)) {
        throw new HttpError(409, "Your bag can hold up to 40 distinct products.");
      }
      db.prepare(`
        INSERT INTO cart_items (cart_id, product_id, quantity) VALUES (?, ?, ?)
        ON CONFLICT (cart_id, product_id) DO UPDATE SET quantity = excluded.quantity
      `).run(cart.id, productId, quantity);
    });
  });

  router.delete("/items/:productId", (req, res) => {
    const cart = findCart(req);
    if (!cart) return res.json({ items: [] });
    db.prepare("DELETE FROM cart_items WHERE cart_id = ? AND product_id = ?").run(cart.id, req.params.productId);
    res.json({ items: cartItems(db, cart) });
  });

  return router;
}
