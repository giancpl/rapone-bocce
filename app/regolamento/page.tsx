import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import logo from "../../logo-hd.png";
import { MAX_CONCURRENT_MATCHES, MAX_SCORE, MIN_WINNING_SCORE } from "../../lib/bracket";

export const metadata: Metadata = {
  title: "Regolamento | Torneo di Bocce - 51° edizione",
  description: "Regole e formula ufficiale del Torneo di Bocce - 51° edizione"
};

const rules = [
  { number: "01", title: "Composizione delle coppie", text: "Ogni coppia è composta da due giocatori, indicati con nome e cognome al momento dell’iscrizione." },
  { number: "02", title: "Punteggio della partita", text: "La vittoria è valida quando una coppia conclude con almeno " + MIN_WINNING_SCORE + " punti e non più di " + MAX_SCORE + ". Il pareggio non è ammesso." },
  { number: "03", title: "Formula del torneo", text: "Il torneo è a eliminazione diretta. Prima del sorteggio il sistema consiglia la formula più coerente con il numero di coppie. I ripescaggi vengono esclusi quando farebbero rientrare tutte le sconfitte e consigliati solo quando restano selettivi." },
  { number: "04", title: "Ripescaggi e spareggi", text: "Il sistema propone le migliori sconfitte ordinandole per differenza punti e poi per punti segnati. L’admin controlla e conferma ogni passaggio; una parità decisiva produce uno spareggio." },
  { number: "05", title: "Svolgimento degli incontri", text: "Possono esserci al massimo " + MAX_CONCURRENT_MATCHES + " partite in corso nello stesso momento. Gli stati pubblicati sono: in attesa, in corso e finita." },
  { number: "06", title: "Finali e podio", text: "Le vincenti delle semifinali disputano la finale per il 1° e 2° posto; le sconfitte disputano la finale per il 3° e 4° posto. Al termine viene pubblicato il podio completo." }
];

export default function RulesPage() {
  return <main className="rulesPage">
    <header className="rulesHeader">
      <Link className="rulesBrand" href="/" aria-label="Torna al torneo"><Image src={logo} alt="Logo Pro Loco Rapone" priority /><span><small>51° edizione</small><strong>Torneo di Bocce</strong></span></Link>
      <Link className="minorButton" href="/">← Torna al torneo</Link>
    </header>
    <section className="rulesIntro">
      <p className="kicker">Regole del torneo</p>
      <h1>Regolamento</h1>
      <p>Questa pagina raccoglie le regole già confermate. Sarà aggiornata con le disposizioni organizzative definitive prima dell’inizio del torneo.</p>
      <span>Versione in definizione</span>
    </section>
    <section className="rulesContent" aria-labelledby="confirmed-rules">
      <div className="sectionHeading"><div><p className="kicker">Punti confermati</p><h2 id="confirmed-rules">Come funziona il torneo</h2></div><span className="muted">Aggiornato al 13 agosto 2026</span></div>
      <div className="rulesGrid">{rules.map(rule => <article className="ruleCard" key={rule.number}><span>{rule.number}</span><div><h3>{rule.title}</h3><p>{rule.text}</p></div></article>)}</div>
    </section>
    <section className="formatComparison" aria-labelledby="tournament-formats"><div className="sectionHeading"><div><p className="kicker">Scelta della formula</p><h2 id="tournament-formats">Preliminari o ripescaggi</h2></div><span className="muted">Il conteggio esatto compare nella regia admin</span></div><div><article><span>01</span><h3>Preliminari</h3><p>Il sistema distribuisce i passaggi automatici necessari per raggiungere un tabellone regolare. Chi perde un incontro è eliminato. Con N coppie si giocano N − 1 partite, più la finale per il 3° posto quando prevista.</p></article><article><span>02</span><h3>Ripescaggi</h3><p>I preliminari generano una classifica delle sconfitte. L’admin la controlla e conferma le coppie che rientrano negli slot liberi. Il totale cresce per gli incontri di rientro e può aumentare ancora soltanto in caso di spareggi sulla soglia.</p></article></div></section>
    <section className="rulesPending">
      <div><p className="kicker">Da completare insieme</p><h2>Disposizioni organizzative</h2></div>
      <p>Completeremo questa parte con chiamata dei giocatori, ritardi e assenze, sostituzioni, comportamento in campo, contestazioni e decisioni dell’organizzazione.</p>
    </section>
    <footer className="siteFooter"><Link href="/">Torna a incontri e risultati</Link></footer>
  </main>;
}
