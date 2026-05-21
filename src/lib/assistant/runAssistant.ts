import {
  anthropicApiKey,
  anthropicAssistantModel,
  isProviderConfigured,
  openAiApiKey,
  openAiAssistantModel,
} from "@/lib/assistant/assistantConfig";
import type {
  AssistantCompletionInput,
  AssistantCompletionResult,
  AssistantProvider,
} from "@/lib/assistant/types";

async function runOpenAi(
  input: AssistantCompletionInput,
): Promise<AssistantCompletionResult> {
  const key = openAiApiKey();
  if (!key) throw new Error("OpenAI is not configured.");

  const model = openAiAssistantModel();
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: input.system },
        ...input.messages.map((m) => ({ role: m.role, content: m.content })),
      ],
      temperature: 0.2,
      max_tokens: 2_048,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    if (errText.includes("rate_limit")) {
      throw new Error(
        "OpenAI rate limit (tokens per minute). The portal now sends a smaller context for OpenAI — wait 30–60 seconds and retry, or switch to Claude for full cross-portal data.",
      );
    }
    if (errText.includes("context_length")) {
      throw new Error(
        "OpenAI context too large for this model. Switch to Claude or ask a shorter follow-up on the current page only.",
      );
    }
    throw new Error(`OpenAI request failed: ${errText.slice(0, 500)}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content =
    data.choices?.[0]?.message?.content?.trim() ||
    "I could not generate a response.";

  return { content, model, provider: "openai" };
}

async function runAnthropic(
  input: AssistantCompletionInput,
): Promise<AssistantCompletionResult> {
  const key = anthropicApiKey();
  if (!key) throw new Error("Anthropic is not configured.");

  const model = anthropicAssistantModel();
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 2_048,
      system: input.system,
      messages: input.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    if (errText.includes("not_found_error")) {
      throw new Error(
        "Claude model not found. Set ANTHROPIC_ASSISTANT_MODEL to a valid ID (e.g. claude-sonnet-4-6) in Vercel and redeploy.",
      );
    }
    throw new Error(`Anthropic request failed: ${errText.slice(0, 500)}`);
  }

  const data = (await res.json()) as {
    content?: { type: string; text?: string }[];
  };
  const content =
    data.content
      ?.filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("")
      .trim() || "I could not generate a response.";

  return { content, model, provider: "anthropic" };
}

export async function runAssistantCompletion(
  input: AssistantCompletionInput,
): Promise<AssistantCompletionResult> {
  if (!isProviderConfigured(input.provider)) {
    throw new Error(
      `${input.provider === "openai" ? "OpenAI" : "Claude"} is not configured on this server.`,
    );
  }

  return input.provider === "openai"
    ? runOpenAi(input)
    : runAnthropic(input);
}

export function providerDisplayName(provider: AssistantProvider): string {
  return provider === "openai" ? "OpenAI" : "Claude";
}
