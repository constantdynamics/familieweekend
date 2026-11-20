# Draaiboek

Dit draaiboek groeit per fase mee en is in fase 5 (half april 2027) compleet: wat de beheerder per dag aanzet, de paklijst en de noodplannen. Hieronder staat wat er nu al geldt.

## Nu (teaser, tot januari)

- De link en de familiecode gaan samen in de familie-app. Voorbeeldbericht:

  > De Valkenburger Spelen 2027 komen eraan! Hemelvaart, do 6 t/m zo 9 mei. Open de link, vul de code in en zet de app op je beginscherm: [link] – familiecode: [code]

- Zet de app ook zelf op je beginscherm en log één keer in op `/beheer`. Wijzig dan meteen je PIN onder **Mijn PIN**.
- Controleer af en toe in beheer bij **Database wakker** of de keepalive elke ochtend draait.

## Noodplannen (nu al bruikbaar)

| Probleem | Wat te doen |
|---|---|
| Iemand ziet "Die code klopt niet" | Code nog eens laten overtypen; hoofdletters, spaties en streepjes maken niet uit. Na 20 foute pogingen op hetzelfde netwerk moet je 10 minuten wachten. |
| De familiecode is uitgelekt | Beheer → **Familiecode**: een nieuwe instellen en opnieuw rondsturen. Wie al binnen is, blijft binnen. Moet iedereen eruit? Zie README, Noodherstel: nieuwe `APP_SECRET`. |
| Beheerder-PIN kwijt | README, Noodherstel: met `npm run maak-hash -- pin <nieuw>` een SQL-regel maken en die in de SQL-editor van Supabase plakken. |
| Na 5 foute PIN's geblokkeerd | 10 minuten wachten. De melding noemt het tijdstip. |
| De app is traag of plat | Kijk op `/api/health`. `database: onbereikbaar`: kijk in Supabase of het project gepauzeerd is en zet het weer aan (Restore). |

## Nog aan te vullen (fase 3 t/m 5)

- Per dag: wat de beheerder wanneer aanzet (captains laten inloggen, zeskamp starten, slot, prijsuitreiking).
- Paklijst: bluetoothspeaker, powerbanks, opladers, mobiele hotspot.
- Noodplannen voor het weekend: internet weg, captaintelefoon leeg, quiz hapert.
