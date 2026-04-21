## Problem Statement

Die Laufzeit-Orchestrierung der App ist aktuell schwer isoliert zu verstehen, zu testen und weiterzuentwickeln. Der Daemon verantwortet nicht nur Lifecycle und Zusammensetzen der Abhängigkeiten, sondern auch Polling, Interpretation von Source-Aenderungen, Cooldowns, Reset-Verhalten, DND-Synchronisation und Reaktionen auf Repriorisierung. Dadurch ist die zentrale Laufzeitlogik breit, die relevanten Verhaltenspfade sind ueber viele Methoden verteilt, und Tests muessen vergleichsweise viel Setup und Mocking betreiben, um einzelne Szenarien abzudecken.

Aus Produktsicht entsteht kein unmittelbarer Funktionsfehler, aber die Architektur erschwert sichere Weiterentwicklung. Kleine Anpassungen an der Source-Orchestrierung, an Polling-Folgen oder an Runtime-Entscheidungen haben eine unnoetig grosse Aenderungsflaeche. Das Team will die Laufzeitlogik in eine tiefere, testbarere Boundary ueberfuehren, ohne das fachliche Verhalten der App zu aendern.

## Solution

Die App bekommt eine dedizierte Runtime-Orchestrierungsschicht fuer die Beobachtung von Sources und die Ableitung von Laufzeitaktionen. Der Daemon soll kuenftig vor allem Lifecycle, Scheduling und Dependency-Wiring verantworten. Die eigentliche Frage, was bei Aktivierung, Deaktivierung, Nachrichtenwechsel, Meeting-Ende, Reset-Blockaden und Repriorisierung passieren soll, wird hinter einer kleineren, stabileren Schnittstelle gebuendelt.

Die neue Loesung ist ausdruecklich verhaltensneutral. Sie soll das bestehende Verhalten der Status-Aktualisierung, DND-Steuerung, Reset-Logik und Prioritaetsbehandlung bewahren, aber die Verantwortung dafuer aus der breiten Daemon-Klasse herausziehen. Ziel ist eine tiefere Runtime-Boundary, an der szenariobasierte Tests gegen beobachtbares Verhalten geschrieben werden koennen, statt die Ablaufdetails des Daemons indirekt mitzuprobieren.

## User Stories

1. As a maintainer, I want the daemon to focus on lifecycle and wiring, so that the runtime decision logic is easier to locate.
2. As a maintainer, I want source activation handling to live behind a dedicated orchestration interface, so that I can change runtime flow without rewriting daemon internals.
3. As a maintainer, I want source deactivation handling to be modeled explicitly, so that switching and resetting behavior is easier to reason about.
4. As a maintainer, I want message-changed scenarios to be handled through the same orchestration boundary as activation, so that there is one place for runtime transition logic.
5. As a maintainer, I want meeting-specific DND behavior to be coordinated inside a runtime module, so that meeting rules are not scattered across daemon helpers.
6. As a maintainer, I want reprioritization behavior to reuse the same orchestration concepts as polling, so that source-order changes do not need a separate flow style.
7. As a maintainer, I want cooldown rules to be applied consistently from one orchestration layer, so that rate-limiting behavior does not drift across code paths.
8. As a maintainer, I want blocked reset behavior to be represented as a first-class runtime outcome, so that retry behavior is easier to test.
9. As a maintainer, I want the orchestration boundary to operate on source snapshots and status side effects, so that it stays independent from Electron transport details.
10. As a maintainer, I want the daemon to delegate runtime decisions instead of computing them inline, so that the daemon class shrinks in responsibility.
11. As a maintainer, I want to add or adjust source-related scenarios with focused tests, so that new behavior does not require broad daemon integration mocks.
12. As a maintainer, I want the new boundary to preserve the current user-visible behavior, so that the refactor can ship with low regression risk.
13. As a maintainer, I want runtime scenario tests to assert external effects rather than private state, so that the tests survive internal refactors.
14. As a maintainer, I want source switching between active integrations to remain deterministic, so that priority order stays trustworthy.
15. As a maintainer, I want status application decisions to remain compatible with the existing status management rules, so that this refactor does not reopen status-domain debates.
16. As a maintainer, I want the runtime orchestration module to consume current source status snapshots, so that it is easy to simulate polling outcomes in tests.
17. As a maintainer, I want the runtime orchestration module to expose clear action outcomes, so that callers can respond without understanding its internal branches.
18. As a maintainer, I want source polling and source reprioritization to share one mental model, so that runtime behavior is easier to explain to future contributors.
19. As a maintainer, I want meeting-end behavior with overlapping meetings to be captured explicitly, so that DND transitions remain safe.
20. As a maintainer, I want no changes to source detection implementations in this effort, so that the refactor remains focused and reviewable.
21. As a maintainer, I want no changes to status business rules in this effort, so that architectural work does not quietly introduce product decisions.
22. As a maintainer, I want the runtime boundary to be usable with local test doubles, so that the test suite stays fast and deterministic.
23. As a maintainer, I want the runtime module to make transition handling readable from a small public interface, so that onboarding into the polling flow gets easier.
24. As a maintainer, I want the daemon to remain the composition root for app startup, so that wiring still has a clear home.
25. As a maintainer, I want runtime events to continue driving app-state updates, so that renderer-facing behavior remains unchanged.
26. As a maintainer, I want this refactor to reduce the amount of branch-by-branch reasoning required in daemon reviews, so that maintenance cost goes down.
27. As a maintainer, I want this work documented as an architectural cut, so that future refactors can build on the same boundary.

