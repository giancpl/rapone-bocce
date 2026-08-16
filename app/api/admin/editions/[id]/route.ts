import { NextResponse } from "next/server";
import { requireAdmin } from "../../../../../lib/auth";
import { apiErrorResponse } from "../../../../../lib/api-error";
import { getAdminEdition, updateHistoricalDate } from "../../../../../lib/editions";

export const dynamic = "force-dynamic";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    const edition = await getAdminEdition(id);
    if (!edition) return NextResponse.json({ error: "Edizione non trovata" }, { status: 404 });
    return NextResponse.json(edition, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error, { fallback: "Edizione non disponibile" });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const result = await updateHistoricalDate(id, new Date(String(body.scheduledAt ?? "")));
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return apiErrorResponse(error, { fallback: "Data non modificata" });
  }
}
