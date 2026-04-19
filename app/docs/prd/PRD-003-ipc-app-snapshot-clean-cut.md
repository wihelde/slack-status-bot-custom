# PRD: IPC-/App-Snapshot sauberer schneiden

## Problem Statement

Die App besitzt bereits erste Bausteine fuer einen gemeinsamen Snapshot zwischen Main Process, Preload und Renderer, aber die eigentliche Zustandsgrenze ist noch nicht konsequent genug geschnitten. Aus Sicht des Produkts gibt es zwar einen sichtbaren Dashboard-Zustand, technisch wird dieser Zustand jedoch noch ueber mehrere parallele Wege geladen, aktualisiert und interpretiert.

Heute existieren nebeneinander:

- ein App-Snapshot als Read-Model
- separate Einzelabfragen fuer First-Run, Status-Konfiguration, Update-Infos und weitere Runtime-Daten
- mehrere Event-Kanaele mit teils unterschiedlichen Payload-Formen
- Renderer-Logik, die nach Aktionen haeufig manuell einen erneuten Snapshot-Load anstoesst
- Preload- und IPC-Oberflaechen, die fachlich zusammenhaengende Zustandsaenderungen noch als viele einzelne Methoden und Events exponieren

Dadurch bleibt unklar, welches Modell fuer die UI eigentlich der kanonische App-Zustand ist. Ein Entwickler, der Dashboard, App-Shell oder Preload erweitert, muss sich heute durch mehrere Datenwege arbeiten, statt auf einer klaren App-Grenze aufzubauen. Das fuehrt zu vermeidbarer Reibung:

- Renderer-Code rekonstruiert fachlichen Zustand teilweise selbst
- Bootstrapping und Live-Updates folgen nicht einem einheitlichen Muster
- die Typgrenze zwischen Runtime-Expose, TypeScript-API und tatsaechlichen IPC-Payloads ist breiter als noetig
- neue UI-Flows laufen Gefahr, weitere parallele Lade- und Refresh-Wege einzufuehren

Das Kernproblem ist also nicht, dass ein Snapshot komplett fehlt, sondern dass die App noch kein wirklich koharentes, bevorzugtes App-Read-Model besitzt, an dem sich Main Process, Preload und Renderer gleichermaßen orientieren.

## Solution

Die App soll einen klareren und engeren IPC-/Snapshot-Schnitt erhalten. Das Ziel ist, dass Renderer, Preload und Main Process ueber ein bewusstes, gemeinsames App-Modell sprechen statt ueber viele nur lose verwandte Einzelpfade.

Aus Nutzersicht soll sich das Verhalten nicht grundsaetzlich aendern. Die App soll weiterhin denselben Status anzeigen, dieselben Aktionen ausfuehren und dieselben Setup- und Update-Signale beruecksichtigen. Die Veraenderung ist primaer architektonisch:

- Der Main Process soll einen klaren Owner fuer den renderer-relevanten App-Zustand haben.
- Der Renderer soll beim Bootstrapping moeglichst aus einem koharenten Snapshot starten.
- Ereignisse und Aktionen sollen sich an demselben App-Modell orientieren, statt eigene parallele Teilmodelle einzufuehren.
- Preload soll eine kleinere, absichtsvollere API exponieren, die um Snapshot-Lesen, Aktionen und wenige klar definierte Event-Typen herum gebaut ist.

Das Zielbild ist kein einziger Monolith-Call fuer alles, sondern ein tieferes App-Read-Model mit klarer Abgrenzung:

- Snapshot fuer renderer-relevanten Runtime-Zustand
- gezielte Action-Methoden fuer mutierende Befehle
- wenige, koharente Events fuer Statusaenderungen oder Snapshot-Refresh-Ausloeser
- klare Trennung zwischen kanonischem Runtime-Zustand und separaten, explizit begruendeten Sonderpfaden wie groesseren Konfigurationseditor-Flows

Wichtig ist dabei: Der Snapshot soll das bevorzugte UI-Modell werden, nicht nur ein zusaetzlicher Helfer neben den bisherigen Wegen.

## User Stories

