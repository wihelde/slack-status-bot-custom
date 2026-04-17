# Implementierungsplan zu PRD-004

## Ziel

Dieser Plan uebersetzt den PRD "Config-/Persistenzschnitt weiter schaerfen" in konkrete, inkrementelle Arbeitsschritte fuer das aktuelle Repository. Ziel ist eine deutlich klarere Grenze zwischen persisted state und runtime state, ohne das Nutzerverhalten oder das bestehende JSON-Format kurzfristig zu veraendern.

## Leitplanken

- Persistenz bleibt vorerst JSON-basiert.
- Runtime-Services sollen moeglichst nicht direkt fuer File-IO verantwortlich sein.
- Main Process und Daemon sollen keine konkurrierenden oder implizit geteilten Config-Owner mehr sein.
- Die Migration soll inkrementell erfolgen und bestehendes Verhalten erhalten.
- Das Ergebnis soll ein tieferes Persistenzmodul sein, nicht ein breites Abstraktions-Framework.

## Aktuelle Reibungspunkte im Repo

- `app/public/electron.js` laedt und speichert App-Konfiguration direkt fuer Tokens, First-Run, Source-Order, Log-Level und weitere App-Settings.
- `app/src/daemon.ts` laedt und speichert ebenfalls direkt `config.json` fuer Source-Enabled-State, Source-Order, Status-Konfiguration und overridable patterns.
- `daemon.ts` nutzt bestehende Dateiinhalte durch breites Mergen, um Felder wie `slackTokens` zu erhalten.
- Persistenzform, Defaulting und Runtime-Initialisierung sind an mehreren Stellen vermischt.
- `Settings.tsx` spricht ueber IPC direkt mit einer API, deren Persistenz-Ownership im Main Process und Daemon verteilt ist.
- Ein Teil der bestehenden Tests prueft rohe Dateistruktur statt eine intentionale Persistenz-Boundary.

## Zielmodule im aktuellen Repo

Die wichtigsten bestehenden Module fuer diese Arbeit sind:

- `app/public/electron.js`
  Heute Owner fuer mehrere App-level Persistenzpfade, aber noch mit direktem Dateizugriff und breiter Verantwortlichkeit.

- `app/src/daemon.ts`
  Heute zugleich Runtime-Service und Persistenz-Owner fuer mehrere daemonnahe Settings.

- `app/src/services/statusManager.ts`
  Konsument von Status-Konfiguration und overridable patterns, sollte diese aber nicht als Speicherformat kennen muessen.

- `app/src/pages/Settings.tsx`
  Renderer-Konsument von Einstellungen, dessen Aktionen spaeter ueber klarere Persistenz-Services laufen sollten.

- `app/src/__tests__/config.test.ts`
  Heutiger Ausgangspunkt fuer rohe Config-Datei-Tests.

- `app/src/__tests__/daemon.test.ts`
  Wichtiger Schutz fuer unveraendertes Laufzeitverhalten waehrend die Persistenzgrenze verschoben wird.

## Neue oder vertiefte Modul-Kandidaten

Die plausibelste Richtung fuer dieses Repo ist eine kleine, klare Persistenzschicht mit wenigen Dateien:

- `app/src/config/appConfigStore.ts`
  Zentraler Owner fuer Laden, Speichern, Defaulting und Recovery der persisted app config.

- `app/src/config/appConfigModel.ts`
  Intentionales Modell fuer persisted app config, getrennt vom rohen JSON-Shape soweit sinnvoll.

- `app/src/config/appConfigMigrations.ts`
  Optionaler Ort fuer Kompatibilitaets- und Schemaentwicklungslogik, falls noetig.

- `app/src/config/appSettings.ts`
  Optionales in-memory Modell fuer die Teile, die Main Process und Daemon tatsaechlich konsumieren.

Diese Dateinamen sind Vorschlaege. Wichtiger als die exakte Struktur ist, dass es einen klaren Persistenz-Owner gibt, statt weiterhin zwei Save-/Load-Zentren zu haben.

## Empfohlene Zustandsaufteilung

Die folgenden persisted concerns sollten bewusst gruppiert und owned werden:

- App-level persisted state
  Tokens, First-Run-Flag, Log-Level, Auto-Launch-bezogene Flags oder vergleichbare appweite Settings.

- Daemon-level persisted settings
  Source-Enabled-State, Source-Order, Status-Konfiguration, overridable patterns.

- Ephemerer Runtime-Zustand
  Polling-Status, laufende Intervalle, temporaere Status- und Cache-Daten, eventbezogene Zustandswerte.

Die kritische Verbesserung ist, dass diese Aufteilung explizit im Modell lebt und nicht nur implizit aus dem aktuellen JSON-Aufbau entsteht.

## Umsetzungsreihenfolge

### Phase 1: Persistenzmodell explizit machen

- Den aktuellen persisted config shape inventarisieren und in ein intentionales Modell ueberfuehren.
- Klarmachen, welche Felder durable app settings sind und welche daemonnahe Settings sind.
- Defaults und Recovery-Regeln an einer Stelle konzentrieren.

Erwartetes Ergebnis:
- ein explizites persisted model
- weniger implizites Wissen in `electron.js` und `daemon.ts`

### Phase 2: Gemeinsamen Config-Store einfuehren

- Einen zentralen Config-Store fuer `load`, `save`, `default`, `merge`, `recover` aufbauen.
- Plattformpfade, Dateiname, JSON-Parsing und Schreiblogik in diesen Store ziehen.
- Fehler- und Corruption-Handling dort verankern.

