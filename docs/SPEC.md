# De Valkenburger Spelen 2027: bouwopdracht voor Claude Code

Dit document is de volledige opdracht voor het bouwen van de PWA voor het familieweekend van de familie Valkenburg. Lees het helemaal voordat je iets bouwt. Alles wat hier staat is een besluit van de eigenaar, tenzij er "voorstel" of "voorbeeld" bij staat.

---

## 0. Zo werk je met deze opdracht

**Jouw rol.** Je bent tegelijk senior full-stack ontwikkelaar en productontwerper. De lat ligt hoog: de familie moet de app openen en denken dat er een echte tv-show achter zit. Bouw niets halfs. Elke knop werkt, elk scherm heeft een lege staat, een laadstaat en een foutstaat, en alles voelt snel.

**Werkwijze per fase** (fases staan in §11):

1. Maak een kort plan in `docs/PLAN-fase-N.md` en begin daarna meteen.
2. Bouw, schrijf tests en draai ze.
3. Doe een visuele check: maak met Playwright screenshots op 390×844 (iPhone) en 360×780 (kleine Android) van elk nieuw scherm, bekijk ze zelf, vergelijk ze met de designreferentie (§6) en los overlap, afgekapte tekst en lelijke randen op voordat je verder gaat.
4. Deploy naar Vercel.
5. Rapporteer in maximaal tien regels: link, wat er af is, screenshots, en wat de eigenaar moet doen (bijvoorbeeld inloggen of namen aanleveren).

**Beslissingen.** Ontbreekt er iets? Kies dan de beste optie, ga door, en noteer de keuze in `docs/BESLISSINGEN.md`. Vraag de eigenaar alleen iets bij keuzes die geld kosten of niet terug te draaien zijn.

**Taal.** De app is volledig Nederlands, in de je-vorm, warm en een beetje grappig. Code, bestandsnamen en variabelen zijn Engels.

**Accounts en geheimen.** Zet nooit sleutels of PIN-codes in de repo. De eigenaar heeft Supabase en Vercel. Gebruik de Supabase-CLI en de Vercel-CLI (of hun MCP-servers als die gekoppeld zijn) en vraag de eigenaar alleen om in te loggen of een token te plakken als dat nodig is. De repo is privé.

---

## 1. Het weekend in het kort

| | |
|---|---|
| Naam van de app | De Valkenburger Spelen 2027 |
| Wanneer | Hemelvaartweekend, donderdag 6 t/m zondag 9 mei 2027 (zondag 9 mei is Moederdag) |
| Waar | De Dommelvallei, Borkel en Schaft (gemeente Valkenswaard). Coördinaten voor het weer: 51.2975, 5.4417 (aan te passen in beheer) |
| Wie | Ruim 40 familieleden van alle leeftijden, verdeeld over 4 teams |
| Rollen | 1 beheerder (die ook quizmaster is), ongeveer 6 spelleiders, per team 1 captain, de rest kijkt mee |
| Teams | 4 teams. Namen en leden volgen later. Werktitels: Team Oranje, Team Mosterd, Team Avocado, Team Petrol |
| Hoofdonderdelen | Quiz op donderdagavond (5 rondes van 10 vragen, met een intermezzo), spelletjesmiddag op vrijdag, zeskamp op zaterdag, prijsuitreiking op zaterdagavond |
| Puntentelling | Eén totaalklassement over het hele weekend, met joker, medaillespiegel en een scorebord dat op slot gaat vanaf de start van de zeskamp |

**Kernflow van het jaar:**

- **Nu tot en met december 2026:** er gaat een link rond met een teaser: aftelklok, datum en locatie.
- **Januari tot 1 april 2027:** iedereen vult in de app een lijst met fun facts in en uploadt een merkwaardige foto. Dat wordt het materiaal voor de quiz.
- **April 2027:** de eigenaar maakt de quiz samen met Claude, en er komt een proefquiz.
- **6 t/m 9 mei 2027:** het weekend zelf.

---

## 2. De kwaliteitslat

Voldoe aan al deze punten. Ze tellen als acceptatiecriteria.

**Design**
- De app volgt het designsysteem in §6 tot op de pixel: retro-zeskamp uit de jaren zeventig met een knipoog naar de Olympische Spelen. Geen standaardcomponenten die er generiek uitzien.
- Elk scherm heeft één duidelijke hoofdzaak, ligt rustig op een telefoon van 360 px breed, en is met één hand te bedienen.
- Er zijn een paar zorgvuldig gekozen momenten om van te genieten. Strooi niet overal animaties rond. De momenten zijn:
  - aftelklok met klapcijfers;
  - antwoordtegel die ploft bij het kiezen;
  - jokerbanier;
  - onthulling van het goede antwoord;
  - stopwatch met trilfeedback;
  - aftellen bij steen, papier, schaar;
  - podium dat oprijst, met confetti en tromgeroffel bij de prijsuitreiking.
- Alles werkt met `prefers-reduced-motion`.

**Functionaliteit**
- Alles wat in §4 staat werkt van begin tot eind, ook als telefoons even offline zijn, een captain van toestel wisselt, of iemand halverwege de quiz de app opnieuw opent.
- Elke actie van de beheerder is terug te draaien of te corrigeren, en wordt gelogd.

**Techniek**
- Lighthouse op mobiel: prestaties ≥ 90, toegankelijkheid ≥ 95, best practices ≥ 95. De app is installeerbaar als PWA.
- Eerste scherm binnen 2 seconden op 4G. Geen verspringende layout.
- WCAG 2.2 AA: contrast, focus, doelen van minstens 44 px, schermlezer-labels.
- Belastingtest: 50 gelijktijdige telefoons tijdens een quizronde zonder haperingen. Een realtime update komt binnen 1 seconde aan.
- Geen quizvraag en geen goed antwoord is ooit vooraf op te vragen uit de app of het netwerkverkeer (zie §7).

---

## 3. Rollen en toegang

| Rol | Hoe kom je erin | Wat kun je |
|---|---|---|
| Familielid | Familiecode (bijvoorbeeld `VALK2027`), daarna kies je je naam uit de lijst | Alles bekijken, fun facts invullen, meekijken met de quiz, steen-papier-schaar spelen als je wordt geloot |
| Captain | Teamtoestel: inloggen met de team-PIN | Quizantwoorden insturen, joker inzetten (quiz en zeskamp), alles van een familielid |
| Spelleider | Eigen PIN (6 stuks, elk gekoppeld aan een naam) | Elk zeskampspel en de spelletjesmiddag leiden: stopwatch, tellers, uitslag insturen |
| Beheerder | Eigen PIN | Alles: beheerscherm, quizmaster-console, puntencorrecties, slot, prijsuitreiking |

Regels:
- **Familiecode.** Wordt op de server gecontroleerd. Daarna krijg je een httpOnly-sessiecookie (ondertekend, 120 dagen geldig).
- **Kies je naam.** De eerste keer dat iemand een naam kiest, wordt die naam aan dat toestel gekoppeld met een willekeurig token.
  - Kiest een ander toestel dezelfde naam, dan zegt de app: "Deze naam is al in gebruik op een ander toestel. Klopt dat niet? Vraag de beheerder om hem vrij te geven."
  - Een ouder kan op één toestel ook namen van kinderen koppelen ("Ik vul ook in voor…").
  - De beheerder kan koppelingen resetten.
- **PIN-codes.**
  - Opgeslagen als hash.
  - Maximaal 5 pogingen per 10 minuten per toestel en rol.
  - De beheerder maakt ze aan of reset ze in het beheerscherm, en ziet een nieuwe PIN één keer.
- **Teamtoestel.** Er is per team één actief captaintoestel. Logt een tweede toestel in met dezelfde team-PIN, dan neemt dat het over. Het oude toestel ziet dan: "Je teamtoestel is overgenomen door een ander toestel."
- **Testmodus.** Een aparte proefomgeving met eigen teams, PIN's en scores, zodat de proefquiz geen echte data raakt. Leeg te maken met één knop.

