import "dotenv/config";
import { createDatabase } from "./db.js";
import { createApp } from "./app.js";
import { purgeExpiredSessions } from "./auth.js";
import { createSmtpInvoiceSender, startInvoiceEmailWorker } from "./invoiceEmail.js";
import { seedDemoUsers } from "./seed.js";

const db = createDatabase();
purgeExpiredSessions(db);
if (process.env.DEMO_USERS_PASSWORD) {
  const created = await seedDemoUsers(db, process.env.DEMO_USERS_PASSWORD);
  if (created) console.log(`Created ${created} demo users (see docs/SCRUM-13_TEAM_NOTES.md).`);
}

const port = Number(process.env.PORT || 4000);
const sendInvoice = createSmtpInvoiceSender();
let stopInvoiceEmails;
// Express 5 reports listen failures through this callback, so the error must be checked here.
const server = createApp(db).listen(port, (error) => {
  if (error) {
    console.error(error.code === "EADDRINUSE"
      ? `Port ${port} is already in use. Stop the other process or change PORT in backend/.env.`
      : `Could not start the API: ${error.message}`);
    db.close();
    process.exit(1);
  }
  if (sendInvoice) stopInvoiceEmails = startInvoiceEmailWorker(db, sendInvoice);
  console.log(`CS308 API running at http://localhost:${port}/api/health`);
});

function shutdown() {
  server.close(async () => {
    await stopInvoiceEmails?.();
    db.close();
    process.exit(0);
  });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
