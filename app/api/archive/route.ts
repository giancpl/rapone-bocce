import { NextResponse } from "next/server";
import { listArchive } from "../../../lib/archive";
import { apiErrorResponse } from "../../../lib/api-error";

export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return NextResponse.json(await listArchive(), { headers: { "Cache-Control": "public, max-age=0, must-revalidate" } });
  } catch (error) {
    return apiErrorResponse(error, { fallback: "Archivio non disponibile" });
  }
}
