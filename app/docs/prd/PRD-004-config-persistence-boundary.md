# PRD: Config-/Persistenzschnitt weiter schaerfen

## Problem Statement

Die App hat bei Ownership und Laufzeitmodell bereits Fortschritte gemacht, aber der Schnitt zwischen Runtime-Zustand und Persistenz ist noch nicht sauber genug getrennt. Konfigurationsdaten werden heute an mehreren Stellen gelesen, geschrieben, interpretiert und mit Laufzeitverhalten vermischt.

Besonders sichtbar ist das in zwei Bereichen:

- Der Electron Main Process verwaltet eine eigene Konfigurationssicht fuer Tokens, First-Run-Status und einzelne UI-relevante Flags.
- Der Daemon laedt und speichert ebenfalls Konfiguration direkt, insbesondere fuer Source-Enabled-State, Source-Reihenfolge sowie Status-Konfiguration und overridable patterns.

Dadurch ist nicht immer klar, welches Modul fachlich Owner eines bestimmten Stuecks Zustand ist und welches Modul lediglich Persistenz vermittelt. Konfigurationsdateien dienen teilweise gleichzeitig als:

- Persistenzformat
- Runtime-Initialisierung
- implizites Domänenmodell
- Synchronisationsmechanismus zwischen Main Process und Daemon

Diese Mehrfachrolle erzeugt vermeidbare Reibung:

- Runtime-Logik kennt Details des Speicherformats
- Persistenzentscheidungen schlagen direkt in Daemon- und Main-Process-Verhalten durch
- unterschiedliche Konfigurationsbereiche leben in unterschiedlichen Modulen mit leicht anderer Logik
- das Testen von Runtime-Verhalten und das Testen von Persistenzverhalten sind nicht klar genug getrennt
- kuenftige Aenderungen an Konfigurationsstruktur oder Speicherort riskieren breitere Auswirkungen als noetig

Das Kernproblem ist also nicht, dass Konfiguration nicht funktioniert, sondern dass Persistenz und Runtime-Modell noch zu eng gekoppelt sind. Die App hat noch keinen tiefen, klaren Boundary-Schnitt zwischen "welcher Zustand gilt zur Laufzeit" und "wie wird dieser Zustand gespeichert und wiederhergestellt".

## Solution

Die App soll einen schaerferen Config-/Persistenzschnitt erhalten. Das Ziel ist, dass Runtime-Module mit einem klaren, absichtsvoll modellierten Konfigurationszustand arbeiten, waehrend Persistenzmodule fuer Laden, Speichern, Defaulting und Formatkompatibilitaet verantwortlich sind.

Aus Nutzersicht soll sich das Verhalten nicht aendern. Einstellungen, Status-Konfigurationen, Source-Schalter, Source-Reihenfolge, Tokens und Setup-relevante Informationen sollen weiterhin erhalten bleiben und nach Neustarts korrekt wiederhergestellt werden. Die Veraenderung ist primaer architektonisch:

- Persistenz soll als eigener Boundary-Bereich sichtbar werden statt als Nebenwirkung innerhalb von Runtime-Modulen.
- Runtime-Module sollen mit stabileren, in-memory orientierten Modellen arbeiten, nicht direkt mit dem Speicherformat.
- Main Process und Daemon sollen expliziter festlegen, welcher Teil des Zustands wo lebt und wer ihn owns.
- Das Dateiformat darf weiterhin JSON bleiben, soll aber nicht mehr als implizite Runtime-API behandelt werden.

Das Zielbild ist:

- ein intentionales Konfigurations-/Persistenzmodell
- klare Trennung zwischen persisted state und runtime state
- ein oder wenige Module, die das Speicherformat kennen
- Runtime-Services, die Konfigurationswerte konsumieren oder mutieren, ohne selbst Save-/Load-Owner zu sein
- eine explizite Geschichte fuer Defaults, Migration und Fehlerbehandlung bei kaputten oder teilweisen Konfigurationsdateien

Wichtig ist dabei: Diese Arbeit soll die Ownership schaerfen, nicht die Menge an Features vergroessern.

## User Stories

