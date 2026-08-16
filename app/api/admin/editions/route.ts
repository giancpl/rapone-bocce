import { NextResponse } from "next/server";
import { confirmAdminPassword, requireAdmin } from "../../../../lib/auth";
import { apiErrorResponse } from "../../../../lib/api-error";
import { createNextEdition, listAdminEditions } from "../../../../lib/editions";

export const dynamic = "force-dynamic";
export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.json(await listAdminEditions(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error, { fallback: "Edizioni non disponibili" });
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = await request.json().catch(() => ({}));
    if (!(await confirmAdminPassword(String(body.password ?? "")))) throw Error("Password non valida");
    const edition = await createNextEdition(new Date(String(body.scheduledAt ?? "")));
    return NextResponse.json({ ok: true, edition });
  } catch (error) {
    return apiErrorResponse(error, { fallback: "Impossibile creare la nuova edizione" });
  }
}
