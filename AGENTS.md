## Layout

Next.js web app in `src/` (port 3000) and an Express API in `server/` (port 4000), as npm workspaces from the root. Only the API touches the database: Prisma schema and migrations are in `server/prisma/`, business rules in `server/src/lib/`, routes in `server/src/routes/`, access control in `server/src/access.ts`, and the response types both sides share in `server/src/contract.ts`. Web pages read through `apiGet` and Server Actions write through `api` in `src/lib/api.ts`. UI text is in `src/i18n/km.ts` (default) and `src/i18n/en.ts`; API error messages get Khmer versions in `server/src/messages.ts`.

Rules: every event-owned query filters by the member's `eventId`; money is an integer in the minor unit (USD cents, KHR riel) with a currency; changes to gifts, check-ins, guests and members are written to `audit_logs` in the same transaction (`server/src/lib/audit.ts`).

Next.js 16 differs from older versions; read `node_modules/next/dist/docs/` before using an unfamiliar API.

## Cloud Agent

Node.js 22, PostgreSQL 16 and Redis are installed. Start them with `service postgresql start && service redis-server start`; the first time, create the database with `su postgres -c "psql -c \"CREATE USER moments WITH PASSWORD 'moments' CREATEDB;\" -c \"CREATE DATABASE moments OWNER moments;\""`. Then copy `.env.example` to `.env` if it is missing (set SESSION_SECRET), apply migrations with `npm run db:deploy`, seed with `npm run db:seed`, and run `npm run dev`. `npm test` runs the API tests against that database.

`npm run db:migrate` (`prisma migrate dev`) is interactive when it needs a name; pass `-- --name <name>`.
