import { NextResponse } from "next/server";
import { archivePublicState, getArchiveEdition } from "../../../../lib/archive";
import { apiErrorResponse } from "../../../../lib/api-error";

export const dynamic = "force-dynamic";
export async function GET(_request: Request, context: { params: Promise<{ edition: string }> }) {
  try {
    const { edition } = await context.params;
    const tournament = await getArchiveEdition(Number(edition));
    if (!tournament) return NextResponse.json({ error: "Edizione non trovata" }, { status: 404 });
    return NextResponse.json(archivePublicState(tournament), { headers: { "Cache-Control": "public, max-age=0, must-revalidate" } });
  } catch (error) {
    return apiErrorResponse(error, { fallback: "Edizione non disponibile" });
  }
}