---

## 4. Schermen en functies

Hoofdmenu onderin met vijf tabs: **Thuis, Programma, Quiz, Zeskamp, Score**. De quiz, de prijsuitreiking en steen-papier-schaar nemen tijdelijk het hele scherm over.

### 4.1 Thuis: vóór, tijdens en na het weekend

**Vóór het weekend**
- Embleem, woordmerk, datum en locatie.
- Aftelklok met klapcijfers (dagen, uren, minuten, seconden) tot de starttijd. Standaard is dat do 6 mei 2027 14:00; de beheerder kan het aanpassen.
- Blok "Vul je fun facts in", met de teller "32 van de 45 familieleden zijn klaar" en de deadline.
- Uitleg voor het installeren op het beginscherm:
  - iOS: Deel, dan Zet op beginscherm;
  - Android: de echte installatieprompt.

**Tijdens het weekend**
- **Nu bezig:** het programma-onderdeel van dit moment, met een voortgangsbalk en de resterende tijd.
- **Straks:** de volgende twee onderdelen.
- Het weer.
- Jouw team en of jullie joker nog beschikbaar is.
- De status van het scorebord, of de melding dat het op slot zit.
- Een live-banner als er iets loopt, bijvoorbeeld "De quiz is begonnen, kijk mee".

**Na het weekend**
- Eindstand, podium en medaillespiegel.
- "Tot de volgende Spelen".

### 4.2 Fun facts (vooraf)

- Er is één vraag per scherm, met een voortgangsbalk. Elke vraag kun je overslaan, en je kunt altijd terug.
- Vraagtypes:
  - ja/nee;
  - getal (stepper met minimum en maximum);
  - keuze (chips);
  - open tekst;
  - foto-upload.
- Startlijst: 25 vragen (§9.1), aan te passen in het beheerscherm.
- **Deadline:** 1 april 2027, 23:59 (Europe/Amsterdam). Tot die tijd kun je je antwoorden aanpassen. Daarna is de lijst alleen nog te lezen, met de melding "De lijst is gesloten, dank je wel!".
- **Privacy:**
  - Antwoorden en foto's ziet alleen de beheerder.
  - Wie een naam koppelt, ziet zijn eigen ingevulde antwoorden terug.
  - Niemand anders ziet ze, ook niet via de API.
- **Foto's:**
  - Worden in de browser verkleind naar maximaal 1600 px als JPEG.
  - Komen in een privé-bucket en zijn alleen via ondertekende links op te vragen.
- **Aanmoediging:** de teller op Thuis, plus aan het einde "Klaar, dank je wel!" met een kleine confetti.

### 4.3 Programma

- Tabs per dag: do, vr, za, zo. Standaard opent de tab van vandaag.
- Een lijst met grote, hangende tijden.
- Het huidige onderdeel staat licht uitgelicht met het label "Nu". Voorbije onderdelen van vandaag zijn gedimd.
- **Bijzondere types:**
  - `moederdag`: bloemicoon en een eigen kleur;
  - `quiz`, `zeskamp` en `prijsuitreiking`: deze linken naar het juiste scherm.
- **Beheer:**
  - toevoegen, wijzigen, verwijderen en slepen;
  - per onderdeel: begin- en eindtijd, titel, ondertitel, locatie, type;
  - wijzigingen zijn direct live op alle telefoons.
- Het blok "Nu & straks" op Thuis rekent met deze data, in tijdzone Europe/Amsterdam.

### 4.4 Teams en deelnemers

- **Beheer van deelnemers:**
  - toevoegen, wijzigen en verwijderen, plus importeren uit een lijst met namen (plakken);
  - per deelnemer: naam, roepnaam, team, "is kind" (ja of nee), captain (ja of nee).
- **Beheer van teams:** naam, kleur (standaard de vier teamkleuren uit §6) en volgorde.
- **Teams zichtbaar:** een schakelaar. De beheerder bepaalt zelf wanneer iedereen zijn team ziet.
- Het teamscherm laat per team de leden zien, met de captain en de jokerstatus.

### 4.5 Puntentelling, scorebord en prijsuitreiking

De exacte rekenregels staan in §5.

- **Klassement:**
  - plaats, met de tekst "gedeeld" bij gelijke stand;
  - kleurvlak van het team, teamnaam, totaal;
  - een uitklapbare opbouw per onderdeel;
  - jokers gemarkeerd.
- **Medaillespiegel:** per team het aantal keer goud, zilver en brons, gesorteerd zoals bij de Olympische Spelen (eerst goud, dan zilver, dan brons).
- **Losse punten:** de beheerder geeft of trekt punten af, altijd met een reden erbij. Die zijn zichtbaar in de opbouw.
- **Slot:**
  - Het slot gaat automatisch dicht zodra het eerste zeskampspel start. De beheerder kan dit handmatig overrulen.
  - Tijdens het slot ziet iedereen, ook captains en spelleiders, de stand van het moment dat het slot dichtging, met de tekst "Stand van zaterdag 10:30".
  - Ook zichtbaar zijn de onderdelen die al gespeeld zijn, met een vinkje maar zonder punten, en de jokers die al gebruikt zijn.
  - De medaillespiegel staat ook op slot.
  - Spelleiders zien alleen de berekende plaatsen en punten van hun eigen spel.
  - De beheerder ziet alles, maar kan kiezen voor "Ik wil zelf ook verrast worden": dan zijn de punten voor hem vervaagd.
- **Prijsuitreiking** (op zaterdagavond na het eten):
  - De beheerder start de ceremonie. Alle telefoons gaan tegelijk naar het ceremoniescherm.
  - De beheerder tikt door: plaats 4, plaats 3, plaats 2, dan tromgeroffel en de winnaar.
  - Na de winnaar: het podium rijst op, met medailles en confetti.
  - Eindscherm: de volledige eindstand, de medaillespiegel ("De medaillespiegel gaat naar…") en de opbouw.
  - Bij een gedeelde plaats worden beide teams tegelijk onthuld.
  - Geluid: tromgeroffel en fanfare, gemaakt met WebAudio (geen bestaande muziek). Standaard staat het geluid alleen aan op het toestel van de beheerder, dat aan een speaker hangt. Op andere telefoons is het te kiezen.

### 4.6 De quiz (donderdagavond)

**Opzet**
- 5 rondes van 10 vragen.
- Zonder groot scherm: alles gebeurt op telefoons. De quizmaster leest ook hardop voor.
- Elke ronde begint met een rondescherm (titel en uitleg) en eindigt met een tussenstand.
- Tussen twee rondes (standaard na ronde 3) kan het intermezzo steen-papier-schaar (§4.7).

**Schermen per rol**
- **Captain:**
  - vraag en antwoordtegels;
  - kiezen en wijzigen kan tot de quizmaster de vraag sluit;
  - status "3 van 4 teams hebben geantwoord";
  - jokerbanier;
  - na de onthulling: goed of fout, met het aantal punten.
- **Meekijker** (iedereen in een team behalve de captain):
  - dezelfde vraag en antwoorden, maar de tegels zijn niet te kiezen;
  - "Alleen jullie captain kan antwoorden. Overleg gerust!";
  - "Sanne heeft gekozen" (zonder welk antwoord).
- **Luistermodus** (per ronde aan of uit, bijvoorbeeld bij de muziekronde): meekijkers zien alleen een groot "Luister goed" met een bewegende equalizer. Captains blijven de antwoorden zien.
- **Quizmaster-console:**
  - vraag met het goede antwoord gemarkeerd (alleen voor hem);
  - een notitieveld, bijvoorbeeld "Start op Spotify: playlist Quiz ronde 4, nummer 2";
  - status per team;
  - knoppen in vaste volgorde: Toon vraag, Sluit de vraag, Onthul het antwoord, Volgende vraag;
  - de knop "Nog 10 seconden!" laat op alle telefoons een aftelling zien en sluit de vraag bij 0;
  - schakelaar voor luistermodus;
  - "Corrigeer punten";
  - "Ga terug naar vorige vraag".

