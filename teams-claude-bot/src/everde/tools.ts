import { getConfig } from "../config/index.js";
import type { Tool } from "@anthropic-ai/sdk/resources/messages/messages.js";
import { downloadJsonFromBlob } from "../azure/downloadJson.js";
import {
  freightBlobContainer,
  freightDashboardJsonPath,
  hdYtdMetaJsonPath,
  hdYtdSkuCategoryMapPath,
  lowesYtdMetaJsonPath,
  lowesYtdSkuCategoryMapPath,
  nurseryDemandJsonPath,
  nurserySupplyJsonPath,
  siteFocusJsonPath,
  retailDashboardJsonPath,
  salesPlanDashboardJsonPath,
  salesByItemMetaJsonPath,
  weatherDashboardJsonPath,
} from "../azure/blobPaths.js";
import {
  compactFreightJson,
  compactNurseryJson,
  compactNurserySupplyJson,
  compactRetailJson,
  compactSalesPlanJson,
  compactWeatherJson,
  compactSiteFocusJson,
  compactWcroJson,
  compactYtdFollowingWeekMeta,
  compactSalesByItemMeta,
} from "./compact.js";
import { loadWcroJsonRaw } from "./loadWcroJson.js";
import { buildPortalCatalogSummary } from "./portalCatalog.js";
import { buildGradeHierarchyBlock } from "./gradeHierarchy.js";
import {
  filterYtdRows,
  formatYtdSample,
  loadYtdRowsCached,
  type SkuCategoryLookup,
  type YtdKind,
} from "./ytdFollowingWeek.js";
import {
  canAccessHdAnalytics,
  canAccessLowesAnalytics,
  capabilitiesForEmail,
  hdDeniedMessage,
  isHdRestrictedTool,
  isLowesRestrictedTool,
  isToolAllowedForCapabilities,
  lowesDeniedMessage,
} from "./viewRights.js";
import {
  BOT_PROFILES,
  type BotProfile,
} from "./botProfile.js";
import {
  formatNurserySupplyQuery,
  type NurserySupplyLine,
} from "./nurserySupplyQuery.js";
import {
  formatSalesByItemQuery,
  loadSalesByItemRowsCached,
} from "./salesByItem.js";
import {
  assessStoreFulfillmentWeather,
  padStoreNbr,
  type FulfillmentRetailer,
} from "./weatherFulfillment.js";

const TOOL_MAX_CHARS = 12000;
const YTD_SAMPLE_ROWS = 25;
const YTD_QUERY_ROWS = 50;

