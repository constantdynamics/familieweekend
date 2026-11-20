# Beslissingen

Keuzes die de SPEC openliet of waarvan ik bewust afweek, met de reden. Nieuwste fase bovenaan.

## Ontwerp met meer ademruimte (20 november 2026)

De eigenaar wil een mooier ontwerp dat meer ademt. Er staan vier varianten (A–D) klaar om uit te kiezen. Tot die keuze blijft live het huidige ontwerp staan.

| Onderwerp | Keuze | Waarom |
|---|---|---|
| Rustige achtergrondbeweging | Op welkom, Thuis en later de prijsuitreiking beweegt de achtergrond heel rustig: ademende studiolampen en banen die elkaars kleur overnemen. Dit telt niet als een van de momenten uit §2. | Bewuste afwijking van §2 en §6.5, gekozen door de eigenaar, op voorwaarde dat het heel rustig blijft. |
| Banen bovenin | Om de 10 seconden neemt elke baan de kleur van de baan ernaast over (mosterd → oranje → roest → mosterd). De nieuwe kleur stroomt in 4 seconden van links door de bocht naar beneden. | De eigenaar koos één wissel per 8 à 12 seconden. Er beweegt alleen `stroke-dashoffset`, dus het is licht voor de telefoon. |
| Studiolampen | Zachte, wazige lichtvlekken in de kleuren van het palet. Ze worden groter en feller en daarna kleiner en zachter, één keer per 10 à 13 seconden, en niet allemaal tegelijk. | De sfeer van een tv-studio uit de jaren zeventig. Ze gebruiken alleen `transform` en `opacity`, geen filters (§6.5). |
| Beweging beperken | Niets stroomt of ademt meer. De banen wisselen alleen heel langzaam van kleur (één ronde per 90 seconden). | Keuze van de eigenaar. Zo blijft er iets leven zonder beweging. |
| Proefpagina's | `/ontwerp/<a–d>-<thuis of welkom>` zijn alleen zichtbaar in een build met `VALK_ONTWERP=1`; live geven ze een 404. Ze verdwijnen zodra er gekozen is. | Eerst statische ontwerpen om uit te kiezen, zoals de eigenaar vroeg. |

## Fase 1 (20 november 2026)

### Hosting en kosten

| Onderwerp | Keuze | Waarom |
|---|---|---|
| Supabase-project | Gedeeld met het bestaande project **eten-avontuur** (regio eu-west-1, Ierland), in een eigen schema `valk` | Het gratis abonnement staat 2 actieve projecten toe en die zijn bezet. De eigenaar koos zelf voor delen ("deel hem maar met eten-avontuur"). |
| Afscherming binnen het gedeelde project | Eigen schema `valk`, eigen databasegebruiker `valk_app`, rij-beveiliging aan op elke tabel met alleen een regel voor `valk_app`. De rollen `anon`, `authenticated` en `service_role` krijgen expliciet niets. | De andere apps in het project kunnen zo niet bij onze gegevens, en wij niet bij die van hen. Het schema staat ook niet open voor de Data API. |
| Database-verbinding | Server praat via de Supabase-pooler (transactiemodus) als `valk_app`, met `postgres.js` en `prepare: false` | Geen service-sleutel nodig voor fase 1, volledige SQL met transacties (handig voor de quiz), en de wachtwoordhash gaat als SCRAM-verifier naar de database, dus het wachtwoord zelf komt nergens in een log. |
| Service-sleutel van Supabase | Nog niet gebruikt | Komt in fase 2 voor de privé-bucket met foto's (ondertekende links). Die sleutel zet ik dan in Vercel, niet in de repo. |
| Vercel-regio | Functies in `dub1` (Dublin) | Zo dicht mogelijk bij de database in Ierland. |
| Vercel-plan | Hobby (gratis) | Volgens de SPEC. Hobby is voor persoonlijk, niet-commercieel gebruik; dat past bij een familieweekend. |
| Adres | **https://valkenburger-spelen.vercel.app** | Gratis, volgens de SPEC prima. |
| Vercel-project | Door de eigenaar zelf aangemaakt via *Import Git Repository*, met de vier omgevingsvariabelen (`DATABASE_URL`, `DATABASE_SSL`, `APP_SECRET`, `CRON_SECRET`) | De Vercel-koppeling van Claude mocht geen projecten aanmaken (403), en een token afgeven wilde de eigenaar liever niet. |
| Productiebranch | `claude/bold-thompson-skzyxh` (de standaardbranch van de repo); elke push daarheen gaat automatisch live | Er is nog geen `main`. Wil je eerst kunnen nakijken voordat iets live gaat, maak dan een `main` en zet die in Vercel als productiebranch. |
| Database-adres | Supabase-pooler in transactiemodus (poort 6543, gebruiker `valk_app.<project-ref>`) | Vercel kan alleen IPv4; het directe adres van Supabase is IPv6 (bevestigd in de documentatie van Supabase). |
| Cloudomgeving voor Claude | Eigen omgeving "familieweekend" met een installatiescript (npm, lokale Postgres met de testdatabases) en toegang tot het live adres | Zodat volgende sessies direct kunnen testen, zonder iets aan de standaardomgeving te veranderen. |

