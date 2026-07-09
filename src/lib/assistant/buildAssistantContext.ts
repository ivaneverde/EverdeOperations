import { getReport, getSection } from "@/config/portal";
import {
  downloadFreightDashboardJsonFromBlob,
  downloadFreightDashboardJsonFromLocal,
} from "@/lib/azure/freightDashboardBlob";
import { loadSalesPlanDashboardJson } from "@/lib/salesPlan/loadSalesPlanDashboardJson";
import { compactFreightForAssistant } from "@/lib/assistant/compactFreightForAssistant";
import { compactNurseryForAssistant } from "@/lib/assistant/compactNurseryForAssistant";
import { compactNurserySupplyForAssistant } from "@/lib/assistant/compactNurserySupplyForAssistant";
import { compactRetailForAssistant } from "@/lib/assistant/compactRetailForAssistant";
import { compactSalesPlanForAssistant } from "@/lib/assistant/compactSalesPlanForAssistant";
import { compactWeatherForAssistant } from "@/lib/assistant/compactWeatherForAssistant";
import {
  anthropicCompendiumMode,
  openAiCompendiumMode,
} from "@/lib/assistant/assistantConfig";
import type { AssistantProvider } from "@/lib/assistant/types";
import {
  catalogMaxChars,
  contextFocusForPathname,
  maxCharsForDataset,
} from "@/lib/assistant/contextBudget";
import { loadNurseryDemandJson } from "@/lib/assistant/loadNurseryDemandJson";
import { loadNurserySupplyJson } from "@/lib/assistant/loadNurserySupplyJson";
import { loadRetailDashboardJson } from "@/lib/retail/loadRetailDashboardJson";
import { loadWeatherDashboardJson } from "@/lib/weather/loadWeatherDashboardJson";
import { buildPortalCatalogSummary } from "@/lib/assistant/portalCatalog";
import { truncateForContext } from "@/lib/assistant/truncateForContext";

export type AssistantRouteContext = {
  pathname: string;
  sectionId?: string;
  reportSlug?: string;
  provider?: AssistantProvider;
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

  const provider = input.provider ?? "anthropic";
  const focus = contextFocusForPathname(input.pathname);
  const datasets: AssistantDataContext["datasets"] = [];
  const compendiumMode =
    provider === "openai"
      ? openAiCompendiumMode()
      : anthropicCompendiumMode();
  const notes = [
    "You are the Everde AI Operations compendium analyst across all portal sections.",
    "Answer from the portal catalog and JSON datasets below. Cite specific numbers, names, carriers, farms, and key items.",
    "Retail and weather JSON are included when published to Blob or available locally.",
    `User is viewing: ${routeLabel}. Emphasize that section when applicable, but you may draw on any loaded dataset for cross-functional questions.`,
    compendiumMode
      ? `Context emphasis: ${focus} (compendium — freight, sales plan, nursery, retail, and weather when published; payloads compacted for API limits).`
      : `Context emphasis: ${focus} (focused mode — primary section + headlines only; set ${provider === "openai" ? "OPENAI" : "ANTHROPIC"}_ASSISTANT_COMPENDIUM=1 on the server for full cross-portal data).`,
    "Each dataset may include assistant_facts — prefer those for rankings and headlines, then supporting detail in the same block.",
  ];

  const pushDataset = (
    name: string,
    raw: string | null,
    compact: (raw: string, max: number) => string,
    dataset: Parameters<typeof maxCharsForDataset>[1],
    missingNote: string,
  ) => {
    const max = maxCharsForDataset(focus, dataset, provider);
    if (max <= 0) return;
    if (!raw) {
      notes.push(missingNote);
      return;
    }
    datasets.push({
      name,
      bytes: raw.length,
      excerpt: compact(raw, max),
    });
  };

  const catalog = buildPortalCatalogSummary();
  datasets.push({
    name: "portal_catalog",
    bytes: catalog.length,
    excerpt: truncateForContext(catalog, catalogMaxChars(provider)),
  });

  pushDataset(
    "freight_dashboard_data",
    await loadFreightJson(),
    compactFreightForAssistant,
    "freight",
    "Freight dashboard_data.json not available.",
  );

  pushDataset(
    "sales_plan_data",
    await loadSalesPlanJson(),
    compactSalesPlanForAssistant,
    "sales_plan",
    "Sales plan JSON not available (Blob, public/sales_plan_data.json, or HTML embed).",
  );

  if (input.pathname.includes("or-forward-looking")) {
    const orPlan = await loadSalesPlanDashboardJson("or");
    pushDataset(
      "or_sales_plan_data",
      orPlan?.json ?? null,
      compactSalesPlanForAssistant,
      "sales_plan",
      "Oregon sales plan JSON not available — run npm run sales-plan:or-extract-publish.",
    );
  }

  pushDataset(
    "nursery_demand_data",
    await loadNurseryDemandJson(),
    compactNurseryForAssistant,
    "nursery_demand",
    "Production & Demand (nursery DEMAND) not available — refresh public/nursery-inventory-dashboard.html or publish demand JSON to Blob.",
  );

  pushDataset(
    "nursery_supply_data",
    await loadNurserySupplyJson(),
    compactNurserySupplyForAssistant,
    "nursery_supply",
    "Supply Inventory (nursery SUPPLY) not available — run npm run nursery:refresh-supply.",
  );

  const retail = await loadRetailDashboardJson();
  pushDataset(
    "retail_opp_data",
    retail?.json ?? null,
    compactRetailForAssistant,
    "retail",
    "Retail opportunity JSON not available — run npm run retail:extract-publish on VPN.",
  );

  const weather = await loadWeatherDashboardJson();
  pushDataset(
    "weather_dashboard_data",
    weather?.json ?? null,
    compactWeatherForAssistant,
    "weather",
    "Weather dashboard JSON not available — run npm run weather:publish.",
  );

  return { routeLabel, datasets, notes };
}
