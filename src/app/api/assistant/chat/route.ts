import { NextResponse } from "next/server";
import { buildAssistantContext } from "@/lib/assistant/buildAssistantContext";
import {
  isPortalAssistantEnabled,
  openAiApiKey,
  openAiAssistantModel,
} from "@/lib/assistant/openaiConfig";
import { guardPortalApi } from "@/lib/auth/guardApiRoute";

export const dynamic = "force-dynamic";

type ChatMessage = { role: "user" | "assistant"; content: string };

type ChatBody = {
  messages?: ChatMessage[];
  pathname?: string;
  sectionId?: string;
  reportSlug?: string;
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
      { error: "Portal assistant is not configured (OPENAI_API_KEY missing)." },
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

  const pathname =
    typeof body.pathname === "string" && body.pathname.trim()
      ? body.pathname.trim()
      : "/";

  const ctx = await buildAssistantContext({
    pathname,
    sectionId: body.sectionId,
    reportSlug: body.reportSlug,
  });

  const openAiMessages = [
    { role: "system" as const, content: buildSystemPrompt(ctx) },
    ...messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(-12)
      .map((m) => ({
        role: m.role,
        content: m.content.slice(0, 8_000),
      })),
  ];

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openAiApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: openAiAssistantModel(),
      messages: openAiMessages,
      temperature: 0.2,
      max_tokens: 2_048,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    return NextResponse.json(
      {
        error: "OpenAI request failed.",
        detail: errText.slice(0, 500),
      },
      { status: 502 },
    );
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const reply =
    data.choices?.[0]?.message?.content?.trim() ||
    "I could not generate a response.";

  return NextResponse.json({
    message: { role: "assistant", content: reply },
    model: openAiAssistantModel(),
    routeLabel: ctx.routeLabel,
  });
}