1. As a product manager, I want the app UI to rely on one coherent runtime model, so that the system is easier to understand.
2. As a product manager, I want renderer and main-process responsibilities to be easier to explain, so that future changes are less risky.
3. As a product manager, I want architecture work here to preserve end-user behavior, so that maintainability improves without visible regressions.
4. As a product manager, I want future UI surfaces to follow one state-loading pattern, so that the app does not accumulate more parallel IPC paths.
5. As a developer, I want the renderer to bootstrap from a single coherent app snapshot, so that startup logic is easier to reason about.
6. As a developer, I want the main process to assemble renderer-facing runtime state in one intentional place, so that the renderer does not have to reconstruct it.
7. As a developer, I want preload to expose a smaller and more stable API surface, so that Electron boundary changes are safer.
8. As a developer, I want app-level runtime state to be typed consistently across main process, preload, and renderer, so that the contract is trustworthy.
9. As a developer, I want the app shell and dashboard to consume the same underlying app model, so that state ownership is not fragmented across components.
10. As a developer, I want first-run and setup-relevant flags to fit clearly into the app model, so that boot decisions are easier to follow.
11. As a developer, I want daemon state, current Slack status, source states, and update state to come from one read model, so that the dashboard does not stitch them together itself.
12. As a developer, I want action flows such as go online, go away, set status, toggle source, and set holiday to integrate cleanly with the same app model, so that post-action refresh logic is predictable.
13. As a developer, I want event payloads to align with the same model used for bootstrap, so that live updates do not invent separate state shapes.
14. As a developer, I want to reduce the number of ad hoc renderer refresh calls after actions, so that UI behavior is simpler to maintain.
15. As a developer, I want the renderer to know when to refresh from a full snapshot versus when a targeted update is enough, so that update paths are explicit.
16. As a developer, I want type declarations and runtime exposure to stay in sync, so that there is less drift between `window.electronAPI` and TypeScript assumptions.
17. As a developer, I want to reduce the use of generic `any` payloads at the IPC boundary, so that regressions are caught earlier.
18. As a developer, I want snapshot assembly to hide main-process complexity behind a small interface, so that the module becomes deeper and easier to test.
19. As a developer, I want renderer components to depend on app-facing state rather than transport details, so that UI code stays shallow.
20. As a developer, I want dashboard refresh behavior after daemon status changes, status changes, and updates to follow one clearer pattern, so that live behavior is easier to audit.
21. As a developer, I want special-case flows like first-run and update notices to be modeled intentionally, so that they do not become one-off exceptions everywhere.
22. As a developer, I want status configuration editing to have a clearly stated relationship to the app snapshot, so that heavy config flows do not accidentally distort the runtime model.
23. As a developer, I want the new app-state boundary to support incremental migration, so that we do not need a risky big-bang rewrite.
24. As a developer, I want tests to protect renderer-observable behavior instead of private event wiring details, so that refactors remain safe.
25. As a developer, I want app-snapshot tests to verify the assembled runtime model directly, so that the main owner of state assembly is protected.
26. As a developer, I want preload tests to verify the exposed contract shape, so that the renderer cannot accidentally depend on undeclared behavior.
27. As a developer, I want renderer tests to cover bootstrap and post-action refresh behavior through the new model, so that UI regressions are visible.
28. As a developer, I want action results and event handling to converge on a smaller set of patterns, so that future contributors do not add custom exceptions by default.
29. As a developer, I want app-state ownership to be clearer for AI-assisted code changes, so that future automated modifications encounter fewer ambiguous seams.
30. As a product manager, I want this refactor to make future settings and dashboard work cheaper, so that state-related UI work scales better.
31. As a developer, I want update-availability behavior to fit the same runtime state model as the rest of the app, so that the UI does not mix event-only and snapshot-only assumptions.
32. As a developer, I want the app shell to avoid independent boot-time queries where the snapshot already has the needed data, so that startup logic becomes more linear.
33. As a developer, I want the final design to make adding another renderer surface easier, so that new screens do not have to invent their own IPC bootstrap flow.
34. As a product manager, I want the work to prioritize clarity of ownership over short-term minimal code movement, so that the architecture improvement is meaningful.
35. As a developer, I want the app snapshot to stay disciplined and renderer-focused, so that it does not become an unbounded dump of all main-process internals.

