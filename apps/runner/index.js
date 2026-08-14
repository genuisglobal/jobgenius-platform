import dotenv from "dotenv";

dotenv.config();

const { startWorker } = await import("./worker.js");

startWorker().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(`[runner] fatal startup error\n${message}`);
  process.exit(1);
});
