export function openAiApiKey(): string | null {
  const key = process.env.OPENAI_API_KEY?.trim();
  return key && key.length > 0 ? key : null;
}

export function openAiAssistantModel(): string {
  return process.env.OPENAI_ASSISTANT_MODEL?.trim() || "gpt-4o";
}

export function isPortalAssistantEnabled(): boolean {
  if (process.env.PORTAL_ASSISTANT_ENABLED === "0") return false;
  return openAiApiKey() != null;
}
