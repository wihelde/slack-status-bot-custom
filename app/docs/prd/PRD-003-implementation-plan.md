# Implementierungsplan zu PRD-003

## Ziel

Dieser Plan uebersetzt den PRD "IPC-/App-Snapshot sauberer schneiden" in konkrete, inkrementelle Arbeitsschritte fuer das aktuelle Repository. Ziel ist ein klar bevorzugtes renderer-seitiges App-Read-Model, ohne die sichtbare Produktfunktionalitaet zu aendern.

## Leitplanken

- Der App-Snapshot wird zum bevorzugten renderer-facing Read-Model.
- Mutierende Aktionen bleiben erhalten, muessen sich aber sauber in dasselbe Modell einfuegen.
- Renderer, Preload und Main Process sollen sich an einer kleineren, absichtsvolleren Boundary orientieren.
- Nicht jeder Konfigurations- oder Editor-Flow muss in den Snapshot aufgenommen werden.
- Die Migration erfolgt schrittweise, nicht als Big-Bang-Umbau.

## Aktuelle Reibungspunkte im Repo

- `App.tsx` bootet ueber `isFirstRun()` und `getAppSnapshot()` parallel.
- `Dashboard.tsx` nutzt bereits den Snapshot, laedt aber nach Aktionen haeufig manuell erneut und hat daneben weitere Einzelpfade wie `getStatusConfiguration()`.
- `preload.js` exponiert viele fachlich benachbarte Methoden und mehrere Event-Kanaele.
- `ipcService.ts` spiegelt diese breite API und enthaelt noch einige `any`-artige Eventgrenzen.
- `electron.js` besitzt schon Snapshot-Assembly, aber die Gesamtgrenze ist noch nicht streng genug auf ein bevorzugtes App-Modell hin organisiert.

## Zielmodule im aktuellen Repo

Die wichtigsten bestaenden Module fuer diese Arbeit sind:

- `app/src/contracts/appSnapshot.ts`
  Das gemeinsame Vertragsmodell fuer renderer-relevanten Runtime-Zustand.

- `app/src/main/appSnapshotProvider.ts`
  Der naheliegendste Ort fuer einen tieferen Main-Process-Owner des renderer-facing Zustands.

- `app/public/electron.js`
  Die Main-Process-seitige IPC-Assembly und Event-Ausleitung.

- `app/public/preload.js`
  Die runtime-exponierte Boundary fuer den Renderer.

- `app/src/services/ipcService.ts`
  Die typisierte Renderer-seitige Zugriffsschicht, die sich enger um Snapshot, Aktionen und wenige Events organisieren sollte.

- `app/src/App.tsx`
  Die App-Shell, die aktuell noch teils parallel zum Dashboard bootet.

- `app/src/pages/Dashboard.tsx`
  Der wichtigste aktuelle Konsument des Snapshot-Modells und damit der beste Ort, um inkrementelle Verbesserungen sichtbar zu machen.

## Neue oder vertiefte Modul-Kandidaten

Die wahrscheinlich sinnvollste Richtung ist keine breite Zahl neuer Dateien, sondern eine Vertiefung der bestehenden App-State-Module:

- Ein klareres App-State-Assembly-Modul im Main Process
  Entweder als Ausbau des bestehenden Snapshot-Providers oder als kleiner Controller darum herum.

- Ein expliziter Renderer-App-State-Zugriff in `ipcService.ts`
  Ziel ist eine kleinere API mit klarer Trennung zwischen:
  Snapshot lesen, Aktionen ausfuehren, gezielte Events abonnieren.

- Eine kleinere Event-Semantik
  Statt vieler teilweiser Statuskanaele sollten wenige wohldefinierte App-State-Events oder Snapshot-Refresh-Signale uebrig bleiben.

- Ein klarerer App-Shell-Boot-Pfad
  `App.tsx` und `Dashboard.tsx` sollten denselben zugrunde liegenden Snapshot-Begriff teilen statt parallel zu booten.

## Umsetzungsreihenfolge

### Phase 1: Snapshot-Grenze im Main Process schaerfen

- Den bestehenden Snapshot-Provider als bevorzugten Owner renderer-relevanten Runtime-Zustands festigen.
- Pruefen und dokumentieren, welche Daten wirklich in den Snapshot gehoeren:
  Daemon-Status, Slack-Status, Sources, Update-Status, Setup-Flags.
- Explizit festhalten, welche Daten ausserhalb des Snapshot bleiben duerfen:
  insbesondere groessere Editor- oder Konfigurationsflows.

Erwartetes Ergebnis:
- ein klarerer, disziplinierter Snapshot-Vertrag
- weniger Unklarheit darueber, was der kanonische Runtime-Zustand fuer den Renderer ist

### Phase 2: Preload- und Type-Grenze ausrichten

- `preload.js` und `ipcService.ts` enger auf dieselbe App-State-Sprache bringen.
- Snapshot-Lesen als bevorzugten Read-Pfad herausstellen.
- Event-Payloads typisieren oder auf klarere Snapshot-Refresh-Signale reduzieren.
- Die Zahl parallel bedeutungsgleicher IPC-Pfade verkleinern.

Erwartetes Ergebnis:
- weniger Drift zwischen Runtime-Expose und TypeScript-Grenze
- kleinere, absichtsvollere Renderer-API

### Phase 3: App-Shell-Boot vereinheitlichen