**Geen snelheidspunten.** Goed is goed. De quizmaster gaat pas door als alle teams hebben geantwoord, of als hij de vraag zelf sluit.

**Joker in de quiz**
- Elk team zet één keer per quiz een joker in op een ronde. Dat doet de captain op het rondescherm, voordat de eerste vraag van die ronde opengaat.
- Alle punten in die ronde tellen dubbel.
- De inzet wordt aan iedereen getoond: "Team Petrol speelt de joker in ronde 4!".

**Vraagtypes**

| Type | Wat ziet de captain | Punten |
|---|---|---|
| `meerkeuze` | 2 tot 4 tegels in vaste kleuren met symbool (zon, bloem, ster, maan) | 1 voor goed |
| `waar_niet_waar` | 2 grote tegels | 1 voor goed |
| `wie_van_ons` | Meerkeuze met namen van deelnemers | 1 voor goed |
| `schatting` | Getal invullen (groot numeriek toetsenbord) | 1 voor het team dat er het dichtst bij zit; bij gelijke afstand krijgen alle betrokken teams 1 |
| `schatting_bereik` | Meerkeuze met getallen of bereiken (0–5, 6–10…) | 1 voor goed |
| `kaart` | Kaart waarop de captain een speld zet ("Waar ligt dit Valkenburg?") | 0 tot 3 naar afstand (§5.4). Bij de onthulling: alle spelden plus de echte plek, met de afstanden |
| `echt_of_ai` | Foto plus de tegels "Echt" en "AI" | 1 voor goed |

- Bij elk type kan een foto horen (bijvoorbeeld een babyfoto) en een uitleg die bij de onthulling verschijnt.
- **Muziekvragen** zijn gewone vragen (meestal `wie_van_ons` of `meerkeuze`) in een ronde met luistermodus. De quizmaster speelt het fragment af via Spotify op een bluetoothspeaker. De app speelt zelf geen muziek af.
- **Kaartvragen:**
  - gebruik Leaflet met OpenStreetMap-tegels, of MapLibre met een gratis tegelbron zonder sleutel;
  - toon de bronvermelding;
  - controleer zelf de gebruiksvoorwaarden;
  - de kaart is goed te bedienen met een duim, met een grote speld en een knop "Zet speld hier".
- **Echt of AI:** de foto's komen uit de fun facts. In beheer kan de beheerder per foto een met AI bewerkte versie uploaden en kiezen welke versie in de quiz komt. Het juiste antwoord ("echt" of "ai") volgt daar automatisch uit.

**Eerlijkheidscheck (belangrijk)**
- Een vraag mag door één persoon te weten zijn, zoals "Van wie is dit het lievelingsnummer?". Dan moeten zulke vragen wel eerlijk verdeeld zijn over de teams.
- Elke vraag heeft een veld `onderwerp`: de deelnemers die voorkennis hebben. Bij `wie_van_ons` vult de app dat zelf in met het goede antwoord, bij `echt_of_ai` met de inzender.
- Beheer toont per ronde en voor de hele quiz hoeveel vragen per team voorkennis geven, bijvoorbeeld "Voorkennis per team: Oranje 2, Mosterd 2, Avocado 2, Petrol 2".
- Bij een verschil van meer dan 1 komt er een waarschuwing.
- Tip voor de antwoordopties bij `wie_van_ons`: liefst één naam per team.

**Vragen voor jong en oud.** De quiz moet net zo goed te doen zijn door een kind van de basisschool als door een volwassene, met gezond verstand in plaats van parate kennis. In beheer staat bij elke vraag een herinnering: "Kan een kind van 10 dit beredeneren?". Zie ook de richtlijnen in §9.2.

**Robuustheid**
- Elke telefoon haalt na het opnieuw verbinden de actuele quizstatus op en zit meteen op de juiste vraag.
- Een captain die zijn telefoon kwijt is, logt op een ander toestel in met de team-PIN.
- Antwoorden worden op de server gecontroleerd: alleen in de fase "open", alleen door het actieve captaintoestel, en het laatste antwoord telt.
- Zet de Screen Wake Lock aan op de schermen van quizmaster en captain.

**Invoer van vragen**
- De eigenaar maakt de vragen met Claude in het formaat van §9.2.
- Jij bouwt `npm run import:quiz -- <bestand>`, dat valideert met duidelijke foutmeldingen en dan in de database zet.
- Beheer heeft een vraageditor voor kleine aanpassingen en het uploaden van foto's.
- Exporteren terug naar JSON is mogelijk als backup.
- Het bestand komt nooit in de clientbundel.

**Testmodus.** Speel de hele quiz na met testteams. Er staat een demo-quiz klaar (§9.5).

### 4.7 Intermezzo: steen, papier, schaar

- **Start.** De quizmaster start het intermezzo. De app loot de eerste twee spelers uit twee verschillende teams.
- **Duel.** De gelote spelers krijgen op hun eigen telefoon: "Jij bent gekozen! Kies in het geheim."
  - Ze kiezen allebei steen, papier of schaar.
  - Als beide keuzes binnen zijn, telt de app op alle telefoons af: 3, 2, 1. Dan worden beide keuzes onthuld.
  - Bij gelijkspel kiezen ze opnieuw.
- **Winnaar blijft staan.** De volgende uitdager wordt willekeurig geloot uit een ander team dan de winnaar, met een snelle namenrol op alle telefoons. Wie al heeft gespeeld, komt pas weer aan de beurt als iedereen geweest is.
- **Zonder telefoon.** Heeft een gelote speler geen telefoon (bijvoorbeeld een kind), dan kiest de quizmaster "In het echt spelen" en tikt hij de winnaar aan.
- **Punten.** Elk gewonnen duel levert 1 punt op voor het team van de winnaar (instelbaar). Dat telt als onderdeel "Intermezzo" in het totaal, zonder joker en zonder medailles.
- **Stoppen.** De quizmaster stopt wanneer hij wil, of na een ingesteld aantal duels. Er is een teller voor de langste reeks, met de tekst "Sanne: 5 op rij!".

### 4.8 Vrijdag: spelletjesmiddag

- Een onderdeel met **vrije punten**: de beheerder vult per team punten in. Het telt mee in het totaal en voor de medaillespiegel.
- **Spelhulp** (een generieke tool voor spelleiders, ook bruikbaar bij de zeskamp):
  - een kaartjesmachine met woorden of opdrachten die de spelleider vooraf plakt;
  - een groot kaartje dat alleen de uitbeelder ziet;
  - een timer (standaard 60 seconden);
  - knoppen "Geraden" en "Volgende";
  - een teller.
- **Omgekeerd uitbeelden** (§9.4) gebruikt de instelling "minste geraden wint". De app rekent dan zelf de plaatsen uit en stelt punten voor, die de beheerder bevestigt.

### 4.9 Zeskamp (zaterdag)

**Spellen beheren**
- 6 spellen, in te stellen door de eigenaar:
  - naam;
  - korte uitleg (optioneel);
  - volgorde;
  - uitslagtype;
  - eenheid;
  - modus "tegelijk" of "na elkaar".
- Voorstellen staan in de spellenbank (§9.4).

**Uitslagtypes**

| Type | Voorbeeld | Wie wint |
|---|---|---|
| `tijd` | estafette | laagste tijd |
| `aantal_hoog` | aantal ballen in de emmer | hoogste |
| `aantal_laag` | omgekeerd uitbeelden | laagste |
| `meting_hoog` | hoogte van de toren in cm | hoogste |
| `meting_laag` | verschil in gram tussen de grootste en de kleinste taartpunt | laagste |
| `plaatsen` | de spelleider tikt de volgorde aan | direct |
| `jury` | 1–10 per team | hoogste |

