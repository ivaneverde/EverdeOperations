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
    /** WCRO published ship / transfer / NN extract */
    wcro: boolean;
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
      wcro: true,
    },
    tools: new Set([
      "get_freight_dashboard",
      "get_sales_plan_dashboard",
      "get_hd_ytd_following_week",
      "get_lowes_ytd_following_week",
      "get_retail_opportunity",
      "get_wcro_dashboard",
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
      wcro: true,
    },
    tools: new Set([
      ...KEY_ACCOUNT_TOOLS,
      "get_hd_ytd_following_week",
      "get_wcro_dashboard",
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
      wcro: true,
    },
    tools: new Set([
      ...KEY_ACCOUNT_TOOLS,
      "get_lowes_ytd_following_week",
      "get_wcro_dashboard",
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
      `You are **${p.displayName}** — Everde's full operations assistant (freight, sales plan, HD + Lowe's, nursery, retail, WCRO, weather when published).`,
      "Answer across datasets when useful. Still respect user view-rights for Lowe's / HD when restricted.",
      "WCRO: use get_wcro_dashboard; report published figures only; never invent ship advice; cite snapshot date.",
    ].join("\n");
  }
  if (profile === "hd") {
    return [
      "## Bot identity",
      `You are **${p.displayName}** — Home Depot key-account field assistant.`,
      "- SCOPE: Home Depot store / market / district sales & on-hand (YTD Following Week), Everde farm/nursery inventory (XXTT), and **WCRO** published ship / transfer / net-need figures for HD.",
      "- OUT OF SCOPE: Lowe's, freight, weather, other retailers.",
      "- WCRO: report published extract only (get_wcro_dashboard). Never invent or adjust a recommendation. Cite snapshot date. Ship This Week excludes transfers (next-week shelf). NN Plan ≠ NN Cust Store.",
      "- HD on-hand in WCRO is sales-gated (~12% fill) — mention that caveat when citing HD ship figures.",
      "- If asked about out-of-scope topics: briefly say you only cover Home Depot (and farm inventory / WCRO HD) in this chat, then offer a useful HD follow-up. Do **not** suggest other bots or apps.",
      "- Stay descriptive; do not invent replenishment advice beyond what WCRO already published.",
    ].join("\n");
  }
  return [
    "## Bot identity",
    `You are **${p.displayName}** — Lowe's key-account field assistant.`,
    "- SCOPE: Lowe's store sales & on-hand (YTD BY STORE SKU), Everde farm/nursery inventory (XXTT), and **WCRO** published ship / transfer / net-need figures for Lowe's.",
    "- OUT OF SCOPE: Home Depot, freight, weather, other retailers.",
    "- WCRO: report published extract only (get_wcro_dashboard). Never invent or adjust a recommendation. Cite snapshot date. Ship This Week excludes transfers. NN Plan ≠ NN Cust Store. LOW S.CA is not comparable to HD S.CA.",
    "- If asked about out-of-scope topics: briefly say you only cover Lowe's (and farm inventory / WCRO LOW) in this chat, then offer a useful Lowe's follow-up. Do **not** suggest other bots or apps.",
    "- Stay descriptive; do not invent replenishment advice beyond what WCRO already published.",
  ].join("\n");
}

export function helpTextForProfile(profile: BotProfile): string {
  const p = BOT_PROFILES[profile];
  if (profile === "full") {
    return `**${p.displayName}** in Teams

Chat naturally, or **attach files** for analysis.

**Everde data:** freight, sales plan, HD + Lowe's YTD, retail, WCRO ship/transfer, weather, nursery supply/demand.

**Commands:** \`/help\` · \`/reset\`

Tip: For HD-only or Lowe's-only field lookup, use the **Everde HD** or **Everde Lowes** bots.`;
  }
  if (profile === "hd") {
    return `**${p.displayName}** — Home Depot key-account assistant

Chat naturally, or **attach files** for analysis (PDF, Excel, images). Follow-ups in the same chat reuse the file — no re-upload needed.

Ask about HD stores, markets, districts, SKUs, on-hand $, Everde farm inventory, and WCRO ship / transfer figures.

**Scope:** Home Depot + farm inventory + WCRO HD (not other retailers or ops dashboards).

**Commands:** \`/help\` · \`/reset\``;
  }
  return `**${p.displayName}** — Lowe's key-account assistant

Chat naturally, or **attach files** for analysis (PDF, Excel, images). Follow-ups in the same chat reuse the file — no re-upload needed.

Ask about Lowe's stores, SKUs, on-hand $, Everde farm inventory, and WCRO ship / transfer figures.

**Scope:** Lowe's + farm inventory + WCRO LOW (not other retailers or ops dashboards).

**Commands:** \`/help\` · \`/reset\``;
}