export const EVERDE_TOOL_DEFINITIONS: Tool[] = [
  {
    name: "get_freight_dashboard",
    description:
      "Fetch Everde freight / load board dashboard JSON (YTD KPIs, carriers, regions, lanes). Use for freight, 3P, carrier, and logistics questions.",
    input_schema: {
      type: "object",
      properties: {
        focus: {
          type: "string",
          enum: ["summary", "carriers", "regions", "full"],
          description: "Optional slice; default summary.",
        },
      },
    },
  },
  {
    name: "get_sales_plan_dashboard",
    description:
      "Fetch Everde NOR CAL sales plan dashboard JSON (plan vs actual, misses, excess, channels).",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_sales_by_item",
    description:
      "Sales by Item feed (2024–2026): customer/account (Bill To), Everde rep, Demand Channel, Tree/item, qty, revenue. Use for who-sold, customer purchase totals, rep book, channel, and plant/item questions. Fast Growing Trees is a Bill To customer. Examples: q='2026 fast growing trees', q='southwest nursery supply this year', q='mcbride southeast texas 2026', q='2025 #15 distictis buccinatoria west coast lsc'. West Coast LSC = WEST COAST NORTH + SOUTH. Returns by_customer, by_rep, by_channel, top_items. Never dump the full grid.",
    input_schema: {
      type: "object",
      properties: {
        focus: {
          type: "string",
          enum: ["summary", "query"],
          description: "Default summary. Use query for item/channel/rep/year filters.",
        },
        q: {
          type: "string",
          description:
            "Filter for focus=query. Customer: 'fast growing trees 2026' or 'southwest nursery this year'. Rep: 'mcbride texas 2026'. Item: '2025 #15 distictis west coast lsc'.",
        },
      },
    },
  },
  {
    name: "get_hd_ytd_following_week",
    description:
      "HD Sales YTD with Following Week Sales (store×SKU grid). Has Market Nbr, District Nbr, Store Nbr (4-digit padded: 48→0048, 25→0025, 614→0614), Store Name, SKU, YTD sales/comps, AND retail on-hand. For Southern California use q='so cal' or 'socal' — expands to MKT 12,47,48,196,29A(D325+327),36 (NOT only 47/48). NorCal: q='nor cal'. Plant Category from HD xref. Examples: 'so cal', 'market 48 shrub evergreen', 'store 6612'.",
    input_schema: {
      type: "object",
      properties: {
        focus: {
          type: "string",
          enum: ["summary", "sample", "query"],
          description: "Default summary.",
        },
        q: {
          type: "string",
          description:
            "Filter for focus=query. Prefer 'so cal' / 'nor cal' for region totals, or 'market 48', 'district 25', 'store 614', store name. HD SoCal is NOT only markets 47+48.",
        },
      },
    },
  },
  {
    name: "get_lowes_ytd_following_week",
    description:
      "Lowe's Sales YTD BY STORE SKU grid. Store / Store Desc / Item / Assortment Desc, Curr Inventory Retail (TY OH $), LY On Hand Units + WKnn LY OH UNITS (store-level), Avg Retail Price. summary.inventory has FULL-store TY OH $ and estimated LY OH $ (units×price) — use for on-hand TY vs LY in dollars. focus=query with q= like 'store 774', 'rancho cucamonga', 'week 25 store 774'. Never dump the full ~300k-row grid.",
    input_schema: {
      type: "object",
      properties: {
        focus: {
          type: "string",
          enum: ["summary", "sample", "query"],
          description: "Default summary.",
        },
        q: {
          type: "string",
          description:
            "Filter text for focus=query (Subregion, Store, Item). Example: NORWALK or WC.",
        },
      },
    },
  },
  {
    name: "get_retail_opportunity",
    description:
      "Fetch West Coast retail opportunity JSON (HD, Lowe's, action buckets, region crosstab).",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_wcro_dashboard",
    description:
      "WCRO published extract: Four Numbers (Ship / Transfer / NN Plan / NN Cust), Combined Summary segments, top_pools_by_market (genus/form/size by NN Cust Store $), transfers, and rep-order index. Use for ship-this-week, net-need, top pools, and spread-prep questions. Lead with published figures; do not invent store×SKU Write Orders.",
    input_schema: {
      type: "object",
      properties: {
        focus: {
          type: "string",
          enum: ["summary", "reps", "transfers", "full"],
          description: "Default summary (Four Numbers + segments).",
        },
      },
    },
  },
  {
    name: "get_weather_dashboard",
    description:
      "Everde weather dashboard snapshot: 14-city Open-Meteo forecasts by region (N/S California, TX, FL, CO) plus sales×weather crosswalk when published. For store fulfillment that should factor weather, prefer get_store_fulfillment_weather.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_store_fulfillment_weather",
    description:
      "ON-DEMAND only when the user asks to take weather into account for store fulfillment / whether to ship next week. Maps an HD or Lowe's store to a weather region (city proxy), scores 7-day precip/freeze/storm risk, and returns proceed|caution|hold_outdoor_sensitive. Does NOT invent SKUs — pair with get_wcro_dashboard top_pools_by_market and HD/Lowe's YTD for the store. Example: store=0614 retailer=hd.",
    input_schema: {
      type: "object",
      properties: {
        retailer: {
          type: "string",
          enum: ["hd", "lowes"],
          description: "Default hd.",
        },
        store: {
          type: "string",
          description: "Store number, e.g. 0614 or 614.",
        },
        market: {
          type: "string",
          description: "Optional HD Market Nbr if already known.",
        },
        district: {
          type: "string",
          description: "Optional HD District Nbr.",
        },
        subregion: {
          type: "string",
          description: "Optional Lowe's subregion label.",
        },
        q: {
          type: "string",
          description:
            "Optional free text (SoCal, NorCal, store name) to help region mapping.",
        },
        horizon_days: {
          type: "number",
          description: "Forecast days to score (default 7).",
        },
      },
    },
  },
  {
    name: "get_nursery_supply",
    description:
      "Everde nursery Supply Inventory (XXTT inventory file). For on-hand A/B + coming-ready questions, returns separate on_hand and coming_ready sections — coming_ready includes SS pipeline grades with READY DATE when user excludes only C/D/P. focus=summary or query with q=.",
    input_schema: {
      type: "object",
      properties: {
        focus: {
          type: "string",
          enum: ["summary", "query"],
          description: "Default summary. Use query for product/grade/region filters.",
        },
        q: {
          type: "string",
          description:
            "Filter for focus=query, e.g. 'japanese boxwood 1g' or 'boxwood norcal grade A'.",
        },
      },
    },
  },
  {
    name: "get_nursery_demand",
    description:
      "Fetch nursery Production & Demand (Inventory Metrics) JSON from Blob — BO/CR, farm YTD vs goal, cycle count, photos, ready dates, inventory accuracy. Use q= for a farm code (ESC, GFL) or region (SO CAL, TX).",
    input_schema: {
      type: "object",
      properties: {
        q: {
          type: "string",
          description: "Optional farm code or region filter, e.g. 'ESC' or 'SO CAL'.",
        },
      },
    },
  },
  {
    name: "get_site_focus_summary",
    description:
      "Weekly Inventory Metrics Site Focus Summary — farm-by-farm action items (BO/CR, cycle count, photos, ready dates, inventory accuracy) from the Word drop in Inventory Metrics.",
    input_schema: {
      type: "object",
      properties: {
        q: {
          type: "string",
          description: "Optional farm code or region filter, e.g. 'ESC' or 'SO CAL'.",
        },
      },
    },
  },
  {
    name: "get_portal_catalog",
    description:
      "List Everde AI Operations portal sections and what data each covers.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_grade_definitions",
    description:
      "Everde nursery grade hierarchy and definitions (A, B, SS, SN, GS, C, D, P*, T). Use whenever someone asks what grades mean, how crop moves up to A/B, or whether SS counts for coming-ready.",
    input_schema: { type: "object", properties: {} },
  },
];

