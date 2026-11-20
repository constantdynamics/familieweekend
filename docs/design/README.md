# Designreferentie: De Valkenburger Spelen 2027

Deze map hoort in `docs/design/` van de repo. Hij bevat de bronbestanden van het klikbare prototype dat op het ontwerpcanvas van Claude staat.

## Inhoud

- `project/*.dc.html`: één bestand per scherm (390×844, de stijlgids is 1280×844). De stijlen staan inline, dus alle maten, kleuren en teksten kun je er letterlijk uit halen.
- `project/canvas.json`: de indeling van het canvas.

## Schermen

| Bestand | Scherm |
|---|---|
| Main | Thuis vóór het weekend, met de aftelklok |
| Funfacts | Fun facts invullen, inclusief de foto-upload |
| Stijlgids | Kleuren, letters, tegels, knoppen en het embleem |
| Thuis-tijdens | Thuis tijdens het weekend: Nu & straks, weer, team, slot |
| Programma | Dagtabs en een tijdlijn |
| Scorebord | Klassement, medaillespiegel en het slot |
| Quiz-captain | Antwoorden kiezen, joker, onthulling |
| Quiz-meekijker | Meekijken bij Echt of AI |
| Quizmaster | Console met luistermodus en "Nog 10 seconden" |
| Intermezzo | Steen, papier, schaar |
| Zeskamp | Stopwatch voor de spelleider, met gedeelde punten en joker |
| Prijsuitreiking | Onthulling van plaats 4 tot 1, met podium |

## Voor Claude Code

Bouw de schermen na in de echte stack. Neem de stijl, maten, teksten en het gedrag over, maar niet de opbouw van deze bestanden (die draaien op de runtime van het canvas).

Zet er ook PNG-exports van de schermen bij. Je maakt ze vanuit het ontwerp via delen of exporteren.
