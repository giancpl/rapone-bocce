import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import logo from "../../logo-hd.png";
import { MAX_SCORE, MIN_WINNING_SCORE } from "../../lib/bracket";

export const metadata: Metadata = {
  title: "Regole delle bocce | Torneo di Bocce - 51° edizione",
  description: "Le regole essenziali per giocare a bocce"
};

const rules = [
  { number: "01", title: "Obiettivo del gioco", text: "Lo scopo è avvicinare le proprie bocce al pallino più di quelle della coppia avversaria." },
  { number: "02", title: "Bocce e giocatori", text: "Ogni coppia è formata da due giocatori. Ciascun giocatore lancia due bocce, per un totale di quattro bocce a coppia in ogni mano." },
  { number: "03", title: "Inizio della mano", text: "La mano comincia con il lancio del pallino. La stessa coppia gioca quindi la prima boccia cercando di collocarla il più vicino possibile." },
  { number: "04", title: "Ordine dei tiri", text: "Gioca la coppia che in quel momento non ha la boccia più vicina al pallino. Continua fino a conquistare il punto o a terminare le proprie bocce." },
  { number: "05", title: "Accosto e bocciata", text: "Una boccia può essere accostata al pallino oppure lanciata per colpire e spostare una boccia avversaria. Il pallino può cambiare posizione durante il gioco." },
  { number: "06", title: "Punti della mano", text: "Terminati i lanci, segna soltanto la coppia con la boccia più vicina al pallino: ottiene un punto per ogni propria boccia più vicina della migliore boccia avversaria, fino a quattro punti." },
  { number: "07", title: "Fine della partita", text: "La partita termina al completamento della mano in cui una coppia raggiunge almeno " + MIN_WINNING_SCORE + " punti. Con quattro punti disponibili nell’ultima mano, il risultato può arrivare fino a " + MAX_SCORE + ". Il pareggio non è valido." },
  { number: "08", title: "Misurazione e correttezza", text: "Le bocce e il pallino non vanno spostati prima del conteggio. In caso di distanza dubbia si procede alla misurazione; tutti rispettano il campo, gli avversari e la decisione dell’organizzazione." }
];

export default function RulesPage() {
  return <main className="rulesPage">
    <header className="rulesHeader">
      <Link className="rulesBrand" href="/" aria-label="Torna al torneo"><Image src={logo} alt="Logo Pro Loco Rapone" priority /><span><small>51° edizione</small><strong>Torneo di Bocce</strong></span></Link>
      <Link className="minorButton" href="/">← Torna al torneo</Link>
    </header>
    <section className="rulesIntro">
      <p className="kicker">Guida al gioco</p>
      <h1>Regole delle bocce</h1>
      <p>Poche indicazioni per capire la partita, seguire il punteggio e giocare nel rispetto degli avversari.</p>
      <span>Versione definitiva</span>
    </section>
    <section className="rulesContent" aria-labelledby="bocce-rules">
      <div className="sectionHeading"><div><p className="kicker">Come si gioca</p><h2 id="bocce-rules">Le regole essenziali</h2></div><span className="muted">Dalla prima boccia al punto decisivo</span></div>
      <div className="rulesGrid">{rules.map(rule => <article className="ruleCard" key={rule.number}><span>{rule.number}</span><div><h3>{rule.title}</h3><p>{rule.text}</p></div></article>)}</div>
    </section>
    <section className="rulesPending rulesClosing">
      <div><p className="kicker">Principio fondamentale</p><h2>Gioco corretto</h2></div>
      <p>Prima di ogni lancio si attende che il campo sia libero. Dubbi e misurazioni si risolvono con calma, senza spostare bocce o pallino.</p>
    </section>
    <footer className="siteFooter"><Link href="/">Torna a incontri e risultati</Link></footer>
  </main>;
}
