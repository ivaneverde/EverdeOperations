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
  ATTACHMENT_MAX_EXCEL_ROWS: z.coerce
    .number()
    .int()
    .positive()
    .max(20_000)
    .default(10_000),
  CONVERSATION_FILE_MAX_CHARS_PER_FILE: z.coerce
    .number()
    .int()
    .positive()
    .max(8_000_000)
    .default(2_000_000),
  CONVERSATION_FILE_MAX_TOTAL_CHARS: z.coerce
    .number()
    .int()
    .positive()
    .max(16_000_000)
    .default(4_000_000),
  EVERDE_RETAIL_TOOL_MAX_CHARS: z.coerce
    .number()
    .int()
    .positive()
    .max(500_000)
    .default(120_000),
  AZURE_STORAGE_CONNECTION_STRING: z.string().optional(),
  AZURE_FREIGHT_BLOB_CONTAINER: z.string().optional(),
  AZURE_FREIGHT_DASHBOARD_JSON_BLOB: z.string().optional(),
  AZURE_SALES_PLAN_DASHBOARD_JSON_BLOB: z.string().optional(),
  AZURE_RETAIL_DASHBOARD_JSON_BLOB: z.string().optional(),
  AZURE_WEATHER_DASHBOARD_JSON_BLOB: z.string().optional(),
  AZURE_NURSERY_DEMAND_JSON_BLOB: z.string().optional(),
  AZURE_NURSERY_SUPPLY_JSON_BLOB: z.string().optional(),
  ENABLE_WEB_SEARCH: z
    .preprocess(
      (v) => (v === undefined || v === "" ? "1" : String(v)),
      z
        .enum(["0", "1", "true", "false"])
        .transform((v) => v !== "0" && v !== "false"),
    ),
  WEB_SEARCH_MAX_USES: z.coerce.number().int().positive().max(10).default(3),
  EVERDE_SNAPSHOT_CACHE_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(5 * 60 * 1000),
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
- Treat this chat as an ongoing discussion: remember stores, SKUs, retailers, and numbers already covered. Do not ask the user to restate prior context.

File analysis:
- Users may attach PDF, Excel (.xlsx/.xls), images, CSV, and text files in **group chats**, **channels**, and **1:1** personal chats.
- Cite specific numbers and trends from spreadsheets; state clearly when only a sample of rows was visible.
- .xlsb is not supported — suggest saving as .xlsx or PDF.

Everde data (always in context):
- You receive an **Everde data snapshot** each turn (freight, sales plan, HD/Lowe's YTD Following Week meta, nursery supply + demand, retail, weather when published). **Prefer this for all internal Everde metrics** — cite specific numbers from the snapshot or Everde tools.
- Follow-up turns may also include **Prior Everde tool results** from earlier in this chat (HD/Lowe's YTD samples, nursery supply queries, freight slices, etc.). Use them for continued discussion without asking the user to repeat filters.
- Use **get_freight_dashboard**, **get_sales_plan_dashboard**, **get_hd_ytd_following_week**, **get_lowes_ytd_following_week**, **get_nursery_supply**, **get_nursery_demand**, and other Everde tools for deeper drill-down when the snapshot or prior tool results are not enough.
- **Nursery Grade A/B farm inventory** (how many plants on hand) lives in **get_nursery_supply** (XXTT price list) — not HD/Lowe's YTD and **not** Production & Demand BO/CR dollars. When answering "how many do I have", use **graded_on_hand** (and available_to_sell). Negative **saleable_net** means oversold allocations in the price list — do **not** describe that as BO/CR. READY DATE on supply lines is the crop-ready date when present.
- Example supply queries: q="japanese boxwood 1g a b norcal socal" — report graded_on_hand by region/grade, then saleable/available, then readyDate.
- HD/Lowe's Following Week grids are huge — never invent store-level rows; call the YTD tools with focus=query and q= for filtered samples. On follow-ups about the same store/SKU, prefer prior tool results first; re-query only for a new filter or fresher sample.
- Do not invent company metrics, policies, or financial figures. If Blob data is missing, say so clearly.

Web search (on demand only):
- **Web search is only enabled when the user needs live public/external facts** (weather, news, current events, public benchmarks). Do not use web search for freight, sales plan, nursery, retail, or HD/Lowe's YTD questions — use Everde data instead.
- When web search is unavailable for a turn, explain that live web lookup was not triggered and offer Everde data or ask the user to rephrase with "search the web" if they need external info.

Everde context:
- This Teams app was built for Everde internal use; **created by Ivan Sunderland**. IT (Aaron) approves the app in Teams Admin Center.
- Do not invent company metrics, policies, or financial figures. If unsure, say so.`;
