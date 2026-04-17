# Implementierungsplan zu PRD-002

## Ziel

Dieser Plan uebersetzt den PRD "Detector-Familie vereinheitlichen" in konkrete Arbeitsschritte fuer das aktuelle Repository. Ziel ist es, die Detector-Logik zu vertiefen, ohne die bestehende Registry-, Arbitration- und Daemon-Schnittstelle zu veraendern.

## Leitplanken

- Die nach aussen sichtbare `ISourceAdapter`-Grenze bleibt waehrend dieser Arbeit stabil.
- `SourceRegistry`, `SourceArbitrationEngine` und `SlackStatusBotDaemon` sollen von der internen Detector-Vertiefung moeglichst wenig merken.
- Nutzerverhalten und Source-Priorisierung bleiben unveraendert.
- Die Migration erfolgt family-by-family, nicht als Big-Bang-Umbau.

## Aktuelle Reibungspunkte

- `spotify.ts` und `appleMusic.ts` tragen fast denselben Lebenszyklus selbst.
- `meetings.ts` enthaelt drei Adapter mit sehr aehnlicher Struktur, aber ohne gemeinsames tiefes Modul.
- Technische Probe-Logik (`exec`, AppleScript, `lsof`, `tasklist`) sitzt direkt in den konkreten Adaptern.
- Ein Teil der aktuellen Tests prueft eher Klassenform als beobachtbares Boundary-Verhalten.

## Zielmodule im aktuellen Repo

Die folgenden Dateikandidaten sind die naheliegendsten Ziele fuer die erste Version der Umstrukturierung:

- `app/src/services/sources/sourceAdapter.ts`
  Hier bleibt die oeffentliche Adapter-Grenze stabil.

- `app/src/services/sources/spotify.ts`
  Sollte zu einem duenneren Spotify-Entry-Point werden, der auf ein gemeinsames Musikmodul delegiert.

- `app/src/services/sources/appleMusic.ts`
  Sollte zu einem duenneren Apple-Music-Entry-Point werden, der auf dasselbe Musikmodul delegiert.

- `app/src/services/sources/meetings.ts`
  Sollte entweder deutlich ausgeduennt oder spaeter in mehrere duenne Entry-Points plus gemeinsames Meetingmodul zerlegt werden.

- `app/src/services/sources/sourceRegistry.ts`
  Sollte nach aussen unveraendert bleiben und nur dann angepasst werden, wenn die neuen duennen Adapter andere Dateinamen oder Exporte brauchen.

## Neue Modul-Kandidaten

Die folgende Zielstruktur ist fuer dieses Repo plausibel und haelt die Komplexitaet dort, wo sie hingehoert:

- `app/src/services/sources/detectors/musicDetector.ts`
  Gemeinsamer Lebenszyklus fuer musikartige Quellen.

- `app/src/services/sources/detectors/meetingDetector.ts`
  Gemeinsamer Lebenszyklus fuer meetingartige Quellen.

- `app/src/services/sources/probes/commandProbe.ts`
  Kleiner technischer Wrapper fuer Shell-Kommandos und defensive Fehlerbehandlung.

- `app/src/services/sources/probes/appleScriptProbe.ts`
  Gemeinsame Ausfuehrung und Rueckgabeaufbereitung fuer AppleScript-basierte Abfragen.

- `app/src/services/sources/probes/processProbe.ts`
  Gemeinsame Prozesspruefungen wie `pgrep` oder Windows-Checks.

- `app/src/services/sources/probes/networkProbe.ts`
  Gemeinsame Probe-Helfer fuer `lsof`-/Netzwerk-basierte Meeting-Erkennung.

- `app/src/services/sources/formatters/sourceMessageFormatter.ts`
  Gemeinsame String-Normalisierung wie Truncation oder standardisierte Fallbacks, sofern diese Logik wirklich geteilt wird.

- `app/src/services/sources/definitions/musicSources.ts`
  Source-spezifische Definitionen fuer Spotify und Apple Music.

- `app/src/services/sources/definitions/meetingSources.ts`
  Source-spezifische Definitionen fuer Zoom, Teams und Huddle.

Die genaue Dateistruktur kann waehrend der Umsetzung noch leicht angepasst werden. Wichtiger als die exakten Dateinamen ist, dass die Verantwortungen sauber getrennt bleiben.

## Umsetzungsreihenfolge

### Phase 1: Technische Probe-Seams vorbereiten

- Einen kleinen gemeinsamen Command-Execution-Pfad einfuehren.
- AppleScript-Ausfuehrung aus den Musikadaptern herausziehen.
- Netzwerk-/`lsof`-Probing aus den Meetingadaptern herausziehen.
- Bestehende Adapter weiter funktionsfaehig lassen, aber intern schon ueber die neuen Probe-Module leiten.

Erwartetes Ergebnis:
- weniger Shell-/AppleScript-Details direkt in den Source-Adaptern
- erste tiefere Testflaechen fuer technische Fehlerbehandlung

### Phase 2: Musik-Familie vereinheitlichen

- Einen gemeinsamen `musicDetector` einfuehren.
- Spotify und Apple Music auf dieselbe Lebenszykluslogik umstellen:
  App verfuegbar -> Wiedergabe aktiv -> Track lesen -> normalisieren -> `SourceStatus` bilden.
