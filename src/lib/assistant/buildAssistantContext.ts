import { getReport, getSection } from "@/config/portal";
import {
  downloadFreightDashboardJsonFromBlob,
  downloadFreightDashboardJsonFromLocal,
} from "@/lib/azure/freightDashboardBlob";
import { loadSalesPlanDashboardJson } from "@/lib/salesPlan/loadSalesPlanDashboardJson";
import { compactFreightForAssistant } from "@/lib/assistant/compactFreightForAssistant";
import { compactNurseryForAssistant } from "@/lib/assistant/compactNurseryForAssistant";
import { compactRetailForAssistant } from "@/lib/assistant/compactRetailForAssistant";
import { compactSalesPlanForAssistant } from "@/lib/assistant/compactSalesPlanForAssistant";
import { compactWeatherForAssistant } from "@/lib/assistant/compactWeatherForAssistant";
import {
  contextFocusForPathname,
  maxCharsForDataset,
  PORTAL_CATALOG_MAX_CHARS,
} from "@/lib/assistant/contextBudget";
import { loadNurseryDemandJson } from "@/lib/assistant/loadNurseryDemandJson";
import { loadRetailDashboardJson } from "@/lib/retail/loadRetailDashboardJson";
import { loadWeatherDashboardJson } from "@/lib/weather/loadWeatherDashboardJson";
import { buildPortalCatalogSummary } from "@/lib/assistant/portalCatalog";
import { truncateForContext } from "@/lib/assistant/truncateForContext";

export type AssistantRouteContext = {
  pathname: string;
  sectionId?: string;
  reportSlug?: string;
};

export type AssistantDataContext = {
  routeLabel: string;
  datasets: { name: string; bytes: number; excerpt: string }[];
  notes: string[];
};

function parseRoute(pathname: string): {
  sectionId?: string;
  reportSlug?: string;
} {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) return {};
  return { sectionId: parts[0], reportSlug: parts[1] };
}

async function loadFreightJson(): Promise<string | null> {
  return (
    (await downloadFreightDashboardJsonFromBlob()) ??
    (await downloadFreightDashboardJsonFromLocal())
  );
}

async function loadSalesPlanJson(): Promise<string | null> {
  const loaded = await loadSalesPlanDashboardJson();
  return loaded?.json ?? null;
}

export async function buildAssistantContext(
  input: AssistantRouteContext,
): Promise<AssistantDataContext> {
  const parsed = parseRoute(input.pathname);
  const sectionId = input.sectionId ?? parsed.sectionId;
  const reportSlug = input.reportSlug ?? parsed.reportSlug;

  let routeLabel = input.pathname || "Portal home";
  if (sectionId) {
    const section = getSection(sectionId);
    if (section) {
      routeLabel = section.title;
      if (reportSlug) {
        const hit = getReport(sectionId, reportSlug);
        if (hit) routeLabel = `${section.title} → ${hit.report.title}`;
      }
    }
  }

  const focus = contextFocusForPathname(input.pathname);
  const datasets: AssistantDataContext["datasets"] = [];
  const notes = [
    "You are the Everde AI Operations compendium analyst across all portal sections.",
    "Answer from the portal catalog and JSON datasets below. Cite specific numbers, names, farms, carriers, and key items.",
    "Retail and weather JSON are included when published to Blob or available locally.",
    `User is viewing: ${routeLabel}. Emphasize that section when applicable, but you may draw on any loaded dataset for cross-functional questions.`,
    `Context emphasis: ${focus} (all published feeds are included; payloads are compacted for API limits).`,
    "Each dataset may include assistant_facts — prefer those for rankings and headlines, then supporting detail in the same block.",
  ];

  const catalog = buildPortalCatalogSummary();
  datasets.push({
    name: "portal_catalog",
    bytes: catalog.length,
    excerpt: truncateForContext(catalog, PORTAL_CATALOG_MAX_CHARS),
  });

  const freightMax = maxCharsForDataset(focus, "freight");
  const freight = await loadFreightJson();
  if (freight) {
    datasets.push({
      name: "freight_dashboard_data",
      bytes: freight.length,
      excerpt: compactFreightForAssistant(freight, freightMax),
    });
  } else {
    notes.push("Freight dashboard_data.json not available.");
  }

  const salesMax = maxCharsForDataset(focus, "sales_plan");
  const salesPlan = await loadSalesPlanJson();
  if (salesPlan) {
    datasets.push({
      name: "sales_plan_data",
      bytes: salesPlan.length,
      excerpt: compactSalesPlanForAssistant(salesPlan, salesMax),
    });
  } else {
    notes.push(
      "Sales plan JSON not available (Blob, public/sales_plan_data.json, or HTML embed).",
    );
  }

  const nurseryMax = maxCharsForDataset(focus, "nursery_demand");
  const nursery = await loadNurseryDemandJson();
  if (nursery) {
    datasets.push({
      name: "nursery_demand_data",
      bytes: nursery.length,
      excerpt: compactNurseryForAssistant(nursery, nurseryMax),
    });
  } else {
    notes.push(
      "Production & Demand (nursery DEMAND) not available — refresh public/nursery-inventory-dashboard.html or publish demand JSON to Blob.",
    );
  }

  const retailMax = maxCharsForDataset(focus, "retail");
  const retail = await loadRetailDashboardJson();
  if (retail) {
    datasets.push({
      name: "retail_opp_data",
      bytes: retail.json.length,
      excerpt: compactRetailForAssistant(retail.json, retailMax),
    });
  } else {
    notes.push(
      "Retail opportunity JSON not available — run npm run retail:extract-publish on VPN.",
    );
  }

  const weatherMax = maxCharsForDataset(focus, "weather");
  const weather = await loadWeatherDashboardJson();
  if (weather) {
    datasets.push({
      name: "weather_dashboard_data",
      bytes: weather.json.length,
      excerpt: compactWeatherForAssistant(weather.json, weatherMax),
    });
  } else {
    notes.push(
      "Weather dashboard JSON not available — run npm run weather:publish.",
    );
  }

  return { routeLabel, datasets, notes };
}
