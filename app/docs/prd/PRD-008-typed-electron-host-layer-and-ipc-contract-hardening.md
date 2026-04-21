## Problem Statement

Nach dem Main-Process-Schnitt aus PRD-007 ist die Electron-Host-Seite der App strukturell deutlich klarer, aber sie bleibt in einem wichtigen Punkt hinter dem Rest der Codebase zurueck: `main`- und `preload`-Schicht laufen weiterhin als plain CommonJS-JavaScript ohne die gleiche Typsicherheit und Compile-Time-Absicherung wie Renderer, Domain und Services.

Aus Maintainer-Sicht erzeugt das eine unschoene Asymmetrie. Aenderungen an IPC-Handlern, Preload-APIs, Event-Payloads, Main-Process-Wiring oder Build-Entrypoints koennen weiterhin leichter still driften, weil ein relevanter Teil der Host-Grenze weniger statisch abgesichert ist. Gerade an der Grenze zwischen Main, Preload und Renderer ist das Risiko hoch, dass scheinbar kleine Anpassungen erst spaet oder nur manuell auffallen.

Das Problem ist dabei nicht primaer fehlende Funktionalitaet fuer Nutzer, sondern ein verbleibendes Architektur- und Delivery-Risiko. Solange der Electron-Host-Layer nicht aehnlich stark typisiert ist wie der restliche App-Code, bleibt die teuerste Art von Fehler moeglich: Contract-Brueche, die sich erst zur Laufzeit oder in spaeteren QA-Schritten zeigen.

## Solution

Die App bekommt einen getypten Electron-Host-Layer. Main-Process-Entrypoint, Preload-Bridge und die zentralen Host-seitigen Adapter werden auf TypeScript und klarere Host-Boundaries umgestellt, ohne das Nutzerverhalten zu aendern.

Die Umstellung soll ausdruecklich nicht bei einer rein mechanischen `.js`-zu-`.ts`-Migration stehenbleiben. Stattdessen wird die Electron-Host-Schicht als eigener, klarer Architektur-Layer behandelt: mit kleinen, stabilen, gut testbaren Modulen fuer Bootstrap, Preload-API-Expose, IPC-Registrierung und Build-Output-Grenzen.

Begleitend dazu werden Main-, Preload- und Renderer-Vertraege bewusster zusammengefuehrt. IPC-Channels, Event-Namen, Payload-Shapes und Rueckgabeformate sollen staerker durch geteilte Typen und engere Compile-Time-Absicherung zusammengehalten werden, damit sich die Schichten nicht still auseinanderentwickeln.

Der Schnitt ist verhaltensneutral. Tray, Startup, Setup, Snapshot-Signale, Status-Aktionen, Update-Verhalten und Auto-Launch sollen fuer Nutzer gleich bleiben. Der Mehrwert liegt in hoeherer Aenderungssicherheit, besserer Refactorbarkeit und einem robusterem Build-/Runtime-Vertrauen fuer den Electron-Host-Bereich.

## User Stories

1. As a maintainer, I want the Electron main entrypoint to be typed, so that host-side wiring errors are caught before runtime.
2. As a maintainer, I want the preload layer to be typed, so that exposed renderer APIs cannot drift silently.
3. As a maintainer, I want the Electron host layer to follow the same TypeScript discipline as the rest of the app, so that architectural quality is more consistent.
4. As a maintainer, I want IPC channels and payloads to be described through shared contracts, so that main, preload, and renderer stay in lockstep.
5. As a maintainer, I want event payloads such as snapshot refresh signals and tray-triggered renderer notifications to remain strongly typed, so that contract regressions surface early.
6. As a maintainer, I want the main-process bootstrap code to compile through a dedicated typed boundary, so that startup changes are easier to validate.
7. As a maintainer, I want preload exposure logic to live behind a small typed module, so that renderer-facing Electron APIs are easier to review.
8. As a maintainer, I want host-layer adapters to use typed interfaces instead of ad hoc object shapes, so that refactors are safer.
9. As a maintainer, I want the Electron build entrypoints to be represented explicitly in the toolchain, so that packaging and runtime expectations are easier to reason about.
10. As a maintainer, I want TypeScript to catch mismatches in IPC result shapes, so that the renderer does not need to defend against accidental contract drift.
11. As a maintainer, I want the main-process modules introduced in PRD-007 to keep their clearer boundaries while gaining type safety, so that structural cleanup is reinforced rather than bypassed.
12. As a maintainer, I want bootstrap composition to remain readable after the migration, so that TypeScript does not merely add ceremony.
13. As a maintainer, I want preload event subscription APIs to be typed end-to-end, so that cleanup contracts and callback payloads stay aligned.
14. As a maintainer, I want shared Electron-facing contracts to be discoverable from one place, so that future features do not invent parallel channel definitions.
15. As a maintainer, I want the typed host layer to reduce fear around changing tray, startup, or setup logic, so that estimates are less exposed to hidden runtime risk.
16. As a maintainer, I want the build output for main and preload to be explicit, so that packaging behavior is less magical.
17. As a maintainer, I want the Electron entrypoint to remain compatible with electron-builder, so that this architecture work does not destabilize release packaging.
18. As a maintainer, I want compile-time guarantees around host-side imports and exports, so that module wiring mistakes fail fast.
19. As a maintainer, I want preload and renderer API naming to remain aligned with domain contracts, so that UI code keeps depending on stable interfaces rather than Electron details.
20. As a maintainer, I want host-layer refactors to rely less on manual smoke testing alone, so that confidence does not depend on remembering every path by hand.
21. As a maintainer, I want Electron-specific platform adapters to benefit from typed boundaries, so that macOS-specific and cross-platform branches are easier to audit.
22. As a maintainer, I want the migration to stay behavior-preserving, so that users do not receive accidental tray, startup, or settings changes.
23. As a maintainer, I want the preload boundary to remain intentionally narrow, so that unsafe or overly broad Electron capabilities are not exposed to the renderer during the migration.
24. As a maintainer, I want the host-layer modules to become deeper modules with small public surfaces, so that they hide complexity instead of exporting it.
25. As a maintainer, I want the Electron host layer to be easier for AI and humans to navigate, so that future architectural work compounds rather than restarts from ambiguity.
26. As a maintainer, I want tests around IPC and preload boundaries to assert external contracts instead of implementation details, so that the migration remains refactor-friendly.
27. As a maintainer, I want one small build or smoke-level proof for the host entrypoints, so that TypeScript conversion is verified beyond pure unit behavior.
28. As a maintainer, I want new Electron-side modules to avoid drifting back into plain untyped utility code, so that the migration has lasting value.
29. As a maintainer, I want contract ownership between main, preload, and renderer to be explicit, so that future changes have a clear place to start.
30. As a maintainer, I want this work to continue the architectural cleanup sequence after PRD-007, so that the remaining high-risk seam is reduced deliberately rather than opportunistically.

