# Draaiboek

Wat de beheerder wanneer doet, de paklijst en de noodplannen. Wat er vóór het weekend moet gebeuren, staat in `docs/AFVINKLIJST.md` (en in de app: Beheer → Afvinklijst).

Alles in dit draaiboek kun je vooraf oefenen in **Beheer → Proefmodus**: proefteams, testnamen, de demo-quiz met nepteams die vanzelf antwoorden, en "Bekijk als…" om te zien wat een captain of meekijker ziet.

## Vóór het weekend

- **Nu:** link en familiecode in de familie-app. Voorbeeldbericht:

  > De Valkenburger Spelen 2027 komen eraan! Hemelvaart, do 6 t/m zo 9 mei. Open de link, vul de code in en zet de app op je beginscherm: [link] – familiecode: [code]

- **Als de deelnemerslijst erin staat:** zet in Beheer → Instellingen "Nieuwe app voor de familie" aan. Iedereen kiest dan zijn naam en ziet het prikbord.
- **1 januari:** de fun facts gaan vanzelf open (deadline 1 april). Houd de teller op Thuis in de gaten.
- **April:** quiz maken met Claude, importeren in Beheer → Quiz, eerlijkheidscheck bekijken, proefquiz spelen in de proefmodus.
- **Begin mei:** team-PIN's en spelleiders-PIN's maken (je ziet ze één keer, schrijf ze op), het programma vrijgeven, de proef leegmaken.

## Donderdag 6 mei

| Wanneer | Wat |
|---|---|
| 14:00 | Iedereen komt aan. Thuis laat nu "Nu bezig" en "Straks" zien. Help wie de app nog niet op het beginscherm heeft. |
| 19:45 | **Captains laten inloggen.** Elke captain opent de tegel Quiz op Thuis (of Inloggen → Captain) en vult de team-PIN in. Die telefoon is het teamtoestel. |
| 19:55 | Zet je eigen telefoon aan de bluetoothspeaker, scherm aan, geluid aan. Open Beheer → Quiz → Quizmaster-console. |
| 20:00 | **Start de quiz.** Alle telefoons gaan vanzelf naar de quiz. Per ronde: rondescherm (captains kunnen hier hun joker inzetten), dan per vraag **Toon vraag → Sluit de vraag → Onthul het antwoord → Volgende vraag**. Wacht op alle teams, of gebruik "Nog 10 seconden!". |
| Na ronde 3 | **Intermezzo:** steen, papier, schaar. Start het in de console, tik "Loot de eerste twee", en daarna steeds "Loot de volgende uitdager". Iemand zonder telefoon? "In het echt spelen". Klaar? "Stop de duels" en terug naar de quiz. |
| 22:30 | Uitslag van de quiz: de tussenstand na de laatste ronde. |

## Vrijdag 7 mei

| Wanneer | Wat |
|---|---|
| 14:00 | **Spelletjesmiddag.** Spelleiders loggen in (Inloggen → Spelleider) en gebruiken de Spelhulp: kaartjesmachine, timer en teller. |
| Na afloop | Vul de vrije punten per team in (Beheer → Zeskamp → Spelletjesmiddag). Bij "omgekeerd uitbeelden" rekent de app de plaatsen zelf uit en stelt punten voor; jij bevestigt. |

## Zaterdag 8 mei

| Wanneer | Wat |
|---|---|
| 10:15 | Spelleiders loggen in. Captains zetten eventueel hun zeskamp-joker in (op de tegel Zeskamp, vóór de start van het spel). |
| 10:25 | **Eerste zeskampspel starten** (door een spelleider of jou). **Het scorebord gaat dan op slot** tot de prijsuitreiking: iedereen ziet de stand van dat moment. Wil je zelf ook verrast worden? Zet dat aan bij Beheer → Scorebord. |
| De hele dag | Spelleiders klokken en tellen op hun telefoon en tikken **Verstuur uitslag**. Zonder internet onthoudt de telefoon de uitslag en verstuurt hij hem later ("Wacht op verbinding…"). |
| 20:30 | **Prijsuitreiking.** Telefoon aan de speaker, Beheer → Prijsuitreiking → start. Alle telefoons gaan mee. Tik door: plaats 4, 3, 2, tromgeroffel, de winnaar. Daarna het podium en de medaillespiegel. |

## Zondag 9 mei

- Moederdagontbijt (staat in het programma met een bloem).
- Na het weekend: Beheer → Na afloop → **Alles opruimen** (fun facts, foto's en naamkoppelingen). Het prikbord blijft staan voor volgend jaar.

## Paklijst

- Bluetoothspeaker (voor de muziekronde en de prijsuitreiking).
- Powerbanks en opladers (vooral voor de captains en de spelleiders).
- Een mobiele hotspot als reserve-internet.
- Spullen voor de zeskamp en de spelletjesmiddag.

## Noodplannen

| Probleem | Wat te doen |
|---|---|
| Iemand ziet "Die code klopt niet" | Code nog eens laten overtypen; hoofdletters, spaties en streepjes maken niet uit. Na 20 foute pogingen op hetzelfde netwerk moet je 10 minuten wachten. |
| Iemand koos de verkeerde naam | Beheer → Deelnemers en teams → de deelnemer → **Geef naam vrij**. Daarna kan de juiste persoon hem kiezen. |
| Internet valt weg | Zet de mobiele hotspot aan. Telefoons laten intussen de laatst bekende stand zien. Spelleiders kunnen gewoon doorgaan: uitslagen worden later verstuurd. Bij de quiz: lees de vraag voor, laat captains op papier antwoorden en zet het later recht met "Corrigeer punten". |
| Captaintelefoon leeg of kwijt | Op een andere telefoon: Inloggen → Captain → team-PIN. Die neemt het meteen over; de oude ziet dat hij is overgenomen. |
| De quiz hapert op een telefoon | De pagina verversen: de telefoon zit dan meteen weer op de juiste vraag. Verkeerd doorgeklikt? "Ga terug naar vorige vraag" in de console. |
| Een uitslag is verkeerd ingevoerd | Beheer kan elke uitslag corrigeren; de oude waarde blijft in het logboek. |
| Het slot ging te vroeg dicht | Beheer → Scorebord: het slot handmatig openen of sluiten. |
| Een team-PIN is uitgelekt | Beheer → Deelnemers en teams → **Maak een nieuwe team-PIN**. Het oude captaintoestel is dan uitgelogd. |
| Beheerder-PIN kwijt | README, Noodherstel: met `npm run maak-hash -- pin <nieuw>` een SQL-regel maken en die in de SQL-editor van Supabase plakken. |
| Na 5 foute PIN's geblokkeerd | 10 minuten wachten. De melding noemt het tijdstip. |
| Telefoons volgen niet meteen | Zonder Realtime vragen telefoons zelf om de paar seconden. Gaat het echt mis: laat iedereen de app verversen. |
| De app is traag of plat | Kijk op `/api/health`. Staat er `database: onbereikbaar`, kijk dan in Supabase of het project gepauzeerd is en zet het weer aan (Restore). |
