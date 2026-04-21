## Problem Statement

Nach den letzten Refactors sitzt die verbleibende strukturelle Komplexitaet der App nicht mehr primaer in der Status-Domaene, sondern vor allem an der Electron-Main-Process-Grenze und in den grossen Integrations-Tests darum herum. Insbesondere `electron.js` traegt weiterhin sehr viele Verantwortlichkeiten gleichzeitig: App-Start, Fenster-Lifecycle, Tray-Menues, Update-Signale, Snapshot-Weitergabe, IPC-Handler, Setup-Flows, Logging-Uebergaenge und Auto-Launch-Verhalten. Dadurch bleibt ein breiter, schwer testbarer und aenderungssensibler Knoten im System bestehen.

Aus Delivery-Sicht zeigt sich dieses Problem weniger als fehlende Funktion, sondern als hohes Aenderungsrisiko rund um Main-Process-Verhalten. Kleine Anpassungen an Tray-Menues, Snapshot-Signalen, IPC-Responses, Setup-Flows oder Update-Handling muessen sich weiterhin durch eine zentrale Datei mit vielen Seiteneffekten bewegen. Das erschwert Review, macht Fehlerdiagnose unnoetig teuer und erhoeht die Wahrscheinlichkeit, dass scheinbar lokale Main-Process-Aenderungen andere Bereiche unbeabsichtigt beeinflussen.

Parallel dazu bleibt die Integrations-Testschicht noch zu breit und teilweise zu nahe an internen Strukturen. Zwar wurden bereits erste Reach-through-Tests reduziert, aber der verbleibende Daemon-/Main-Process-Testbereich ist immer noch groesser und enger gekoppelt als noetig. Dadurch dauert es laenger, Vertraege sicher zu aendern, und die Tests geben teilweise noch zu viel Implementierungswissen preis statt nur stabile Systemgrenzen zu pruefen.

## Solution

Die App bekommt einen klareren Electron-Main-Boundary-Schnitt. Die bisher in `electron.js` gebuendelten Verantwortlichkeiten werden in kleinere, explizitere Main-Process-Module und fokussierte Adapter zerlegt. Ziel ist eine Main-Process-Komposition, in der Fenster-/Tray-Verhalten, Snapshot-Signalisierung, Setup-/Config-Initialisierung, Status-/Renderer-Bruecken, Update-Integration und IPC-Handler hinter kleineren, besser testbaren Schnittstellen liegen.

Begleitend dazu wird die verbleibende grosse Integrations-Testschicht weiter in Richtung Boundary- und Contract-Tests verschoben. Hohe Systemabdeckung soll erhalten bleiben, aber die Suite soll weniger private Interna beruehren, klarere Testdoubles verwenden und den Main-/Daemon-/Renderer-Zusammenschnitt ueber stabile Vertrage statt ueber interne Objekte absichern.

Der Schnitt ist ausdruecklich verhaltensneutral. Es geht nicht darum, das App-Verhalten fuer Nutzer zu veraendern, sondern darum, die bestehende Main-Process-Architektur und die zugehoerige Testschicht so zu reorganisieren, dass Releases robuster, Aenderungen vorhersehbarer und spaetere Feature- oder Refactor-Arbeit sicherer werden.

## User Stories

1. As a maintainer, I want the Electron main process to be split into smaller modules, so that changes no longer require navigating one broad file.
2. As a maintainer, I want startup, tray, window, update, and IPC responsibilities to be separated, so that bugs are easier to isolate.
3. As a maintainer, I want `electron.js` to become a composition-oriented entrypoint, so that top-level behavior is readable without carrying every implementation detail inline.
4. As a maintainer, I want the renderer-facing snapshot signaling path to live behind a focused boundary, so that snapshot refresh behavior is easier to evolve safely.
5. As a maintainer, I want tray behavior to be encapsulated separately from app bootstrap logic, so that menu changes do not risk unrelated startup behavior.
6. As a maintainer, I want window lifecycle behavior to be represented behind a dedicated module, so that hide/minimize/close semantics can be reviewed in one place.
7. As a maintainer, I want app setup and config bootstrap concerns to have clearer ownership, so that startup regressions are easier to debug.
8. As a maintainer, I want main-process IPC handlers to be grouped by concern, so that contracts are easier to discover and test.
9. As a maintainer, I want status-related IPC handlers to remain aligned with shared typed contracts, so that renderer and main process cannot drift silently.
10. As a maintainer, I want snapshot- and setup-related IPC handlers to expose consistent result shapes, so that renderer code does not need ad hoc branching.
11. As a maintainer, I want the main-process status bridge to have a predictable logging pattern, so that status-related production issues are easier to trace.
12. As a maintainer, I want Electron-side logging around snapshot emission and renderer notifications to be consistent, so that state propagation issues are easier to diagnose.
13. As a maintainer, I want auto-launch and update integration to sit behind explicit boundaries, so that platform-specific behavior does not sprawl through unrelated code.
14. As a maintainer, I want preload and main-process APIs to remain in lockstep through shared contracts, so that UI evolution stays safe.
15. As a maintainer, I want the Electron main process to expose smaller seams for tests, so that focused tests can replace broad setup-heavy coverage.
16. As a maintainer, I want more tests to assert main-process contracts and observable outcomes, so that implementation refactors do not cause unnecessary rewrites.
17. As a maintainer, I want fewer tests to inspect daemon or manager internals through reflection or index access, so that test intent matches architectural boundaries.
18. As a maintainer, I want large daemon- and Electron-adjacent tests to shrink where focused boundary tests now provide equivalent coverage, so that the suite remains maintainable.
19. As a maintainer, I want a small set of integration-style tests to remain, so that end-to-end composition of daemon, main process, preload, and renderer contracts is still proven.
20. As a maintainer, I want snapshot provider behavior to remain externally unchanged, so that the UI does not regress while architecture is improved.
21. As a maintainer, I want tray interactions to remain externally unchanged, so that this refactor does not create user-visible surprises.
22. As a maintainer, I want startup and first-run flows to remain externally unchanged, so that architecture work ships with low onboarding risk.
23. As a maintainer, I want status actions triggered through Electron IPC to remain compatible with the existing daemon contracts, so that recent status-domain work stays intact.
24. As a maintainer, I want main-process modules to be structured as deep modules with small public surfaces, so that future changes compose through stable seams.
25. As a maintainer, I want platform-specific Electron behavior to be isolated from cross-platform app logic, so that portability concerns are easier to reason about.
26. As a maintainer, I want the remaining integration-test complexity to be reduced deliberately instead of opportunistically, so that architectural cleanup is durable.
27. As a maintainer, I want future PM work affecting tray, startup, setup, or main-process behavior to be estimated with higher confidence, so that roadmap planning is less exposed to hidden risk.
28. As a maintainer, I want this PRD to follow the status-domain cleanup with an equally clear main-process cleanup, so that architectural work progresses along the next largest seam.

