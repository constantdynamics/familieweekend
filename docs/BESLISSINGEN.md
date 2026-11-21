# Beslissingen

Keuzes die de SPEC openliet of waarvan ik bewust afweek, met de reden. Nieuwste fase bovenaan.

## Fase 2 t/m 4: de rest van de app (21 november 2026)

De eigenaar wilde alles wat in beheer als "Binnenkort" stond nu al, in één oplevering, en alles meteen kunnen uitproberen (zie `docs/PLAN-fase-2-4.md` voor zijn keuzes).

### Techniek

| Onderwerp | Keuze | Waarom |
|---|---|---|
| Oplevering zonder halve dingen | Een schakelaar "Nieuwe app voor de familie" (`settings.fase2_live`). Staat hij uit, dan ziet de familie de app van fase 1 (aftelklok, oud menu). De beheerder ziet altijd alles. | Elke push gaat meteen live, en de eigenaar wilde één oplevering. Zo kan er tussendoor veilig gedeployed worden. |
| Proef en echt | Teams, deelnemers, onderdelen, uitslagen, jokers, losse punten, quizantwoorden, duels, momentopnames, live-status en het logboek hebben een kolom `env` (`live` of `test`). Programma, fun facts, prikbord en quizinhoud zijn gedeeld. | SPEC §3 vraagt om een aparte proefomgeving. Een kolom is eenvoudiger dan een tweede schema, en zo kan de echte quiz ook in de proef geoefend worden. |
| In de proef komen | Alleen via de beheerder: op het eigen toestel, of met een uitnodigingslink (een dag geldig) voor een ander toestel. Beide zijn ondertekende cookies. Bovenaan elk scherm staat dan een balk "Proef". | Dan kan niemand per ongeluk in de proef belanden of de echte quizvragen in een oefenronde zien. |
| "Bekijk als…" | Alleen voor de beheerder en alleen in de proef: als familielid, captain, meekijker of spelleider. Als captain kun je ook echt antwoorden, maar alleen in de proef. | Echte gegevens kunnen zo nooit per ongeluk geraakt worden. |
| Seintjes (Realtime) | Supabase Realtime, één publiek kanaal per omgeving (`valk-live`, `valk-test`), alleen met een versienummer. Het adres en de publieke sleutel staan in de database (`settings.realtime_*`), niet in de repo en niet als Vercel-variabele. Zonder Realtime vragen telefoons zelf: om de 2,5 seconde als er iets live loopt, anders om de 15 seconden. Met Realtime is het om de 30 seconden. | SPEC §7.2. Vercel-variabelen kon Claude niet zelf zetten. De publieke sleutel is geen geheim (hij staat in elke browser), maar hoort ook niet in de repo. Rustig vragen houdt de gratis limieten van Vercel ruim. |
| Foto's | In een eigen tabel in het `valk`-schema, niet in Supabase Storage. Opvragen kan alleen met een ondertekende link die kort geldig is, en met de familiesessie. In de browser verkleind (fun facts tot 1600 px, prikbord tot 1280 px). Ongebruikte uploads ruimt de dagelijkse keepalive op. | Supabase Storage vraagt de servicesleutel van het gedeelde project, en die geeft toegang tot de andere apps. De database heeft ruim plek (39 van 500 MB in gebruik). |
| Context per verzoek | Pagina's gebruiken het context dat per verzoek onthouden wordt, serveracties krijgen een vers context, en na een actie op dezelfde pagina volgt `refresh()`. | Next.js 16 ververst de pagina niet vanzelf na een serveractie. |
| Scherm overnemen | Start de quiz, het intermezzo of de prijsuitreiking, dan gaat elke telefoon in de app er meteen heen. Dat gebeurt alleen op het moment van wisselen: wie daarna wegtikt, wordt niet teruggetrokken. | SPEC §4: deze onderdelen nemen tijdelijk het hele scherm over. |

### Familie en rollen

| Onderwerp | Keuze | Waarom |
|---|---|---|
| Menu | Thuis, Programma en Prikbord. Quiz en Zeskamp worden een tegel op Thuis op de dag zelf, Score zodra de Spelen begonnen zijn. | De keuze van de eigenaar. Dit wijkt af van SPEC §4 (vijf tabs). |
| Beheer | Bovenin het embleem en onderin "Terug naar Thuis", op elk beheerscherm. | De wens van de eigenaar. |
| Wie ben jij? | Na de familiecode, zodra er namen in de lijst staan. Elke naam hoort bij één telefoon, en een telefoon mag meer namen hebben ("Ik vul ook in voor…"). Overslaan kan ("Ik kijk eerst even rond"). De beheerder kan een naam vrijgeven. | SPEC §3. Elke naam maar één keer, zoals de eigenaar wilde, zodat niemand andermans naam gebruikt. |
| Inloggen voor de spelleiding | Op Thuis staat "Inloggen voor de spelleiding", met daarachter drie deuren: captain (team-PIN), spelleider (eigen PIN) en beheerder. | Eén ingang houdt Thuis rustig. |
| PIN's | De app maakt team-PIN's en PIN's voor spelleiders zelf aan, en de beheerder ziet ze precies één keer. Een nieuwe team-PIN logt het oude captaintoestel uit. | SPEC §3. |
| Teamtoestel | Logt een tweede toestel in met dezelfde team-PIN, dan neemt dat het over. Het oude toestel ziet "Je teamtoestel is overgenomen door een ander toestel." | SPEC §3. |
| Programma vrijgeven | Het voorbeeldprogramma (SPEC §9.3) staat erin, maar de familie ziet het pas als de beheerder het vrijgeeft. | De keuze van de eigenaar: "zodra jij het hebt ingevuld". |

