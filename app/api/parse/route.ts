import { NextRequest, NextResponse } from "next/server";
import { parseAllChangeDocs, type ChangeDocInput } from "@/lib/pipeline";
import { parseConfigFromEnv, isOffline } from "@/lib/config";

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
    const changeDocs: ChangeDocInput[] = [];
    for (const f of changeFiles) {
      changeDocs.push({ name: f.name, data: new Uint8Array(await f.arrayBuffer()) });
    }
    const { operations, engine, notes } = await parseAllChangeDocs(changeDocs, parseConfigFromEnv());
    return NextResponse.json({ operations, engine, notes, offline: isOffline() });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