function toolFocus(input: unknown): string {
  if (
    typeof input === "object" &&
    input &&
    "focus" in input &&
    typeof (input as { focus?: string }).focus === "string"
  ) {
    return (input as { focus: string }).focus;
  }
  return "summary";
}

function filterNurseryDemandJson(raw: string, q: string): string {
  const needle = q.trim().toLowerCase();
  if (!needle) return raw;
  const p = JSON.parse(raw) as Record<string, unknown>;
  const matchFarm = (code: string, region?: string): boolean => {
    const c = code.toLowerCase();
    const r = String(region ?? "").toLowerCase();
    return (
      c === needle ||
      c.includes(needle) ||
      r.includes(needle) ||
      needle.includes(c)
    );
  };
  const pickFarmMap = (val: unknown): Record<string, unknown> | unknown => {
    if (!val || typeof val !== "object" || Array.isArray(val)) return val;
    const src = val as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [code, row] of Object.entries(src)) {
      const region =
        row && typeof row === "object"
          ? String((row as { region?: string }).region ?? "")
          : "";
      if (matchFarm(code, region)) out[code] = row;
    }
    return out;
  };
  const pickFarmList = (val: unknown): unknown => {
    if (!Array.isArray(val)) return val;
    return val.filter((row) => {
      if (!row || typeof row !== "object") return false;
      const farm = String((row as { farm?: string }).farm ?? "");
      const region = String((row as { region?: string }).region ?? "");
      return matchFarm(farm, region);
    });
  };
  return JSON.stringify({
    meta: p.meta,
    filter: q,
    farmYTD: pickFarmMap(p.farmYTD),
    farmBO: pickFarmMap(p.farmBO),
    variance: pickFarmMap(p.variance),
    cycle: pickFarmMap(p.cycle),
    photos: pickFarmMap(p.photos),
    readyDate: pickFarmMap(p.readyDate),
    demandWin: pickFarmMap(p.demandWin),
    boReasons: pickFarmList(p.boReasons),
    crReasons: pickFarmList(p.crReasons),
    topReasons: pickFarmList(p.topReasons),
    weeklyTotals: p.weeklyTotals,
    regionWeekly: p.regionWeekly,
  });
}

