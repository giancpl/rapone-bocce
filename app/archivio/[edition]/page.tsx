import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Public from "../../../components/Public";
import { archivePublicState, getArchiveEdition } from "../../../lib/archive";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ edition: string }> }): Promise<Metadata> {
  const { edition } = await params;
  const tournament = await getArchiveEdition(Number(edition));
  if (!tournament) return { title: "Edizione non trovata · Torneo di Bocce" };
  return { title: `Torneo di Bocce · ${tournament.edition}`, description: `Podio, tabellone e risultati della ${tournament.edition} del Torneo di Bocce.` };
}

export default async function ArchiveEditionPage({ params }: { params: Promise<{ edition: string }> }) {
  const { edition } = await params;
  const tournament = await getArchiveEdition(Number(edition));
  if (!tournament) notFound();
  return <Public initial={archivePublicState(tournament) as any} archived />;
}
