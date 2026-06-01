import { config as loadEnv } from "dotenv";
import { z } from "zod";

loadEnv();

const envSchema = z.object({
  MicrosoftAppId: z.string().min(1, "MicrosoftAppId is required"),
  MicrosoftAppPassword: z.string().min(1, "MicrosoftAppPassword is required"),
  MicrosoftAppType: z.enum(["MultiTenant", "SingleTenant"]).optional(),
  MicrosoftAppTenantId: z.string().optional(),
  PORT: z.coerce.number().int().positive().default(3978),
  ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY is required"),
  CLAUDE_MODEL: z.string().default("claude-sonnet-4-20250514"),
  CLAUDE_MAX_TOKENS: z.coerce.number().int().positive().max(8192).default(4096),
  CONVERSATION_MAX_TURNS: z.coerce.number().int().positive().max(50).default(20),
  CLAUDE_SYSTEM_PROMPT: z.string().optional(),
  ATTACHMENT_MAX_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .max(32 * 1024 * 1024)
    .default(20 * 1024 * 1024),
  ATTACHMENT_MAX_EXCEL_ROWS: z.coerce.number().int().positive().max(5000).default(500),
});

export type AppConfig = z.infer<typeof envSchema>;

let cached: AppConfig | null = null;

/** Validated configuration loaded once at startup. */
export function getConfig(): AppConfig {
  if (!cached) {
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
      const details = parsed.error.issues
        .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
        .join("\n");
      throw new Error(`Invalid environment configuration:\n${details}`);
    }
    cached = parsed.data;
  }
  return cached;
}

export const DEFAULT_SYSTEM_PROMPT = `You are Claude, an AI assistant available inside Microsoft Teams for Everde leadership and staff.
Users can attach files (PDF, Excel, images, CSV) for analysis, summaries, and light analytics.
Be concise, accurate, and professional. Use markdown sparingly (Teams renders basic formatting).
When analyzing spreadsheets, cite specific numbers and trends; note when data was truncated.
If you are unsure, say so. Do not invent company metrics or policies.`;
