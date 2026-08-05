/**
 * Teams bot profiles — one Azure App Service, three visual Teams bots.
 * - full  → "Claude" (ops: freight, weather, HD+Lowes, nursery, …)
 * - hd    → "Everde HD" (Home Depot key-account + farm inventory)
 * - lowes → "Everde Lowes" (Lowe's key-account + farm inventory)
 */

export type BotProfile = "full" | "hd" | "lowes";

export type BotProfileConfig = {
  id: BotProfile;
  displayName: string;
  shortName: string;
  /** Snapshot / tool datasets this profile may load */
  datasets: {
    freight: boolean;
    salesPlan: boolean;
    hdYtd: boolean;
    lowesYtd: boolean;
    retail: boolean;
    weather: boolean;
    nurserySupply: boolean;
    nurseryDemand: boolean;
  };
  /** Tool names allowed (in addition to catalog/grades when nursery on) */
  tools: Set<string>;
  enableWebSearch: boolean;
};

const KEY_ACCOUNT_TOOLS = new Set([
  "get_portal_catalog",
  "get_grade_definitions",
  "get_nursery_supply",
  "get_nursery_demand",
]);

export const BOT_PROFILES: Record<BotProfile, BotProfileConfig> = {
  full: {
    id: "full",
    displayName: "Claude",
    shortName: "Claude",
    datasets: {
      freight: true,
      salesPlan: true,
      hdYtd: true,
      lowesYtd: true,
      retail: true,
      weather: true,
      nurserySupply: true,
      nurseryDemand: true,
    },
    tools: new Set([
      "get_freight_dashboard",
      "get_sales_plan_dashboard",
      "get_hd_ytd_following_week",
      "get_lowes_ytd_following_week",
      "get_retail_opportunity",
      "get_weather_dashboard",
      "get_nursery_supply",
      "get_nursery_demand",
      "get_portal_catalog",
      "get_grade_definitions",
    ]),
    enableWebSearch: true,
  },
  hd: {
    id: "hd",
    displayName: "Everde HD",
    shortName: "Everde HD",
    datasets: {
      freight: false,
      salesPlan: false,
      hdYtd: true,
      lowesYtd: false,
      retail: false,
      weather: false,
      nurserySupply: true,
      nurseryDemand: true,
    },
    tools: new Set([
      ...KEY_ACCOUNT_TOOLS,
      "get_hd_ytd_following_week",
    ]),
    enableWebSearch: true,
  },
  lowes: {
    id: "lowes",
    displayName: "Everde Lowes",
    shortName: "Everde Lowes",
    datasets: {
      freight: false,
      salesPlan: false,
      hdYtd: false,
      lowesYtd: true,
      retail: false,
      weather: false,
      nurserySupply: true,
      nurseryDemand: true,
    },
    tools: new Set([
      ...KEY_ACCOUNT_TOOLS,
      "get_lowes_ytd_following_week",
    ]),
    enableWebSearch: true,
  },
};

export function parseBotProfile(raw: string | undefined | null): BotProfile {
  const v = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (v === "hd" || v === "home_depot" || v === "homedepot") return "hd";
  if (v === "lowes" || v === "lowe" || v === "lowes_rep") return "lowes";
  return "full";
}

export function buildBotProfilePromptBlock(profile: BotProfile): string {
  const p = BOT_PROFILES[profile];
  if (profile === "full") {
    return [
      "## Bot identity",
      `You are **${p.displayName}** — Everde's full operations assistant (freight, sales plan, HD + Lowe's, nursery, retail, weather when published).`,
      "Answer across datasets when useful. Still respect user view-rights for Lowe's when restricted.",
    ].join("\n");
  }
  if (profile === "hd") {
    return [
      "## Bot identity",
      `You are **${p.displayName}** — Home Depot key-account field assistant.`,
      "- SCOPE: Home Depot store / market / district sales & on-hand (YTD Following Week), plus Everde farm/nursery inventory (XXTT) and production demand.",
      "- OUT OF SCOPE: Lowe's, freight, weather, retail opportunity dashboards, other retailers.",
      "- If asked about out-of-scope topics: briefly say you only cover Home Depot (and farm inventory) in this chat, then offer a useful HD follow-up. Do **not** suggest other bots or apps (no Everde Lowes, no Claude). Key-account reps should stay in their lane.",
      "- Stay focused on quick lookup and analysis for HD; do not invent replenishment recommendations unless suggested-order data is present.",
    ].join("\n");
  }
  return [
    "## Bot identity",
    `You are **${p.displayName}** — Lowe's key-account field assistant.`,
    "- SCOPE: Lowe's store sales & on-hand (YTD BY STORE SKU), plus Everde farm/nursery inventory (XXTT) and production demand.",
    "- OUT OF SCOPE: Home Depot, freight, weather, retail opportunity dashboards.",
    "- If asked about out-of-scope topics: briefly say you only cover Lowe's (and farm inventory) in this chat, then offer a useful Lowe's follow-up. Do **not** suggest other bots or apps (no Everde HD, no Claude). Key-account reps should stay in their lane.",
    "- Stay focused on quick lookup and analysis for Lowe's; do not invent replenishment recommendations unless suggested-order data is present.",
  ].join("\n");
}

export function helpTextForProfile(profile: BotProfile): string {
  const p = BOT_PROFILES[profile];
  if (profile === "full") {
    return `**${p.displayName}** in Teams

Chat naturally, or **attach files** for analysis.

**Everde data:** freight, sales plan, HD + Lowe's YTD, retail, weather, nursery supply/demand.

**Commands:** \`/help\` · \`/reset\`

Tip: For HD-only or Lowe's-only field lookup, use the **Everde HD** or **Everde Lowes** bots.`;
  }
  if (profile === "hd") {
    return `**${p.displayName}** — Home Depot key-account assistant

Chat naturally, or **attach files** for analysis (PDF, Excel, images). Follow-ups in the same chat reuse the file — no re-upload needed.

Ask about HD stores, markets, districts, SKUs, on-hand $, and Everde farm inventory.

**Scope:** Home Depot + farm inventory only (not other retailers or ops dashboards).

**Commands:** \`/help\` · \`/reset\``;
  }
  return `**${p.displayName}** — Lowe's key-account assistant

Chat naturally, or **attach files** for analysis (PDF, Excel, images). Follow-ups in the same chat reuse the file — no re-upload needed.

Ask about Lowe's stores, SKUs, on-hand $, and Everde farm inventory.

**Scope:** Lowe's + farm inventory only (not other retailers or ops dashboards).

**Commands:** \`/help\` · \`/reset\``;
}