## Implementation Decisions

- The effort is architectural and behavior-preserving. It must not intentionally change user-visible tray behavior, startup behavior, first-run behavior, status actions, snapshot refresh semantics, or update visibility.
- The broad Electron main entrypoint should be reduced to composition and wiring. Concrete responsibilities should move behind smaller modules instead of remaining inline.
- Window lifecycle management should live behind a focused boundary that owns BrowserWindow creation, visibility behavior, and close/minimize/hide policies.
- Tray creation and tray menu composition should live behind a focused boundary that owns icon selection, menu building, and menu refresh triggers.
- Snapshot emission toward the renderer should live behind an explicit boundary that owns event naming, payload shape, and logging around refresh signals.
- IPC handlers should be organized by concern rather than continuing as one long procedural list. Status, snapshot/setup, config, logging, and platform helpers should be separable.
- Shared preload/main/renderer contracts should remain the source of truth for IPC result shapes and event payloads.
- Platform-specific auto-launch behavior should be isolated from general main-process wiring, even if the underlying behavior remains unchanged.
- Update integration should keep its current functional behavior but should no longer force unrelated tray or window logic to sit in the same implementation block.
- Main-process logging around renderer bridges, snapshot refreshes, and status-triggered IPC calls should follow a consistent pattern instead of mixing ad hoc console output.
- The resulting structure should preserve the current daemon boundary and should not pull status-domain rules back into Electron-specific code.
- The test refactor should prefer extracting focused boundary tests over adding more logic to broad, monolithic integration files.
- Where large integration tests still provide unique composition coverage, they should stay; where they merely repeat lower-level boundary assertions, they should be simplified or removed.
- New test seams should be designed around externally meaningful contracts: IPC results, emitted refresh signals, tray/menu outcomes, window lifecycle outcomes, and daemon/main-process collaboration.
- The refactor should continue the pattern established by the runtime and status-domain cuts: reduce broad architectural hotspots by introducing deeper, more explicit modules.

## Testing Decisions

- Good tests for this refactor assert contracts, emitted events, visible state transitions, and IPC outcomes rather than private fields or helper ordering.
- The primary test focus should move toward focused main-process boundaries: window lifecycle management, tray/menu composition, snapshot signaling, IPC contract handlers, and setup/bootstrap collaborators.
- Shared contract tests should continue to validate payload shapes between main, preload, and renderer layers.
- Broad integration-style tests should remain only where they prove meaningful end-to-end composition between daemon, main process, preload, and renderer-facing boundaries.
- Existing daemon and IPC tests provide useful prior art, but new tests should reduce direct reach-through into internal collaborators where a boundary-level test can prove the same behavior.
- Snapshot-provider tests, IPC service tests, app-snapshot contract tests, and daemon integration tests are the most relevant prior art for style and fixture shape.
- Logging tests should stay selective and assert only meaningful boundary behavior, such as whether a failure path is recorded through the expected logging channel, not incidental wording.
- The resulting suite should aim to keep test runtime practical while making individual failures more local, readable, and action-guiding.

## Out of Scope

- Introducing new user-facing tray features, menu items, setup flows, or update experiences.
- Redesigning the renderer UI, routing, dashboard, or settings screens.
- Reworking the status-domain business rules that were handled under the previous PRD.
- Changing daemon polling cadence, source detection logic, or status arbitration behavior beyond interface adjustments required by the new main-process boundaries.
- Replacing Electron with a different host architecture.
- A full platform-behavior redesign for auto-launch, packaging, updates, or tray icons.
- General-purpose cleanup in unrelated modules that does not materially support the Electron main boundary or integration-test hardening.

## Further Notes

- This PRD should be treated as the next architectural follow-up after the runtime and status-domain cuts. Those efforts reduced service-layer complexity; this one targets the broad Main-process seam that still carries disproportionate coordination risk.
- The main product reason for the work remains release-risk reduction, not visible feature delivery.
- If implementation uncovers undocumented behavior dependencies in tray, startup, update, or setup flows, those ambiguities should be surfaced explicitly instead of being silently reinterpreted during the refactor.
- A successful outcome should leave the team with a slimmer Electron entrypoint, clearer main-process ownership boundaries, stronger IPC/test contracts, and a smaller, more meaningful integration-test surface.
