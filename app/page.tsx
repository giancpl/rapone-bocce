import type { Metadata } from "next";
import Public from "../components/Public";
import { pub } from "../lib/state";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const tournament = await pub().catch(() => null);
  const edition = tournament?.edition;
  return {
    title: edition ? `${edition} · Torneo di Bocce` : "Torneo di Bocce",
    description: edition ? `Tabellone e risultati della ${edition} del Torneo di Bocce.` : "Tabellone, risultati e archivio del Torneo di Bocce.",
    appleWebApp: { capable: true, statusBarStyle: "default", title: edition ? `Torneo di Bocce · ${edition}` : "Torneo di Bocce" },
  };
}

export default async function Home() {
  return <Public initial={await pub()} />;
}