- Unterschiedliche Teile nur noch als source-spezifische Definitionen einspeisen:
  App-Name, Verfuegbarkeitsregel, Player-State-Probe, Track-Probe, Emoji, Message-Formatierung.

Erwartetes Ergebnis:
- `spotify.ts` und `appleMusic.ts` werden deutlich duenner
- die gemeinsame Musiklogik ist an einer Stelle testbar

### Phase 3: Meeting-Familie vereinheitlichen

- Einen gemeinsamen `meetingDetector` einfuehren.
- Zoom, Teams und Huddle auf dieselbe Lebenszykluslogik umstellen:
  Probe ausfuehren -> Regel evaluieren -> aktiven/inaktiven `SourceStatus` bilden.
- Unterschiede nur noch ueber source-spezifische Regeln abbilden:
  Plattformverhalten, Probe-Definition, Match-Kriterium, Anzeigename, Emoji, Standardnachricht.

Erwartetes Ergebnis:
- `meetings.ts` verliert den Charakter einer Sammeldatei mit drei fast gleichen Klassen
- gemeinsame Meeting-Semantik wird als tiefes Modul sichtbar

### Phase 4: Adapter auf duenne Entry-Points reduzieren

- Konkrete Adapter nur noch als Boundary-Schicht belassen:
  Enabled-State, family-definition, Delegation an shared detector.
- Pruefen, ob `meetings.ts` sinnvoll aufgespalten werden sollte oder als reine Re-Export-/Entry-Datei bestehen bleiben darf.

Erwartetes Ergebnis:
- SourceAdapter bleiben fuer Registry und Daemon stabil
- der wesentliche fachliche Code lebt in den Familienmodulen

### Phase 5: Testportfolio neu ausrichten

- Gemeinsame Musiktests fuer Boundary-Verhalten hinzufuegen.
- Gemeinsame Meetingtests fuer Boundary-Verhalten hinzufuegen.
- Source-spezifische Tests auf echte Unterschiede reduzieren.
- Registry- und Daemon-Tests nur dort anpassen, wo sie unbeabsichtigt auf alte interne Struktur angewiesen sind.

Erwartetes Ergebnis:
- mehr Vertrauen an den echten Wiederverwendungsgrenzen
- weniger duplizierte Strukturtests

## Konkrete Testkandidaten

Diese vorhandenen Testbereiche sind die wichtigsten Anker fuer die Migration:

- `app/src/services/sources/__tests__/spotify.test.ts`
  Sollte von Strukturtests zu Musik-Familien- und Spotify-spezifischen Verhaltenstests verschoben werden.

- `app/src/services/sources/__tests__/appleMusic.test.ts`
  Sollte dieselbe Neuausrichtung wie Spotify erhalten.

- `app/src/services/sources/__tests__/meetings.test.ts`
  Sollte einen klaren gemeinsamen Meeting-Boundary-Fokus bekommen; regexnahe Regeln koennen bleiben, falls sie wirklich fachlich relevant sind.

- `app/src/services/sources/__tests__/sourceArbitrationEngine.test.ts`
  Dient als Schutz dafuer, dass sich die nachgelagerte Source-Semantik nicht aendert.

- `app/src/__tests__/daemon.test.ts`
  Dient als End-to-End-Schutz fuer unveraendertes Verhalten ueber Polling, Winner-Wechsel und Reset-Pfade.

## Minimale erste Slice

Wenn wir die Arbeit in kleine, sichere PRs schneiden wollen, ist diese Reihenfolge am sinnvollsten:

1. Probe-Module einfuehren und Spotify intern darauf umstellen.
2. Apple Music auf denselben Musikdetector heben.
3. Gemeinsame Musiktests nachziehen und alte Duplikate ausduennen.
4. Meeting-Probe-Module einfuehren.
5. Zoom, Teams und Huddle auf gemeinsamen Meetingdetector heben.
6. Tests auf Familiengrenzen konzentrieren und Restlogik bereinigen.

## Offene Entscheidungen vor der Umsetzung

Diese Punkte muessen waehrend der Implementierung bewusst entschieden werden:

- Ob `meetings.ts` als Sammeldatei bestehen bleibt oder in mehrere duenne Dateien aufgeteilt wird.
- Ob Musik- und Meetingdefinitionen rein deklarativ bleiben oder kleine source-spezifische Strategien benoetigen.
- Ob String-Normalisierung zentral genug ist, um ein eigenes Modul zu rechtfertigen, oder nur in der Musikfamilie leben sollte.
- Wie weit technische Probe-Module abstrahiert werden sollen, ohne eine kuenstliche "universal probe framework"-Schicht zu bauen.

## Erfolgskriterien

- Neue oder geaenderte Quellen lassen sich family-first statt adapter-first implementieren.
- Registry, Arbitration und Daemon brauchen keine semantischen Aenderungen.
- Tests schuetzen die gemeinsamen Detector-Lebenszyklen direkt.
- Source-spezifische Dateien beschreiben hauptsaechlich Unterschiede, nicht den kompletten Ablauf.
