// Разбор инструкций через OpenRouter (OpenAI-совместимый API).
// ИИ выступает ПАРСЕРОМ НАМЕРЕНИЯ: превращает свободный текст инструкции
// в строгий JSON-список операций. Он НЕ переписывает текст Оферты —
// это делает детерминированный движок.
import type { Operation } from "../types";

const SYSTEM_PROMPT = `Ты — парсер юридических инструкций об изменениях в публичную оферту.
На вход даётся список пунктов-инструкций (каждый — как изменить оферту).
Верни СТРОГО JSON вида {"operations": Operation[]} без пояснений.

Тип Operation:
{
  "type": "insert_after" | "replace" | "append_table_rows",
  "target": {
     "kind": "footnote", "number": <int>            // «Сноску N …»
   | "term", "term": <string>, "point": <string?>   // «п. 2.44 «Устройство»»
   | "point", "point": <string>, "heading": <string?> // «Пункт 7.6 …»
   | "appendix_point", "appendix": <string>, "point": <string>
   | "appendix_table", "appendix": <string>, "point": <string>
  },
  "anchor": <string?>,        // для insert_after — фраза «после слов …»
  "payload": <string?>,       // вставляемый/заменяющий текст без внешних «ёлочек»
  "renumberFootnotes": <bool?>,
  "rowRange": {"from": <int>, "to": <int>}?  // для append_table_rows
}

Правила:
- Сохраняй payload дословно, вместе с внутренними кавычками и знаками.
- Для insert_after payload должен начинаться с нужного разделителя (запятая/пробел),
  чтобы вставка читалась естественно после якоря.
- Для append_table_rows НЕ придумывай данные строк — только укажи rowRange.
- Ничего, кроме JSON, не выводи.`;

interface LlmOp {
  type: Operation["type"];
  target: Operation["target"];
  anchor?: string;
  payload?: string;
  renumberFootnotes?: boolean;
  rowRange?: { from: number; to: number };
}

export interface LlmConfig {
  apiKey: string;
  model: string;
  appUrl?: string;
  appTitle?: string;
  /** База OpenAI-совместимого API. По умолчанию — OpenRouter. */
  baseUrl?: string;
}

export async function parseInstructionsLLM(
  paras: string[],
  sourceDoc: string,
  cfg: LlmConfig,
): Promise<Operation[]> {
  const userContent =
    "Инструкции об изменениях (по одной на строку):\n" +
    paras.map((p, i) => `${i + 1}. ${p}`).join("\n");

  const base = (cfg.baseUrl ?? "https://openrouter.ai/api/v1").replace(/\/$/, "");
  const resp = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      "Content-Type": "application/json",
      ...(cfg.appUrl ? { "HTTP-Referer": cfg.appUrl } : {}),
      ...(cfg.appTitle ? { "X-Title": cfg.appTitle } : {}),
    },
    body: JSON.stringify({
      model: cfg.model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
    }),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`OpenRouter ${resp.status}: ${body.slice(0, 300)}`);
  }

  const data = await resp.json();
  const content: string = data?.choices?.[0]?.message?.content ?? "";
  const parsed = safeJson(content);
  const rawOps: LlmOp[] = Array.isArray(parsed?.operations) ? parsed.operations : [];

  return rawOps.map((o, i) => ({
    id: `${sourceDoc}#llm${i + 1}`,
    sourceDoc,
    type: o.type,
    target: o.target,
    anchor: o.anchor,
    payload: o.payload,
    renumberFootnotes: o.renumberFootnotes,
    rowRange: o.rowRange,
    rawText: paras[i] ?? "",
    confidence: 0.75,
  }));
}

function safeJson(s: string): { operations?: LlmOp[] } | null {
  try {
    return JSON.parse(s);
  } catch {
    const m = s.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}