function toolQuery(input: unknown): string {
  if (
    typeof input === "object" &&
    input &&
    "q" in input &&
    typeof (input as { q?: string }).q === "string"
  ) {
    return (input as { q: string }).q.trim();
  }
  return "";
}

async function loadSkuCategoryMap(
  kind: YtdKind,
): Promise<SkuCategoryLookup | null> {
  const path =
    kind === "lowes" ? lowesYtdSkuCategoryMapPath() : hdYtdSkuCategoryMapPath();
  const raw = await downloadJsonFromBlob(freightBlobContainer(), path);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as {
      bySku?: Record<string, { category?: string } | string>;
    };
    const bySku = parsed.bySku;
    if (!bySku || typeof bySku !== "object") return null;
    const out: SkuCategoryLookup = {};
    for (const [sku, val] of Object.entries(bySku)) {
      const cat =
        typeof val === "string"
          ? val
          : val && typeof val === "object"
            ? String(val.category ?? "")
            : "";
      if (sku && cat) out[sku] = cat;
    }
    return Object.keys(out).length ? out : null;
  } catch {
    return null;
  }
}

async function runYtdTool(kind: YtdKind, input: unknown): Promise<string> {
  const container = freightBlobContainer();
  const metaPath =
    kind === "lowes" ? lowesYtdMetaJsonPath() : hdYtdMetaJsonPath();
  const label = kind === "lowes" ? "Lowe's" : "HD";
  const metaRaw = await downloadJsonFromBlob(container, metaPath);
  if (!metaRaw) {
    return `${label} YTD Following Week meta not available in Blob.`;
  }

  const focus = toolFocus(input);
  if (focus === "summary") {
    return compactYtdFollowingWeekMeta(metaRaw, TOOL_MAX_CHARS);
  }

  const meta = JSON.parse(metaRaw) as {
    columns?: string[];
    rowCount?: number;
  };
  const columns = Array.isArray(meta.columns) ? meta.columns : [];
  const rows = await loadYtdRowsCached(kind, columns);
  if (!rows) {
    return `${label} YTD row grid not available in Blob (meta is present).`;
  }

  const skuCategory = await loadSkuCategoryMap(kind);

  if (focus === "sample") {
    return [
      `asOf/meta rowCount=${meta.rowCount ?? rows.length}`,
      `plant_category_map=${skuCategory ? `${Object.keys(skuCategory).length} SKUs` : "unavailable"}`,
      formatYtdSample(
        columns,
        rows,
        YTD_SAMPLE_ROWS,
        TOOL_MAX_CHARS,
        undefined,
        skuCategory,
      ),
    ].join("\n");
  }

  // query
  const q = toolQuery(input);
  if (!q) {
    return "focus=query requires q= (e.g. 'market 48', 'district 25', 'store 614', 'shrub evergreen'). Or use focus=summary|sample.";
  }
  const filtered = filterYtdRows(rows, columns, q, skuCategory);
  if (filtered.length === 0) {
    return [
      `FILTER_MISS (not missing data): q=${JSON.stringify(q)} matched=0 of ${rows.length} published ${label} YTD rows.`,
      `The ${label} store×SKU grid IS loaded (${meta.rowCount ?? rows.length} rows). Zero matches means the filter string did not hit — try again with a different q.`,
      `Retry tips: store number alone (HD store 6612 / Lowe's store 774), store name fragment, market 48, district 25, or plant category / assortment words. Drop extra phrasing.`,
      `Do NOT tell the user the data is unavailable. Call this tool again with a revised q, or focus=sample to inspect column values.`,
    ].join("\n");
  }
  return [
    `q=${JSON.stringify(q)} matched=${filtered.length} of ${rows.length}`,
    `plant_category_map=${skuCategory ? `${Object.keys(skuCategory).length} SKUs` : "unavailable — publish hd/lowes_sku_category_map.json"}`,
    formatYtdSample(
      columns,
      filtered,
      YTD_QUERY_ROWS,
      TOOL_MAX_CHARS,
      q,
      skuCategory,
    ),
  ].join("\n");
}

