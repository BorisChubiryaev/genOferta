"use client";

import { useMemo, useState } from "react";
import type { Operation, HighlightMode } from "@/lib/types";

type Stage = "upload" | "review" | "done";
type EngineMode = "auto" | "ai" | "algo";

interface ApplyResult {
  operationId: string;
  ok: boolean;
  message: string;
}

function targetLabel(op: Operation): string {
  const t = op.target;
  switch (t.kind) {
    case "footnote":
      return `Сноска № ${t.number}`;
    case "term":
      return `Термин${t.point ? ` (п. ${t.point})` : ""}: «${t.term}»`;
    case "point":
      return `Пункт ${t.point}${t.heading ? ` — ${t.heading}` : ""}`;
    case "appendix_point":
      return `Приложение №${t.appendix}, п. ${t.point}`;
    case "appendix_table":
      return `Таблица п. ${t.point} Приложения №${t.appendix}`;
  }
}

const OP_TYPE_LABEL: Record<Operation["type"], string> = {
  insert_after: "вставка после слов",
  replace: "изложить в новой редакции",
  append_table_rows: "добавить строки таблицы",
  delete: "исключить",
};

async function fileToB64(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  return btoa(bin);
}

function downloadB64(b64: string, filename: string) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Home() {
  const [stage, setStage] = useState<Stage>("upload");
  const [offer, setOffer] = useState<File | null>(null);
  const [changes, setChanges] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [offerB64, setOfferB64] = useState<string>("");
  const [operations, setOperations] = useState<Operation[]>([]);
  const [included, setIncluded] = useState<Record<string, boolean>>({});
  const [engine, setEngine] = useState<string>("");
  const [usedMode, setUsedMode] = useState<EngineMode>("auto");
  const [notes, setNotes] = useState<string[]>([]);
  const [offline, setOffline] = useState(false);

  const [engineMode, setEngineMode] = useState<EngineMode>("auto");
  const [model, setModel] = useState<string>("");
  const [highlightMode, setHighlightMode] = useState<HighlightMode>("color");
  const [results, setResults] = useState<ApplyResult[]>([]);
  const [outOffer, setOutOffer] = useState<string>("");
  const [outCombined, setOutCombined] = useState<string>("");

  const includedOps = useMemo(
    () => operations.filter((o) => included[o.id] !== false),
    [operations, included],
  );

  async function handleParse() {
    if (!offer || changes.length === 0) {
      setError("Загрузите Оферту и хотя бы один документ с изменениями.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      setOfferB64(await fileToB64(offer));
      const fd = new FormData();
      changes.forEach((c) => fd.append("changes", c));
      fd.append("mode", engineMode);
      if (engineMode !== "algo" && model.trim()) fd.append("model", model.trim());
      const resp = await fetch("/api/parse", { method: "POST", body: fd });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Ошибка разбора");
      setOperations(data.operations);
      setIncluded({});
      setEngine(data.engine);
      setUsedMode((data.mode as EngineMode) || "auto");
      setNotes(data.notes || []);
      setOffline(!!data.offline);
      setStage("review");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function updateOp(id: string, patch: Partial<Operation>) {
    setOperations((ops) => ops.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  }

  async function handleBuild() {
    setError(null);
    setBusy(true);
    try {
      const resp = await fetch("/api/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          offerB64,
          operations: includedOps,
          options: { highlightMode, author: "genOferta" },
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Ошибка сборки");
      setResults(data.results);
      setOutOffer(data.offerDocxB64);
      setOutCombined(data.combinedDocxB64);
      setStage("done");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setStage("upload");
    setOperations([]);
    setResults([]);
    setOutOffer("");
    setOutCombined("");
    setError(null);
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">genOferta</h1>
        <p className="mt-1 text-sm opacity-70">
          Объединение изменений в публичную оферту «Удобный доступ»: загрузите
          действующую Оферту и документы с изменениями — на выходе объединённый
          файл изменений и текст Оферты с выделенными правками.
        </p>
      </header>

      <Steps stage={stage} />

      {error && (
        <div className="mb-4 rounded-lg border border-red-400/50 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-300">
          {error}
        </div>
      )}

      {stage === "upload" && (
        <section className="space-y-6">
          <FileDrop
            label="Действующая Оферта (Приложение 7), .docx"
            multiple={false}
            onFiles={(fs) => setOffer(fs[0] ?? null)}
            files={offer ? [offer] : []}
          />
          <FileDrop
            label="Документы с изменениями (можно несколько), .docx"
            multiple
            onFiles={(fs) => setChanges(fs)}
            files={changes}
          />
          <fieldset className="rounded-xl border border-black/10 px-4 py-3 dark:border-white/10">
            <legend className="px-1 text-xs opacity-60">Способ разбора инструкций</legend>
            <div className="flex flex-col gap-1.5 text-sm">
              {[
                { v: "auto", t: "Авто", d: "ИИ, если доступен, иначе алгоритм" },
                { v: "ai", t: "ИИ (OpenRouter)", d: "принудительно ИИ; при недоступности — алгоритм" },
                { v: "algo", t: "Только алгоритм", d: "детерминированный парсер, без ИИ и без сети" },
              ].map((o) => (
                <label key={o.v} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="engine"
                    checked={engineMode === o.v}
                    onChange={() => setEngineMode(o.v as EngineMode)}
                  />
                  <span className="font-medium">{o.t}</span>
                  <span className="text-xs opacity-55">— {o.d}</span>
                </label>
              ))}
            </div>
            {engineMode !== "algo" && (
              <label className="mt-2 block text-xs">
                <span className="opacity-60">Модель OpenRouter (необязательно; по умолчанию из настроек сервера)</span>
                <input
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="напр. dots-studio/dots-3-note-preview:free"
                  className="mt-0.5 w-full rounded border border-black/15 bg-transparent px-2 py-1 dark:border-white/15"
                />
              </label>
            )}
          </fieldset>
          <button
            onClick={handleParse}
            disabled={busy}
            className="rounded-lg bg-emerald-600 px-5 py-2.5 font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {busy ? "Распознаём…" : "Распознать изменения →"}
          </button>
        </section>
      )}

      {stage === "review" && (
        <section className="space-y-5">
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-black/10 bg-black/[0.03] px-4 py-3 text-sm dark:border-white/10 dark:bg-white/[0.03]">
            <span className="font-medium">
              Распознано операций: {operations.length}
            </span>
            <span className="rounded-full bg-black/10 px-2 py-0.5 text-xs dark:bg-white/10">
              разбор:{" "}
              {engine === "llm"
                ? "ИИ (OpenRouter)"
                : engine === "mixed"
                  ? "ИИ + алгоритм"
                  : usedMode === "algo"
                    ? "алгоритм (выбрано)"
                    : "алгоритм"}
            </span>
            {offline && usedMode !== "algo" && (
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-300">
                ИИ недоступен — сработал алгоритм
              </span>
            )}
          </div>
          {notes.map((n, i) => (
            <p key={i} className="text-xs opacity-60">
              ⚠ {n}
            </p>
          ))}

          <p className="text-sm opacity-70">
            Проверьте распознанные правки. При необходимости отредактируйте текст
            вставки/замены или отключите ошибочные пункты. Юридический текст Оферты
            менять будет только движок — строго по подтверждённым операциям.
          </p>

          <div className="space-y-3">
            {operations.map((op, i) => (
              <OpCard
                key={op.id}
                op={op}
                index={i + 1}
                included={included[op.id] !== false}
                onToggle={(v) => setIncluded((s) => ({ ...s, [op.id]: v }))}
                onChange={(patch) => updateOp(op.id, patch)}
              />
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-4 border-t border-black/10 pt-4 dark:border-white/10">
            <label className="text-sm">
              Выделение изменений:{" "}
              <select
                value={highlightMode}
                onChange={(e) => setHighlightMode(e.target.value as HighlightMode)}
                className="ml-1 rounded border border-black/20 bg-transparent px-2 py-1 dark:border-white/20"
              >
                <option value="color">цветом (как в образце)</option>
                <option value="tracked">рецензирование (исправления)</option>
                <option value="both">цветом + рецензирование</option>
              </select>
            </label>
            <button
              onClick={handleBuild}
              disabled={busy || includedOps.length === 0}
              className="rounded-lg bg-emerald-600 px-5 py-2.5 font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {busy ? "Собираем…" : `Собрать файлы (${includedOps.length}) →`}
            </button>
            <button onClick={reset} className="text-sm underline opacity-70">
              начать заново
            </button>
          </div>
        </section>
      )}

      {stage === "done" && (
        <section className="space-y-5">
          <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm">
            Готово. Применено операций: {results.filter((r) => r.ok).length}/{results.length}.
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => downloadB64(outCombined, "Объединённые_изменения.docx")}
              className="rounded-lg bg-emerald-600 px-5 py-2.5 font-medium text-white hover:bg-emerald-500"
            >
              ↓ Объединённый файл изменений
            </button>
            <button
              onClick={() => downloadB64(outOffer, "Оферта_с_изменениями.docx")}
              className="rounded-lg bg-emerald-600 px-5 py-2.5 font-medium text-white hover:bg-emerald-500"
            >
              ↓ Оферта с выделенными изменениями
            </button>
          </div>
          <div className="space-y-1.5">
            {results.map((r) => (
              <div key={r.operationId} className="flex gap-2 text-sm">
                <span>{r.ok ? "✅" : "❌"}</span>
                <span className="opacity-80">{r.message}</span>
              </div>
            ))}
          </div>
          <button onClick={reset} className="text-sm underline opacity-70">
            начать заново
          </button>
        </section>
      )}
    </main>
  );
}

function Steps({ stage }: { stage: Stage }) {
  const items = [
    { k: "upload", n: "1. Загрузка" },
    { k: "review", n: "2. Проверка" },
    { k: "done", n: "3. Файлы" },
  ];
  return (
    <ol className="mb-6 flex gap-2 text-xs">
      {items.map((it) => (
        <li
          key={it.k}
          className={`rounded-full px-3 py-1 ${
            stage === it.k
              ? "bg-emerald-600 text-white"
              : "bg-black/[0.06] opacity-60 dark:bg-white/[0.08]"
          }`}
        >
          {it.n}
        </li>
      ))}
    </ol>
  );
}

function FileDrop({
  label,
  multiple,
  files,
  onFiles,
}: {
  label: string;
  multiple: boolean;
  files: File[];
  onFiles: (files: File[]) => void;
}) {
  return (
    <label className="block cursor-pointer rounded-xl border-2 border-dashed border-black/15 bg-black/[0.02] px-4 py-6 text-sm hover:border-emerald-500/60 dark:border-white/15 dark:bg-white/[0.02]">
      <div className="mb-2 font-medium">{label}</div>
      <input
        type="file"
        accept=".docx"
        multiple={multiple}
        className="block w-full text-xs"
        onChange={(e) => onFiles(Array.from(e.target.files ?? []))}
      />
      {files.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs opacity-70">
          {files.map((f) => (
            <li key={f.name}>📄 {f.name}</li>
          ))}
        </ul>
      )}
    </label>
  );
}

function OpCard({
  op,
  index,
  included,
  onToggle,
  onChange,
}: {
  op: Operation;
  index: number;
  included: boolean;
  onToggle: (v: boolean) => void;
  onChange: (patch: Partial<Operation>) => void;
}) {
  const low = op.confidence < 0.6;
  return (
    <div
      className={`rounded-xl border px-4 py-3 ${
        included ? "border-black/12 dark:border-white/12" : "border-black/8 opacity-50 dark:border-white/8"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm">
          <span className="mr-2 font-semibold">{index}.</span>
          <span className="rounded bg-black/10 px-1.5 py-0.5 text-xs dark:bg-white/10">
            {OP_TYPE_LABEL[op.type]}
          </span>{" "}
          <span className="font-medium">{targetLabel(op)}</span>
          <span className="ml-2 text-xs opacity-50">· {op.sourceDoc}</span>
          {low && (
            <span className="ml-2 rounded bg-amber-500/20 px-1.5 py-0.5 text-xs text-amber-700 dark:text-amber-300">
              низкая уверенность
            </span>
          )}
        </div>
        <label className="flex shrink-0 items-center gap-1.5 text-xs">
          <input type="checkbox" checked={included} onChange={(e) => onToggle(e.target.checked)} />
          включить
        </label>
      </div>

      <details className="mt-2 text-xs opacity-70">
        <summary className="cursor-pointer">исходная формулировка</summary>
        <p className="mt-1 whitespace-pre-wrap">{op.rawText}</p>
      </details>

      {op.warnings?.map((w, i) => (
        <p key={i} className="mt-1 text-xs text-amber-600 dark:text-amber-400">
          ⚠ {w}
        </p>
      ))}

      <div className="mt-2 grid gap-2">
        {op.anchor !== undefined && (
          <Field
            label="После слов (якорь)"
            value={op.anchor}
            onChange={(v) => onChange({ anchor: v })}
          />
        )}
        {op.payload !== undefined && (
          <Field
            label={op.type === "replace" ? "Новая редакция" : "Вставляемый текст"}
            value={op.payload}
            onChange={(v) => onChange({ payload: v })}
            multiline
          />
        )}
        {op.rows && (
          <p className="text-xs opacity-70">Строк таблицы к добавлению: {op.rows.length}</p>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
}) {
  return (
    <label className="block text-xs">
      <span className="opacity-60">{label}</span>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={2}
          className="mt-0.5 w-full rounded border border-black/15 bg-transparent px-2 py-1 dark:border-white/15"
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="mt-0.5 w-full rounded border border-black/15 bg-transparent px-2 py-1 dark:border-white/15"
        />
      )}
    </label>
  );
}
