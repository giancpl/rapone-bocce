# Rapone Bocce 3.0 — backend production

Backend persistente per Vercel + PostgreSQL + Prisma 7.

## Stack
- Next.js 16.3.0
- PostgreSQL
- Prisma 7 + `@prisma/adapter-pg`
- bcryptjs per la password
- sessione admin persistente in database con cookie HttpOnly


## Setup locale

1. Crea `.env` e inserisci `DATABASE_URL`.
2. `npm install`
3. `npx prisma generate`
4. `npm run db:migrate`
5. `npm run dev`

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
- tutte le mutazioni amministrative richiedono una sessione valida
- sorteggio bloccato dopo READY
- risultati accettati soltanto per incontri pronti, in attesa o in corso
- risultato valido con vincitore da 12 a 15 punti; pareggi non ammessi
- transazioni serializable con timeout esplicito per le operazioni sul tabellone

## Formati del torneo
Le modalità preliminari e ripescaggi sono calcolate automaticamente in base al numero di coppie; eventuali spareggi vengono applicati soltanto dopo la conferma dell’amministratore.
