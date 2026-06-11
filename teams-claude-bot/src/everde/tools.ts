import type { Tool } from "@anthropic-ai/sdk/resources/messages/messages.js";
import { downloadJsonFromBlob } from "../azure/downloadJson.js";
import {
  freightBlobContainer,
  freightDashboardJsonPath,
  nurseryDemandJsonPath,
  retailDashboardJsonPath,
  salesPlanDashboardJsonPath,
  weatherDashboardJsonPath,
} from "../azure/blobPaths.js";
import {
  compactFreightJson,
  compactNurseryJson,
  compactRetailJson,
  compactSalesPlanJson,
  compactWeatherJson,
} from "./compact.js";
import { buildPortalCatalogSummary } from "./portalCatalog.js";

const TOOL_MAX_CHARS = 12000;

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
    name: "get_nursery_demand",
    description:
      "Fetch nursery production / demand JSON when published to Blob.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_portal_catalog",
    description:
      "List Everde AI Operations portal sections and what data each covers.",
    input_schema: { type: "object", properties: {} },
  },
];

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
      const focus =
        typeof input === "object" &&
        input &&
        "focus" in input &&
        typeof (input as { focus?: string }).focus === "string"
          ? (input as { focus: string }).focus
          : "summary";
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

    case "get_retail_opportunity": {
      const raw = await downloadJsonFromBlob(
        container,
        retailDashboardJsonPath(),
      );
      if (!raw) return "Retail opportunity JSON not available in Blob storage.";
      return compactRetailJson(raw, TOOL_MAX_CHARS);
    }

    case "get_weather_dashboard": {
      const raw = await downloadJsonFromBlob(
        container,
        weatherDashboardJsonPath(),
      );
      if (!raw) return "Weather dashboard JSON not available in Blob storage.";
      return compactWeatherJson(raw, TOOL_MAX_CHARS);
    }

    case "get_nursery_demand": {
      const path = nurseryDemandJsonPath();
      if (!path) {
        return "Nursery demand not configured (set AZURE_NURSERY_DEMAND_JSON_BLOB).";
      }
      const raw = await downloadJsonFromBlob(container, path);
      if (!raw) return "Nursery demand JSON not available in Blob storage.";
      return compactNurseryJson(raw, TOOL_MAX_CHARS);
    }

    default:
      return `Unknown Everde tool: ${name}`;
  }
}
