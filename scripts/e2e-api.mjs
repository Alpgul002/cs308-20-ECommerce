import { createDatabase } from "../backend/src/db.js";
import { createApp } from "../backend/src/app.js";
const db = createDatabase(process.env.E2E_DB_FILE);
const server = createApp(db, { allowedOrigins: ["http://127.0.0.1:5174"], cookieSecure: false, bcryptRounds: 4 }).listen(4001, "127.0.0.1");
function stop() { server.close(() => { db.close(); process.exit(0); }); }
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