**Spelleider-scherm**
- De spelleider kiest een spel. Spelleiders zitten niet vast aan één spel; het systeem legt vast wie wat invoert.
- **Stopwatch:**
  - **Tegelijk:** één startknop, daarna vier grote stopknoppen in de teamkleuren, met plaats en punten live.
  - **Na elkaar:** per team een eigen start en stop.
  - Tijden tot op de honderdste, met `performance.now()`.
  - Trilfeedback bij start en stop (Android).
  - Wake lock aan.
- **Tellers:** grote knoppen + en − per team.
- **Joker:** de captain zet de joker vóór de start in via de app. Bij de start ligt hij vast. De spelleider ziet "Joker: Team Avocado".
- **Offline invoer.** Uitslagen worden lokaal opgeslagen (IndexedDB) en verstuurd zodra er weer verbinding is, met de status "Wacht op verbinding…" en daarna "Verstuurd".
- **Corrigeren.** De beheerder kan elke uitslag corrigeren. De oude waarde blijft in het logboek.

### 4.10 Weer

- Gebruik Open-Meteo (gratis, geen sleutel nodig) met de ingestelde coördinaten.
- Pas zo'n 14 dagen vooraf komt er een verwachting voor do t/m zo. Daarvoor staat er: "Het weerbericht verschijnt rond 22 april."
- Tijdens het weekend: de huidige temperatuur, een omschrijving en het uurverloop van vandaag.
- Cache 30 minuten. Offline toont de app de laatst bekende stand, met tijdstempel.

### 4.11 Beheerscherm

Eén overzichtelijk dashboard, goed te bedienen op een telefoon. Het heeft deze tegels:

- **Deelnemers en teams** (§4.4).
- **PIN-codes** (aanmaken en resetten).
- **Familiecode** (wijzigen).
- **Programma** (§4.3).
- **Fun facts:**
  - vragen bewerken;
  - voortgang per persoon;
  - deadline;
  - export als CSV en JSON, plus de foto's als zip;
  - statistieken per vraag (aantallen, percentages, gemiddelde, hoogste, laagste);
  - **conceptvragen:** de app maakt van elke fun fact een conceptquizvraag met vier plausibele antwoorden. Bijvoorbeeld: "Hoeveel van ons hebben ooit iets gebroken?" met het echte aantal en drie afleiders. De beheerder neemt die met één tik over in een ronde.
- **Foto's voor Echt of AI** (§4.6).
- **Quiz:**
  - rondes en vragen;
  - import en export;
  - eerlijkheidscheck;
  - maximaal te halen punten per ronde (zodat de kaartronde niet ongemerkt zwaarder telt);
  - testmodus.
- **Onderdelen en puntentabellen.**
- **Zeskamp-spellen.**
- **Losse punten.**
- **Slot en prijsuitreiking.**
- **Logboek.**
- **Na afloop:** de knop "Alles opruimen". Die verwijdert fun facts, foto's en koppelingen, alleen na een dubbele bevestiging.

### 4.12 PWA

**Manifest**
- naam "De Valkenburger Spelen 2027";
- korte naam "Valk Spelen";
- themakleur `#2B1810`;
- alleen staand (portret).

**Iconen**
- maskable icons en de Apple touch icon, gemaakt uit het logo. Tot het logo er is: het voorlopige embleem uit de designreferentie.

**Opstarten en updates**
- splashscreens voor iOS;
- melding "Nieuwe versie beschikbaar, tik om te verversen".

**Offline**
- de service worker cachet de app-shell, het programma, het laatste scorebord (met inachtneming van het slot) en het weer;
- quizvragen worden nooit gecachet;
- banner "Je bent offline, laatst bijgewerkt om 11:42".

**Installatie-uitleg** per platform. Geen pushmeldingen (bewust weggelaten).

---

## 5. Puntentelling: exacte regels

### 5.1 Onderdelen

| Onderdeel | Hoe | Joker | Medailles |
|---|---|---|---|
| Quiz | 1 punt per goed antwoord, kaartvragen 0 tot 3 | 1 ronde ×2 | ja, op basis van het quiztotaal |
| Intermezzo | 1 per gewonnen duel | nee | nee |
| Vrijdag | vrije punten van de beheerder | nee | ja, op basis van de vrije punten |
| Zeskamp spel 1 tot 6 | plaatspunten 10, 7, 5, 3 | 1 spel ×2 | ja, per spel |
| Losse punten | plus of min, met reden | nee | nee |

Het totaal is de som van alles hierboven. Alle tabellen en waarden zijn instelbaar in beheer.

### 5.2 Gelijke stand bij plaatspunten

- Teams met dezelfde uitslag delen de punten van de plaatsen die ze samen bezetten.
- Voorbeeld: twee teams gedeeld 2e krijgen elk (7 + 5) / 2 = 6, en het volgende team is 4e met 3.
- Drie teams gedeeld 1e krijgen elk (10 + 7 + 5) / 3 = 7⅓.

**Rekenen zonder afrondingsfouten**
- Reken intern in twaalfden (12 is deelbaar door 1, 2, 3 en 4), dus `punten × 12` als geheel getal.
- Toon met hoogstens 1 decimaal en een Nederlandse komma, bijvoorbeeld "96,5" en "7,3".
- De joker verdubbelt de gedeelde punten.

**Medailles bij gelijke stand.** De medailles worden gedeeld en de volgende medaille vervalt. Twee keer goud betekent dus geen zilver, en de derde krijgt brons. Dat is dezelfde regel als bij de Olympische Spelen.

**Gelijke eindstand.** Bij een gelijke eindstand delen de teams de plaats. Er is geen schiftingsvraag.

### 5.3 Slot

- Bij het dichtgaan van het slot wordt een momentopname van het klassement en de medaillespiegel opgeslagen.
- Publieke API's leveren tijdens het slot alleen die momentopname, plus de status van de onderdelen zonder punten.
- Het slot gaat alleen open via de onthulling bij de prijsuitreiking.

### 5.4 Kaartvragen

Afstand met de haversine-formule. Er zijn twee schalen, in te stellen per vraag:

| Schaal | 3 punten | 2 punten | 1 punt |
|---|---|---|---|
| nederland | ≤ 5 km | ≤ 20 km | ≤ 75 km |
| wereld | ≤ 100 km | ≤ 500 km | ≤ 1500 km |

### 5.5 Testgevallen (verplicht als unittests)

Dit zijn de cijfers uit het prototype. Ze moeten exact kloppen.

**Stand na vrijdag**
- **Quiz:** Oranje 38, Mosterd 41 (inclusief joker), Avocado 33, Petrol 36.
- **Vrijdag:** Oranje 8, Mosterd 5, Avocado 10, Petrol 6.
- **Totaal:** Oranje 46 en Mosterd 46 (beide plaats 1, gedeeld), Avocado 43 (3e), Petrol 42 (4e).

**Zeskamp**

| Spel | Uitslag |
|---|---|
| 1 | Petrol 1e met joker (20), Mosterd 7, Oranje 5, Avocado 3 |
| 2 | Oranje 1e met joker (20), Avocado 7, Mosterd 5, Petrol 3 |
| 3 | Mosterd en Avocado gedeeld 1e (elk 8,5), Oranje 3e (5), Petrol 4e (3) |
| 4 | Avocado 10, Oranje 7, Petrol 5, Mosterd 3 |
| 5 | Mosterd 1e met joker (20), Petrol 7, Oranje 5, Avocado 3 |
| 6 | Oranje 10, Mosterd 7, Avocado 3e met joker (10), Petrol 3 |

- **Totaal zeskamp:** Oranje 52, Mosterd 50,5, Avocado 41,5, Petrol 41.
- **Eindstand:** 1 Oranje 98, 2 Mosterd 96,5, 3 Avocado 84,5, 4 Petrol 83.
- **Medaillespiegel** (goud, zilver, brons): Mosterd 3, 2, 1; Avocado 3, 1, 1; Oranje 2, 3, 3; Petrol 1, 1, 3. Mosterd wint de medaillespiegel, Oranje wint de Spelen.

