import { readConfig } from "./config.js";
import { createApp } from "./app.js";

const config = readConfig(process.env);
const app = await createApp(config);

try {
  await app.listen({ host: "0.0.0.0", port: config.PORT });
  app.log.info(`server listening on ${config.PORT}`);
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}
