// Полный конвейер genOferta: Оферта + N документов «Изменения» -> два файла.
import { loadDocx } from "./docx";
import { applyOperations, applyOneOp } from "./apply";
import { buildCombinedDocx } from "./combined";
import { parseChangeDoc, type ParseConfig } from "./parser";
import type { BuildOptions, BuildResult, Operation } from "./types";

export interface ChangeDocInput {
  name: string;
  data: Uint8Array;
}

/** Разобрать все документы «Изменения» в операции (для экрана подтверждения). */
export async function parseAllChangeDocs(
  changeDocs: ChangeDocInput[],
  cfg: ParseConfig,
): Promise<{ operations: Operation[]; engine: "llm" | "offline" | "mixed"; notes: string[] }> {
  const all: Operation[] = [];
  const engines = new Set<string>();
  const notes: string[] = [];
  for (const cd of changeDocs) {
    const parts = await loadDocx(cd.data);
    const { operations, engine, note } = await parseChangeDoc(parts.document, cd.name, cfg);
    all.push(...operations);
    engines.add(engine);
    if (note) notes.push(`${cd.name}: ${note}`);
  }
  const engine = engines.size > 1 ? "mixed" : ((engines.values().next().value as "llm" | "offline") ?? "offline");
  return { operations: all, engine, notes };
}

/** Отсортировать операции по порядку следования в Оферте (по позиции цели). */
export async function orderOperations(
  offerData: Uint8Array,
  operations: Operation[],
  opts: BuildOptions,
): Promise<Operation[]> {
  const offer = await loadDocx(offerData);
  const keyed = operations.map((op) => {
    // Локация на ЧИСТОЙ копии — без мутации исходного текста.
    const state = { document: offer.document, footnotes: offer.footnotes };
    const r = applyOneOp(op, state, { ...opts, highlightMode: opts.highlightMode });
    return { op, key: r.ok ? r.orderKey : Number.MAX_SAFE_INTEGER };
  });
  keyed.sort((a, b) => a.key - b.key);
  return keyed.map((k) => k.op);
}

/** Собрать оба итоговых файла из уже подтверждённых операций. */
export async function buildOutputs(
  offerData: Uint8Array,
  operations: Operation[],
  opts: BuildOptions = {},
): Promise<BuildResult> {
  const ordered = await orderOperations(offerData, operations, opts);
  const offer = await loadDocx(offerData);
  const { offerDocx, results } = await applyOperations(offer, ordered, opts);
  const combinedDocx = await buildCombinedDocx(ordered);
  return {
    offerDocx,
    combinedDocx,
    results,
    orderedOperationIds: ordered.map((o) => o.id),
  };
}