**Andere tests**
- drie teams gedeeld eerste;
- schatting met gelijke afstand;
- grenzen van de kaartbanden;
- joker op een ronde met een kaartvraag;
- correctie na het slot;
- losse punten met een negatief getal.

---

## 6. Designsysteem

**Referentie.** Het klikbare prototype staat op een ontwerpcanvas van Claude (twaalf schermen plus een stijlgids). De eigenaar zet in `docs/design/`:
- de bronbestanden van de schermen (`.dc.html`, uit `design-referentie.zip`);
- exportbeelden (PNG) van elk scherm.

Neem de stijl, maten, kleuren, teksten en het gedrag over. Bouw het echt na in de gekozen stack: kopieer de prototype-code niet, de opbouw daarvan is alleen een referentie.

### 6.1 Idee

De app gedraagt zich als het decor van een tv-zeskamp uit de jaren zeventig:
- een studio in donkerbruin;
- drie strepen in mosterd, oranje en roest die bovenaan elk scherm een bocht naar beneden maken (de "zeskampbocht");
- dikke retroletters met een harde oranje schaduw;
- lichte kaarten als oude beeldbuizen;
- een scorebord met klapcijfers.

De Olympische knipoog zit in:
- het embleem (een valk in een lauwerkrans);
- de medailles;
- de medaillespiegel;
- het podium.

### 6.2 Kleuren

| Naam | Hex | Gebruik |
|---|---|---|
| Studio | `#2B1810` | ondergrond van de app, tekst op lichte vlakken |
| Studio diep | `#1A0E08` / `#1E110B` | inzetvlakken, tabbalk |
| Studio licht | `#3B2417` | donkere kaarten, chips |
| Beeldbuis | `#FCEBD0` | kaarten en panelen, lichte tekst op donker |
| Zand | `#E9C9A0` | bijtekst op donker |
| Oranje | `#F06A1F` | primaire actie (altijd met donkere tekst), schaduw onder knop `#9E3E0B` |
| Mosterd | `#F5AE1B` | actieve staat, highlights, jokerbanier |
| Roest | `#B4441A` | derde baan, foutmelding met lichte tekst |
| Goud / zilver / brons | `#F2C14E` / `#C9C3B8` / `#C27A3E` | medailles, altijd met donkere tekst |

**Teamkleuren** (van licht naar donker, zodat ze ook voor kleurenblinden verschillen): Mosterd `#F5AE1B`, Oranje `#F06A1F`, Avocado `#6F7F1F`, Petrol `#17565E`.
- De teamkleur is altijd een vlak naast de naam, nooit tekstkleur.
- Tekst óp Avocado of Petrol is licht (`#FCEBD0`), en op Avocado minstens 19 px vet.

**Antwoordtegels** (altijd kleur, symbool en tekst):

| Tegel | Symbool | Kleur | Hex |
|---|---|---|---|
| A | Zon | Oranje | `#F06A1F` |
| B | Bloem | Mosterd | `#F5AE1B` |
| C | Ster | Avocado licht | `#A7B43A` |
| D | Maan | Petrol licht | `#4FA3A5` |

Tekst op de tegels is altijd Studio. Bij Echt of AI: Echt is `#A7B43A`, AI is `#4FA3A5`.

**Vast palet.** Dit palet geldt in licht én donker: de app heeft één vaste sfeer. Zet `color-scheme: dark` en negeer de donkermodus van het systeem.

### 6.3 Letters

- **Shrikhand** (Google Fonts, zelf hosten via `next/font`):
  - schermtitels 26–30 px;
  - woordmerk 38–44 px;
  - grote cijfers (aftelklok, punten, podium);
  - altijd met `text-shadow: 3px 3px 0 #F06A1F` op donker.
- **Rubik** (400, 500, 700, 800) voor al het andere:
  - tekst 17 px;
  - labels 14 px;
  - nooit kleiner dan 13 px.
- Cijfers in tabellen en de stopwatch: `font-variant-numeric: tabular-nums` in Rubik 800.
- Labels in gewone zinsopbouw, nooit in hoofdletters met extra spatiëring.

### 6.4 Vormen en details

- **Kaarten:** radius 22–24 px, `box-shadow: 0 6px 0 #140B06` (harde onderrand, geen zachte schaduw).
- **Knoppen:**
  - pilvorm, minimaal 48 px hoog;
  - primair oranje met onderrand `0 4px 0 #9E3E0B`;
  - ingedrukt: 3 px omlaag en een kleinere rand;
  - secundair: transparant met een rand van 2 px in Zand.
- **Zeskampbocht:** SVG met drie banen van 7 px (mosterd, oranje, roest). De banen lopen horizontaal en buigen rechtsboven met een straal van 42–62 px naar beneden. Laat rechtsboven 40 px ruimte vrij voor content.
- **Stralen:** subtiele zonnestralen (`repeating-conic-gradient`, `#35200F` en `#2B1810`) achter het startscherm en de ceremonie.
- **Klapcijfers:** beeldbuisvlak met een dunne horizontale lijn op de helft, en een korte kantel-animatie bij elke verandering.
- **Iconen:** eigen inline-SVG met lijnen van 2–2,4 px en ronde uiteinden. Nooit emoji.
- **Embleem** (voorlopig): een valk in een lauwerkrans; het SVG-bestand staat in de referentie. Wordt vervangen door het echte logo. Lever dan zelf alle iconmaten en maskable varianten, met een veilige zone van 10 %.

### 6.5 Beweging en geluid

- Eén duidelijke beweging per moment (§2). Duur 150–450 ms, met ease-out.
- **Antwoord gekozen:** de tegel schaalt naar 1,03 met een rand en het label "Jouw keuze".
- **Onthulling:** foute tegels dimmen naar 35 %, de goede krijgt een vinkje.
- **Confetti** alleen bij Klaar (fun facts), de winnaar en de medaillespiegel. Alleen transform-animaties, geen filters.
- **Geluid** via WebAudio, gesynthetiseerd: tik in de laatste 10 seconden, "ding" bij goed, tromgeroffel en fanfare bij de prijsuitreiking. Overal te dempen.

### 6.6 Teksten

- Kort, warm, actief.
- De knop zegt wat er gebeurt ("Verstuur uitslag", "Onthul plaats 3"), en de bevestiging gebruikt hetzelfde woord ("Uitslag verstuurd").
- Fouten zeggen wat er mis is en wat je moet doen, zonder excuses.
- Voorbeelden uit het prototype:
  - "Nog te gaan tot de aftrap"
  - "Alleen jullie captain kan antwoorden. Overleg gerust!"
  - "Het scorebord is op slot tot de prijsuitreiking"
  - "Gelijke tijd? Dan delen de teams de punten van hun plaatsen."

### 6.7 Niet doen

- Geen Olympische ringen, geen officiële Olympische tekens en geen woorden die op een sponsor lijken.
- Niets van Kahoot overnemen: geen merknaam, geen geluiden, geen combinatie van driehoek, ruit, cirkel en vierkant.
- Geen nep-statusbalken, geen stockfoto's.

---

## 7. Techniek

### 7.1 Stack

- **Next.js** (laatste stabiele versie, App Router) met TypeScript en Tailwind CSS. Zet de design-tokens van §6 in de Tailwind-config.
- **Supabase:**
  - Postgres;
  - Realtime;
  - Storage (privé-buckets).
  - Gebruik geen Supabase Auth voor familieleden. Sessies zijn eigen, ondertekende httpOnly-cookies.
- **Vercel Hobby** (gratis) voor hosting. Een gratis adres zoals `valkenburger-spelen.vercel.app` is prima.
- **Kosten.** Alles binnen de gratis abonnementen. Controleer de actuele limieten van Supabase en Vercel en noteer ze in `docs/BESLISSINGEN.md`.
- **PWA:** een onderhouden aanpak, bijvoorbeeld Serwist, met een eigen manifest.
- **Animatie:** Motion (de opvolger van Framer Motion) alleen waar CSS niet volstaat.
- **Tests:**
  - Vitest voor de logica;
  - Playwright voor end-to-end- en visuele tests;
  - Lighthouse CI.