- `App.tsx` auf einen koharenteren Boot-Pfad heben, damit First-Run-Entscheidung und appweite Runtime-Anzeige nicht mehr auf lose parallelen Requests beruhen.
- Entscheiden, ob App-Shell und Dashboard denselben initialen Snapshot teilen oder ob die App-Shell einen kleineren, expliziten Teil desselben Modells konsumiert.

Erwartetes Ergebnis:
- linearerer Startup-Fluss
- klarere Ownership fuer First-Run- und Daemon-Anzeige in der App-Shell

### Phase 4: Dashboard auf klareres Snapshot-Modell ziehen

- Dashboard-Initialisierung, Live-Update-Reaktion und Post-Action-Refresh enger am Snapshot orientieren.
- Manuelle Reload-Muster nach Aktionen reduzieren, wo ein klarerer Refresh-Pfad moeglich ist.
- Sonderpfade wie Status-Konfiguration bewusst als ausserhalb oder angrenzend zum Snapshot behandeln, statt sie implizit zu vermischen.

Erwartetes Ergebnis:
- weniger ad hoc Refresh-Logik
- Dashboard-Code spricht staerker in App-State- statt Transport-Begriffen

### Phase 5: Event-Modell bereinigen

- Bestehende Event-Kanaele auf ihren echten Nutzen pruefen.
- Entweder Events auf snapshot-kompatible Payloads bringen oder sie als reine Refresh-Ausloeser behandeln.
- Redundante oder semantisch ueberlappende Event-Pfade abbauen.

Erwartetes Ergebnis:
- weniger Event-bedingte Sonderfaelle
- leichter nachvollziehbare Live-Update-Semantik

### Phase 6: Tests auf die neue Boundary ausrichten

- Snapshot-Provider-Tests auf das kanonische Runtime-Modell fokussieren.
- `ipcService`-Tests auf klare App-State-Methoden und Event-Vertraege ausrichten.
- App- und Dashboard-Tests auf Bootstrapping, First-Run-Gating und Post-Action-Refresh konzentrieren.

Erwartetes Ergebnis:
- Vertrauen sitzt auf der App-State-Boundary statt auf verstreuten Einzelfaellen

## Konkrete Testkandidaten

Die wichtigsten bestehenden Testanker fuer diese Arbeit sind:

- `app/src/main/__tests__/appSnapshotProvider.test.ts`
  Schutz fuer die Main-Process-seitige Assembly des renderer-facing Zustands.

- `app/src/contracts/__tests__/appSnapshot.test.ts`
  Schutz fuer das Snapshot-Vertragsmodell selbst.

- `app/src/services/__tests__/ipcService.appSnapshot.test.ts`
  Guter Startpunkt fuer Snapshot-zentrierte Renderer-API-Tests.

- `app/src/services/__tests__/ipcService.firstRun.test.ts`
  Wichtig, falls First-Run staerker an das gemeinsame App-Modell angeschlossen wird.

- `app/src/services/__tests__/ipcService.test.ts`
  Kandidat fuer die Verengung und Typisierung der Event- und Boundary-API.

- `app/src/__tests__/App.firstRun.test.tsx`
  Schutz fuer App-Shell-Boot und First-Run-Gating.

- `app/src/pages/__tests__/Dashboard.test.tsx`
  Schutz fuer Snapshot-Bootstrapping, Action-Flows und Live-Updates im Dashboard.

## Minimale erste Slice

Wenn wir diese Arbeit in kleine, risikoarme PRs schneiden wollen, ist diese Reihenfolge am sinnvollsten:

1. Snapshot-Vertrag und Snapshot-Provider final disziplinieren.
2. Preload und `ipcService` auf eine kleinere, klarere App-State-API zuschneiden.
3. `App.tsx`-Boot auf den gemeinsamen Snapshot-Begriff ausrichten.
4. Dashboard-Refresh-Pfade vereinfachen und Event-Semantik konsolidieren.
5. Tests auf die neue Boundary nachziehen und redundante Altpfade abbauen.

## Offene Entscheidungen vor der Umsetzung

Diese Punkte muessen waehrend der Implementierung bewusst entschieden werden:

- Ob First-Run vollstaendig Teil des App-Snapshot werden soll oder ob es als kleiner, expliziter Sonderfall daneben bleibt.
- Ob Events bevorzugt snapshot-kompatible Payloads transportieren oder nur Refresh-Signale sein sollen.
- Ob App-Shell und Dashboard denselben initialen Snapshot lesen oder ob die App-Shell nur einen engeren Ausschnitt konsumiert.
- Wie weit Status-Konfiguration und andere editorartige Flows bewusst ausserhalb des Runtime-Snapshot bleiben sollen.
- Welche bestehenden IPC-Methoden nur migriert und welche danach wirklich entfernt oder entwertet werden sollen.

## Erfolgskriterien

- Der Snapshot ist der klare bevorzugte Read-Pfad fuer renderer-relevanten Runtime-Zustand.
- App-Shell und Dashboard sprechen ueber denselben zugrunde liegenden App-State-Begriff.
- Preload und `ipcService` bilden eine kleinere und besser typisierte Boundary.
- Post-Action-Refresh und Live-Update-Verhalten folgen wenigen klaren Mustern.
- Neue Renderer-Flaechen koennen auf dem bestehenden App-Modell aufbauen statt neue IPC-Boot-Pfade zu erfinden.

