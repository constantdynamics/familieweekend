# Plan fase 1: de teaser

Doel (SPEC §11): een link die de eigenaar in de familiegroepsapp kan zetten, met de aftelklok, de data, de locatie en uitleg om de app op het beginscherm te zetten. Daaronder ligt het fundament voor de rest van het jaar.

## Wat er in deze fase komt

1. **Repo en setup.** Next.js 16 (App Router, Cache Components, Turbopack), TypeScript, Tailwind 4, Vitest, Playwright, Lighthouse CI, GitHub Actions.
2. **Designsysteem en basiscomponenten** (SPEC §6): kleuren, letters (Shrikhand en Rubik, zelf gehost), zeskampbocht, zonnestralen, embleem, kaarten, knoppen, chips, klapcijfers, tabbalk, lege staten, invulvelden, meldingen, iconen.
3. **Familiecode.** Welkomstscherm, controle op de server, ondertekend httpOnly-sessiecookie van 120 dagen (verlengt zich bij gebruik), limiet op pogingen.
4. **Thuis vóór het weekend.** Embleem, data, locatie, aftelklok met klapcijfers, vooraankondiging van de fun facts, installatie-uitleg voor iPhone en Android (met de echte installatieprompt op Android).
5. **De andere tabs** (Programma, Quiz, Zeskamp, Score) met een nette lege staat en wat er al vaststaat.
6. **PWA-basis.** Manifest, iconen en maskable iconen, Apple touch icon, 22 iOS-splashscreens, service worker (Serwist) met app-shell-cache en offlinepagina, melding "Nieuwe versie beschikbaar", offline-banner.
7. **Inloggen voor de beheerder** met PIN, en een beheerscherm met instellingen (aftrap, einde, locatie, coördinaten, deadline fun facts), familiecode wijzigen, eigen PIN wijzigen en logboek.
8. **Supabase met migraties.** Eigen schema `valk` in het bestaande project eten-avontuur, rij-beveiliging die standaard alles weigert, eigen databasegebruiker `valk_app`.
9. **Keepalive-cron** (Vercel Cron, dagelijks) met een GitHub Actions-workflow als reserve.
10. **Deploy** naar Vercel.

## Hoe ik het controleer

- Vitest voor de logica (tijd en tijdzones, aftelklok, codes, hashes, sessietokens) en een integratietest voor de rij-beveiliging van de database.
- Playwright op 390×844 en 360×780: toegang, Thuis, tabs, beheer, PWA en offline, keepalive, plus een toegankelijkheidscheck (axe, WCAG 2.2 AA) en screenshots van elk scherm in `docs/screenshots/fase-1/`.
- Lighthouse mobiel: prestaties ≥ 90, toegankelijkheid ≥ 95, best practices ≥ 95.

## Wat bewust nog niet in deze fase zit

Deelnemers en naamkoppeling, fun facts (fase 2), programma-beheer, scorebord en zeskamp (fase 3), quiz (fase 4). De tabs laten daarvoor nu een lege staat zien. De familiecode en de toesteltoken zijn al zo gebouwd dat fase 2 de naamkoppeling er zonder verbouwing bovenop kan zetten.
