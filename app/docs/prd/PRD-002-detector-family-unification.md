# PRD: Detector-Familie vereinheitlichen

## Problem Statement

Die aktuellen Quellen fuer automatische Slack-Status-Aenderungen folgen bereits einer gemeinsamen fachlichen Idee, sind aber technisch noch zu uneinheitlich umgesetzt. Spotify, Apple Music und die Meeting-Quellen verhalten sich aus Produktsicht alle wie "Detektoren": Sie pruefen periodisch einen externen Zustand, entscheiden daraus, ob eine Quelle aktiv ist, und liefern bei Aktivitaet ein Status-Signal fuer die weitere Verarbeitung.

Heute ist diese gemeinsame Struktur aber noch nicht tief genug gekapselt. Ein Teil der Logik steckt pro Quelle direkt im jeweiligen Adapter, ein Teil in gruppierten Dateien, und ein Teil nur implizit in wiederholten Mustern. Dadurch ist die Codebasis schwerer zu erweitern und zu testen, als sie sein muesste. Wenn eine neue Quelle hinzukommt oder ein bestehender Detector angepasst werden soll, muss man mehrere leicht unterschiedliche Implementierungsstile verstehen, statt auf einer klaren, wiederverwendbaren Detector-Architektur aufzubauen.

Aus Team-Sicht fuehrt das zu vermeidbarer Reibung:

- gemeinsame Verhaltensmuster sind nicht als gemeinsame Module sichtbar
- Tests pruefen vielfach nur Oberflaechenstruktur statt stabile Boundary-Verhalten
- plattform- und prozessspezifische Abfragen sind zu nah an den fachlichen Source-Adaptern
- die Grenze zwischen "Source-Definition", "Detection-Mechanik" und "Status-Ableitung" ist nicht klar genug

Das Kernproblem ist also nicht fehlende Funktionalitaet, sondern eine noch zu flache Detector-Familie. Die Implementierung verbirgt die eigentliche gemeinsame Komplexitaet noch nicht hinter einer kleinen, gut testbaren Schnittstelle.

## Solution

Die Source-Detection soll als klarere Modulfamilie vertieft werden. Das Ziel ist eine gemeinsame Detector-Architektur, in der wiederkehrende Muster fuer Musik- und Meeting-Quellen in tieferen Modulen gekapselt werden, waehrend quellspezifische Unterschiede ueber kleine, deklarative Definitionen oder schmale Strategien eingebracht werden.

Aus Nutzersicht soll sich dabei kein Verhalten aendern. Spotify, Apple Music, Zoom, Microsoft Teams und Slack Huddle sollen weiterhin dieselben Status-Signale liefern, dieselben Enable/Disable-Schalter respektieren und sich weiterhin sauber in Registry, Priorisierung und Daemon integrieren.

Die wesentliche Aenderung ist intern:

- Musikquellen sollen nicht mehr jeweils ihre komplette Polling- und Ableitungslogik selbst tragen, sondern auf einem gemeinsamen Musik-Detector-Modell aufbauen.
- Meeting-Quellen sollen nicht nur zufaellig aehnlich aussehen, sondern ueber eine gemeinsame Meeting-Detector-Abstraktion beschrieben werden.
- Prozess-/Shell-/AppleScript-Zugriffe sollen hinter kleineren technischen Ports oder Probe-Modulen liegen statt direkt in jedem Adapter verstreut zu sein.
- Die oeffentliche Registry-Sicht soll moeglichst klein bleiben: Eine Source liefert Status, Availability und Enabled-State; die interne Detection-Komplexitaet wird darunter verborgen.

Die Architektur soll dabei bewusst nicht auf "eine abstrakte Basisklasse fuer alles" reduziert werden, sondern auf tiefe, testbare Module mit klarer Verantwortung. Die Standardfaelle fuer Musik- und Meeting-Erkennung sollen trivial werden, waehrend Spezialfaelle gezielt erweiterbar bleiben.

## User Stories

