import "dotenv/config";
import { createDatabase } from "./db.js";
import { createApp } from "./app.js";

const db = createDatabase();
const port = Number(process.env.PORT || 4000);
const server = createApp(db).listen(port, () => {
  console.log(`CS308 API running at http://localhost:${port}/api/health`);
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