#### Gratis limieten

**Supabase Free** (gecontroleerd in de documentatie van Supabase, 20-11-2026):

- 2 actieve gratis projecten per persoon. Gepauzeerde projecten tellen niet mee.
- Database 500 MB per project. Het gedeelde project gebruikt nu 38 MB.
- Opslag 1 GB, egress 5 GB per maand.
- Realtime: 200 verbindingen tegelijk en 2 miljoen berichten per maand.
- Een gratis project wordt gepauzeerd na een week zonder activiteit. Daarom draait de keepalive.

**Vercel Hobby** (laatst bekende waarden; de pagina's van vercel.com waren vanuit de bouwomgeving niet bereikbaar, dus controleer ze in het dashboard onder Usage of op vercel.com/docs/limits):

- 1 miljoen functie-aanroepen per maand.
- 4 uur actieve CPU per maand.
- 100 GB Fast Data Transfer per maand.
- 1 miljoen edge requests per maand.
- Een cronjob draait hoogstens één keer per dag, ergens binnen het opgegeven uur.

**Gemeten op de live site** (Lighthouse mobiel, 20-11-2026): prestaties 96–99, toegankelijkheid 100, best practices 100, LCP ± 0,9 s, CLS 0.

**Inschatting voor 75 deelnemers.** Een quizavond kost ongeveer 20.000 aanroepen en realtime-berichten. De foto's zijn samen zo'n 30 MB. Dat ligt allemaal ruim binnen de gratis limieten.

### Techniek

| Onderwerp | Keuze | Waarom |
|---|---|---|
| Next.js | 16.4.6 met Cache Components en Partial Prefetching (de standaard van `create-next-app`) | Laatste stabiele versie. Thuis en de tabs zijn een statische schil die direct laadt; de beheerpagina's laden hun inhoud erachteraan. |
| Middleware | Heet in Next 16 `proxy.ts` | Naamswijziging in Next 16, functie gelijk. De proxy controleert alleen de ondertekening en geldigheid van de sessie (snel, zonder database); gevoelige gegevens controleert de server nog een keer. |
| Tailwind-config | Tailwind 4: de tokens van §6 staan in `@theme` in `src/app/globals.css` | Tailwind 4 heeft geen `tailwind.config.js` meer; `@theme` is de opvolger. Alle standaardkleuren van Tailwind zijn uitgezet, zodat alleen het palet van §6 bestaat. |
| Lettertypes | Shrikhand en Rubik (variabel, 300–900) zelf gehost via `next/font/local`, alleen de Latijnse subset, met OFL-licentie erbij | Hetzelfde resultaat als `next/font/google`, maar de build hangt niet af van Google. |
| Service worker | Serwist: `@serwist/build` en `serwist`, gebouwd met esbuild in de hook `compiler.runAfterProductionCompile` naar `public/sw.js` | Het kant-en-klare `@serwist/turbopack` werkt (nog) niet met Cache Components. Deze route is nog steeds de onderhouden Serwist-aanpak en precachet precies de bestanden van elke build. |
| Wat de service worker cachet | App-bestanden (CacheFirst), pagina's (NetworkFirst met 4 s time-out), beelden en lettertypes. Nooit: `/api/*`, `/beheer*`, POST-verzoeken, doorverwijzingen. Onbekende pagina's offline: `/offline`. | Volgens §4.12; de quizvragen komen er in fase 4 ook nooit in. |
| Offline-melding | `useOffline` van Next 16 (experimenteel) plus de tijd van de laatst geladen gegevens | Next probeert navigaties en Server Actions vanzelf opnieuw zodra er weer verbinding is. |
| Sessies | Twee ondertekende JWT's (HS256) in httpOnly-cookies: `valk_sessie` (familie, 120 dagen, verlengt na een week gebruik) en `valk_staf` (beheerder, 30 dagen). Daarnaast een toesteltoken `valk_toestel` (400 dagen) | Het toesteltoken blijft hetzelfde als de sessie verloopt. Zo kan fase 2 een naam aan een telefoon koppelen zonder dat iemand die koppeling kwijtraakt. |
| Geheimen | Eén `APP_SECRET`; sub-sleutels via HKDF (sessie, beheer, peper voor PIN, peper voor familiecode, IP-hash) | Eén geheim om te beheren. Nieuwe `APP_SECRET` = iedereen uitgelogd en alle hashes ongeldig (zie README, noodherstel). |
| Hashes | scrypt (N=16384) met eigen zout, na een HMAC met een peper uit `APP_SECRET` | PIN's zijn kort; met alleen de database kun je ze zo toch niet terugrekenen. |
| Limiet op pogingen | PIN: 5 mislukte pogingen per 10 minuten per toestel en rol, plus 30 per netwerk. Familiecode: 20 mislukte per 10 minuten per netwerk | SPEC §3 voor PIN's. Voor de familiecode bestaat nog geen toestel, dus per netwerk; 20 omdat op het weekend iedereen op dezelfde wifi zit. IP-adressen worden alleen als gehashte waarde bewaard. |
| Familiecode wijzigen | Telefoons die al binnen zijn, blijven binnen; nieuwe telefoons hebben de nieuwe code nodig | Simpel en zonder gedoe voor de familie. Iedereen eruit zetten kan via een nieuwe `APP_SECRET` (README). |
| Tijd | Alles in Europe/Amsterdam met eigen hulpfuncties, getest rond de zomer- en wintertijd. De aftelklok tikt op de telefoon zelf (NTP-klok); deadlines en het slot rekenen op de servertijd | Volgens §7.5. |
| Fouten loggen | Eén JSON-regel per fout in de Vercel-logs; foutpagina's in de stijl van de app | §7.5 staat logs toe; een eigen tabel is nog niet nodig. |
| Beveiligingsheaders | CSP (zonder nonce, zodat pagina's statisch kunnen blijven), `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` | Goede basis zonder de snelheid op te geven. |
| Zoekmachines | `noindex` en een `robots.txt` die alles weigert | Het is een familie-app. |

### Inhoud en ontwerp

| Onderwerp | Keuze | Waarom |
|---|---|---|
| Welkomstscherm | Toont alleen de naam, het embleem en het codeveld; geen data of locatie | Wie de link zonder code krijgt, ziet niets persoonlijks. |
| Deelafbeelding | `og.png` met embleem, naam en "Hemelvaart, 6 t/m 9 mei", zonder locatie | Mooie preview in de familie-app; de link zelf toont pas na de code meer. |
| Fun facts op Thuis | Kaart "Je fun facts – Vanaf januari" in plaats van de voortgangsbalk | De vragenlijst komt in fase 2. De kaart staat er wel al, zodat de familie weet wat er komt. |
| Tabs zonder inhoud | Elk tabblad heeft een lege staat in de stijl van de app, met wat al vaststaat (de hoofdonderdelen uit §1, het Moederdagontbijt uit §9.3) | §0: elk scherm heeft een lege staat. Ik zet nog geen voorbeeldprogramma neer, omdat dat nog niet definitief is. |
| Installatie-uitleg | Eén regel op Thuis, plus "Zo werkt het" met een stappenplan voor iPhone en Android. Op Android verschijnt de echte installatieknop zodra Chrome hem aanbiedt. Verdwijnt vanzelf zodra de app vanaf het beginscherm draait | §4.1 en §4.12. Op iPhone heeft de geïnstalleerde app een eigen cookieopslag, dus de uitleg zegt dat je de code daar nog één keer invult. |
| Beheer | Te vinden via de link "Beheer" onderaan Thuis, en via `/beheer` | Geen zesde tab: het menu blijft voor de familie. |
| Beheerscherm fase 1 | Instellingen, familiecode, eigen PIN, logboek, hartslag van de keepalive, en een lijst "Binnenkort" (niet klikbaar) | Elke knop die er staat, werkt. |
| Logboek | Inloggen, uitloggen, instellingen (oude → nieuwe waarde), familiecode en PIN (zonder waarde) | §2: elke actie van de beheerder wordt gelogd. |
| Designreferentie | De PNG's ontbraken; ik heb ze zelf gemaakt met `npm run design:png` (draait de prototypes in hun beginstand) en in `docs/design/png/` gezet | Om mijn schermen naast het ontwerp te leggen. |
| Familiecode en beheerder-PIN | Zelf gegenereerd en alleen als hash in de database gezet; de waarden staan in de rapportage aan de eigenaar, niet in de repo | §0: nooit sleutels of PIN-codes in de repo. |
| Iconen en splashscreens | Gegenereerd uit `public/brand/embleem.svg` met `npm run icons` (22 iOS-formaten, maskable met 10 % veilige rand) | Komt het echte logo, dan alleen dat bestand vervangen en opnieuw draaien. |

### Werkwijze

| Onderwerp | Keuze | Waarom |
|---|---|---|
| Migraties | SQL-bestanden in `supabase/migrations/`. Ze schrijven zichzelf in `valk.schema_migrations`, en worden toegepast met `npm run db:migrate` of via de Supabase-MCP | Zo kloppen lokaal, CI en het gedeelde project altijd met elkaar. |
| Lokale database | Gewone PostgreSQL (16 lokaal, 17 in CI), met de Supabase-rollen nagebootst | Geen Docker nodig. |
| GitHub-branch | Het werk staat op `claude/bold-thompson-skzyxh`. De repo was leeg, dus deze branch werd ook de standaardbranch. | Er bestond nog geen `main`; ik mocht alleen naar deze branch pushen. |
