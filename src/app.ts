import startServer from "./server.js";

import { Logger } from "./utils/index.js";

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
