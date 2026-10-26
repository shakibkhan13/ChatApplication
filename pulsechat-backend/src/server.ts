
import { createServer } from "node:http";
import { app } from "./app";
import { env } from "./config/env";
import { pool } from "./config/database";
import { redis } from "./config/redis";
import { initSocket } from "./sockets";

async function main() {
  await pool.query("SELECT 1");
  await redis.connect();

  const httpServer = createServer(app);
  initSocket(httpServer);

  httpServer.listen(env.PORT, () => {
    console.log(`PulseChat API running on port ${env.PORT}`);
  });

  const shutdown = async () => {
    httpServer.close(async () => {
      await redis.quit();
      await pool.end();
      process.exit(0);
    });
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((error) => {
  console.error("Server startup failed", error);
  process.exit(1);
});
