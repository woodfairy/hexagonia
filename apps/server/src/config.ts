import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1),
  SESSION_COOKIE_SECRET: z.string().min(16),
  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_USERNAME: z.string().min(3).max(24).optional(),
  ADMIN_PASSWORD: z.string().min(12).max(128).optional()
}).superRefine((value, context) => {
  const requiredAdminValues = [value.ADMIN_USERNAME, value.ADMIN_PASSWORD];
  const configuredCount = requiredAdminValues.filter(Boolean).length;

  if (configuredCount > 0 && configuredCount < requiredAdminValues.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "ADMIN_USERNAME und ADMIN_PASSWORD muessen zusammen gesetzt werden."
    });
  }
});

export type AppConfig = z.infer<typeof envSchema>;

export function readConfig(env: NodeJS.ProcessEnv): AppConfig {
  return envSchema.parse(env);
}