### Rekenen (pure modules met unittests)

| Onderwerp | Keuze | Waarom |
|---|---|---|
| Medailles | Bij de zeskamp volgen medailles de plaats, niet de punten. Een team met joker dat 3e wordt, krijgt brons. Bij de quiz en de vrijdag gaan medailles op punten. | Volgt uit SPEC §5.5, spel 6. |
| Plaatsen | Bij `plaatsen` geven gelijke tikken een gedeelde plaats (1, 2, 2, 4). | SPEC §5.2. |
| Schatting | Afstanden worden vergeleken op het aantal decimalen dat getypt is, zodat 7,4 en 7,6 even ver van 7,5 liggen. Antwoordt maar één team, dan scoort dat team. | Rekenen met kommagetallen gaf anders een verkeerde winnaar. |
| Kaartvragen | Een speld met een lengtegraad buiten ±180 (de kaart is rondgedraaid) wordt goed gerekend. Een vraag zonder geldige plek geeft niemand punten. | Robuust voor duimen en scrollende kaarten. |
| Weergave | Hoogstens 1 decimaal met een Nederlandse komma, afgerond van nul af (6,25 → "6,3"). Een ASCII-min ("-2"). | SPEC §5.2. |
| Eerlijkheidscheck | Een vraag telt één keer per team met voorkennis. Bij `wie_van_ons` en `echt_of_ai` vult de app het onderwerp zelf aan, en handmatige onderwerpen tellen mee. | SPEC §4.6. |

### Intermezzo, afvinklijst en opruimen

| Onderwerp | Keuze | Waarom |
|---|---|---|
| Intermezzo | De quizmaster loot. De gelote spelers kiezen in het geheim op hun eigen telefoon. Zijn beide keuzes binnen, dan telt iedereen 3 seconden af en gaan pas daarna de keuzes naar de telefoons. Bij gelijkspel kiezen ze na 2,5 seconden opnieuw. De winnaar blijft staan, en wie al gespeeld heeft komt pas terug als iedereen geweest is. "Loot opnieuw" en "In het echt spelen" zijn er voor wie er niet is of geen telefoon heeft. | SPEC §4.7. Zo kan niemand de keuze van de ander vooraf zien, ook niet in het netwerkverkeer. |
| Afvinklijst | 26 punten. Wat de app zelf kan zien, vinkt hij af en laat hij zien ("32 van de 45 klaar"); de rest vink je met je naam af. Spelleiders zien de lijst en plaatsen notities, de beheerder voegt punten toe en haalt ze weg. Ook als document: `docs/AFVINKLIJST.md`. | De wens van de eigenaar: alleen voor de beheerder en de spelleiders, met notities op naam. |
| Alles opruimen | Verwijdert de antwoorden en foto's van de fun facts (met de AI-versies) en welke naam bij welke telefoon hoort. Het prikbord, de deelnemers, de teams, de uitslagen en het logboek blijven staan. Eerst "Ik wil alles opruimen", daarna OPRUIMEN typen. | SPEC §4.11 en §8, plus de wens van de eigenaar om het prikbord te bewaren voor volgend jaar. |
| Geen losse woorden | Chrome's `text-wrap: pretty` lost twee regels met één los woord niet op. Teksten uit de database krijgen daarom `bijElkaar()`, en de controle per scherm telt een woord dat bij een koppelteken afbreekt, mee op de regel waar het eindigt. | De wens van de eigenaar uit de ontwerpronde. |

## Ontwerp met meer ademruimte (20 november 2026)

De eigenaar wilde een mooier ontwerp dat meer ademt. Uit vier statische varianten koos de eigenaar **B · Spotlights**.

