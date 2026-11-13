import { getProduct } from "./catalog.js";
import { HttpError } from "./errors.js";

// Must match the icons in frontend/src/ProductArt.jsx and the .art--* classes in styles.css.
// products.test.js fails if these lists drift apart.
export const IMAGE_KEYS = Object.freeze([
  "headphones", "speaker", "earbuds", "laptop", "keyboard", "mouse", "watch", "tablet", "camera"
]);
export const ACCENTS = Object.freeze(["violet", "orange", "mint", "blue", "rose", "sand"]);

const TEXT_LIMITS = {
  name: 120, brand: 60, model: 60, serialNumber: 60, description: 2000, warrantyStatus: 40, distributor: 120
};
const NUMBER_RANGES = {
  stock: [0, 1_000_000], priceCents: [1, 100_000_000], warrantyMonths: [0, 120]
};
const MAX_COST_CENTS = 100_000_000;
const MAX_PRODUCT_NUMBER = 999; // Frontend and cart validation both require the p-NNN format.

function isWholeNumberInRange(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max;
}

// Reads only known fields, so id, popularity and deleted_at cannot be set by the client.
export function validateProductInput(db, body) {
  const input = {};
  const fields = {};

  for (const [field, max] of Object.entries(TEXT_LIMITS)) {
    input[field] = typeof body?.[field] === "string" ? body[field].trim() : "";
    if (!input[field]) fields[field] = `${field} is required.`;
    else if (input[field].length > max) fields[field] = `${field} must be at most ${max} characters.`;
  }
  for (const [field, [min, max]] of Object.entries(NUMBER_RANGES)) {
    input[field] = body?.[field];
    if (!isWholeNumberInRange(input[field], min, max)) {
      fields[field] = `${field} must be a whole number from ${min} to ${max}.`;
    }
  }

  // PDF item 11: the cost defaults to 50% of the sale price unless the manager gives one.
  input.costCents = body?.costCents ?? Math.floor(input.priceCents / 2);
  if (!fields.priceCents && !isWholeNumberInRange(input.costCents, 0, MAX_COST_CENTS)) {
    fields.costCents = `costCents must be a whole number from 0 to ${MAX_COST_CENTS}.`;
  }

  input.categorySlug = body?.categorySlug;
  const categoryExists = typeof input.categorySlug === "string" &&
    db.prepare("SELECT 1 FROM categories WHERE slug = ?").get(input.categorySlug);
  if (!categoryExists) fields.categorySlug = "Choose an existing category.";

  input.imageKey = body?.imageKey ?? IMAGE_KEYS[0];
  if (!IMAGE_KEYS.includes(input.imageKey)) fields.imageKey = `imageKey must be one of: ${IMAGE_KEYS.join(", ")}.`;
  input.accent = body?.accent ?? ACCENTS[0];
  if (!ACCENTS.includes(input.accent)) fields.accent = `accent must be one of: ${ACCENTS.join(", ")}.`;

  if (Object.keys(fields).length) throw new HttpError(400, "Please check the highlighted fields.", fields);
  return input;
}

// Removed products keep their row, so MAX() can never hand a used ID out again.
function nextProductId(db) {
  const { highest } = db.prepare("SELECT MAX(CAST(SUBSTR(id, 3) AS INTEGER)) AS highest FROM products").get();
  const next = (highest ?? 100) + 1;
  if (next > MAX_PRODUCT_NUMBER) throw new HttpError(409, "No product IDs are left.");
  return `p-${next}`;
}

export function createProduct(db, input) {
  try {
    // IMMEDIATE holds the write lock from reading the highest ID until the insert.
    const id = db.transaction(() => {
      const newId = nextProductId(db);
      db.prepare(`
        INSERT INTO products (id, category_slug, name, brand, model, serial_number, description, stock,
          price_cents, cost_cents, warranty_months, warranty_status, distributor, image_key, accent)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(newId, input.categorySlug, input.name, input.brand, input.model, input.serialNumber,
        input.description, input.stock, input.priceCents, input.costCents, input.warrantyMonths,
        input.warrantyStatus, input.distributor, input.imageKey, input.accent);
      return newId;
    }).immediate();
    // The public catalog never exposes cost, so it is added only for the manager who set it.
    return { ...getProduct(db, id), costCents: input.costCents };
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      throw new HttpError(409, "A product with this serial number already exists.", {
        serialNumber: "A product with this serial number already exists."
      });
    }
    throw error;
  }
}

// Returns false when there is nothing to remove, which also makes concurrent removals safe.
export function removeProduct(db, id) {
  const { changes } = db.prepare(`
    UPDATE products SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE id = ? AND deleted_at IS NULL
  `).run(id);
  return changes === 1;
}
