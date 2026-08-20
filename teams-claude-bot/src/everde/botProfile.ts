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
    /** Compact Sales by Item (store / customer / rep) without NOR CAL plan dashboard */
    salesByItem: boolean;
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
  "get_site_focus_summary",
  "get_store_fulfillment_weather",
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
      salesByItem: true,
    },
    tools: new Set([
      "get_freight_dashboard",
      "get_sales_plan_dashboard",
      "get_sales_by_item",
      "get_hd_ytd_following_week",
      "get_lowes_ytd_following_week",
      "get_retail_opportunity",
      "get_wcro_dashboard",
      "get_weather_dashboard",
      "get_store_fulfillment_weather",
      "get_nursery_supply",
      "get_nursery_demand",
      "get_site_focus_summary",
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
      salesByItem: true,
    },
    tools: new Set([
      ...KEY_ACCOUNT_TOOLS,
      "get_hd_ytd_following_week",
      "get_sales_by_item",
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
      salesByItem: true,
    },
    tools: new Set([
      ...KEY_ACCOUNT_TOOLS,
      "get_lowes_ytd_following_week",
      "get_sales_by_item",
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
      `You are **${p.displayName}** — Everde's full operations assistant (freight, sales plan, Sales by Item, HD + Lowe's, nursery, retail, WCRO, weather when published).`,
      "Answer across datasets when useful. Still respect user view-rights for Lowe's / HD when restricted.",
      "Who sold / which customer bought / which farm shipped / which rep covers an account (Bill To + Location farm + Demand Channel, 2024–2026): call **get_sales_by_item** focus=query. Farm+item (e.g. 3G loropetalum from Bunnell): q='2025 2026 3G loropetalum Bunnell' — lead with units and $ by year; do not say farm is missing; do not give all-farm totals. Store sales (HD 6910 / STORE #6910): q='2026 store 6910'. Item history: include the Tree code in q= (e.g. ELADEF0430). Fast Growing Trees = customer/Bill To. West Coast LSC = WEST COAST NORTH + WEST COAST SOUTH. Multi-year: include each year in q=.",
      "Weather-aware store fulfillment (ONLY when the user asks to take weather into account / whether shipping is recommended given weather): call **get_store_fulfillment_weather** (store + retailer), then **get_wcro_dashboard** for published market pools / ship figures, and HD or Lowe's YTD for that store's on-hand. Lead with weather_verdict (proceed|caution|hold_outdoor_sensitive). Item lists must come from published WCRO top_pools — do not invent SKUs. Default fulfillment answers stay weather-free.",
      "WCRO: call get_wcro_dashboard. Lead with published segments / top_pools_by_market / transfers / reps. When asked for SKUs/items use retailer_pool_sku + top_items + everde_item_codes. NN = Net Need. Cite snapshot date once. Do not deny pool data when top_pools_by_market is present. Label any YTD+farm cross-check as hypothesis, not the official WCRO order.",
      "Inventory Metrics / Production & Demand / BO-CR / cycle count / photos / farm YTD: call **get_nursery_demand** (q= farm code like ESC or region like SO CAL). Site Focus / weekly farm action items: call **get_site_focus_summary** (same q=). Do not say those feeds are missing when nursery_demand or site_focus is in the snapshot.",
      "HD SoCal / Southern California: get_hd_ytd_following_week q='so cal' → markets 12,47,48,196,29A(D325+327),36 — never only 47+48. Includes HD 6910 Mission Valley (Market 12; opened 2026-07-30).",
    ].join("\n");
  }
  if (profile === "hd") {
    return [
      "## Bot identity",
      `You are **${p.displayName}** — Home Depot key-account field assistant.`,
      "- SCOPE: Home Depot store / market / district sales & on-hand (YTD Following Week), **recent invoiced store sales from Sales by Item** (get_sales_by_item q='2026 store 6910'), Everde farm/nursery inventory (XXTT), Inventory Metrics (get_nursery_demand), Site Focus Summary (get_site_focus_summary), **WCRO** published ship / transfer / net-need figures for HD, and **on-demand weather for fulfillment** (get_store_fulfillment_weather) when the user asks to factor weather.",
      "- OUT OF SCOPE: Lowe's, freight, other retailers. Do not use weather unless the user asks about weather / shipping in rain/freeze / weather-aware recommendations.",
      "- Weather-aware fulfillment example: 'recommended items for HD 0614 next week taking weather into account?' → get_store_fulfillment_weather store=0614 retailer=hd, then get_wcro_dashboard + get_hd_ytd_following_week q='store 0614'. Answer weather_verdict first, then published WCRO pools for that market. Do not invent Write Orders.",
      "- WCRO: call get_wcro_dashboard. Answer helpfully from published extract — for top pools / spread prep use **top_pools_by_market**. When asked for SKUs/items, show **retailer_pool_sku**, **top_items** (item + item_description), and **everde_item_codes** — do not stop at genus alone. Cite snapshot date once.",
      "- NN = Net Need. NN Plan (plan-driven) ≠ NN Cust Store (store-summed demand-sensed) ≠ NN Cust Pool (pool-netted). Explain briefly when asked.",
      "- Ship This Week excludes To Transfer (transfers = next-week shelf). HD on-hand is sales-gated (~12% fill) — caveat when citing HD ship figures.",
      "- Recent store sales / last orders invoiced: call **get_sales_by_item** focus=query q='2026 store 6910' (Ship To Add2). HD YTD Following Week can lag (on-hand/comps only as-of its extract date) — do not treat $0 YTD as 'no Oracle activity' when Sales by Item has STORE # lines.",
      "- Stay useful: lead with what you have; one clear next step. Do not open with 'I don't have pool data' when top_pools_by_market exists. Do not invent store×SKU Write Order lines.",
      "- YTD + farm may support a secondary item cross-check — label as hypothesis, not Jonathan's official WCRO call.",
      "- If asked about out-of-scope topics: briefly say you only cover Home Depot (and farm inventory / WCRO HD) in this chat, then offer a useful HD follow-up. Do **not** suggest other bots or apps.",
    ].join("\n");
  }
  return [
    "## Bot identity",
    `You are **${p.displayName}** — Lowe's key-account field assistant.`,
      "- SCOPE: Lowe's store sales & on-hand (YTD BY STORE SKU), Everde farm/nursery inventory (XXTT), Inventory Metrics (get_nursery_demand), Site Focus Summary (get_site_focus_summary), **WCRO** published ship / transfer / net-need figures for Lowe's, and **on-demand weather for fulfillment** (get_store_fulfillment_weather) when the user asks to factor weather.",
    "- OUT OF SCOPE: Home Depot, freight, other retailers. Do not use weather unless the user asks about weather / shipping in rain/freeze / weather-aware recommendations.",
    "- Weather-aware fulfillment: get_store_fulfillment_weather retailer=lowes + store/subregion, then get_wcro_dashboard + get_lowes_ytd_following_week. Lead with weather_verdict; item lists from published WCRO only.",
    "- WCRO: call get_wcro_dashboard. Answer helpfully from published extract — for top pools / spread prep use **top_pools_by_market**. When asked for SKUs/items, show **retailer_pool_sku**, **top_items** (item + item_description), and **everde_item_codes** — do not stop at genus alone. Cite snapshot date once. LOW S.CA includes AZ/NV/NM/UT — not CA-only.",
    "- NN = Net Need. NN Plan (plan-driven) ≠ NN Cust Store (store-summed demand-sensed) ≠ NN Cust Pool (pool-netted). Explain briefly when asked.",
    "- Ship This Week excludes To Transfer (transfers = next-week shelf).",
    "- Recent store sales: call **get_sales_by_item** focus=query q='2026 store 774' (Ship To). Lowe's YTD is on-hand/comps as-of its extract; Sales by Item is invoiced store sales from the weekly sheet.",
    "- Stay useful: lead with what you have; one clear next step. Do not open with 'I don't have pool data' when top_pools_by_market exists. Do not invent store×SKU Write Order lines.",
    "- YTD + farm may support a secondary item cross-check — label as hypothesis, not Jonathan's official WCRO call.",
    "- If asked about out-of-scope topics: briefly say you only cover Lowe's (and farm inventory / WCRO LOW) in this chat, then offer a useful Lowe's follow-up. Do **not** suggest other bots or apps.",
  ].join("\n");
}

export function helpTextForProfile(profile: BotProfile): string {
  const p = BOT_PROFILES[profile];
  if (profile === "full") {
    return `**${p.displayName}** in Teams

Chat naturally, or **attach files** for analysis.

**Everde data:** freight, sales plan, Sales by Item (rep / channel / year), HD + Lowe's YTD, retail, WCRO ship/transfer, weather, nursery supply, Inventory Metrics (demand), Site Focus Summary.

**Commands:** \`/help\` · \`/reset\`

Tip: For HD-only or Lowe's-only field lookup, use the **Everde HD** or **Everde Lowes** bots.`;
  }
  if (profile === "hd") {
    return `**${p.displayName}** — Home Depot key-account assistant

Chat naturally, or **attach files** for analysis (PDF, Excel, images). Follow-ups in the same chat reuse the file — no re-upload needed.

Ask about HD stores, markets, districts, SKUs, **recent invoiced store sales** (Sales by Item), on-hand $, Everde farm inventory, and WCRO ship / transfer figures. Ask to **take weather into account** for store fulfillment when you want a rain/freeze overlay (on demand only).

**Scope:** Home Depot + farm inventory + WCRO HD (not other retailers or ops dashboards).

**Commands:** \`/help\` · \`/reset\``;
  }
  return `**${p.displayName}** — Lowe's key-account assistant

Chat naturally, or **attach files** for analysis (PDF, Excel, images). Follow-ups in the same chat reuse the file — no re-upload needed.

Ask about Lowe's stores, SKUs, **recent invoiced store sales** (Sales by Item), on-hand $, Everde farm inventory, and WCRO ship / transfer figures. Ask to **take weather into account** for store fulfillment when you want a rain/freeze overlay (on demand only).

**Scope:** Lowe's + farm inventory + WCRO LOW (not other retailers or ops dashboards).

**Commands:** \`/help\` · \`/reset\``;
}
