export const SORT_OPTIONS = Object.freeze({
  popular: "p.popularity DESC, p.name ASC",
  "price-asc": "p.price_cents ASC, p.name ASC",
  "price-desc": "p.price_cents DESC, p.name ASC",
  name: "p.name COLLATE NOCASE ASC"
});

const selectProducts = `
  SELECT p.id, p.name, p.brand, p.model,
         p.serial_number AS serialNumber,
         p.description, p.stock, p.price_cents AS priceCents,
         p.warranty_months AS warrantyMonths,
         p.warranty_status AS warrantyStatus,
         p.distributor, p.popularity,
         p.image_key AS imageKey, p.accent,
         c.slug AS categorySlug, c.name AS categoryName
  FROM products p
  JOIN categories c ON c.slug = p.category_slug
`;

export function getCategories(db) {
  return db.prepare(`
    SELECT c.slug, c.name, COUNT(p.id) AS productCount
    FROM categories c
    LEFT JOIN products p ON p.category_slug = c.slug AND p.deleted_at IS NULL
    GROUP BY c.slug, c.name
    ORDER BY c.name
  `).all();
}

// SQL values are bound parameters. Sorting is a fixed allowlist, never user SQL.
export function getProducts(db, { search = "", category = "all", sort = "popular", minPriceCents, maxPriceCents, inStock = false } = {}) {
  if (!Object.hasOwn(SORT_OPTIONS, sort)) throw new RangeError("Invalid sort option");
  const where = ["p.deleted_at IS NULL"];
  const params = [];
  if (category !== "all") {
    where.push("c.slug = ?");
    params.push(category);
  }
  if (search.trim()) {
    // Users search for literal text, so LIKE wildcards in their input must not match everything.
    const pattern = `%${search.trim().replace(/[!%_]/g, "!$&")}%`;
    where.push("(p.name LIKE ? ESCAPE '!' OR p.description LIKE ? ESCAPE '!')");
    params.push(pattern, pattern);
  }
  if (minPriceCents !== undefined) { where.push("p.price_cents >= ?"); params.push(minPriceCents); }
  if (maxPriceCents !== undefined) { where.push("p.price_cents <= ?"); params.push(maxPriceCents); }
  if (inStock) where.push("p.stock > 0");
  // Return the entire matching set; filtering and sorting happen in SQLite.
  return db.prepare(`${selectProducts} WHERE ${where.join(" AND ")} ORDER BY ${SORT_OPTIONS[sort]}`).all(...params);
}

export function getProduct(db, id) {
  return db.prepare(`${selectProducts} WHERE p.deleted_at IS NULL AND p.id = ?`).get(id) ?? null;
}

// Quotes do not place an order, reserve stock, or process payment.
export function validateCart(db, items) {
  const result = items.map(({ productId, quantity }) => {
    const product = getProduct(db, productId);
    if (!product) {
      return { productId, quantity, available: false, reason: "Product not found", unitPriceCents: null, lineTotalCents: 0 };
    }
    const available = product.stock >= quantity;
    return {
      productId,
      name: product.name,
      quantity,
      stock: product.stock,
      available,
      reason: available ? null : product.stock === 0 ? "Out of stock" : "Insufficient stock",
      unitPriceCents: product.priceCents,
      lineTotalCents: product.priceCents * quantity
    };
  });
  return {
    valid: result.every((line) => line.available),
    items: result,
    subtotalCents: result.reduce((total, line) => total + line.lineTotalCents, 0),
    currency: "USD"
  };
}

export function isValidCartInput(items) {
  if (!Array.isArray(items) || items.length > 40) return false;
  const seen = new Set();
  for (const item of items) {
    if (!item || typeof item.productId !== "string" || !/^p-[0-9]{3}$/.test(item.productId) ||
      !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 20 ||
      seen.has(item.productId)) return false;
    seen.add(item.productId);
  }
  return true;
}
