export const STORAGE_KEY = "cs308-orbit-cart-v1";
const MAX_QUANTITY = 20;

// Treat persisted browser storage as untrusted input.
export function normalizeCart(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value.filter((item) => {
    if (!item || typeof item.productId !== "string" ||
      !/^p-[0-9]{3}$/.test(item.productId) ||
      !Number.isInteger(item.quantity) || item.quantity < 1 ||
      item.quantity > MAX_QUANTITY || seen.has(item.productId)) return false;
    seen.add(item.productId);
    return true;
  }).map(({ productId, quantity }) => ({ productId, quantity }));
}

export function addItem(items, product) {
  if (!product || product.stock < 1) return items;
  const limit = Math.min(product.stock, MAX_QUANTITY);
  const existing = items.find((item) => item.productId === product.id);
  if (!existing) return [...items, { productId: product.id, quantity: 1 }];
  if (existing.quantity >= limit) return items;
  return items.map((item) => item.productId === product.id
    ? { ...item, quantity: item.quantity + 1 } : item);
}

export function setItemQuantity(items, productId, quantity, stock = MAX_QUANTITY) {
  if (!Number.isInteger(quantity)) return items;
  if (quantity <= 0) return removeItem(items, productId);
  if (stock < 1) return items;
  const next = Math.min(quantity, stock, MAX_QUANTITY);
  return items.map((item) => item.productId === productId ? { ...item, quantity: next } : item);
}

export function removeItem(items, productId) {
  return items.filter((item) => item.productId !== productId);
}

export function countItems(items) {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}

export function subtotalCents(items, productsById) {
  return items.reduce((sum, item) => sum +
    (productsById[item.productId]?.priceCents ?? 0) * item.quantity, 0);
}

export function formatPrice(cents) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
