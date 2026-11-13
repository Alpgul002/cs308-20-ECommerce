import { ROLES, hashPassword } from "./auth.js";

// Fake demo content only. Runs once, from the first migration.
const categories = [
  ["audio", "Audio"],
  ["computing", "Computing"],
  ["wearables", "Wearables"],
  ["photography", "Photography"]
];

// All money amounts are stored as integer cents to avoid floating-point errors.
const products = [
  ["p-101", "audio", "Studio Headphones", "Sonic", "SH-100", "AUD-100-2026", "Wireless over-ear headphones with active noise cancellation and 40-hour battery life.", 17, 12999, 24, "Active", "Sonic Electronics Distribution", 99, "headphones", "violet"],
  ["p-102", "audio", "Pocket Speaker", "Wave", "WP-20", "AUD-200-2026", "Portable Bluetooth speaker with rich stereo sound, water resistance, and USB-C charging.", 34, 8999, 12, "Active", "Wave Technology Partners", 82, "speaker", "orange"],
  ["p-103", "audio", "Wireless Earbuds", "Sonic", "SE-2", "AUD-300-2026", "Comfortable wireless earbuds with charging case, touch controls, and clear calls.", 26, 7999, 12, "Active", "Sonic Electronics Distribution", 94, "earbuds", "mint"],
  ["p-104", "computing", "Ultrabook 14", "Core", "UB-14", "CMP-100-2026", "Lightweight 14-inch laptop for everyday work, creative projects, and learning.", 8, 109900, 24, "Active", "Core Computer Systems", 95, "laptop", "blue"],
  ["p-105", "computing", "Mechanical Keyboard", "Keylab", "MK-75", "CMP-200-2026", "Compact mechanical keyboard with tactile switches and a durable aluminum frame.", 16, 13999, 24, "Active", "Keylab Accessories", 75, "keyboard", "rose"],
  ["p-106", "computing", "Precision Mouse", "Keylab", "PM-6", "CMP-300-2026", "Ergonomic wireless mouse with adjustable sensitivity and silent buttons.", 42, 5499, 12, "Active", "Keylab Accessories", 65, "mouse", "sand"],
  ["p-107", "wearables", "Pulse Smartwatch", "Forma", "PS-4", "WRB-100-2026", "Everyday smartwatch with workout tracking, notifications, and long battery life.", 11, 17999, 24, "Active", "Forma Wearables", 88, "watch", "mint"],
  ["p-108", "wearables", "Creative Tablet", "Forma", "CT-11", "WRB-200-2026", "Slim touchscreen tablet for drawing, note-taking, and entertainment.", 5, 42999, 12, "Active", "Forma Wearables", 79, "tablet", "violet"],
  ["p-109", "photography", "Mirrorless Camera", "Optic", "MC-50", "PHT-100-2026", "Compact mirrorless camera with interchangeable lenses and 4K video recording.", 0, 84999, 24, "Active", "Optic Imaging Distribution", 91, "camera", "orange"]
];

export function seedCatalog(db) {
  const insertCategory = db.prepare("INSERT OR IGNORE INTO categories (slug, name) VALUES (?, ?)");
  const insertProduct = db.prepare(`
    INSERT INTO products (id, category_slug, name, brand, model, serial_number,
      description, stock, price_cents, warranty_months, warranty_status,
      distributor, popularity, image_key, accent)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const category of categories) insertCategory.run(...category);
  for (const product of products) insertProduct.run(...product);
}

const demoUsers = [
  { name: "Demo Customer", email: "customer@orbit.test", role: ROLES.CUSTOMER, taxId: "1234567890", homeAddress: "Orta Mah. Universite Cad. 27, Tuzla, Istanbul" },
  { name: "Demo Sales Manager", email: "sales@orbit.test", role: ROLES.SALES_MANAGER },
  { name: "Demo Product Manager", email: "product@orbit.test", role: ROLES.PRODUCT_MANAGER },
  { name: "Demo Support Agent", email: "support@orbit.test", role: ROLES.SUPPORT_AGENT }
];

// Staff cannot sign up publicly, so local development needs one account per role. The password
// comes from backend/.env (DEMO_USERS_PASSWORD), so no credential is ever committed to the repo.
export async function seedDemoUsers(db, password, { rounds } = {}) {
  if (process.env.NODE_ENV === "production") throw new Error("Demo users must not be created in production.");
  if (password.length < 8) throw new Error("DEMO_USERS_PASSWORD must contain at least 8 characters.");
  const exists = db.prepare("SELECT 1 FROM users WHERE email = ?");
  const insert = db.prepare(`
    INSERT INTO users (name, email, tax_id, home_address, password_hash, role) VALUES (?, ?, ?, ?, ?, ?)
  `);
  let created = 0;
  for (const user of demoUsers) {
    if (exists.get(user.email)) continue;
    const hash = await hashPassword(password, rounds);
    insert.run(user.name, user.email, user.taxId ?? null, user.homeAddress ?? null, hash, user.role);
    created += 1;
  }
  return created;
}
