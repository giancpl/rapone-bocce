import { prisma } from "./db";
import { PUBLIC_INCLUDE, publicTournament } from "./tournament-v2";
import { podiumFromTournament } from "./archive-data";
export { archiveEtag, podiumFromTournament, sportingExport } from "./archive-data";

export async function listArchive() {
  const editions = await prisma.tournament.findMany({ where: { status: "FINISHED" }, orderBy: { editionNumber: "desc" }, include: PUBLIC_INCLUDE });
  return editions.map(tournament => ({
    editionNumber: tournament.editionNumber, edition: tournament.edition, scheduledAt: tournament.scheduledAt,
    drawMode: tournament.drawMode, teams: tournament.teams.length,
    champion: (podiumFromTournament(tournament)[0] as any)?.team ?? null,
    isCurrent: tournament.isCurrent, archivedAt: tournament.archivedAt,
  }));
}

export async function getArchiveEdition(editionNumber: number) {
  if (!Number.isInteger(editionNumber) || editionNumber < 1) return null;
  return prisma.tournament.findFirst({ where: { editionNumber, status: "FINISHED" }, include: PUBLIC_INCLUDE });
}

export function archivePublicState(tournament: any) {
  const state = publicTournament(tournament);
  return state ? { ...state, archived: true, podium: podiumFromTournament(tournament) } : null;
}