| Onderwerp | Keuze | Waarom |
|---|---|---|
| Rustige achtergrondbeweging | Op welkom, Thuis en later de prijsuitreiking beweegt de achtergrond heel rustig: ademende spotlights en banen die elkaars kleur overnemen. Dit telt niet als een van de momenten uit §2. | Bewuste afwijking van §2 en §6.5, gekozen door de eigenaar, op voorwaarde dat het heel rustig blijft. |
| Spotlights | Drie lange, wazige lichtbundels van boven (mosterd, roomwit, oranje) en een warme gloed onderaan. Ze worden groter en feller en daarna kleiner en zachter, één keer per 10 à 13 seconden, en niet allemaal tegelijk. Op welkom staan ze sterker, op Thuis zachter. Geen zonnestralen meer op deze schermen. | De keuze van de eigenaar (variant B, sterker op welkom en zachter op Thuis). Op Thuis houdt de aftelklok zo de aandacht. Ze gebruiken alleen `transform` en `opacity`, geen filters (§6.5). |
| Banen | De banen komen bovenin van links, buigen rechtsboven af en lopen langs de rechterkant door tot de onderkant van het scherm. **Welkom** heeft zes banen van 4 px: goud, mosterd, oranje, roest, petrol en avocado (de vier teamkleuren, met avocado en petrol in de lichte tint, plus goud en roest); de inhoud houdt daar rechts 42 px vrij. **Alle andere schermen** hebben één baan van 6 px, in mosterd, en houden de volle breedte (22 px aan beide kanten). Op welkom neemt steeds één baan tegelijk de kleur van de baan ernaast over: de nieuwe kleur stroomt rustig (85 px per seconde) van de linkerrand door de bocht naar beneden, daarna 1,5 seconde rust en dan de volgende baan. Een ronde begint bij de binnenste baan, zodat buren nooit dezelfde kleur hebben; na zes banen 6 seconden rust. Op Thuis en bij de prijsuitreiking loopt de ene baan zo door de zes kleuren, met 6 seconden rust na elke wissel. De eerste wissel komt na 5 seconden. | De wens van de eigenaar (21 november): zes banen in een passend palet, langzamer, één voor één en tot onderaan; daarna "die banen alleen op de inlogpagina, op de home 1 baan, zuinig met de schaarse ruimte". Alleen de baan die stroomt wordt opnieuw getekend, en het rechte stuk is een smalle strook, dus de telefoon heeft er weinig werk aan. Eerder kostte een animatie die altijd doorliep 8 punten in Lighthouse. |
| Beweging beperken | Niets stroomt of ademt meer. Om de 9 seconden vervaagt één baan langzaam (in 6 seconden) naar zijn volgende kleur. | De keuze van de eigenaar. Zo blijft er iets leven zonder beweging. |
| Geen losse woorden | Een zin eindigt nooit met één los woord op een eigen regel. Daarvoor zorgt `text-wrap: pretty`, met gebalanceerde regels als terugval op oudere iPhones. Een datum of tijd breekt nooit ("donderdag 6 mei, 14:00", "1 april"), en een korte plaatsnaam blijft heel ("Borkel en Schaft"). Een e2e-test controleert dit op elk scherm op 390 en 360 px. | De wens van de eigenaar. Daarom heet de offlinepagina nu "Geen verbinding" (past op één regel), en staat in het beheer "vanaf februari" onder de naam van het onderdeel. |
| Letters | Sansita Swashed ExtraBold voor titels, het woordmerk en grote cijfers, en Nunito (variabel) voor alle andere tekst. Zelf gehost via `next/font/local`, alleen de Latijnse subset, met OFL-licentie. | De eigenaar koos uit zes voorbeelden ("swingend, met krullen"). Dit wijkt af van §6.3 (Shrikhand en Rubik). De oude bestanden blijven alleen voor `npm run design:png`, dat de referentieontwerpen rendert. |
| Titel | "De Valkenburger", met daaronder "Spelen" en het jaar ernaast in mosterdgele schrijfletters (Yellowtail) met een roestkleurige schaduw, iets schuin omhoog, 1,5 keer zo groot. Dat geldt voor welkom, Thuis, de opstartschermen en de deelafbeelding. Op Thuis staat in het label erboven alleen nog "Hemelvaart". Van Yellowtail zitten alleen de cijfers in de app (2 kB, Apache-2.0-licentie). | De keuze van de eigenaar: eerst het jaar als label, op 21 november "laat die 2027 er mooier uitknallen", in de stijl van het eerdere voorbeeld met "Spelen" in schrijfletters. Zo staat "Spelen" nooit alleen op een regel, en staat 2027 maar één keer in beeld. |
| Deelafbeelding | Spotlights in plaats van zonnestralen, net als welkom, en dezelfde zes banen. | Eén stijl. |

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
| Lettertypes | Shrikhand en Rubik (variabel, 300–900) zelf gehost via `next/font/local`, alleen de Latijnse subset, met OFL-licentie erbij | Hetzelfde resultaat als `next/font/google`, maar de build hangt niet af van Google. Later vervangen, zie "Ontwerp met meer ademruimte". |
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
