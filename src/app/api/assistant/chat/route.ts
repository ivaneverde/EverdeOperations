import { NextResponse } from "next/server";
import {
  defaultAssistantProvider,
  isPortalAssistantEnabled,
  parseAssistantProvider,
} from "@/lib/assistant/assistantConfig";
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
    "You are the Everde AI Operations analyst assistant for an internal nursery operations portal.",
    `The user is viewing: ${ctx.routeLabel}.`,
    "",
    ...ctx.notes,
    "",
    "Use clear business language. Cite numbers from the JSON. Give actionable suggestions when appropriate.",
    "For carrier questions: if assistant_facts.most_expensive_carrier_by_total_ytd_cost is present, state that carrier name and cost explicitly.",
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
  });

  const turns = messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-12)
    .map((m) => ({
      role: m.role,
      content: m.content.slice(0, 8_000),
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