## Implementation Decisions

- The effort is architectural and behavior-preserving. It must not intentionally change user-visible tray behavior, startup behavior, setup flows, snapshot refresh semantics, update visibility, or auto-launch behavior.
- The Electron host layer should be treated as a first-class typed layer, not merely as a collection of JavaScript files that happen to work.
- The migration should cover the main entrypoint, preload entrypoint, and the focused host-side modules that currently sit behind them.
- The resulting host-layer structure should preserve the clearer responsibility cuts from PRD-007 rather than collapsing those modules back into a broad entrypoint.
- The TypeScript migration should prefer a conservative build evolution: explicit compiled main/preload outputs that remain straightforward for Electron and electron-builder to consume.
- The work may modernize how host entrypoints are produced and referenced, but it should avoid introducing a large new bundling architecture unless required.
- Shared contracts should become the source of truth for IPC channels, payloads, result wrappers, and renderer-facing preload APIs wherever practical.
- Main, preload, and renderer should continue to communicate through intentionally narrow APIs rather than exposing broader Electron internals.
- The preload layer should be expressed through a small typed bridge module that owns exposing the renderer-safe Electron API surface.
- The main bootstrap layer should remain composition-oriented and typed, with concrete platform or integration details delegated to smaller host-side modules.
- Host-side adapters such as tray, snapshot signaling, update integration, auto-launch integration, and IPC registration should expose small typed interfaces instead of loose object contracts.
- The solution should look for deep modules in the host layer, especially around bootstrap composition, preload API exposure, IPC registry composition, and packaging/build adaptation.
- The build boundary between source host modules and runtime Electron entrypoints should be explicit enough that a maintainer can understand where compiled artifacts come from and why.
- The migration should minimize ambient `any` usage and avoid broad type escapes that would erase most of the value of moving to TypeScript.
- Where Electron APIs are dynamic or awkwardly typed, local adapter types should absorb that complexity instead of leaking it through the rest of the host layer.
- The architecture should preserve the current renderer contract shape where possible so that the renderer does not need churn merely because the host layer became typed.
- If any host-layer module remains JavaScript for a transitional reason, that exception should be narrow, explicit, and temporary rather than becoming a second permanent standard.
- The effort should leave a clear path for future host-side modules to be added in TypeScript by default.

## Testing Decisions

- Good tests for this work assert externally meaningful contracts, compile/build outcomes, typed API behavior, and observable host-layer effects rather than implementation details or helper ordering.
- The primary test focus should be on typed IPC contracts, preload exposure boundaries, main bootstrap composition seams, and the most important host-layer adapters introduced by PRD-007.
- Shared contract tests should continue to validate payload and result shapes between main, preload, and renderer layers.
- Boundary tests should prove that renderer-safe preload APIs remain narrow and correctly wired to the main-process contracts.
- Main-process boundary tests should remain focused on observable outcomes such as emitted events, registered handlers, result payloads, and bootstrap integration rather than private fields.
- At least one small build or smoke-level verification should prove that the typed main/preload entrypoints compile into outputs Electron can start from.
- The migration should prefer replacing brittle runtime-only confidence with compile-time guarantees plus focused boundary tests, not with a new wave of broad integration tests.
- Prior art includes the existing app snapshot provider tests, IPC service contract tests, app snapshot contract tests, and the PRD-007 main-boundary tests.
- Testing should preserve the principle that contracts belong to stable seams; tests should not become coupled to incidental file layout or internal implementation choices created during the migration.

## Out of Scope

- Introducing new user-facing Electron features, tray items, setup screens, update UX, or startup flows.
- Reworking renderer UI architecture, routing, pages, or React component structure.
- Replacing Electron with another host technology.
- A broad rewrite of the app's overall build system unrelated to making the host layer typed and explicitly built.
- Product behavior changes to status management, daemon polling, source arbitration, or status-domain rules.
- General cleanup of unrelated JavaScript or TypeScript modules outside the Electron host boundary unless required by shared contract alignment.
- Expanding the preload API surface beyond what the renderer currently needs.
- A packaging redesign beyond the minimum changes needed to support a typed host-layer output cleanly.

## Further Notes

- This PRD should be treated as the natural follow-up to PRD-007. That work reduced structural complexity in the Electron main process; this work reduces the remaining type-safety gap at the same architectural seam.
- The highest-value outcome is not TypeScript syntax by itself, but stronger guarantees that host-layer contracts cannot silently drift.
- A successful outcome should leave the team with a typed Electron host layer, clearer ownership of shared IPC/preload contracts, a conservative and understandable build story for Electron entrypoints, and less reliance on runtime discovery of host-side mistakes.