## Implementation Decisions

- The effort targets only the Electron/TypeScript app runtime and explicitly excludes the legacy shell implementation.
- The primary goal is architectural: move runtime orchestration behavior behind a deeper module while preserving user-visible behavior.
- The daemon remains the composition root and lifecycle owner, but no longer owns the detailed transition logic for source-driven runtime behavior.
- A dedicated runtime orchestration module will encapsulate handling of source activation, deactivation, winner switching, message changes, reset attempts, reset cooldowns, profile update cooldowns, meeting DND follow-up, and reprioritization outcomes.
- The new orchestration boundary should present a small interface oriented around runtime scenarios and observable actions, rather than exposing internal branching structure.
- Existing status-domain rules remain owned by the current status-management layer; this refactor does not redefine protection logic, reset policy semantics, or manual action rules.
- Existing source detection and arbitration concepts remain in place; the new module coordinates them rather than replacing source adapters or detectors.
- Runtime decisions should be expressed in terms of externally meaningful actions and effects, not in terms of daemon-private helper calls.
- The orchestration boundary should depend on local-substitutable collaborators so that it can be tested with deterministic doubles rather than real timers or real Slack/network behavior.
- Scheduling remains outside the deep module. Poll interval triggering and daemon start/stop semantics stay with the daemon-level lifecycle.
- App-state notifications to the renderer remain behaviorally unchanged; the refactor may alter where they are emitted from internally, but not their externally observable meaning.
- Reprioritization must reuse the same orchestration model as polling-driven updates, so the system has one concept of how source competition is resolved.
- Cooldown state should be owned in one place within the orchestration layer so that rate limiting and blocked-reset retries are not split across multiple helpers.
- The resulting architecture should make it straightforward to add future runtime scenarios without expanding the daemon back into a broad decision hub.

## Testing Decisions

- Good tests for this refactor assert observable runtime behavior at the orchestration boundary, not private flags, helper ordering, or implementation-specific branching.
- The primary test target is the new runtime orchestration module, exercised through scenario-based inputs and asserted through emitted actions or invoked collaborators.
- Key scenarios to cover include winning source activation, winning source message change, winning source deactivation with fallback winner, deactivation with no fallback winner, meeting end while another meeting remains active, meeting end with no remaining meetings, reset blocked cooldown, profile-set cooldown, and reprioritization.
- The daemon should retain a smaller number of higher-level tests proving lifecycle wiring and delegation, rather than owning the full scenario matrix.
- Existing prior art includes daemon-focused tests and source arbitration tests in the current app test suite; these should inform style and fixtures, but the new tests should move closer to the new boundary and further from class internals.
- Tests should use local doubles for Slack execution, status management, source snapshots, and time-sensitive collaborators so they remain fast and deterministic.
- Where old tests cover behavior that becomes redundant once the new boundary is tested directly, they should be simplified or removed rather than layered indefinitely.

## Out of Scope

- Changing status-domain rules, including protected-status semantics, holiday behavior, correction rules, or manual action semantics.
- Refactoring the renderer IPC layer, snapshot contracts, or app snapshot provider.
- Refactoring the configuration persistence layer.
- Changing source detection implementations, detectors, adapters, or probe technologies.
- Adding new source types, new UI behavior, or new user-facing settings.
- Changing polling frequencies or other product behavior unless required to preserve the existing semantics during refactoring.
- Any work on the legacy shell scripts.

## Further Notes

- This PRD intentionally frames the work as a refactor with preserved behavior, not as a feature project.
- The success condition is primarily architectural: a smaller daemon, a deeper runtime boundary, and tests that describe runtime scenarios directly.
- If implementation reveals hidden behavior coupling that prevents a clean, behavior-neutral extraction, that should be surfaced explicitly as a follow-up decision rather than silently broadened within this scope.
