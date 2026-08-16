import { NextResponse } from "next/server";
import { requireAdmin } from "../../../../../../lib/auth";
import { apiErrorResponse } from "../../../../../../lib/api-error";
import { renameHistoricalTeam } from "../../../../../../lib/editions";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const team = await renameHistoricalTeam(id, String(body.id ?? ""), body.playerOne, body.playerTwo);
    return NextResponse.json({ ok: true, team });
  } catch (error) {
    return apiErrorResponse(error, { fallback: "Nominativi non modificati" });
  }
}
