import Link from "next/link";
import { listArchive } from "../../lib/archive";

export const dynamic = "force-dynamic";
export const metadata = { title: "Archivio · Torneo di Bocce", description: "Edizioni concluse, podi, tabelloni e risultati del Torneo di Bocce." };

export default async function ArchivePage() {
  const editions = await listArchive();
  return <main className="archivePage">
    <header className="archiveHeader"><div><p className="kicker">Torneo di Bocce</p><h1>Archivio edizioni</h1><p>Podio, tabellone e risultati delle edizioni concluse.</p></div><Link href="/">Edizione corrente</Link></header>
    <section className="archiveGrid">
      {editions.map(edition => <article className="archiveCard" key={edition.editionNumber}>
        <div className="archiveEdition"><span>{edition.editionNumber}</span><div><p className="kicker">{edition.edition}</p><h2>{edition.scheduledAt ? new Date(edition.scheduledAt).toLocaleDateString("it-IT", { timeZone: "Europe/Rome", day: "numeric", month: "long", year: "numeric" }) : "Data non disponibile"}</h2></div></div>
        <dl><div><dt>Formula</dt><dd>{edition.drawMode === "REPECHAGE" ? "Ripescaggi" : "Preliminari"}</dd></div><div><dt>Coppie</dt><dd>{edition.teams}</dd></div><div><dt>Campione</dt><dd>{edition.champion ?? "Non disponibile"}</dd></div></dl>
        <div className="archiveActions"><Link className="primaryButton" href={"/archivio/" + edition.editionNumber}>Apri edizione</Link><a className="minorButton" href={"/api/archive/" + edition.editionNumber + "/export"}>Scarica JSON</a></div>
      </article>)}
      {!editions.length && <div className="emptyState">Nessuna edizione conclusa è ancora disponibile.</div>}
    </section>
  </main>;
}
