import { NextRequest, NextResponse } from "next/server";
import { parseAllChangeDocs, type ChangeDocInput } from "@/lib/pipeline";
import { parseConfigForMode, isOffline, type EngineMode } from "@/lib/config";

export const runtime = "nodejs";
export const maxDuration = 60;

// Разбор загруженных документов «Изменения» в структурные операции.
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const changeFiles = form.getAll("changes").filter((f): f is File => f instanceof File);
    if (changeFiles.length === 0) {
      return NextResponse.json({ error: "Не переданы документы с изменениями" }, { status: 400 });
    }
    const modeRaw = (form.get("mode") as string) || "auto";
    const mode: EngineMode = ["auto", "ai", "algo"].includes(modeRaw) ? (modeRaw as EngineMode) : "auto";
    const model = (form.get("model") as string) || undefined;

    const changeDocs: ChangeDocInput[] = [];
    for (const f of changeFiles) {
      changeDocs.push({ name: f.name, data: new Uint8Array(await f.arrayBuffer()) });
    }
    const cfg = parseConfigForMode(mode, model);
    const { operations, engine, notes } = await parseAllChangeDocs(changeDocs, cfg);
    // В режиме «только алгоритм» ИИ не задействуется намеренно — это не оффлайн-«вынужденно».
    return NextResponse.json({ operations, engine, notes, offline: isOffline(), mode });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
