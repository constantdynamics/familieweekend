# Plan fase 2 t/m 4: de rest van de app, in één oplevering

De eigenaar wil alles wat in beheer als "Binnenkort" stond nu al hebben, in één keer, met een manier om het meteen uit te proberen (20 november 2026). Dit plan volgt SPEC §11 (fase 2, 3 en 4) plus de nieuwe wensen: een prikbord en een afvinklijst.

## Keuzes van de eigenaar

| Vraag | Keuze |
|---|---|
| Volgorde | Alles in één oplevering. Tussendoor gaat alleen live wat de familie nog niet ziet. |
| Fun facts | Gaan automatisch open op 1 januari 2027, en die datum is aan te passen in beheer. |
| Uitproberen | Proefmodus met eigen testteams, testnamen en voorbeelddata (leeg te maken met één knop), nepteams die vanzelf antwoorden, en "Bekijk als…". |
| Kaartvragen | Zoals GeoGuessr: een foto, en de captain zet een speld waar die gemaakt is. Het liefst internationale valk-plekken (Valkenburgerstraat, Falkenberg, Halcón, Falconara). |
| Wat de familie ziet | De aftelklok, de fun facts (vanaf de opening) en het programma zodra de beheerder het vrijgeeft. |
| Menu | Thuis, Programma en Prikbord. Quiz en Zeskamp worden een tegel op Thuis op de dag zelf. Score wordt een tegel zodra de Spelen begonnen zijn. |
| Beheer | Bovenin het embleem en onderin een knop, allebei terug naar Thuis. |
| Prikbord | Wie zijn naam koos, kan plaatsen; elke naam kan maar één keer gekozen worden. Draadjes, hartjes en duimpjes, foto's, sorteren op nieuwste of populairste. De beheerder maakt, hernoemt en zet kanalen vast of op alleen-lezen, en kan berichten bewerken, verbergen en verwijderen. Het bord gaat meteen open en blijft staan voor volgend jaar. |
| Kanalen | "Doe de groeten aan…", "Weet je nog?", "Opscheppen mag", "Vraag het de organisatie" en "Mededelingen van de spelleiding" (alleen de beheerder). Meer kanalen maakt de beheerder zelf. |
| Afvinklijst | Alleen voor de beheerder en de spelleiders, met notities op naam. Ook als document: `docs/AFVINKLIJST.md`. |

## Hoe het werkt (techniek)

- **Proef en echt.** Teams, deelnemers, onderdelen, uitslagen, jokers, losse punten, quizantwoorden, duels, momentopnames en de live-status hebben een kolom `env` (`live` of `test`). Een toestel komt alleen in de proef via de beheerder (eigen toestel of een uitnodigingslink), met een ondertekend cookie.
- **Deurbel en brievenbus** (SPEC §7.2). De server schrijft, verhoogt het versienummer in `live_state` en geeft een seintje `{v}` via Supabase Realtime (een publiek kanaal per omgeving, zonder inhoud). Telefoons halen dan `/api/state` op; die route is rol-bewust. Zonder Realtime (lokaal, of als de verbinding wegvalt) vragen telefoons zelf om de paar seconden de versie op.
- **Foto's** staan in een eigen tabel in het `valk`-schema, niet in Supabase Storage: zo is de servicesleutel van het gedeelde project niet nodig. Ze zijn alleen op te vragen via ondertekende links die kort geldig zijn. In de browser worden ze verkleind (fun facts tot 1600 px, het prikbord tot 1280 px).
- **Rollen.** Familielid (familiecode en eventueel een gekozen naam), captain (team-PIN, één actief toestel per team, overnemen kan), spelleider (eigen PIN), beheerder (eigen PIN).
- **Rekenen** in pure modules met unittests (SPEC §5): puntentelling in twaalfden, medailles, kaartbanden, quizpunten, eerlijkheidscheck, steen-papier-schaar.
- **Kaarten** met Leaflet en OpenStreetMap-tegels, met bronvermelding.
- **Weer** via Open-Meteo, 30 minuten gecachet.

## Onderdelen

1. **Fundament.** Migratie met alle tabellen, het request-context (rol, naam, proef), het seintje en `/api/state`, het nieuwe menu, beheer met logo en terugknop.
2. **Deelnemers en teams.** Beheer met plakken, teamnamen, kleuren en volgorde, captains, team-PIN's en spelleiders. Kies je naam (één toestel per naam, "Ik vul ook in voor…"), en de beheerder kan een koppeling vrijgeven.
3. **Fun facts.** De 25 vragen, één per scherm, overslaan, terug, foto-upload, deadline, de teller op Thuis, en confetti bij Klaar. In beheer: vragen bewerken, voortgang, export (CSV, JSON en foto's als zip), statistieken, conceptvragen en het fotobeheer voor Echt of AI.
4. **Prikbord.** Kanalen, draadjes, reacties, foto's en moderatie.
5. **Programma.** Dagtabs, Nu en straks, Moederdag en linkjes naar quiz en zeskamp. In beheer: toevoegen, wijzigen, verwijderen, volgorde en vrijgeven.
6. **Thuis tijdens en na het weekend.** Nu en straks, het weer, je team en joker, de status van het scorebord, een live-banner, de tegels Quiz, Zeskamp en Score, en na afloop het eindpodium.
7. **Scorebord.** Klassement met opbouw, medaillespiegel, losse punten, vrije punten voor vrijdag, en een slot met momentopname.
8. **Zeskamp en spelletjesmiddag.** Spellen beheren, spelleiderscherm met stopwatch (tegelijk en na elkaar), tellers, alle uitslagtypes, joker, offline invoer, corrigeren en de spelhulp (kaartjesmachine, timer, teller).
9. **Prijsuitreiking.** Ceremonie die op alle telefoons tegelijk loopt, met tromgeroffel, fanfare, podium en confetti.
10. **Quiz.** Rondes en vragen, alle zeven vraagtypes (met de kaart en Echt of AI), schermen voor captain, meekijker en quizmaster, luistermodus, notities, joker, "Nog 10 seconden!", corrigeren, terug naar de vorige vraag, eerlijkheidscheck, import en export (`npm run import:quiz`), en de demo-quiz.
11. **Intermezzo.** Steen, papier, schaar met loting, duels, "In het echt spelen" en de langste reeks.
12. **Proefmodus.** Proef klaarzetten en leegmaken, uitnodigingslink voor andere toestellen, nepteams die antwoorden, "Bekijk als…".
13. **Afvinklijst.** Een tegel in beheer en een pagina voor de spelleiders, met vinkjes die de app zelf zet, vinkjes die je zelf zet, en notities.
14. **Afronding.** Draaiboek, README, beslissingen, alle tests, screenshots op 390 en 360 px, Lighthouse, belastingtest, deploy en live-controle.

## Hoe ik het controleer

- Unittests voor alle rekenregels, inclusief de testgevallen van SPEC §5.5.
- End-to-end-tests op 390 en 360 px: een mini-quiz met quizmaster, 4 captains en 2 meekijkers (met joker, kaartvraag, luistermodus, overname van een captaintoestel en opnieuw verbinden), een zeskamp met gelijke tijden en offline invoer, fun facts met een privacycheck, de prijsuitreiking op 3 toestellen, het prikbord, en geen losse woorden op elk scherm.
- Een test dat er voor de opening geen quizvraag of antwoord in de clientbundel of in `/api/state` staat.
- Een belastingtest met 50 gesimuleerde telefoons tijdens een quizronde.
- Lighthouse mobiel: prestaties ≥ 90, toegankelijkheid ≥ 95 en best practices ≥ 95.
