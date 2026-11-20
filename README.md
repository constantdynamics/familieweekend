# De Valkenburger Spelen 2027

De PWA voor het familieweekend van de familie Valkenburg: Hemelvaart, do 6 t/m zo 9 mei 2027. De volledige opdracht staat in [`docs/SPEC.md`](docs/SPEC.md), de gemaakte keuzes in [`docs/BESLISSINGEN.md`](docs/BESLISSINGEN.md) en wat je wanneer doet in [`docs/DRAAIBOEK.md`](docs/DRAAIBOEK.md).

**Live:** https://valkenburger-spelen.vercel.app

**Stand:** fase 1 (teaser) is af: welkomstscherm met familiecode, Thuis met aftelklok, installatie-uitleg, PWA, beheer met instellingen, familiecode, PIN en logboek. Zie [`docs/PLAN-fase-1.md`](docs/PLAN-fase-1.md).

## Stack

Next.js 16 (App Router, Cache Components) · TypeScript · Tailwind 4 · Postgres op Supabase (eigen schema `valk`) · Vercel Hobby · Serwist · Vitest · Playwright · Lighthouse CI.

```
src/app/            schermen (Thuis en tabs in (app)/, welkom, beheer, privacy, offline, api)
src/components/     designsysteem (ui/), merk (brand/), Thuis (home/), PWA (pwa/)
src/lib/shared/     pure logica: tijd, aftelklok, codes, platform
src/lib/server/     server: database, sessies, hashes, limieten, logboek, instellingen
src/proxy.ts        de voordeur: zonder familiecode naar /welkom
src/sw/sw.ts        service worker
supabase/migrations SQL-migraties
scripts/            migreren, testdata, iconen, design-PNG's, hashes, Lighthouse
tests/              unit/, integration/ en e2e/
```

## Lokaal draaien

Nodig: Node 22 en een PostgreSQL-server (16 of nieuwer).

```bash
npm install
```

Maak in Postgres de Supabase-rollen en twee databases aan (eenmalig):

```bash
psql -U postgres -c "create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;" -c "create database valk_dev;" -c "create database valk_test;"
```

Kopieer `.env.example` naar `.env.local`, vul `APP_SECRET`, `CRON_SECRET` en `VALK_APP_PASSWORD` in, en zet de database klaar:

```bash
npm run db:migrate
```

```bash
npm run db:seed
```

```bash
npm run dev
```

Open http://localhost:3000 en vul de familiecode uit `SEED_FAMILY_CODE` in. Beheer zit op `/beheer` met `SEED_ADMIN_PIN`.

## Testen

```bash
npm test
```

Unit- en integratietests (Vitest), inclusief een controle dat de rij-beveiliging van de database alles dichthoudt. Gebruikt de lokale database `valk_test`.

```bash
npm run build && npm run test:e2e
```

End-to-end op 390×844 en 360×780 (Playwright), met toegankelijkheidscheck (axe) en screenshots in `docs/screenshots/fase-1/`.

```bash
npm run lighthouse
```

Lighthouse mobiel; faalt onder prestaties 90, toegankelijkheid 95 of best practices 95.

Verder: `npm run lint` en `npm run typecheck`. GitHub Actions draait dit allemaal bij elke push.

## Deployen

De app draait op Vercel (project `valkenburger-spelen`, functies in Dublin, dicht bij de database). De databasegegevens staan in het Supabase-project eten-avontuur, in het schema `valk`.

1. **Migraties** eerst: plak het nieuwe bestand uit `supabase/migrations/` in de SQL-editor van Supabase, of laat Claude het toepassen via de Supabase-MCP. Elke migratie schrijft zichzelf in `valk.schema_migrations`, dus `select * from valk.schema_migrations` laat zien wat er al staat. Met een directe databaseverbinding kan het ook zo:

   ```bash
   MIGRATION_DATABASE_URL='postgres://postgres:…@db.<ref>.supabase.co:5432/postgres' npm run db:migrate
   ```

2. **Code**: push naar de productiebranch (nu `claude/bold-thompson-skzyxh`, de standaardbranch); Vercel bouwt en zet live.
3. **Omgevingsvariabelen in Vercel**: `DATABASE_URL`, `DATABASE_SSL=require`, `APP_SECRET`, `CRON_SECRET`.

De dagelijkse keepalive (`/api/keepalive`, beveiligd met `CRON_SECRET`) staat in `vercel.json`. De reserve in `.github/workflows/keepalive.yml` werkt zodra je in GitHub de geheimen `KEEPALIVE_URL` en `CRON_SECRET` invult (Settings → Secrets and variables → Actions).

### Databasegebruiker

De app praat met de database als `valk_app`. Het wachtwoord staat alleen in `DATABASE_URL` in Vercel. Nieuw wachtwoord zetten: maak lokaal een SCRAM-verifier en voer in de SQL-editor `alter role valk_app password 'SCRAM-SHA-256$…'` uit, en pas daarna `DATABASE_URL` in Vercel aan.

## Importeren en testmodus

Komen in fase 4 (quiz): `npm run import:quiz -- <bestand>` en een aparte proefomgeving met een demo-quiz.

## Noodherstel

Alle commando's hieronder hebben de `APP_SECRET` van productie nodig (Vercel → Settings → Environment Variables). Ze printen een SQL-regel die je in de SQL-editor van Supabase plakt. De PIN of code zelf komt nergens te staan.

**Beheerder-PIN kwijt:**

```bash
APP_SECRET='…' npm run maak-hash -- pin 731946
```

**Familiecode opnieuw instellen (zonder beheer):**

```bash
APP_SECRET='…' npm run maak-hash -- familiecode NIEUWECODE
```

**Een extra beheerder:**

```bash
APP_SECRET='…' npm run maak-hash -- nieuwe-beheerder "Naam" 731946
```

**Iedereen uitloggen** (bijvoorbeeld als een telefoon met beheerderssessie kwijt is): zet in Vercel een nieuwe `APP_SECRET` en deploy opnieuw. Let op: daarna kloppen ook alle hashes niet meer, dus zet daarna meteen met de commando's hierboven (met de nieuwe `APP_SECRET`) een nieuwe PIN en familiecode.

**App plat?** Kijk op `/api/health`. Bij `database: onbereikbaar` is het Supabase-project meestal gepauzeerd: zet het in het Supabase-dashboard weer aan.

## Merk en iconen

`public/brand/embleem.svg` is de bron voor alle iconen, de iOS-splashscreens en de deelafbeelding `public/og.png`. Komt het echte logo, vervang dan dat bestand en draai:

```bash
npm run icons
```

De PNG's van de designreferentie in `docs/design/png/` maak je opnieuw met `npm run design:png`.
