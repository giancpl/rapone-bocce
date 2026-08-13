# Rapone Bocce 3.0 — backend production

Backend persistente per Vercel + PostgreSQL + Prisma 7.

## Stack
- Next.js 15.5.21 (Maintenance LTS; patched release)
- PostgreSQL
- Prisma 7 + `@prisma/adapter-pg`
- bcryptjs per la password
- sessione admin persistente in database con cookie HttpOnly

Next.js 15.5.21 è attualmente una Maintenance LTS patched release secondo la pagina sicurezza/supporto ufficiale Next.js.

## Setup locale

1. Copia `.env.example` in `.env`.
2. Inserisci `DATABASE_URL`.
3. `npm install`
4. `npx prisma generate`
5. `npm run db:migrate`
6. `npm run dev`

## Vercel
Collega una PostgreSQL (Prisma Postgres è una scelta naturale su Vercel) e imposta `DATABASE_URL` nelle Environment Variables. Poi:
`npm run build`

Per produzione la migrazione si applica con:
`npm run db:deploy`

## Sicurezza
- password hash bcrypt 12 rounds
- nessuna password nel client
- sessione server-side
- cookie HttpOnly + SameSite=Lax + Secure in produzione
- sessioni con scadenza 12 ore
- tutte le mutazioni richiedono sessione admin
- sorteggio bloccato dopo READY
- risultati accettati solo per partite LIVE
- risultato valido con vincitore da 12 a 15 punti; pareggi non ammessi
- transazione serializable + retry per evitare aggiornamenti concorrenti

## Nota
La logica "ripescaggio" è modellata come turno preliminare quando il numero di coppie non è una potenza di 2. Questo va confermato con il regolamento reale prima dell'evento.
