import { NextResponse } from "next/server";
import {
  defaultAssistantProvider,
  isPortalAssistantEnabled,
  parseAssistantProvider,
} from "@/lib/assistant/assistantConfig";
import { maxChatTurns, maxTurnChars } from "@/lib/assistant/contextBudget";
import { buildAssistantContext } from "@/lib/assistant/buildAssistantContext";
import { runAssistantCompletion } from "@/lib/assistant/runAssistant";
import type { AssistantChatTurn } from "@/lib/assistant/types";
import { guardPortalApi } from "@/lib/auth/guardApiRoute";

export const dynamic = "force-dynamic";

type ChatBody = {
  messages?: AssistantChatTurn[];
  pathname?: string;
  sectionId?: string;
  reportSlug?: string;
  provider?: string;
};

function buildSystemPrompt(ctx: Awaited<ReturnType<typeof buildAssistantContext>>): string {
  const blocks = ctx.datasets.map(
    (d) => `### ${d.name} (${d.bytes} bytes)\n${d.excerpt}`,
  );
  return [
    "You are the Everde AI Operations compendium analyst for an internal multi-section portal (freight, sales plan, production/demand, retail, supply).",
    `The user is viewing: ${ctx.routeLabel}.`,
    "",
    ...ctx.notes,
    "",
    "Use clear, professional business language. Structure answers with short headings when helpful.",
    "Always cite numbers from the JSON. Name entities (carriers, farms, key items, channels) when the data supports it.",
    "For rankings (most expensive carrier, top farm by BO, largest plan miss): use assistant_facts first, then confirm from detail arrays.",
    "For cross-section questions, synthesize across freight_dashboard_data, sales_plan_data, and nursery_demand_data.",
    "Anti-denial: if a dataset is listed under Datasets below, the data IS loaded — answer from it. Never say you cannot find / don't have data that appears in context. Only cite a gap when a notes line says that specific dataset is unpublished, and still answer from other loaded datasets.",
    "HD/Lowe's Following Week: context often has meta/totals only; for store×SKU detail tell the user to open the portal grid or use Teams bot tools — do not claim the retailer data does not exist when hd_ytd / lowes_ytd meta is present.",
    "",
    "## Datasets",
    ...blocks,
  ].join("\n");
}

export async function POST(request: Request) {
  const gate = await guardPortalApi(request);
  if (!gate.ok) return gate.response;

  if (!isPortalAssistantEnabled()) {
    return NextResponse.json(
      {
        error:
          "Portal assistant is not configured (set OPENAI_API_KEY and/or ANTHROPIC_API_KEY).",
      },
      { status: 503 },
    );
  }

  let body: ChatBody;
  try {
    body = (await request.json()) as ChatBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const messages = Array.isArray(body.messages) ? body.messages : [];
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser?.content?.trim()) {
    return NextResponse.json({ error: "A user message is required." }, { status: 400 });
  }

  const provider =
    parseAssistantProvider(body.provider) ?? defaultAssistantProvider();

  const pathname =
    typeof body.pathname === "string" && body.pathname.trim()
      ? body.pathname.trim()
      : "/";

  const ctx = await buildAssistantContext({
    pathname,
    sectionId: body.sectionId,
    reportSlug: body.reportSlug,
    provider,
    userEmail: gate.user.email,
  });

  const turns = messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-maxChatTurns(provider))
    .map((m) => ({
      role: m.role,
      content: m.content.slice(0, maxTurnChars(provider)),
    }));

  try {
    const result = await runAssistantCompletion({
      provider,
      system: buildSystemPrompt(ctx),
      messages: turns,
    });

    return NextResponse.json({
      message: { role: "assistant", content: result.content },
      provider: result.provider,
      model: result.model,
      routeLabel: ctx.routeLabel,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Assistant request failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