1. As a product manager, I want detector behavior to stay unchanged for end users, so that architecture work does not create regressions.
2. As a product manager, I want new source integrations to be cheaper to add, so that the app can evolve without repeated detector rewrites.
3. As a product manager, I want detector behavior to be easier for the team to understand, so that maintenance work is less risky.
4. As a product manager, I want architecture work to reduce implementation variance, so that future refactors do not multiply patterns.
5. As a developer, I want music sources to share a common detection model, so that Spotify and Apple Music do not duplicate the same workflow.
6. As a developer, I want meeting sources to share a common detection model, so that Zoom, Teams, and Huddle behave consistently.
7. As a developer, I want source-specific adapters to become thinner, so that their code mostly describes source differences rather than control flow.
8. As a developer, I want process and shell probing to be isolated behind small technical modules, so that source logic is easier to read.
9. As a developer, I want track extraction and activity detection to be modeled explicitly, so that music-source behavior is easier to test.
10. As a developer, I want meeting detection rules to be represented intentionally, so that regex or command changes do not require touching unrelated logic.
11. As a developer, I want a clear separation between source metadata and detection execution, so that the role of each module is easier to explain.
12. As a developer, I want detector modules to hide platform-specific details internally, so that callers interact with a stable interface.
13. As a developer, I want common inactive-state behavior to be standardized, so that sources fail and recover consistently.
14. As a developer, I want enabled and availability checks to remain predictable across all detectors, so that registry behavior stays coherent.
15. As a developer, I want the most common source implementation path to be small and declarative, so that adding a new detector is mostly configuration and a few source-specific probes.
16. As a developer, I want source registry integration to remain simple, so that detector deepening does not leak complexity outward.
17. As a developer, I want daemon polling to continue consuming a stable source-status shape, so that this refactor stays localized.
18. As a developer, I want detector tests to verify observable statuses rather than private helper methods, so that refactors remain safe.
19. As a developer, I want family-level tests for music and meeting detectors, so that shared behavior is protected in one place.
20. As a developer, I want source-specific tests to focus on source-specific behavior, so that duplicated generic tests can be reduced.
21. As a developer, I want platform support decisions to be expressed consistently, so that source availability rules are easy to audit.
22. As a developer, I want error handling and fallback-to-inactive behavior to be standardized, so that broken probes do not create source-specific surprises.
23. As a developer, I want message formatting responsibilities to be explicit, so that title/message derivation is not scattered.
24. As a developer, I want the detector design to support future sources that behave like music or meeting families, so that the architecture scales naturally.
25. As a developer, I want to avoid a large inheritance tree, so that commonality is captured through deep modules rather than fragile class hierarchies.
26. As a developer, I want polling-side code to stop caring how a detector gathers its evidence, so that source execution remains swappable.
27. As a developer, I want source adapters to be composed from smaller responsibilities, so that technical probes can be tested without daemon involvement.
28. As a developer, I want inactive, unavailable, and active-with-message outcomes to be modeled consistently, so that downstream logic can rely on stable semantics.
29. As a developer, I want detector internals to be easier for AI tools to navigate, so that future automated code work encounters less friction.
30. As a developer, I want common truncation, normalization, and fallback decisions to live in shared modules when appropriate, so that behavior does not drift between sources.
31. As a developer, I want meeting detectors to define only their identifying probe rules and output copy, so that the common shell/parsing pattern is not rewritten for each source.
32. As a developer, I want music detectors to define only app-specific commands and track formatting differences, so that their overall lifecycle is standardized.
33. As a developer, I want tests to cover shared detector boundaries before source-level details, so that the architecture is protected where reuse is concentrated.
34. As a product manager, I want this refactor to remain incremental, so that we can keep shipping safely while deepening the detector family.
35. As a product manager, I want the resulting detector model to clarify ownership, so that future work on sources, polling, and status application starts from a cleaner base.

## Implementation Decisions