### 7.2 Architectuur: deurbel en brievenbus

- **Database als waarheid.** Alle status staat in Postgres. Er is een rij `live_state` per omgeving (live en test) met een versienummer.
- **Schrijven via de server.** Elke wijziging gaat via een server route of server action. Die controleert rol en sessie, schrijft met de service-sleutel (alleen op de server), en zendt daarna op een publiek Realtime-kanaal alleen een seintje: `{versie: 123}`.
- **Seintje, dan ophalen.** Clients halen bij elk seintje, bij het opnieuw verbinden en bij focus de actuele staat op via `/api/state`. Die route is rol-bewust: de captain krijgt zijn eigen teamantwoord, de quizmaster alles, een familielid alleen publieke velden.
- **Geen gevoelige data in Realtime.** Er gaat nooit iets gevoeligs over Realtime. Een vervalst seintje veroorzaakt hoogstens een extra keer ophalen.
- **Row Level Security** staat aan op alle tabellen, met een standaardregel "alles weigeren". De browser praat met de database alleen via jouw API.

### 7.3 Geheimhouding van de quiz

- Vragen en antwoorden staan alleen in de database. De vraagtekst gaat pas naar telefoons in de fase "open", en het goede antwoord pas bij "onthuld".
- Foto's bij vragen krijgen een ondertekende link met een korte geldigheid, pas als de vraag opengaat.
- Schrijf een test die controleert dat de clientbundel en de responses van `/api/state` vóór die fasen geen vraag of antwoord bevatten.

### 7.4 Datamodel (voorstel, verfijn waar nodig)

| Tabel | Doel |
|---|---|
| `settings` | familiecode (hash), starttijd, deadline fun facts, locatie, teams zichtbaar, slotstatus, puntentabellen |
| `participants` | naam, roepnaam, team, is kind, claim-token-hash, geclaimd op |
| `teams` | naam, kleur, volgorde, captain, PIN-hash, actief captaintoestel |
| `staff` | naam, rol (beheerder of spelleider), PIN-hash |
| `program_items` | dag, begin, eind, titel, ondertitel, locatie, type, volgorde |
| `events` | onderdelen: type (quiz, intermezzo, vrijdag, zeskamp, los), uitslagtype, eenheid, puntentabel, joker toegestaan, telt voor medailles, status, gestart op |
| `event_results` | onderdeel, team, ruwe waarde, plaats, punten in twaalfden, ingevoerd door, correcties |
| `jokers` | team, soort (quiz of zeskamp), ronde of onderdeel, gezet op, door |
| `bonus_points` | team, twaalfden (plus of min), reden, door |
| `funfact_questions` / `funfact_answers` | vragenlijst en antwoorden (antwoorden alleen voor de beheerder) |
| `uploads` | foto's: inzender, pad, variant (origineel of AI), in quiz, echt of AI |
| `quizzes`, `quiz_rounds`, `quiz_questions`, `quiz_answers` | quiz-inhoud en antwoorden per team, met punten in twaalfden |
| `duels` | intermezzo: kampioen, uitdager, keuzes, winnaar, volgnummer |
| `scoreboard_snapshots` | momentopname bij het dichtgaan van het slot |
| `live_state` | modus, quiz, ronde, vraag, fase, luistermodus, aftellen tot, ceremoniestap, versie |
| `audit_log` | wie, wat, wanneer, oude en nieuwe waarde |

### 7.5 Overige eisen

- **Supabase wakker houden.** Gratis Supabase-projecten worden gepauzeerd na een week met weinig activiteit. Maak daarom een dagelijkse Vercel Cron (op Hobby kan dat maximaal één keer per dag) naar `/api/keepalive`, beveiligd met `CRON_SECRET`, die een kleine query doet. Zet ook een GitHub Actions-workflow klaar als reserve.
- **Tijd.** Alles in Europe/Amsterdam. De servertijd is leidend voor deadlines en het slot.
- **Rekenlogica.** Puntentelling, eerlijkheidscheck, kaartbanden en steen-papier-schaar zijn pure TypeScript-modules met unittests (§5.5).
- **End-to-end-tests** (Playwright, meerdere browsercontexten):
  - een volledige mini-quiz met 1 quizmaster, 4 captains en 2 meekijkers, inclusief joker, kaartvraag, luistermodus, overname van een captaintoestel en opnieuw verbinden;
  - een zeskamp met gelijke tijden en offline invoer;
  - fun facts met de privacycheck;
  - de prijsuitreiking, synchroon op 3 toestellen.
- **Belasting.** Een script dat 50 clients simuleert tijdens een quizronde.
- **Foutlogging.** Eenvoudig, naar een tabel of de Vercel-logs, plus een foutpagina in de stijl van de app.

---

## 8. Toegankelijkheid en privacy

**Toegankelijkheid**
- Echte knoppen en links, labels bij elk veld, `aria-live` voor de status van de quiz.
- Te vergroten tot 200 % zonder dat er iets breekt op de hoofdschermen.

**Privacy**
- Alleen namen, geen e-mail of telefoonnummer.
- Fun facts en foto's zijn alleen voor de beheerder.
- Na het weekend: de knop "Alles opruimen" (§4.11).
- Een korte privacytekst in de app: "Wat we bewaren en wanneer we het weggooien".

---

## 9. Inhoud en formaten

### 9.1 Fun facts: startlijst (25 vragen)

De vragen zijn zo gekozen dat er totaalvragen van te maken zijn: niemand kent de som of het percentage van de hele familie. Vragen over één persoon (lievelingsnummer, foto) mogen ook, mits eerlijk verdeeld over de teams (§4.6).

| # | Type | Vraag | Opties of bereik | Quizvorm |
|---|---|---|---|---|
| 1 | ja/nee | Heb je ooit iets gebroken? | | Hoeveel van ons hebben ooit iets gebroken? |
| 2 | keuze | Ben je ooit gezakt voor je rijexamen? | Ja / Nee, in één keer geslaagd / Ik heb (nog) geen rijbewijs | Hoeveel van ons zakten ooit voor het rijexamen? |
| 3 | ja/nee | Kun je op je vingers fluiten? | | Hoeveel van ons kunnen op hun vingers fluiten? |
| 4 | ja/nee | Ben je ooit op tv, op de radio of in de krant geweest? | | Hoeveel van ons kwamen ooit in het nieuws? |
| 5 | ja/nee | Heb je ooit een vliegtuig, trein of bus gemist? | | Hoeveel van ons misten ooit hun vervoer? |
| 6 | ja/nee | Ben je bang voor spinnen? | | Welk percentage van ons is bang voor spinnen? |
| 7 | ja/nee | Kun je je tong in een rolletje draaien? | | Hoeveel van ons kunnen hun tong rollen? |
| 8 | ja/nee | Heb je ooit in het buitenland gewoond? | | Hoeveel van ons woonden ooit in het buitenland? |
| 9 | ja/nee | Heb je ooit een prijs gewonnen? | loterij, wedstrijd of sport | Hoeveel van ons wonnen ooit een prijs? |
| 10 | ja/nee | Heb je ooit iemand beroemds ontmoet? | | Hoeveel van ons ontmoetten ooit iemand beroemds? |
| 11 | ja/nee | Heb je ooit een hele dag in je pyjama doorgebracht? | | Hoeveel van ons deden dat ooit? |
| 12 | getal | In hoeveel landen ben je ooit geweest? | 0–200 | Wat is het record van de familie? / Hoeveel gemiddeld? |
| 13 | getal | Hoe vaak ben je verhuisd? | 0–50 | Hoe vaak zijn we samen verhuisd? |
| 14 | getal | Hoeveel paar schoenen heb je? | 0–200 | Hoeveel paar schoenen hebben we samen? |
| 15 | getal | Hoeveel uur slaap je gemiddeld per nacht? | 3–14 | Hoeveel uur slaapt de familie gemiddeld? |
| 16 | getal | Hoeveel kopjes koffie en thee drink je per dag? | 0–20 | Hoeveel kopjes drinken we samen per dag? |
| 17 | getal | Hoeveel kilometer woon je van Borkel en Schaft? | 0–20000 | Hoeveel kilometer reisden we samen om hier te komen? |
| 18 | keuze | Koffie of thee? | Koffie / Thee / Allebei / Geen van beide | Welk percentage kiest koffie? |
| 19 | keuze | Ben je een ochtendmens of een avondmens? | Ochtend / Avond / Geen van beide | Meer ochtend- of avondmensen? |
| 20 | keuze | Wat is je favoriete seizoen? | Lente / Zomer / Herfst / Winter | Het favoriete seizoen van de familie? |
| 21 | keuze | Hagelslag: puur, melk, wit of gemengd? | 4 opties + Geen hagelslag | Welke hagelslag wint? |
| 22 | keuze | Uit welk decennium komt je lievelingsnummer? | jaren 60 of eerder t/m jaren 20 | Uit welk decennium komen de meeste lievelingsnummers? |
| 23 | open | Wat is je lievelingsnummer? (titel en artiest) | | Muziekronde: van wie is dit het lievelingsnummer? |
| 24 | foto | Upload je meest merkwaardige foto (echt gebeurd) | | Ronde Echt of AI? |
| 25 | open | Wat is je gekste vakantieherinnering? | | Verhalen voor de quizmaster en wie-van-ons-vragen |

