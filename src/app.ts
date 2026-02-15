import startServer from "./server.js";

import { Logger, LogLevel } from "./utils/index.js";

const logLevel = process.env.LOG_LEVEL || "INFO";
Logger.setLogLevel(LogLevel[logLevel as keyof typeof LogLevel] || LogLevel.INFO);
const logger = new Logger("app:server-initializer");
(() => {
  try {
    logger.info("server starting...");
    startServer();
  } catch (e) {
    if (e instanceof Error) {
      logger.error("Error starting server:", { message: e.message, stack: e.stack });
    } else {
      logger.error("Error starting server:", e);
    }
    process.exit(1);
  }
})();
