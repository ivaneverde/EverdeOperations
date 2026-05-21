import { NextResponse } from "next/server";
import {
  defaultAssistantProvider,
  isPortalAssistantEnabled,
  listConfiguredProviders,
  modelLabelForProvider,
  openAiCompendiumMode,
} from "@/lib/assistant/assistantConfig";
import { providerDisplayName } from "@/lib/assistant/runAssistant";
import { guardPortalApi } from "@/lib/auth/guardApiRoute";
import type { AssistantProvider } from "@/lib/assistant/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const gate = await guardPortalApi(request);
  if (!gate.ok) return gate.response;

  const providers = listConfiguredProviders();
  const defaultProvider = defaultAssistantProvider();

  return NextResponse.json({
    enabled: isPortalAssistantEnabled(),
    defaultProvider,
    openAiCompendium: openAiCompendiumMode(),
    providers: providers.map((id: AssistantProvider) => ({
      id,
      label: providerDisplayName(id),
      model: modelLabelForProvider(id),
    })),
  });
}
