import type { AssistantProvider } from "@/lib/assistant/types";

export function openAiApiKey(): string | null {
  const key = process.env.OPENAI_API_KEY?.trim();
  return key && key.length > 0 ? key : null;
}

export function anthropicApiKey(): string | null {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  return key && key.length > 0 ? key : null;
}

export function openAiAssistantModel(): string {
  return process.env.OPENAI_ASSISTANT_MODEL?.trim() || "gpt-4o";
}

export function anthropicAssistantModel(): string {
  return process.env.ANTHROPIC_ASSISTANT_MODEL?.trim() || "claude-sonnet-4-6";
}

export function defaultAssistantProvider(): AssistantProvider {
  const env = process.env.PORTAL_ASSISTANT_PROVIDER?.trim().toLowerCase();
  if (env === "anthropic" && isProviderConfigured("anthropic")) return "anthropic";
  if (env === "openai" && isProviderConfigured("openai")) return "openai";
  // Prefer Claude when both keys exist — larger context, fewer TPM rate limits.
  if (isProviderConfigured("anthropic")) return "anthropic";
  if (isProviderConfigured("openai")) return "openai";
  return "openai";
}

export function isProviderConfigured(provider: AssistantProvider): boolean {
  if (provider === "openai") return openAiApiKey() != null;
  return anthropicApiKey() != null;
}

export function isPortalAssistantEnabled(): boolean {
  if (process.env.PORTAL_ASSISTANT_ENABLED === "0") return false;
  return isProviderConfigured("openai") || isProviderConfigured("anthropic");
}

export function listConfiguredProviders(): AssistantProvider[] {
  const out: AssistantProvider[] = [];
  if (isProviderConfigured("openai")) out.push("openai");
  if (isProviderConfigured("anthropic")) out.push("anthropic");
  return out;
}

export function parseAssistantProvider(
  value: unknown,
): AssistantProvider | null {
  if (value === "openai" || value === "anthropic") return value;
  return null;
}

export function modelLabelForProvider(provider: AssistantProvider): string {
  return provider === "openai"
    ? openAiAssistantModel()
    : anthropicAssistantModel();
}

/**
 * When true (default), OpenAI receives the same multi-dataset compendium as Claude
 * on every page. Set OPENAI_ASSISTANT_COMPENDIUM=0 for page-focused context (Tier 1 TPM).
 */
export function openAiCompendiumMode(): boolean {
  const env = process.env.OPENAI_ASSISTANT_COMPENDIUM?.trim().toLowerCase();
  if (env === "0" || env === "false" || env === "focused") return false;
  return true;
}

/**
 * When true (default), Claude gets freight + sales plan + nursery + retail + weather
 * on every request (~20k–50k input tokens). Set ANTHROPIC_ASSISTANT_COMPENDIUM=0 for
 * page-focused context so back-to-back questions hit Anthropic TPM limits less often.
 */
export function anthropicCompendiumMode(): boolean {
  const env = process.env.ANTHROPIC_ASSISTANT_COMPENDIUM?.trim().toLowerCase();
  if (env === "0" || env === "false" || env === "focused") return false;
  return true;
}
