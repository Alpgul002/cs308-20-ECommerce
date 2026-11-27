import { ROLES, getSessionUser } from "./auth.js";

export const SESSION_COOKIE = "orbit_session";
export const GUEST_CART_COOKIE = "orbit_guest_cart";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function loadSession(db) {
  return (req, _res, next) => {
    const token = req.cookies?.[SESSION_COOKIE];
    req.user = typeof token === "string" ? getSessionUser(db, token) : null;
    next();
  };
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Please sign in to continue." });
  next();
}

// Usage: app.post("/api/x", requireRole(ROLES.PRODUCT_MANAGER), handler)
export function requireRole(...roles) {
  const known = Object.values(ROLES);
  for (const role of roles) {
    // A typo here would otherwise lock everyone out without any error.
    if (!known.includes(role)) throw new Error(`Unknown role: ${role}`);
  }
  return [requireAuth, (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "You do not have permission to do this." });
    }
    next();
  }];
}

// CSRF defence in depth, on top of the SameSite=Lax cookie: a state-changing request that
// carries a session cookie must come from one of our own origins. This also protects persisted guest carts.
export function rejectForeignOrigins(allowedOrigins) {
  return (req, res, next) => {
    const origin = req.get("origin");
    const hasProtectedCookie = Boolean(req.cookies?.[SESSION_COOKIE] || req.cookies?.[GUEST_CART_COOKIE]);
    if (SAFE_METHODS.has(req.method) || !hasProtectedCookie || !origin || allowedOrigins.includes(origin)) return next();
    res.status(403).json({ error: "Request blocked: unknown origin." });
  };
}
