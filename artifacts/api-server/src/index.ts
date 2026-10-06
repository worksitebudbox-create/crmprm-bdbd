import "dotenv/config";
import app from "./app";
import { logger } from "./lib/logger";
import { startNovaPoshtaTracking } from "./lib/nova-poshta-tracking";
import { ensureCrmAccessSchema } from "./lib/crm-access-schema";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

void ensureCrmAccessSchema().then(() => {
  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
    startNovaPoshtaTracking();
  });
}).catch((err: unknown) => {
  logger.error({ err }, "Failed to initialize CRM access tables");
  process.exit(1);
});
