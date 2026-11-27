import nodemailer from "nodemailer";
import { invoiceForOrder } from "./invoice.js";
import { claimInvoiceEmail, finishInvoiceEmail } from "./invoiceEmailJobs.js";
import { renderInvoicePdf } from "./invoicePdf.js";
import { getOrder } from "./orders.js";

export function createSmtpInvoiceSender(env = process.env) {
  if (!env.SMTP_HOST?.trim()) return null;
  const port = Number(env.SMTP_PORT || 587);
  if (!Number.isInteger(port) || port < 1 || port > 65535 || !env.SMTP_FROM?.trim() ||
      Boolean(env.SMTP_USER) !== Boolean(env.SMTP_PASSWORD)) {
    throw new Error("Configure SMTP_PORT, SMTP_FROM and both SMTP authentication fields if needed.");
  }
  const secure = env.SMTP_SECURE === undefined ? port === 465 : env.SMTP_SECURE === "true";
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST.trim(),
    port,
    secure,
    requireTLS: !secure && env.SMTP_REQUIRE_TLS !== "false",
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
    disableFileAccess: true,
    disableUrlAccess: true
  });
  return ({ recipient, number, orderId, pdf }) => transport.sendMail({
    from: env.SMTP_FROM,
    to: { address: recipient, name: "" },
    subject: `Orbit Store invoice ${number}`,
    text: `Your PDF invoice for order #${orderId} is attached.`,
    attachments: [{ filename: `${number}.pdf`, content: pdf, contentType: "application/pdf" }]
  });
}

export async function sendNextInvoiceEmail(db, send) {
  const job = claimInvoiceEmail(db, Date.now());
  if (!job) return false;
  let sentAt = null;
  try {
    const invoice = invoiceForOrder(db, getOrder(db, job.orderId)?.order);
    const pdf = await renderInvoicePdf(invoice);
    await send({ recipient: job.recipient, number: invoice.number, orderId: job.orderId, pdf });
    sentAt = new Date().toISOString();
  } catch {
    // Keep provider replies and recipient data out of API errors and server logs.
  }
  finishInvoiceEmail(db, job, sentAt);
  return true;
}

export function startInvoiceEmailWorker(db, send) {
  let current;
  const poll = () => {
    if (current) return;
    current = sendNextInvoiceEmail(db, send)
      .catch(() => console.error("Could not process the invoice email queue."))
      .finally(() => { current = null; });
  };
  const timer = setInterval(poll, 1000);
  poll();
  return async () => {
    clearInterval(timer);
    await current;
  };
}