Erwartetes Ergebnis:
- nur noch ein naheliegender Ort kennt Dateipfade und das rohe JSON-Format
- Save-/Load-Semantik wird konsistent

### Phase 3: Main-Process-Config-Zugriffe umstellen

- `electron.js` fuer Tokens, First-Run, Log-Level und appweite Settings auf den gemeinsamen Store heben.
- IPC-Handler sollen mit intentionalen Config-Operationen arbeiten statt direkt `config`-Objekte und `saveConfig()` zu manipulieren.
- App-Snapshot-Setup-Daten sollen ueber dieselbe boundary kommen.

Erwartetes Ergebnis:
- Main Process ist Konsument einer Persistenzgrenze, nicht mehr ihr ad hoc Owner

### Phase 4: Daemon-Config-Zugriffe umstellen

- `daemon.ts` soll Konfiguration ueber intentional geladene Settings oder einen Store/Repository-Zugriff beziehen, statt direkt selbst Dateien zu lesen und zu schreiben.
- Source-Order, Source-Enabled-State, Status-Konfiguration und overridable patterns sollen ueber klar definierte Persistenzoperationen laufen.
- Breites Mergen bestehender JSON-Dateien soll durch intentionalere Feld-Updates ersetzt werden.

Erwartetes Ergebnis:
- Runtime-Logik im Daemon kennt weniger Speicherformat
- Persistenz und Polling-/Statuslogik sind besser getrennt

### Phase 5: IPC- und Settings-Flows ausduennen

- `Settings.tsx` bleibt funktional gleich, aber die dahinterliegenden IPC-Pfade sollen duennere Persistenz-Use-Cases aufrufen.
- Renderer-seitig wird die Ownership klarer, weil Main Process und Daemon nicht mehr implizit getrennte Config-Modelle verwalten.

Erwartetes Ergebnis:
- Settings-Aktionen sprechen ueber stabilere Use-Cases statt ueber verteilte Save-Pfade

### Phase 6: Tests auf die Persistenz-Boundary neu verteilen

- Datei-, Defaulting- und Recovery-Tests in die neue Persistenzschicht ziehen.
- Daemon-Tests auf Laufzeitverhalten und Konsum der Konfiguration fokussieren.
- Main-Process-Tests auf Nutzung des Config-Stores fokussieren.

Erwartetes Ergebnis:
- Persistenzverhalten und Runtime-Verhalten sind testseitig sauberer getrennt

## Konkrete Testkandidaten

Die wichtigsten bestehenden Testanker fuer diese Arbeit sind:

- `app/src/__tests__/config.test.ts`
  Guter Ausgangspunkt, sollte aber von rohen Dateistruktur-Checks zu Boundary-Tests fuer den Config-Store evolvieren.

- `app/src/__tests__/daemon.test.ts`
  Wichtig als Schutz dafuer, dass Persistenz-Entkopplung das Laufzeitverhalten nicht aendert.

- `app/src/services/__tests__/statusManager.test.ts`
  Relevant, falls Status-Konfiguration kuenftig ueber ein intentionaleres Settings-Modell eingespeist wird.

- IPC- und Settings-nahe Tests
  Sollten spaeter pruefen, dass appweite Settings ueber die neue Persistenz-Boundary korrekt konsumiert werden, nicht ueber verteilte Dateilogik.

## Minimale erste Slice

Wenn wir die Arbeit in kleine, risikoarme PRs schneiden wollen, ist diese Reihenfolge am sinnvollsten:

1. Persisted config model plus gemeinsamer Config-Store einfuehren, ohne Main Process oder Daemon voll umzustellen.
2. Main-Process-Tokens und First-Run auf den Store heben.
3. Daemon-Settings fuer Source-Order und Source-Enabled-State auf den Store heben.
4. Status-Konfiguration und overridable patterns auf dieselbe Boundary heben.
5. Alte direkte Save-/Load-Pfade entfernen und Tests entsprechend neu verteilen.

## Offene Entscheidungen vor der Umsetzung

Diese Punkte muessen waehrend der Implementierung bewusst entschieden werden:

- Ob es einen gemeinsamen Config-Store fuer alles geben soll oder einen kleinen gemeinsamen Kern plus getrennte app-/daemonnahe Use-Cases.
- Ob der Daemon direkte Store-Zugriffe behalten darf oder ein bereits geladenes Settings-Modell injiziert bekommen sollte.
- Wie stark Main Process und Daemon denselben persisted model type teilen sollen.
- Ob Tokens langfristig im selben JSON-Konfigurationsraum bleiben oder nur kurzfristig ueber dieselbe Boundary verwaltet werden.
- Wie explizit Schema-Versionierung oder Migrationslogik in der ersten Ausbaustufe schon sein muss.

## Erfolgskriterien

- Es gibt einen klaren Persistenz-Owner fuer geladene und gespeicherte App-Konfiguration.
- Main Process und Daemon sind Konsumenten einer Boundary statt konkurrierende Save-/Load-Zentren.
- Runtime-Module arbeiten staerker mit intentionalen Settings-Modellen als mit roher JSON-Form.
- Persistenztests schuetzen Defaults, Recovery und Round-Trip-Verhalten direkt an der Boundary.
- Zukuenftige Konfigurationsaenderungen koennen eingefuehrt werden, ohne mehrere Save-/Load-Stellen parallel anpassen zu muessen.
