import { readConfig } from "./config";
import { createApp } from "./app";

const config = readConfig(process.env);
const app = await createApp(config);

try {
  await app.listen({ host: "0.0.0.0", port: config.PORT });
  app.log.info(`server listening on ${config.PORT}`);
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}