Bij elke vraag kun je "Sla over" kiezen. Ouders vullen in voor jonge kinderen.

### 9.2 Quizformaat

De eigenaar maakt de vragen met Claude in dit JSON-formaat, en `npm run import:quiz` leest het in.

```json
{
  "titel": "De Grote Valkenburger Quiz",
  "rondes": [
    {
      "nummer": 1,
      "titel": "Familie in cijfers",
      "luistermodus": false,
      "intermezzo_na": false,
      "vragen": [
        {
          "id": "r1v1",
          "type": "meerkeuze",
          "vraag": "Hoeveel van ons hebben ooit iets gebroken?",
          "opties": ["9", "14", "17", "23"],
          "goed": 2,
          "uitleg": "17 van de 45 familieleden brak ooit iets.",
          "foto": null,
          "onderwerp": [],
          "notitie": ""
        },
        {
          "id": "r1v2",
          "type": "kaart",
          "vraag": "Waar ligt Valkenburg aan de Geul?",
          "antwoord": {"lat": 50.865, "lng": 5.832},
          "schaal": "nederland"
        }
      ]
    }
  ]
}
```

| Veld | Uitleg |
|---|---|
| `type` | `meerkeuze`, `waar_niet_waar`, `wie_van_ons`, `schatting`, `schatting_bereik`, `kaart`, `echt_of_ai` |
| `opties` + `goed` | Bij meerkeuze, wie_van_ons en schatting_bereik: 2 tot 4 opties, `goed` is de index (0–3). Bij wie_van_ons staan namen exact zoals in de deelnemerslijst |
| `goed` | Bij waar_niet_waar: `true` of `false`. Bij echt_of_ai: `"echt"` of `"ai"` |
| `antwoord` | Bij schatting: een getal, met daarbij `"eenheid"`. Bij kaart: `{lat, lng}`, met `"schaal"` (`nederland` of `wereld`) |
| `foto` | Optioneel: een bestandsnaam uit de uploads, of een pad in `content/fotos/` |
| `uitleg` | Optioneel, verschijnt bij de onthulling |
| `onderwerp` | Optioneel: namen met voorkennis. Wordt automatisch gevuld bij wie_van_ons en echt_of_ai |
| `notitie` | Alleen voor de quizmaster, bijvoorbeeld een Spotify-aanwijzing |

**Richtlijnen voor de vragen** (voor de eigenaar en Claude):

1. Elke vraag is te beredeneren met gezond verstand, ook door een kind van 10. Gebruik schattingen, kaarten, foto's, familietotalen en Echt of AI liever dan feitjes uit je hoofd.
2. Vragen over één persoon zijn eerlijk verdeeld over de teams. Liefst staat er één naam per team in de opties.
3. Elke ronde heeft een duidelijk thema en een mix van vraagtypes.
4. Een kaartvraag levert tot 3 punten op. Houd het maximale aantal punten per ronde in de gaten.

**Rondes (voorstel):**

1. **Familie in cijfers:** totaalvragen uit de fun facts.
2. **Waar ligt Valkenburg?:** kaartvragen over plaatsen met valk in de naam, ook in andere talen. Ideeën om te controleren: Valkenburg aan de Geul, Valkenburg bij Katwijk, Valkenswaard, Falkenberg (Zweden), Falconara Marittima (Italië), plaatsen met Halcón (Spaans) of Falcão (Portugees). Controleer bij elke plek de juiste coördinaten.
3. **Muziek:** met luistermodus en lievelingsnummers. Daarna volgt het intermezzo.
4. **Hemelvaart, lente en de Dommel:** gezond verstand en schattingen.
5. **Echt of AI?:** de merkwaardige foto's.

### 9.3 Voorbeeldprogramma

Dit programma vervangt de eigenaar in beheer.

- **Do 6 mei**
  - 14:00 Aankomst en kamers verdelen
  - 17:30 Barbecue
  - 20:00 De Grote Valkenburger Quiz
  - 22:30 Uitslag van de quiz
- **Vr 7 mei**
  - 09:30 Ontbijt
  - 11:00 Wandelen langs de Dommel
  - 14:00 Spelletjesmiddag (telt mee)
  - 18:30 Pizza-avond
- **Za 8 mei**
  - 09:00 Ontbijt
  - 10:30 Zeskamp, spel 1 t/m 3 (slot gaat dicht)
  - 12:30 Lunch
  - 14:00 Zeskamp, spel 4 t/m 6
  - 18:00 Feestdiner
  - 20:30 Prijsuitreiking
- **Zo 9 mei**
  - 09:00 Moederdagontbijt (type `moederdag`)
  - 11:00 Opruimen
  - 13:00 Vertrek

### 9.4 Spellenbank (voorstellen, de eigenaar kiest)

**Zeskamp (buiten, alle teams):**

| Spel | Opzet | Uitslagtype |
|---|---|---|
| Taart in zeven | Snij een ronde taart in 7 zo gelijk mogelijke stukken. Je mag alleen de spullen op tafel gebruiken (touwtje, karton, tandenstokers, plastic mes). Daarna wegen | `meting_laag`: verschil in gram tussen het grootste en het kleinste stuk |
| Lekke-bekerestafette | Water met doorgeprikte bekers naar een fles brengen, 3 minuten | `meting_hoog`: waterstand in cm |
| Blind parcours met dierengeluiden | Eén teamlid is geblinddoekt, de rest stuurt alleen met dierengeluiden | `tijd` |
| Skilopen | Vier personen op twee lange planken | `tijd` |
| Hoogste toren uit je zakken | 5 minuten bouwen met alleen wat je bij je hebt | `meting_hoog`: cm |
| Spijkerpoepen | Spijker aan een touw om je middel in een fles laten zakken | `tijd` |
| Zaklopen-estafette | Klassiek | `tijd` |

**Vrijdag (binnen, met publiek):**

| Spel | Opzet | Uitslagtype |
|---|---|---|
| Omgekeerd uitbeelden | De uitbeelder krijgt een koptelefoon met muziek en denkt dat zijn team zo veel mogelijk moet raden. De rader weet het geheim: zo weinig mogelijk goed raden, maar wel steeds blijven gokken. 60 seconden, een scheidsrechter telt. Tegen valsspelen: het publiek is ingewijd en moet stil zijn (wie voorzegt, kost zijn team een strafpunt), alleen de rader telt, en de kaartjes staan op de telefoon van de spelleider | `aantal_laag` |
| Teken het familielid | Iemand beschrijft een oude familiefoto zonder namen te noemen, een teamgenoot tekent | `jury` |
| Beeld van aluminiumfolie | 5 minuten om een familielid na te maken | `jury` |
| Eierval | Bouw met rietjes en tape een bescherming. Daarna valt het ei van steeds grotere hoogte | `meting_hoog`: hoogste hoogte zonder dat het ei breekt |

