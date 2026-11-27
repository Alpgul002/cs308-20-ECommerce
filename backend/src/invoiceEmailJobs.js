import { HttpError } from "./errors.js";

export function addInvoiceEmailJobs(db) {
  db.exec(`
    CREATE TABLE invoice_email_jobs (
      order_id INTEGER PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
      recipient TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
      attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
      started_at INTEGER,
      sent_at TEXT,
      CHECK ((status = 'sending') = (started_at IS NOT NULL)),
      CHECK ((status = 'sent') = (sent_at IS NOT NULL))
    );
    CREATE INDEX idx_invoice_email_jobs_pending ON invoice_email_jobs(order_id) WHERE status = 'pending';
  `);
}

export function queueInvoiceEmail(db, orderId, userId) {
  db.prepare(`
    INSERT INTO invoice_email_jobs (order_id, recipient)
    SELECT ?, email FROM users WHERE id = ?
  `).run(orderId, userId);
}

export function getInvoiceEmailJob(db, orderId) {
  const job = db.prepare(`
    SELECT status, attempts, sent_at AS sentAt FROM invoice_email_jobs WHERE order_id = ?
  `).get(orderId);
  if (!job) throw new HttpError(404, "No invoice email was queued for this order.");
  return job;
}

export function retryInvoiceEmail(db, orderId) {
  const job = db.prepare(`
    UPDATE invoice_email_jobs SET status = 'pending'
    WHERE order_id = ? AND status = 'failed'
    RETURNING status, attempts, sent_at AS sentAt
  `).get(orderId);
  if (job) return job;
  getInvoiceEmailJob(db, orderId);
  throw new HttpError(409, "Only a failed invoice email can be retried.");
}

export function claimInvoiceEmail(db, now) {
  // An interrupted send has an unknown outcome. Wait for a manual retry after it expires.
  db.prepare(`
    UPDATE invoice_email_jobs SET status = 'failed', started_at = NULL
    WHERE status = 'sending' AND started_at <= ?
  `).run(now - 10 * 60 * 1000);
  return db.prepare(`
    UPDATE invoice_email_jobs SET status = 'sending', started_at = ?, attempts = attempts + 1
    WHERE order_id = (SELECT order_id FROM invoice_email_jobs WHERE status = 'pending' ORDER BY order_id LIMIT 1)
    RETURNING order_id AS orderId, recipient, attempts
  `).get(now);
}

export function finishInvoiceEmail(db, job, sentAt) {
  db.prepare(`
    UPDATE invoice_email_jobs SET status = ?, started_at = NULL, sent_at = ?
    WHERE order_id = ? AND status = 'sending' AND attempts = ?
  `).run(sentAt ? "sent" : "failed", sentAt, job.orderId, job.attempts);
}
