import { archiveEtag, getArchiveEdition, sportingExport } from "../../../../../lib/archive";
import { apiErrorResponse } from "../../../../../lib/api-error";

export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ edition: string }> }) {
  try {
    const { edition } = await context.params;
    const tournament = await getArchiveEdition(Number(edition));
    if (!tournament) return Response.json({ error: "Edizione non trovata" }, { status: 404 });
    const etag = archiveEtag(tournament);
    if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: { ETag: etag } });
    const json = JSON.stringify(sportingExport(tournament), null, 2);
    return new Response(json, { headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="torneo-bocce-${tournament.editionNumber}-edizione.json"`,
      "Cache-Control": "public, max-age=0, must-revalidate",
      ETag: etag,
    } });
  } catch (error) {
    return apiErrorResponse(error, { fallback: "Esportazione non disponibile" });
  }
}
