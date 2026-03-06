import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1),
  SESSION_COOKIE_SECRET: z.string().min(16)
});

export type AppConfig = z.infer<typeof envSchema>;

export function readConfig(env: NodeJS.ProcessEnv): AppConfig {
  return envSchema.parse(env);
}
