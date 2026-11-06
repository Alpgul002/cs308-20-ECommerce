import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { HttpError } from "./errors.js";

export const ROLES = Object.freeze({
  CUSTOMER: "customer",
  SALES_MANAGER: "sales_manager",
  PRODUCT_MANAGER: "product_manager",
  SUPPORT_AGENT: "support_agent"
});

export const DEFAULT_BCRYPT_ROUNDS = 12;
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const MAX_PASSWORD_BYTES = 72; // bcrypt ignores everything after 72 bytes.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/; // Same rule as frontend/src/LoginPage.jsx.
const TAX_ID_PATTERN = /^[0-9]{10,11}$/;
const USER_COLUMNS = "id, name, email, role, home_address";

const cleanText = (value) => (typeof value === "string" ? value.trim() : "");

export function normalizeEmail(value) {
  return cleanText(value).toLowerCase();
}

function emailProblem(email) {
  if (!email) return "Email is required.";
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) return "Enter a valid email address.";
  return null;
}

function failIfInvalid(fields) {
  if (Object.keys(fields).length) throw new HttpError(400, "Please check the highlighted fields.", fields);
}

export function validateLogin(body) {
  const email = normalizeEmail(body?.email);
  const password = body?.password;
  const fields = {};
  const problem = emailProblem(email);
  if (problem) fields.email = problem;
  if (typeof password !== "string" || !password) fields.password = "Password is required.";
  failIfInvalid(fields);
  return { email, password };
}

// The role is deliberately not read from the request: public sign-up only creates customers.
export function validateRegistration(body) {
  const email = normalizeEmail(body?.email);
  const name = cleanText(body?.name);
  const taxId = cleanText(body?.taxId);
  const homeAddress = cleanText(body?.homeAddress);
  const password = body?.password;
  const fields = {};
  const problem = emailProblem(email);
  if (problem) fields.email = problem;
  if (name.length < 2 || name.length > 100) fields.name = "Enter your full name.";
  if (!TAX_ID_PATTERN.test(taxId)) fields.taxId = "Tax ID must contain 10 or 11 digits.";
  if (homeAddress.length < 5 || homeAddress.length > 300) fields.homeAddress = "Enter your home address.";
  if (typeof password !== "string" || password.length < 8) {
    fields.password = "Password must contain at least 8 characters.";
  } else if (Buffer.byteLength(password) > MAX_PASSWORD_BYTES) {
    fields.password = `Password must be at most ${MAX_PASSWORD_BYTES} bytes long.`;
  }
  failIfInvalid(fields);
  return { name, email, password, taxId, homeAddress };
}

export function hashPassword(password, rounds = DEFAULT_BCRYPT_ROUNDS) {
  return bcrypt.hash(password, rounds);
}

// Never add password_hash or tax_id here: this object is sent to the browser.
function toPublicUser(row) {
  return { id: row.id, name: row.name, email: row.email, role: row.role, homeAddress: row.home_address };
}

export function getUserById(db, id) {
  const row = db.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`).get(id);
  return row ? toPublicUser(row) : null;
}

export async function registerCustomer(db, input, { rounds } = {}) {
  const passwordHash = await hashPassword(input.password, rounds);
  try {
    const { lastInsertRowid } = db.prepare(`
      INSERT INTO users (name, email, tax_id, home_address, password_hash, role)
      VALUES (?, ?, ?, ?, ?, '${ROLES.CUSTOMER}')
    `).run(input.name, input.email, input.taxId, input.homeAddress, passwordHash);
    return getUserById(db, lastInsertRowid);
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      throw new HttpError(409, "An account with this email already exists.", {
        email: "An account with this email already exists."
      });
    }
    throw error;
  }
}

const dummyHashes = new Map();
function dummyHash(rounds) {
  if (!dummyHashes.has(rounds)) dummyHashes.set(rounds, hashPassword("no-account-has-this-password", rounds));
  return dummyHashes.get(rounds);
}

export async function authenticate(db, { email, password }, { rounds = DEFAULT_BCRYPT_ROUNDS } = {}) {
  const row = db.prepare(`SELECT ${USER_COLUMNS}, password_hash FROM users WHERE email = ?`).get(email);
  // Compare even for unknown emails, so response time does not reveal which accounts exist.
  const matches = await bcrypt.compare(password, row?.password_hash ?? await dummyHash(rounds));
  const withinLimit = Buffer.byteLength(password) <= MAX_PASSWORD_BYTES;
  return row && matches && withinLimit ? toPublicUser(row) : null;
}

export function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

export function createSession(db, userId, now = Date.now()) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = now + SESSION_TTL_MS;
  db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
    .run(hashToken(token), userId, expiresAt);
  return { token, expiresAt };
}

// Reads the user fresh on every request, so a role change or deletion applies immediately.
export function getSessionUser(db, token, now = Date.now()) {
  const row = db.prepare(`
    SELECT u.id, u.name, u.email, u.role, u.home_address
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ?
  `).get(hashToken(token), now);
  return row ? toPublicUser(row) : null;
}

export function deleteSession(db, token) {
  db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
}

export function purgeExpiredSessions(db, now = Date.now()) {
  return db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(now).changes;
}
