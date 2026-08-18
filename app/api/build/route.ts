import { NextRequest, NextResponse } from "next/server";
import { buildOutputs } from "@/lib/pipeline";
import type { BuildOptions, Operation } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

interface BuildBody {
  offerB64: string;
  operations: Operation[];
  options?: BuildOptions;
}

function b64ToBytes(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, "base64"));
}
function bytesToB64(b: Uint8Array): string {
  return Buffer.from(b).toString("base64");
}

// Применение подтверждённых операций и сборка двух итоговых файлов.
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as BuildBody;
    if (!body.offerB64) return NextResponse.json({ error: "Не передан файл Оферты" }, { status: 400 });
    if (!Array.isArray(body.operations) || body.operations.length === 0) {
      return NextResponse.json({ error: "Нет операций для применения" }, { status: 400 });
    }
    const offer = b64ToBytes(body.offerB64);
    const result = await buildOutputs(offer, body.operations, body.options ?? { highlightMode: "color" });
    return NextResponse.json({
      offerDocxB64: bytesToB64(result.offerDocx),
      combinedDocxB64: bytesToB64(result.combinedDocx),
      results: result.results,
      orderedOperationIds: result.orderedOperationIds,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
