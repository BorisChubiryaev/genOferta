// Конфигурация разбора из переменных окружения.
import type { ParseConfig } from "./parser";

export function isOffline(): boolean {
  const flag = (process.env.GENOFERTA_OFFLINE ?? "").toLowerCase();
  if (flag === "1" || flag === "true") return true;
  return !process.env.OPENROUTER_API_KEY;
}

export function parseConfigFromEnv(): ParseConfig {
  if (isOffline()) return { llm: null };
  return {
    llm: {
      apiKey: process.env.OPENROUTER_API_KEY!,
      model: process.env.OPENROUTER_MODEL || "deepseek/deepseek-chat-v3.1:free",
      appUrl: process.env.OPENROUTER_APP_URL,
      appTitle: process.env.OPENROUTER_APP_TITLE || "genOferta",
      baseUrl: process.env.OPENROUTER_BASE_URL || undefined,
    },
  };
}
