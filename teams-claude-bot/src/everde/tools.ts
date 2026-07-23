import { getConfig } from "../config/index.js";
import type { Tool } from "@anthropic-ai/sdk/resources/messages/messages.js";
import { downloadJsonFromBlob } from "../azure/downloadJson.js";
import {
  freightBlobContainer,
  freightDashboardJsonPath,
  hdYtdMetaJsonPath,
  lowesYtdMetaJsonPath,
  nurseryDemandJsonPath,
  nurserySupplyJsonPath,
  retailDashboardJsonPath,
  salesPlanDashboardJsonPath,
  weatherDashboardJsonPath,
} from "../azure/blobPaths.js";
import {
  compactFreightJson,
  compactNurseryJson,
  compactNurserySupplyJson,
  compactRetailJson,
  compactSalesPlanJson,
  compactWeatherJson,
  compactYtdFollowingWeekMeta,
} from "./compact.js";
import { buildPortalCatalogSummary } from "./portalCatalog.js";
import {
  filterYtdRows,
  formatYtdSample,
  loadYtdRowsCached,
  type YtdKind,
} from "./ytdFollowingWeek.js";
import {
  formatNurserySupplyQuery,
  type NurserySupplyLine,
} from "./nurserySupplyQuery.js";

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
    name: "get_hd_ytd_following_week",
    description:
      "HD Sales YTD with Following Week Sales (store×SKU grid). Use for Home Depot YTD / following-week questions. focus=summary (meta+totals), sample (first rows), or query (filter with q on Market/Store/SKU). Never dumps the full ~97k-row grid.",
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
            "Filter text for focus=query (Market, Store, SKU, KEY). Example: ENCINITAS or 117205.",
        },
      },
    },
  },
  {
    name: "get_lowes_ytd_following_week",
    description:
      "Lowe's Sales YTD with Following Week Sales (YTD BY STORE SKU grid). Use for Lowe's store×item YTD questions. focus=summary, sample, or query (q filters Subregion/Store/Item). Never dumps the full ~300k-row grid.",
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
    name: "get_weather_dashboard",
    description:
      "Fetch Everde weather dashboard JSON snapshot (regional conditions when published).",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_nursery_supply",
    description:
      "Everde nursery Supply Inventory from the XXTT inventory file (Sales Inventory Availability LANDSCAPE_INV_PL — graded/saleable/ready date by farm). Users call this the inventory file. Prefer graded_on_hand for on-hand; use readyDate for crop-ready timing. focus=summary or query with q= (e.g. 'japanese boxwood 1g a b norcal socal').",
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
      "Fetch nursery Production & Demand (Inventory Metrics) JSON from Blob — BO/CR, farm YTD, demand windows.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_portal_catalog",
    description:
      "List Everde AI Operations portal sections and what data each covers.",
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

  if (focus === "sample") {
    return [
      `asOf/meta rowCount=${meta.rowCount ?? rows.length}`,
      formatYtdSample(columns, rows, YTD_SAMPLE_ROWS, TOOL_MAX_CHARS),
    ].join("\n");
  }

  // query
  const q = toolQuery(input);
  if (!q) {
    return "focus=query requires q= (e.g. store name, SKU, subregion). Or use focus=summary|sample.";
  }
  const filtered = filterYtdRows(rows, columns, q);
  return [
    `q=${JSON.stringify(q)} matched=${filtered.length} of ${rows.length}`,
    formatYtdSample(columns, filtered, YTD_QUERY_ROWS, TOOL_MAX_CHARS),
  ].join("\n");
}

export async function executeEverdeTool(
  name: string,
  input: unknown,
): Promise<string> {
  const container = freightBlobContainer();

  switch (name) {
    case "get_portal_catalog":
      return buildPortalCatalogSummary();

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

    case "get_weather_dashboard": {
      const raw = await downloadJsonFromBlob(
        container,
        weatherDashboardJsonPath(),
      );
      if (!raw) return "Weather dashboard JSON not available in Blob storage.";
      return compactWeatherJson(raw, TOOL_MAX_CHARS);
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
      return compactNurseryJson(raw, TOOL_MAX_CHARS);
    }

    default:
      return `Unknown Everde tool: ${name}`;
  }
}