- The detector family will be reorganized around deeper internal modules for source detection rather than leaving full workflows embedded in each concrete adapter.
- The public source boundary should remain small and compatible with existing registry and arbitration consumers.
- Music detection should be represented as a shared family with common lifecycle steps such as availability checking, activity probing, track lookup, normalization, and inactive fallback.
- Meeting detection should be represented as a shared family with common lifecycle steps such as probe execution, rule evaluation, standardized active/inactive mapping, and source-specific copy.
- Platform-specific command execution should be isolated behind smaller technical ports, probes, or services rather than repeated directly across concrete detectors.
- Concrete source definitions should become thinner and primarily describe source-specific facts such as display identity, supported platforms, probe strategy, and message formatting rules.
- The design should prefer composition and declarative source definitions over a brittle inheritance hierarchy.
- Shared detector modules should own consistent inactive-state behavior, defensive error handling, and normalization rules.
- Source enablement and availability semantics must remain stable from the perspective of the source registry and daemon.
- The refactor should preserve the current source status shape used by source registry, arbitration, and daemon code paths.
- Source-specific output text and emoji behavior should remain unchanged unless a deliberate regression fix is separately approved.
- The architecture should allow future sources to join an existing detector family without copying an entire adapter implementation.
- Migration should proceed incrementally: establish shared detector modules, move one family at a time, keep registry integration stable, then simplify redundant source-specific code.
- The target module split should follow these responsibilities:
- A source-definition layer that describes source identity, supported platform rules, emoji/message defaults, and the family-specific strategy a source uses.
- A music-detector module that owns the shared "running/app available -> currently active -> extract track/message -> normalize -> emit source status" lifecycle.
- A meeting-detector module that owns the shared "run probe -> evaluate match -> map to active/inactive source status" lifecycle.
- A probe layer that hides shell, process, AppleScript, or lsof execution details behind narrow technical operations.
- A normalization layer for shared string shaping such as truncation and inactive fallback semantics where common behavior is intended.
- Thin adapter entry points that remain compatible with the existing source registry interface while delegating almost all behavior to deeper modules.
- The preferred migration order should be:
- First, extract family-level probe and normalization seams without changing outward registry behavior.
- Second, move Spotify and Apple Music onto a shared music-detector path and stabilize family-level tests there.
- Third, move Zoom, Teams, and Huddle onto a shared meeting-detector path and stabilize family-level tests there.
- Fourth, simplify or delete source-specific duplicate logic that is now covered by deep modules.
- Fifth, tighten source-level tests so they focus on true source differences instead of repeated structural assertions.
- The design should explicitly preserve the current `ISourceAdapter`-style boundary for this refactor, even if deeper internals are reorganized substantially.
- The design should assume two dominant detector families for now, while leaving room for a future source to either join an existing family or define a new one without disturbing registry and daemon code.

## Testing Decisions

- Good tests should verify observable detector outcomes at module boundaries rather than private helper calls or exact internal command composition unless the command shape is itself the behavior under test.
- Shared detector modules should receive focused behavior tests that cover active detection, inactive fallback, unsupported-platform behavior, probe failure handling, and output normalization.
- Music-family tests should verify common lifecycle behavior once, then leave source-specific tests to validate only source-specific differences such as app names, probe responses, or formatting rules.
- Meeting-family tests should verify common probing and active/inactive mapping once, then leave source-specific tests to validate only the identifying rules and source copy.
- Source registry tests should continue to assert that enabled-state handling and aggregated source-status retrieval behave correctly with the deepened detector implementation behind them.
- Existing daemon and source tests provide prior art for behavior-oriented assertions; the new tests should continue that style but shift more confidence to shared detector boundaries.
- Tests should prioritize confidence in boundary behavior over minimizing test count, because this refactor mainly changes ownership and structure rather than visible product features.
- The refactor should reduce duplicated "basic structure" tests where deeper module tests can protect the same behavior more meaningfully.

## Out of Scope

- Changing source priority behavior
- Changing daemon polling policy or arbitration rules
- Redesigning the renderer or IPC model
- Introducing new user-facing source controls
- Adding brand-new source integrations in this PRD
- Revisiting status-manager business rules unrelated to detector structure
- Large-scale persistence or config redesign
- Packaging, updater, or installer changes
- Legacy shell-script cleanup outside what is necessary to preserve detector parity

## Further Notes

- This PRD treats detector unification as the next major deep-module opportunity after the source-registry and prioritization work.
- The main success criterion is not fewer files, but clearer ownership and stronger family-level boundaries.
- A successful outcome would make it obvious where to implement a new music-like source, where to implement a new meeting-like source, and where to test each concern.
- The likely review question during implementation will not be "did we abstract enough," but "did we move enough repeated lifecycle logic behind modules that callers no longer need to understand."
- This draft assumes current end-user behavior should be preserved and that the work is primarily architectural.
