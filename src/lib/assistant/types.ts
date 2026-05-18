export type AssistantProvider = "openai" | "anthropic";

export type AssistantChatTurn = {
  role: "user" | "assistant";
  content: string;
};

export type AssistantCompletionInput = {
  provider: AssistantProvider;
  system: string;
  messages: AssistantChatTurn[];
};

export type AssistantCompletionResult = {
  content: string;
  model: string;
  provider: AssistantProvider;
};