## Implementation Decisions

- The app will have a clearly preferred renderer-facing read model centered on an app snapshot assembled in the main process.
- The snapshot should include the runtime state the renderer actually needs for app-shell and dashboard decisions, including daemon state, current Slack status, source state, update state, and setup-relevant flags where appropriate.
- The design should preserve targeted action methods for mutations, but those actions must relate cleanly back to the same app model.
- Event handling should be reduced to a smaller set of intentional patterns: either events carry snapshot-compatible state or they clearly instruct the renderer to refresh from the canonical snapshot.
- The renderer should prefer booting from one snapshot path rather than mixing separate startup calls for closely related runtime concerns.
- The app shell and dashboard should align on the same underlying snapshot model instead of independently owning overlapping pieces of runtime state.
- Preload should expose a smaller and more coherent contract focused on snapshot reads, actions, and a limited event surface.
- The runtime-exposed preload API and TypeScript declarations should be kept structurally aligned to reduce drift.
- Generic `any` payloads at the IPC boundary should be replaced or wrapped with more intentional types wherever the payload is part of the supported app-state contract.
- The snapshot boundary should remain renderer-focused and should not absorb every config or editor concern by default.
- Larger editor-style flows such as status-configuration management may remain separate if they are not part of the lightweight runtime view model, but their relationship to the snapshot should be explicit.
- The architecture should favor a deep module for app-state assembly: a small renderer-facing interface hiding the complexity of collecting state from daemon, config, update, and setup sources.
- Migration should be incremental: tighten the main-process snapshot owner, align preload and types, move renderer boot logic onto the shared model, then retire redundant or confusing parallel paths.
- End-user behavior should be preserved unless a separate bug fix is explicitly approved.

## Testing Decisions

- Good tests should verify externally visible behavior at the app-state boundary rather than private implementation details such as exact internal event wiring.
- The app-state assembly layer should receive focused tests that validate the shape and meaning of the snapshot returned to the renderer.
- Preload tests should verify that the exposed runtime contract matches the supported TypeScript-facing API in structure and intent.
- Renderer tests should cover bootstrapping from the app snapshot, action-triggered refresh behavior, and event-driven updates that interact with the snapshot model.
- App-shell and dashboard tests should verify user-visible outcomes such as current status display, daemon-running indicators, source display, update banners, and first-run gating behavior.
- Tests should prefer outcome-based assertions over assertions about how many individual IPC calls happen internally.
- Existing snapshot-provider, IPC service, dashboard, and first-run tests provide prior art and should be evolved toward stronger app-boundary coverage rather than duplicated with lower-level structure checks.
- Regression confidence should take priority over minimizing test count, because this work changes ownership and control flow more than visible product capability.

## Out of Scope

- New end-user features
- UI redesign
- Source-priority or detector-family changes beyond what is necessary to expose a coherent app model
- Large-scale config or persistence redesign
- Rewriting all configuration editor flows into the snapshot if they are not part of the lightweight runtime view
- Updater implementation changes beyond aligning its state exposure with the app model
- Packaging, installer, or tray redesign
- Legacy shell-script cleanup

## Further Notes

- This PRD intentionally creates a fresh artifact for the IPC-/snapshot work to avoid ambiguity with earlier numbering and prior discussions.
- The core success criterion is not "having a snapshot object" but making that snapshot the clear, preferred renderer-facing state model.
- A successful outcome would make it obvious where renderer boot state comes from, how live updates map back to that same model, and which flows are intentionally outside the snapshot.
- The main architectural risk is letting the snapshot become either too weak to be useful or too broad to stay intentional; the implementation should actively steer between those extremes.

## Decision Log

The implementation has now fixed the most important open boundary choices:

- First-run belongs to the renderer-facing app snapshot as a setup flag.
- App-shell and dashboard bootstrap from the same canonical snapshot read.
- Runtime events are modeled primarily as refresh signals for that canonical snapshot.
- Status-configuration editing remains intentionally outside the lightweight runtime snapshot.
- The main-process snapshot provider is the preferred owner for normalizing renderer-visible runtime data before it crosses the Electron boundary.
