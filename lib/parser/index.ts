// Оркестратор разбора одного документа «Изменения» в операции.
import { paragraphs, tables } from "../text";
import type { Operation } from "../types";
import { parseInstructionsOffline, resetIds } from "./offline";
import { parseInstructionsLLM, type LlmConfig } from "./llm";

export interface ParseConfig {
  /** Конфигурация OpenRouter; null — оффлайн-режим (без ИИ). */
  llm: LlmConfig | null;
}

/** Заполнить строки таблицы для append_table_rows из таблиц самого документа. */
function fillTableRows(ops: Operation[], docTables: string[][][]): void {
  for (const op of ops) {
    if (op.type !== "append_table_rows" || (op.rows && op.rows.length)) continue;
    const range = op.rowRange;
    if (!range) continue;
    for (const tbl of docTables) {
      const hit = tbl
        .filter((r) => {
          const n = parseInt((r[0] || "").trim(), 10);
          return n >= range.from && n <= range.to;
        })
        .map((r) => r.map((c) => c.trim()));
      if (hit.length) {
        op.rows = hit;
        break;
      }
    }
    if (!op.rows || !op.rows.length) {
      op.warnings = [...(op.warnings ?? []), "строки таблицы не найдены в документе"];
      op.confidence = Math.min(op.confidence, 0.4);
    }
  }
}

export async function parseChangeDoc(
  documentXml: string,
  sourceDoc: string,
  cfg: ParseConfig,
): Promise<{ operations: Operation[]; engine: "llm" | "offline"; note?: string }> {
  const paras = paragraphs(documentXml);
  const docTables = tables(documentXml);

  if (cfg.llm) {
    try {
      const ops = await parseInstructionsLLM(paras, sourceDoc, cfg.llm);
      fillTableRows(ops, docTables);
      if (ops.length) return { operations: ops, engine: "llm" };
      // ИИ ничего не вернул — падаем в оффлайн.
    } catch (e) {
      // Сеть/ключ/квота — прозрачно переключаемся на оффлайн.
      resetIds();
      const ops = parseInstructionsOffline(paras, docTables, sourceDoc);
      return {
        operations: ops,
        engine: "offline",
        note: `ИИ недоступен (${(e as Error).message}); использован оффлайн-парсер`,
      };
    }
  }

  resetIds();
  const ops = parseInstructionsOffline(paras, docTables, sourceDoc);
  return { operations: ops, engine: "offline" };
}