1. As a product manager, I want configuration behavior to stay stable for users, so that architecture work does not create setup regressions.
2. As a product manager, I want ownership of persisted data to be easier to explain, so that future changes are less risky.
3. As a product manager, I want configuration-related bugs to become more localized, so that fixes are cheaper.
4. As a developer, I want runtime modules to stop owning file IO details directly, so that business logic is easier to reason about.
5. As a developer, I want persisted config and in-memory runtime state to be modeled separately, so that their responsibilities are clearer.
6. As a developer, I want the daemon to consume configuration through a narrower boundary, so that save/load details do not leak into polling and status logic.
7. As a developer, I want the main process to consume persisted app settings through a narrower boundary, so that Electron orchestration does not double as config storage logic.
8. As a developer, I want a clear owner for Slack tokens, so that credential persistence is not implicitly coupled to unrelated daemon config paths.
9. As a developer, I want a clear owner for source-enabled state and source order persistence, so that runtime source logic and storage shape are not mixed together.
10. As a developer, I want a clear owner for custom status configuration and overridable patterns, so that status behavior can evolve without rewriting persistence code everywhere.
11. As a developer, I want defaults to be applied intentionally by a config boundary, so that runtime modules do not each invent their own fallback behavior.
12. As a developer, I want corrupted or partial config files to be handled consistently, so that recovery behavior is predictable.
13. As a developer, I want persistence tests to focus on serialization, defaults, and recovery, so that runtime tests can stay focused on behavior.
14. As a developer, I want runtime tests to avoid depending on file system behavior where possible, so that they stay smaller and faster.
15. As a developer, I want the JSON file format to remain an implementation detail rather than a domain contract, so that future format changes are cheaper.
16. As a developer, I want configuration writes to happen through a smaller set of well-defined paths, so that save triggers are easier to audit.
17. As a developer, I want configuration reads to be centralized, so that load-time semantics are consistent.
18. As a developer, I want migrations or schema evolution to have an obvious home, so that new config fields do not create ad hoc compatibility code.
19. As a developer, I want first-run and setup flags to have a clearly documented relationship to persisted state, so that app boot behavior is easier to follow.
20. As a developer, I want app snapshot and runtime UI state to consume persisted settings through intentional models, so that persistence concerns do not leak into renderer-facing code.
21. As a developer, I want a distinction between durable configuration and ephemeral runtime state, so that temporary process state is not accidentally persisted.
22. As a developer, I want save operations to preserve unrelated persisted fields only through intentional merge rules, so that accidental coupling through raw object spreading is reduced.
23. As a developer, I want file-path and platform-specific storage details to live in one place, so that storage location changes are easier.
24. As a developer, I want configuration-related code to become easier for AI tools to navigate, so that future automated edits encounter fewer ambiguous seams.
25. As a developer, I want the daemon constructor to depend less directly on config-file semantics, so that daemon setup is more testable.
26. As a developer, I want the main process and daemon to stop acting like competing config owners, so that ownership becomes explicit.
27. As a developer, I want tests for config corruption, missing files, partial data, and defaulting to live at the persistence boundary, so that resilience is protected in one place.
28. As a developer, I want runtime models to be deserialized once and then passed around intentionally, so that business logic stops reinterpreting raw config shape.
29. As a product manager, I want future config-related features to land with less architectural friction, so that the app stays easier to evolve.
30. As a developer, I want persistence refactors to be incremental, so that we do not need to rewrite daemon and main-process logic all at once.
31. As a developer, I want settings UI actions to relate to persisted state through a clear service boundary, so that IPC handlers are thinner.
32. As a developer, I want test fixtures for configuration to be simpler and more stable, so that repo-wide tests are easier to maintain.
33. As a developer, I want the design to make room for future schema versioning if needed, so that today’s JSON shape does not become a long-term trap.
34. As a product manager, I want this work to improve clarity of ownership rather than add hidden complexity, so that the payoff is real.
35. As a developer, I want the final design to deepen the persistence module instead of spreading save/load helpers across many files, so that the architecture gains a true deep module.

## Implementation Decisions

- Persisted configuration and runtime state should be modeled as related but distinct concepts.
- The JSON storage format may remain the on-disk representation, but runtime modules should not depend on its raw shape more than necessary.
- Persistence responsibilities should be concentrated in one or a small number of modules that own loading, saving, defaulting, compatibility handling, and recovery from partial or corrupted files.
- The daemon should consume a clearer persisted-settings boundary instead of directly owning file read/write behavior for multiple config concerns.
- The main process should likewise consume a clearer persisted-settings boundary for app-level config concerns such as tokens and setup-related flags.
- Ownership of individual persisted concerns should become explicit, especially for tokens, source settings, source order, custom statuses, overridable patterns, and first-run/setup flags.
- Merge behavior when saving persisted config should be intentional and field-aware rather than relying on broad object spreading where possible.
- Default values should be applied by the persistence boundary or a closely related configuration model layer, not scattered across unrelated runtime modules.
- Corruption handling, missing-file behavior, and partial-config recovery should be consistent and should live at the persistence boundary.
- The refactor should favor deep modules: a small interface for reading and writing intentional config models while hiding storage paths, JSON parsing, serialization, compatibility logic, and fallback behavior.
- The design should preserve current user-visible behavior and existing persisted information unless a separate migration decision is explicitly made.
- Migration should be incremental: establish a clearer persistence owner first, then route daemon and main-process config access through it, then simplify duplicated or legacy save/load logic.

## Testing Decisions

- Good tests should verify external persistence behavior such as correct load results, save results, defaults, and corruption recovery rather than internal helper structure.
- Persistence-boundary tests should cover missing files, corrupted files, partial files, default application, and round-trip serialization of supported config concerns.
- Runtime tests for daemon, main process, and status logic should shift away from asserting raw file behavior where a configuration boundary can be stubbed instead.
- Tests should clearly distinguish between "persistence works correctly" and "runtime behavior consumes configuration correctly".
- Existing daemon config tests provide useful prior art and should be evolved so that more resilience checks move toward the persistence boundary while daemon tests focus on behavior.
- Main-process config tests should cover token/setup persistence through the new ownership boundary rather than through scattered file-system assumptions.
- Tests should prioritize behavior at module boundaries over implementation details such as exact file read order or exact helper decomposition.
- Regression confidence should take priority over minimizing test count, because persistence and recovery bugs are costly even when the refactor is mostly architectural.

## Out of Scope

- New end-user features
- UI redesign
- Reworking source arbitration or detector-family architecture beyond what persistence separation requires
- Rewriting the entire IPC/app snapshot boundary as part of this PRD
- Changing the on-disk format away from JSON unless a later migration explicitly requires it
- Security redesign of token storage beyond clarifying current ownership boundaries
- Packaging, installer, or updater changes
- Legacy shell-script cleanup unrelated to config persistence

## Further Notes

- This PRD is intentionally lower priority than the detector-family and IPC/app-snapshot work because the current pain appears more structural than immediately blocking.
- Even so, the current code shows real coupling between main-process config handling, daemon config handling, and raw file shape, so the opportunity is meaningful.
- The key success criterion is that future contributors can answer two questions quickly: "what is the runtime model?" and "where is it persisted?" without reading multiple save/load implementations.
- The main architectural risk is over-engineering a persistence framework. The goal should be a deeper and clearer boundary, not a large abstraction stack.
