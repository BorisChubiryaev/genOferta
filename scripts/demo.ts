// E2E-прогон движка на реальных образцах из fixtures/ (без Next.js, без ИИ).
//   npx tsx scripts/demo.ts
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { parseAllChangeDocs, buildOutputs } from "../lib/pipeline";
import { loadDocx } from "../lib/docx";
import { indexFootnotes, findFootnoteById } from "../lib/offer-index";
import { xmlText } from "../lib/text";

const FX = join(process.cwd(), "fixtures");
const OUT = join(process.cwd(), "tmp-out");
mkdirSync(OUT, { recursive: true });

function load(name: string): Uint8Array {
  return new Uint8Array(readFileSync(join(FX, name)));
}

async function main() {
  const offerData = load("offer-prilozhenie7.docx");
  const changeDocs = [
    { name: "Изменения №1", data: load("izmeneniya-1.docx") },
    { name: "Изменения №2", data: load("izmeneniya-2.docx") },
  ];

  console.log("── Разбор инструкций (оффлайн-парсер) ──");
  const { operations, engine, notes } = await parseAllChangeDocs(changeDocs, { llm: null });
  console.log(`движок разбора: ${engine}; распознано операций: ${operations.length}`);
  notes.forEach((n) => console.log("  примечание:", n));
  for (const op of operations) {
    console.log(
      `  • [${op.sourceDoc}] ${op.type} → ${JSON.stringify(op.target)}` +
        (op.anchor ? `\n      якорь: «${op.anchor}»` : "") +
        (op.payload ? `\n      текст: ${op.payload.slice(0, 80)}` : "") +
        (op.rows ? `\n      строк таблицы: ${op.rows.length}` : ""),
    );
  }

  console.log("\n── Сборка итоговых файлов ──");
  const result = await buildOutputs(offerData, operations, { highlightMode: "color" });
  console.log("порядок операций (по следованию в Оферте):");
  result.orderedOperationIds.forEach((id, i) => {
    const op = operations.find((o) => o.id === id)!;
    console.log(`  ${i + 1}. ${op.rawText.slice(0, 70)}`);
  });
  console.log("\nотчёт применения:");
  let okCount = 0;
  for (const r of result.results) {
    console.log(`  ${r.ok ? "✓" : "✗"} ${r.operationId}: ${r.message}`);
    if (r.ok) okCount++;
  }
  console.log(`\nуспешно применено: ${okCount}/${result.results.length}`);

  writeFileSync(join(OUT, "offer-updated.docx"), result.offerDocx);
  writeFileSync(join(OUT, "combined-changes.docx"), result.combinedDocx);
  console.log("\nзаписано: tmp-out/offer-updated.docx, tmp-out/combined-changes.docx");

  // ── Проверка: сноска 32 действительно получила добавление ──
  console.log("\n── Проверка результата в Оферте ──");
  const updated = await loadDocx(result.offerDocx);
  const idx = indexFootnotes(updated.document);
  for (const num of [32, 33, 57, 66]) {
    const id = idx.displayToId.get(num)!;
    const fn = findFootnoteById(updated.footnotes!, id);
    const txt = fn ? xmlText(fn.inner) : "(нет)";
    console.log(`  сноска № ${num} (id=${id}): …${txt.slice(-90)}`);
  }
  // п.7.6 — «код цвета» должен появиться после якоря
  const has76 = updated.document.includes("код цвета Транспортного средства");
  console.log(`  п.7.6 добавление «код цвета…» присутствует: ${has76}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