export function toolsForProfile(
  profile: BotProfile,
  email: string | null | undefined,
): Tool[] {
  const allowed = BOT_PROFILES[profile].tools;
  const caps = capabilitiesForEmail(email);
  let tools = EVERDE_TOOL_DEFINITIONS.filter((t) => allowed.has(t.name));

  tools = tools.filter((t) => {
    if (isLowesRestrictedTool(t.name) && !caps.lowesYtd) return false;
    if (isHdRestrictedTool(t.name) && !caps.hdYtd) return false;
    // Farm inventory stays available on HD/Lowes field bots; strip on Claude for retailer-slice users.
    if (profile === "full") {
      return isToolAllowedForCapabilities(t.name, caps);
    }
    if (t.name === "get_freight_dashboard" && !caps.freight) return false;
    if (t.name === "get_weather_dashboard" && !caps.weather) return false;
    if (t.name === "get_sales_plan_dashboard" && !caps.salesPlanOps) return false;
    if (t.name === "get_sales_by_item" && !caps.salesPlanOps) return false;
    return true;
  });

  return tools;
}

/** @deprecated use toolsForProfile */
export function toolsForEmail(email: string | null | undefined): Tool[] {
  return toolsForProfile("full", email);
}

export async function executeEverdeTool(
  name: string,
  input: unknown,
  options?: { userEmail?: string | null; profile?: BotProfile },
): Promise<string> {
  const profile = options?.profile ?? "full";
  const allowed = BOT_PROFILES[profile].tools;
  if (!allowed.has(name)) {
    return `That data is outside this ${BOT_PROFILES[profile].displayName} chat's scope. Ask about ${profile === "hd" ? "Home Depot" : profile === "lowes" ? "Lowe's" : "Everde"} data available in this bot.`;
  }

  const caps = capabilitiesForEmail(options?.userEmail);
  if (isLowesRestrictedTool(name) && !canAccessLowesAnalytics(options?.userEmail)) {
    return lowesDeniedMessage();
  }
  if (isHdRestrictedTool(name) && !canAccessHdAnalytics(options?.userEmail)) {
    return hdDeniedMessage();
  }
  if (profile === "full" && !isToolAllowedForCapabilities(name, caps)) {
    return "That dataset is outside your assigned view. Ask about Home Depot or Lowe's store data you have access to.";
  }

  const container = freightBlobContainer();

  switch (name) {
    case "get_portal_catalog":
      return `${buildPortalCatalogSummary(profile)}\n\n${buildGradeHierarchyBlock()}`;

    case "get_grade_definitions":
      return buildGradeHierarchyBlock();

    case "get_freight_dashboard": {
      const raw = await downloadJsonFromBlob(
        container,
        freightDashboardJsonPath(),
      );
      if (!raw) return "Freight dashboard JSON not available in Blob storage.";
      const focus = toolFocus(input);
      const compact = compactFreightJson(raw, TOOL_MAX_CHARS);
      return `focus=${focus}\n${compact}`;
    }

    case "get_sales_plan_dashboard": {
      const raw = await downloadJsonFromBlob(
        container,
        salesPlanDashboardJsonPath(),
      );
      if (!raw) return "Sales plan JSON not available in Blob storage.";
      return compactSalesPlanJson(raw, TOOL_MAX_CHARS);
    }

    case "get_sales_by_item": {
      const metaRaw = await downloadJsonFromBlob(
        container,
        salesByItemMetaJsonPath(),
      );
      if (!metaRaw) {
        return "Sales by Item JSON not in Blob — run npm run sales-plan:sales-by-item-extract-publish.";
      }
      const focus = toolFocus(input);
      if (focus !== "query") {
        return compactSalesByItemMeta(metaRaw, TOOL_MAX_CHARS);
      }
      const q = toolQuery(input);
      if (!q) {
        return "focus=query requires q= (e.g. '2025 #15 distictis buccinatoria west coast lsc').";
      }
      const rows = await loadSalesByItemRowsCached();
      if (!rows) {
        return "Sales by Item row grid not available or still on old grain (needs bill_to). Re-run npm run sales-plan:sales-by-item-extract-publish.";
      }
      return formatSalesByItemQuery(rows, q, TOOL_MAX_CHARS);
    }

    case "get_hd_ytd_following_week":
      return runYtdTool("hd", input);

    case "get_lowes_ytd_following_week":
      return runYtdTool("lowes", input);

    case "get_retail_opportunity": {
      const raw = await downloadJsonFromBlob(
        container,
        retailDashboardJsonPath(),
      );
      if (!raw) return "Retail opportunity JSON not available in Blob storage.";
      return compactRetailJson(raw, getConfig().EVERDE_RETAIL_TOOL_MAX_CHARS);
    }

    case "get_wcro_dashboard": {
      const raw = await loadWcroJsonRaw();
      if (!raw) {
        return "WCRO data not available — run python scripts/wcro/extract_wcro.py and publish wcro/latest/wcro_data.json.";
      }
      const channel: "HD" | "LOW" | "ALL" =
        profile === "hd" ? "HD" : profile === "lowes" ? "LOW" : "ALL";
      const focus = toolFocus(input);
      const body = compactWcroJson(raw, TOOL_MAX_CHARS, channel);
      return `focus=${focus} channel=${channel}\n${body}`;
    }

    case "get_weather_dashboard": {
      const raw = await downloadJsonFromBlob(
        container,
        weatherDashboardJsonPath(),
      );
      if (!raw) return "Weather dashboard JSON not available in Blob storage.";
      return compactWeatherJson(raw, TOOL_MAX_CHARS);
    }

    case "get_store_fulfillment_weather": {
      const raw = await downloadJsonFromBlob(
        container,
        weatherDashboardJsonPath(),
      );
      if (!raw) {
        return "Weather JSON not in Blob — cannot assess fulfillment weather. Refresh weather publish.";
      }
      const inputObj =
        typeof input === "object" && input ? (input as Record<string, unknown>) : {};
      let retailer: FulfillmentRetailer =
        inputObj.retailer === "lowes" ? "lowes" : "hd";
      if (profile === "lowes") retailer = "lowes";
      if (profile === "hd") retailer = "hd";
      const storeRaw =
        typeof inputObj.store === "string"
          ? inputObj.store
          : toolQuery(input).match(/\b0*\d{3,4}\b/)?.[0];
      const store = storeRaw ? padStoreNbr(storeRaw) : undefined;
      const market =
        typeof inputObj.market === "string" ? inputObj.market : undefined;
      const district =
        typeof inputObj.district === "string" ? inputObj.district : undefined;
      const subregion =
        typeof inputObj.subregion === "string" ? inputObj.subregion : undefined;
      const hint =
        typeof inputObj.q === "string" && inputObj.q.trim()
          ? inputObj.q
          : toolQuery(input);
      const horizon_days =
        typeof inputObj.horizon_days === "number"
          ? inputObj.horizon_days
          : undefined;
      return assessStoreFulfillmentWeather(
        raw,
        { retailer, store, market, district, subregion, hint, horizon_days },
        TOOL_MAX_CHARS,
      );
    }

    case "get_nursery_supply": {
      const raw = await downloadJsonFromBlob(
        container,
        nurserySupplyJsonPath(),
      );
      if (!raw) {
        return "Nursery supply JSON not available in Blob. Run npm run nursery:publish-blob.";
      }
      const focus = toolFocus(input);
      if (focus !== "query") {
        return compactNurserySupplyJson(raw, TOOL_MAX_CHARS);
      }
      const q = toolQuery(input);
      if (!q) {
        return "focus=query requires q= (e.g. 'japanese boxwood 1g' or 'boxwood grade A norcal').";
      }
      try {
        const parsed = JSON.parse(raw) as { lines?: NurserySupplyLine[] };
        const lines = Array.isArray(parsed.lines) ? parsed.lines : [];
        if (lines.length === 0) {
          return "Nursery supply Blob has no line-level rows yet — re-run nursery:publish-blob.";
        }
        return formatNurserySupplyQuery(lines, q, TOOL_MAX_CHARS);
      } catch {
        return compactNurserySupplyJson(raw, TOOL_MAX_CHARS);
      }
    }

    case "get_nursery_demand": {
      const path = nurseryDemandJsonPath();
      const raw = await downloadJsonFromBlob(container, path);
      if (!raw) return "Nursery demand JSON not available in Blob storage.";
      const q = toolQuery(input);
      if (!q) return compactNurseryJson(raw, TOOL_MAX_CHARS);
      try {
        const sliced = filterNurseryDemandJson(raw, q);
        const parsed = JSON.parse(sliced) as {
          farmYTD?: Record<string, unknown>;
        };
        if (!parsed.farmYTD || Object.keys(parsed.farmYTD).length === 0) {
          return `No Inventory Metrics farms matched q=${q}. Try a farm code (ESC, GFL, BRA) or region (SO CAL, TX, FL).`;
        }
        return compactNurseryJson(sliced, TOOL_MAX_CHARS);
      } catch {
        return compactNurseryJson(raw, TOOL_MAX_CHARS);
      }
    }

    case "get_site_focus_summary": {
      const raw = await downloadJsonFromBlob(container, siteFocusJsonPath());
      if (!raw) {
        return "Site Focus Summary not in Blob — drop WkNN_Site_Focus*.docx in Inventory Metrics and run npm run nursery:extract-site-focus.";
      }
      const q = toolQuery(input).toLowerCase();
      if (!q) return compactSiteFocusJson(raw, TOOL_MAX_CHARS);
      try {
        const parsed = JSON.parse(raw) as {
          meta?: unknown;
          closing?: unknown;
          regions?: {
            name?: string;
            farms?: { code?: string; market?: string }[];
          }[];
        };
        const regions = (parsed.regions ?? []).filter((r) => {
          const name = String(r.name ?? "").toLowerCase();
          if (name.includes(q)) return true;
          return (r.farms ?? []).some((f) => {
            const code = String(f.code ?? "").toLowerCase();
            const market = String(f.market ?? "").toLowerCase();
            return code === q || code.includes(q) || market.includes(q);
          });
        }).map((r) => ({
          ...r,
          farms: (r.farms ?? []).filter((f) => {
            if (String(r.name ?? "").toLowerCase().includes(q)) return true;
            const code = String(f.code ?? "").toLowerCase();
            const market = String(f.market ?? "").toLowerCase();
            return code === q || code.includes(q) || market.includes(q);
          }),
        }));
        if (regions.every((r) => (r.farms ?? []).length === 0)) {
          return `No Site Focus farms matched q=${q}. Try a farm code (ESC, GFL) or region (SO CAL, TX).`;
        }
        return compactSiteFocusJson(
          JSON.stringify({ meta: parsed.meta, regions, closing: parsed.closing }),
          TOOL_MAX_CHARS,
        );
      } catch {
        return compactSiteFocusJson(raw, TOOL_MAX_CHARS);
      }
    }

    default:
      return `Unknown Everde tool: ${name}`;
  }
}
