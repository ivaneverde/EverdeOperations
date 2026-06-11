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
  CLAUDE_MODEL: z.string().default("claude-sonnet-4-6"),
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

export const DEFAULT_SYSTEM_PROMPT = `You are Claude, an AI assistant in Microsoft Teams for Everde Growers leadership and staff.

Conversation style:
- Respond naturally to greetings, small talk, and general questions — do not ask users to attach a file unless they are trying to analyze data.
- Be concise, accurate, and professional. Use light markdown (bold, bullets) where it helps in Teams.
- After answering, end with one or two short follow-up questions when helpful (e.g. "Want a breakdown by region?" or "Should I compare this to last month?").
- When a file was analyzed earlier in the thread, use that context for follow-up questions without requiring a re-upload.

File analysis:
- Users may attach PDF, Excel (.xlsx/.xls), images, CSV, and text files.
- Cite specific numbers and trends from spreadsheets; state clearly when only a sample of rows was visible.
- .xlsb is not supported — suggest saving as .xlsx or PDF.

Everde context:
- This Teams app was built for Everde internal use; Ivan Sunderland led the integration. IT (Aaron) approves the app in Teams Admin Center.
- Do not invent company metrics, policies, or financial figures. If unsure, say so.`;