### 9.5 Demo-quiz voor de testmodus

Maak een quiz van 5 rondes met elk 2 tot 3 vragen, zodat elk vraagtype aan bod komt. Voorbeelden:
- Op welke dag van de week valt Hemelvaartsdag altijd? Antwoord: donderdag.
- Waar of niet waar: in 2027 valt Moederdag in het Hemelvaartweekend. Antwoord: waar.
- Hoeveel dagen na Pasen valt Hemelvaartsdag? Een schatting, antwoord: 39.
- Waar stond Valkenswaard vroeger in heel Europa om bekend? Antwoord: om de valkeniers.
- Een kaartvraag naar Valkenburg aan de Geul.
- Een `wie_van_ons`-vraag en een `echt_of_ai`-vraag met testdeelnemers en een testfoto.
- Na ronde 3: het intermezzo.

---

## 10. Wat de eigenaar nog aanlevert

- Teamnamen, teamleden en captains, plus de volledige deelnemerslijst. Tot die tijd gebruik je werktitels en testnamen.
- De familiecode. Genereer anders een voorstel.
- De definitieve keuze van de 6 zeskampspellen en de opzet van de spelletjesmiddag.
- De quizvragen (in april, in het formaat van §9.2).
- Het definitieve programma en de starttijd.
- Het logo: een valk met een lauwerkrans, gemaakt met de logo-prompt. Zodra het er is, maak je er alle iconen en splashscreens van.

---

## 11. Fases en planning

| Fase | Klaar | Inhoud | Oplevering |
|---|---|---|---|
| 1. Teaser | zo snel mogelijk, uiterlijk half december 2026 | Repo en setup, designsysteem en basiscomponenten, familiecode, Thuis vóór het weekend (aftelklok, datum, locatie, installatie-uitleg), PWA-basis met het voorlopige embleem, inloggen voor de beheerder, Supabase met migraties, de keepalive-cron, deploy | Een link die de eigenaar in de familiegroepsapp kan zetten |
| 2. Fun facts | begin januari 2027 | Deelnemers en naamkoppeling, de vragenlijst met 25 vragen en de foto-upload, deadline, teller, en in beheer: voortgang, vragen bewerken, export, statistieken, conceptvragen en het fotobeheer voor Echt of AI | Vragenlijst live |
| 3. Weekend-basis | eind februari 2027 | Programma met Nu & straks en Moederdag, teams, onderdelen en puntentelling, klassement, medaillespiegel, losse en vrije punten, zeskamp met spelleider-schermen, stopwatch, alle uitslagtypes, joker en offline invoer, spelhulp, slot, prijsuitreiking, weer | Volledig scorebord en zeskamp, getest met testdata |
| 4. Quiz | eind maart 2027 | Quiz-engine, alle vraagtypes inclusief kaart en Echt of AI, schermen per rol, luistermodus, notities, joker, "Nog 10 seconden", eerlijkheidscheck, import en export, intermezzo, testmodus met de demo-quiz | Een proefquiz die de eigenaar zelf kan spelen |
| 5. Generale repetitie | half april 2027 | Proefquiz met een paar familieleden, belastingtest, bugfixes, `docs/DRAAIBOEK.md`, testdata wissen, en vanaf 1 mei geen nieuwe functies meer | De app is klaar voor 6 mei |

**Wat er in het draaiboek moet** (`docs/DRAAIBOEK.md`):
- **Per dag:** wat de beheerder wanneer aanzet. Voorbeelden: donderdag om 19:45 de captains laten inloggen, zaterdag om 10:25 de zeskamp starten (het slot gaat dan dicht).
- **Paklijst:** een bluetoothspeaker, powerbanks, opladers en een mobiele hotspot als reserve.
- **Noodplannen:** wat te doen als het internet uitvalt, een captaintelefoon leeg is of de beheerder zijn PIN kwijt is.

---

## 12. Klaar is klaar (per fase en aan het eind)

- Alle tests zijn groen, inclusief de testgevallen van §5.5.
- De end-to-end-scenario's van §7.5 zijn groen op mobiele viewports.
- De screenshots op 390 en 360 px zijn bekeken en kloppen met de designreferentie.
- Lighthouse haalt de normen van §2.
- Geen console-fouten, geen geheimen in de repo, RLS overal aan.
- `README.md` legt uit hoe je lokaal draait, deployt, importeert, de testmodus gebruikt en noodherstel doet.
- `docs/BESLISSINGEN.md` en `docs/DRAAIBOEK.md` zijn bijgewerkt.

---

## Bijlage A: logo-prompt (voor Claude Design of ChatGPT)

> Ontwerp een logo voor "De Valkenburger Spelen 2027", een familieweekend vol spelletjes met een knipoog naar de Olympische Spelen en de tv-zeskampen uit de jaren zeventig.
>
> Het beeld: de kop van een valk in profiel, naar links kijkend, met een scherpe haaksnavel, een donkere kap en de typische donkere "traanstreep" onder het oog. De valk staat in een cirkel, met daaromheen een lauwerkrans van twee takken die onderaan samenkomen met een klein strikje.
>
> Stijl: platte vormen, dikke vloeiende lijnen, retro jaren zeventig, als een embleem op een tv-decor of een sporttas uit 1977. Gebruik deze kleuren: donker chocoladebruin #2B1810, oranje #F06A1F, mosterdgeel #F5AE1B, roomwit #FCEBD0 en voor de blaadjes olijfgroen #A7B43A en #6F7F1F. Geen verlopen, geen fotorealisme, geen dunne details.
>
> Maak drie varianten:
> 1. **Volledig logo:** het embleem met daaronder het woordmerk "De Valkenburger Spelen" in dikke, ronde retroletters (zoals Cooper Black of Shrikhand), roomwit met een harde oranje schaduw, en "2027" in een mosterdgeel label.
> 2. **App-icoon:** alleen het embleem, vierkant 1024×1024 op een chocoladebruine achtergrond, met minstens 10 % lege rand rondom, zonder tekst, en nog duidelijk herkenbaar op 48 px.
> 3. **Eenkleurig:** het embleem in één kleur (roomwit) op een transparante achtergrond.
>
> Lever PNG met een transparante achtergrond en, als het kan, SVG. Gebruik geen Olympische ringen en geen bestaande logo's of mascottes.

## Bijlage B: prompt om de quizvragen te maken met Claude

> Ik organiseer De Valkenburger Spelen 2027, een familieweekend met ruim 40 mensen van alle leeftijden in 4 teams. Help me de quiz te maken: 5 rondes van 10 vragen, als JSON in het formaat van SPEC.md §9.2. Ik geef je de export van de fun facts (CSV) en de deelnemerslijst met teams.
>
> Regels:
> 1. Elke vraag is met gezond verstand te beredeneren, ook door een kind van 10.
> 2. Vragen over één persoon zijn eerlijk verdeeld over de teams, met liefst één naam per team in de opties.
> 3. Gebruik totaalvragen uit de fun facts (bijvoorbeeld "Hoeveel van ons…?"), met drie geloofwaardige afleiders.
> 4. Ronde 2 bestaat uit kaartvragen over plaatsen met valk in de naam, ook in andere talen, met gecontroleerde coördinaten.
> 5. Ronde 3 is de muziekronde, met luistermodus en een Spotify-aanwijzing in `notitie`.
> 6. Ronde 5 is Echt of AI? met de ingestuurde foto's.
>
> Stel me eerst vragen als iets onduidelijk is. Lever daarna één geldig JSON-bestand.
