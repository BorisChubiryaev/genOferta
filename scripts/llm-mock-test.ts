import http from "node:http";
import { readFileSync } from "node:fs";
import { loadDocx } from "../lib/docx";
import { paragraphs } from "../lib/text";
import { parseInstructionsLLM } from "../lib/parser/llm";
import { parseChangeDoc } from "../lib/parser";
import { buildOutputs } from "../lib/pipeline";

// Мок OpenRouter (localhost, минуя egress-прокси): возвращает валидный
// chat.completion с JSON операций — проверяем весь ИИ-путь кода.
async function main() {
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const reqJson = JSON.parse(body);
      const debug = {
        hasSystem: reqJson.messages?.[0]?.role === "system",
        jsonMode: reqJson.response_format?.type === "json_object",
        model: reqJson.model,
        authPrefix: (req.headers["authorization"] as string)?.slice(0, 10),
        referer: req.headers["http-referer"],
      };
      console.log("  [mock] запрос собран корректно:", JSON.stringify(debug));
      const ops = {
        operations: [
          { type: "insert_after", target: { kind: "footnote", number: 32 }, anchor: "«ООО СК «Сбербанк Страхование»", payload: ", ООО «ДубльГИС», ООО «НТС»." },
          { type: "insert_after", target: { kind: "footnote", number: 33 }, anchor: "«ООО СК «Сбербанк Страхование»", payload: ", ООО «СберАвто», ООО «ДубльГИС», ООО «НТС»." },
          { type: "insert_after", target: { kind: "point", point: "7.6", heading: "ПЕРСОНАЛЬНЫЕ ДАННЫЕ" }, anchor: "«реквизиты свидетельства о регистрации транспортного средства»", payload: " код цвета Транспортного средства; пользовательское название Транспортного средства;", renumberFootnotes: true },
        ],
      };
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(ops) } }] }));
    });
  });
  await new Promise<void>((r) => server.listen(0, r));
  const port = (server.address() as { port: number }).port;
  const base = `http://127.0.0.1:${port}/v1`;

  console.log("── 1) parseInstructionsLLM напрямую ──");
  const parts = await loadDocx(new Uint8Array(readFileSync("fixtures/izmeneniya-1.docx")));
  const paras = paragraphs(parts.document);
  const ops = await parseInstructionsLLM(paras, "izmeneniya-1.docx", {
    apiKey: "sk-test",
    model: "deepseek/deepseek-chat-v3.1:free",
    baseUrl: base,
    appUrl: "http://localhost:3000",
  });
  console.log("  операций от ИИ:", ops.length);
  ops.forEach((o) => console.log("   •", o.type, JSON.stringify(o.target)));

  console.log("\n── 2) parseChangeDoc с ИИ + сборка Оферты ──");
  const cfg = { llm: { apiKey: "sk-test", model: "m", baseUrl: base } };
  const r = await parseChangeDoc(parts.document, "izmeneniya-1.docx", cfg);
  console.log("  engine:", r.engine, "операций:", r.operations.length);
  const built = await buildOutputs(
    new Uint8Array(readFileSync("fixtures/offer-prilozhenie7.docx")),
    r.operations,
    { highlightMode: "color" },
  );
  const ok = built.results.filter((x) => x.ok).length;
  console.log(`  применено к Оферте: ${ok}/${built.results.length}`);
  built.results.forEach((x) => console.log(`   ${x.ok ? "✓" : "✗"} ${x.message}`));

  server.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
