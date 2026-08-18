// Конфигурация разбора из переменных окружения.
import type { ParseConfig } from "./parser";

export function isOffline(): boolean {
  const flag = (process.env.GENOFERTA_OFFLINE ?? "").toLowerCase();
  if (flag === "1" || flag === "true") return true;
  return !process.env.OPENROUTER_API_KEY;
}

/** Режим разбора, выбираемый в интерфейсе. */
export type EngineMode = "auto" | "ai" | "algo";

function llmFromEnv(modelOverride?: string): ParseConfig["llm"] {
  return {
    apiKey: process.env.OPENROUTER_API_KEY!,
    model: modelOverride || process.env.OPENROUTER_MODEL || "deepseek/deepseek-chat-v3.1:free",
    appUrl: process.env.OPENROUTER_APP_URL,
    appTitle: process.env.OPENROUTER_APP_TITLE || "genOferta",
    baseUrl: process.env.OPENROUTER_BASE_URL || undefined,
  };
}

export function parseConfigFromEnv(): ParseConfig {
  if (isOffline()) return { llm: null };
  return { llm: llmFromEnv() };
}

/**
 * Конфигурация под выбранный режим:
 *  - algo — всегда без ИИ (детерминированный алгоритм);
 *  - ai   — принудительно ИИ (при недоступности сработает алгоритм-fallback);
 *  - auto — ИИ, если задан ключ, иначе алгоритм.
 */
export function parseConfigForMode(mode: EngineMode, modelOverride?: string): ParseConfig {
  if (mode === "algo") return { llm: null };
  if (mode === "ai") {
    if (!process.env.OPENROUTER_API_KEY) return { llm: null };
    return { llm: llmFromEnv(modelOverride) };
  }
  // auto
  if (isOffline()) return { llm: null };
  return { llm: llmFromEnv(modelOverride) };
}
