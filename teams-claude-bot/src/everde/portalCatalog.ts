import type { BotProfile } from "./botProfile.js";

/** Static map of Everde AI Operations portal sections (no portal code dependency). */
export function buildPortalCatalogSummary(profile: BotProfile = "full"): string {
  if (profile === "hd") {
    return [
      "## Everde HD — key-account scope",
      "- **Home Depot YTD Following Week** — store / market / district sales + on-hand (get_hd_ytd_following_week)",
      "- **WCRO** — published West Coast ship / transfer / NN (get_wcro_dashboard; HD slice)",
      "- **Weather-aware fulfillment (on demand)** — get_store_fulfillment_weather when asked to factor rain/freeze/storm into what to ship",
      "- **Supply Inventory** — XXTT farm inventory + READY DATE (get_nursery_supply)",
      "- **Production & Demand** — Inventory Metrics (get_nursery_demand) + weekly Site Focus (get_site_focus_summary)",
      "- Out of scope here: Lowe's, freight — stay on HD questions.",
    ].join("\n");
  }
  if (profile === "lowes") {
    return [
      "## Everde Lowes — key-account scope",
      "- **Lowe's YTD BY STORE SKU** — store sales + on-hand (get_lowes_ytd_following_week)",
      "- **WCRO** — published West Coast ship / transfer / NN (get_wcro_dashboard; Lowe's slice)",
      "- **Weather-aware fulfillment (on demand)** — get_store_fulfillment_weather when asked to factor rain/freeze/storm into what to ship",
      "- **Supply Inventory** — XXTT farm inventory + READY DATE (get_nursery_supply)",
      "- **Production & Demand** — Inventory Metrics (get_nursery_demand) + weekly Site Focus (get_site_focus_summary)",
      "- Out of scope here: Home Depot, freight — stay on Lowe's questions.",
    ].join("\n");
  }
  return [
    "## Everde AI Operations Portal",
    "",
    "- **Freight / Load Board** — YTD freight KPIs, carriers, regions, lanes, build health",
    "- **Sales Plan Review** — NOR CAL plan vs actual; **Sales by Item** (rep × item × Demand Channel, 2024–2026 via get_sales_by_item); **HD Sales YTD w/ Following Week Sales**; **Lowe's Sales YTD w/ Following Week Sales** (store×SKU grids)",
    "- **Supply Inventory** — XXTT inventory file (LANDSCAPE_INV_PL) with graded on-hand + READY DATE via get_nursery_supply",
    "- **Production & Demand Plan** — Inventory Metrics BO/CR via get_nursery_demand; weekly Site Focus via get_site_focus_summary",
    "- **West Coast Retail Opportunity** — HD / Lowe's retail performance and action buckets",
    "- **WCRO** — Store Driven ship / transfer / NN Plan vs NN Cust Store (get_wcro_dashboard)",
    "- **Weather** — regional weather dashboard snapshot (when published)",
    "",
    "Prefer Everde JSON tools and the snapshot below for internal metrics. Use web search only for live public/external facts.",
    "Farm inventory / ready dates: **get_nursery_supply** on the XXTT inventory file (not HD YTD, not a separate price list). Example q: japanese boxwood 1g",
    "For HD/Lowe's Following Week store detail, use get_hd_ytd_following_week / get_lowes_ytd_following_week (summary, sample, or query with q=).",
    "For customer purchase totals, who-sold / which-rep, or plant/item history (West Coast LSC, MLC, HD, Lowe's, IGC accounts, 2024–2026): use **get_sales_by_item** focus=query. Filters Bill To (customer), Rep, Demand Channel, and item. West Coast LSC = WEST COAST NORTH + WEST COAST SOUTH. Sales Plan dashboard is NOR CAL plan vs actual only and has no rep/customer grain.",
    "Anti-denial: if snapshot shows a dataset published, call tools before saying you cannot find data. Zero filter matches ≠ missing upload.",
  ].join("\n");
}
