import { NextResponse } from "next/server";
import { requireAdmin } from "../../../../../../lib/auth";
import { apiErrorResponse } from "../../../../../../lib/api-error";
import { correctHistoricalScore } from "../../../../../../lib/editions";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const match = await correctHistoricalScore(id, String(body.id ?? ""), Number(body.a), Number(body.b));
    return NextResponse.json({ ok: true, match });
  } catch (error) {
    return apiErrorResponse(error, { fallback: "Risultato non modificato" });
  }
}
