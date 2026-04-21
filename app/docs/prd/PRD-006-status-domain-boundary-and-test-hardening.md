## Problem Statement

Die verbleibende technische Komplexitaet der App sitzt inzwischen vor allem in der Status-Domaene. Zwar wurde die Runtime-Orchestrierung bereits besser gekapselt, aber die eigentliche Status-Logik ist weiterhin ueber wenige breite Module, implizite Regeln, gemischte Verantwortlichkeiten und intern gekoppelte Tests verteilt. Dadurch bleibt ein relevanter Teil des Release- und Bug-Risikos bestehen.

Aus Produkt- und Delivery-Sicht zeigt sich das nicht primaer als fehlendes Feature, sondern als erhoehte Unsicherheit bei Aenderungen. Status-bezogene Anpassungen, Bugfixes und angrenzende Refactors muessen weiterhin durch dichte Entscheidungsbaeume, harte Sonderfaelle und breit aufgestellte Testdateien navigieren. Das erschwert verlaessliche Schaetzungen, erhoeht Review-Aufwand und macht es wahrscheinlicher, dass kleine Aenderungen Seiteneffekte in manuellen Status, Tagesstatus, Reset-Verhalten, Korrekturlogik oder Renderer-Synchronisation ausloesen.

Zusaetzlich gibt es angrenzende technische Schulden an den Grenzen der Status-Domaene: nicht durchgaengig saubere Typgrenzen zwischen Daemon, Renderer und IPC, sowie uneinheitliches Logging-Verhalten zwischen Core- und UI-Pfaden. Diese Themen muessen nicht als eigenstaendige Projekte behandelt werden, sollten in diesem Schnitt aber soweit aufgeraeumt werden, dass statusbezogene Releases stabiler und nachvollziehbarer werden.

## Solution

Die App bekommt einen tieferen, klarer geschnittenen Status-Domain-Bereich. Die bestehende Status-Logik wird in kleinere, testbarere Module mit klaren Verantwortlichkeiten zerlegt. Der bisher breite Status-Manager soll kuenftig eher orchestrieren und verdrahten, waehrend konkrete Entscheidungen fuer Statusschutz, Tagesstatus, manuelle Statusaktionen, Statuskorrektur und zustandsbezogene Ableitungen hinter stabileren Domaenen-Schnittstellen liegen.

Der Schnitt ist ausdruecklich verhaltensneutral. Ziel ist nicht, neue Statusregeln einzufuehren, sondern die bestehenden Regeln so zu kapseln, dass sie leichter zu verstehen, gezielter zu testen und sicherer zu aendern sind. Der Refactor soll ausserdem die angrenzenden Renderer-/IPC-Typgrenzen im Statusumfeld schaerfen und Logging-Pfade konsistenter machen, damit Releases besser beobachtbar und Fehler leichter zu diagnostizieren sind.

Der Erfolg dieses PRDs wird nicht daran gemessen, ob Nutzer eine neue Funktion sehen, sondern daran, ob statusbezogene Aenderungen mit geringerem Regressionsrisiko, klareren Modulen und schlankeren, verhaltensorientierten Tests umgesetzt werden koennen.

## User Stories

1. As a maintainer, I want the status domain to be split into smaller modules, so that status-related bugs are easier to isolate.
2. As a maintainer, I want the broad status manager responsibilities reduced, so that a single class no longer carries most status behavior risk.
3. As a maintainer, I want status protection rules to live behind a focused policy boundary, so that protected-status behavior is easier to reason about.
4. As a maintainer, I want day-based default status selection to be encapsulated behind a dedicated module, so that reset behavior is easier to review.
5. As a maintainer, I want manual status actions to be modeled separately from automatic source-driven behavior, so that user actions and observed actions are not mixed together.
6. As a maintainer, I want correction-cycle decision making to be isolated, so that auto-correction changes do not require understanding unrelated status paths.
7. As a maintainer, I want status state transitions to be represented explicitly, so that state synchronization is less dependent on implicit side effects.
8. As a maintainer, I want the status domain to expose stable, testable interfaces, so that internal refactors do not force broad test rewrites.
9. As a maintainer, I want observable behavior tests to sit closer to the status domain boundaries, so that regressions are caught with less fixture complexity.
10. As a maintainer, I want fewer tests to reach through private daemon and status internals, so that the test suite reflects real contracts instead of implementation details.
11. As a maintainer, I want status-related modules to use local doubles cleanly, so that tests remain fast and deterministic.
12. As a maintainer, I want status reset behavior to remain functionally unchanged, so that this refactor does not create user-visible surprises.
13. As a maintainer, I want protected-status semantics to remain unchanged, so that architectural cleanup does not silently redefine business rules.
14. As a maintainer, I want holiday and expiration behavior to remain compatible with current expectations, so that time-based statuses do not regress.
15. As a maintainer, I want manual away, holiday, online, and custom status actions to continue working through stable domain contracts, so that UI actions stay trustworthy.
16. As a maintainer, I want source-driven status application to remain compatible with the current runtime orchestration, so that the recent runtime boundary work remains intact.
17. As a maintainer, I want shared state such as active-source markers and protected-status markers to have a clear ownership model, so that subtle race and sync issues are easier to avoid.
18. As a maintainer, I want the status domain to reduce hidden randomness or implicit branching where possible, so that behavior is easier to explain and verify.
19. As a maintainer, I want the logic that decides whether a status may be changed to be readable in one place, so that overrides and exceptions are easier to audit.
20. As a maintainer, I want renderer-facing status payloads to use stronger shared typing, so that UI and main-process code cannot drift silently.
21. As a maintainer, I want daemon-to-renderer status change notifications to use explicit contracts instead of ad hoc payloads, so that status refresh behavior is safer to evolve.
22. As a maintainer, I want IPC helpers around status and snapshot flows to remain small and consistently typed, so that renderer code does not need defensive guesswork.
23. As a maintainer, I want status-related logging to be consistent across domain, daemon, and renderer edges, so that production diagnosis is easier.
24. As a maintainer, I want status-related errors to be logged through a predictable approach, so that operational debugging does not depend on scattered console output.
25. As a maintainer, I want large daemon- and status-centered tests to be slimmed down when new boundary tests make them redundant, so that the suite remains maintainable.
26. As a maintainer, I want the refactor to preserve current UI behavior, so that architecture work ships with low user-facing risk.
27. As a maintainer, I want the status domain to keep the existing configuration model, so that this effort stays focused on architecture rather than new settings.
28. As a maintainer, I want clearer seams between domain rules and side effects, so that Slack API execution can be changed without rewriting status policies.
29. As a maintainer, I want clear module responsibilities for cached profile reads, state mutation, and status execution, so that failure modes are easier to diagnose.
30. As a maintainer, I want future PM requests in the status area to be estimated with higher confidence, so that roadmap planning is less exposed to hidden complexity.
31. As a maintainer, I want the refactor to explicitly target release-risk reduction, so that engineering investment aligns with delivery reliability.
32. As a maintainer, I want the status-domain architecture documented as a follow-up cut after the runtime refactor, so that future contributors understand the intended direction.

## Implementation Decisions

- The effort is explicitly architectural and behavior-preserving. It must not intentionally change user-visible status rules, reset semantics, protected-status semantics, holiday rules, or manual-action outcomes.
- The central status-management area will be decomposed into smaller domain-focused modules rather than continuing to expand one broad manager class.
- A dedicated status-policy boundary should own the decision of whether the current Slack status may be changed.
- A dedicated day-status selection boundary should own selection of the default status plan for a given day and configuration.
- A dedicated manual-action boundary should own interpretation of manual actions such as go-online, go-away, holiday, and custom status updates.
- A dedicated correction boundary should own decisions about whether the current status should be left alone or reset during correction cycles.
- The remaining top-level status manager, if retained, should become a composition-oriented facade that coordinates these deeper modules and side-effect collaborators rather than embedding most rules inline.
- Domain rules should be expressed in terms of explicit input and output structures rather than indirect mutation where practical.
- Ownership of status state, including protected/not-working state and active-source markers, should be clarified so that state transitions are easier to audit.
- Side effects such as Slack profile writes, presence changes, DND changes, cache invalidation, and emitted status-change notifications should be clearly separated from pure decision logic.
- The refactor should reduce hidden or incidental nondeterminism in status decisions where possible, or make it injectable so tests can control it deterministically.
- Renderer-facing status update payloads should use explicit shared types rather than loose `any`-style contracts.
- IPC helpers involved in status and snapshot flows should preserve a small, predictable surface and align with the shared contracts used by the main process and renderer.
- Logging around status-domain execution, error handling, and renderer/daemon bridges should be normalized so that equivalent events are emitted through a consistent approach.
- Existing runtime orchestration boundaries should remain intact; this effort should improve the status domain beneath or beside them rather than reabsorbing runtime logic into broad modules.
- The resulting architecture should make future status-related refactors or features possible without returning to broad, internally coupled test suites.

## Testing Decisions

- Good tests for this refactor assert externally observable behavior and contract-level outcomes, not private fields, helper ordering, or class internals.
- The primary test focus should move toward the new status-domain boundaries: policy decisions, day-status planning, manual-action planning, correction decisions, and facade-level coordination where side effects are relevant.
- Tests should prefer deterministic inputs and controllable doubles over reaching through internal state or relying on implicit randomness.
- Existing broad daemon- and status-centered tests should be reviewed for redundancy once focused boundary tests exist; where they no longer add unique coverage, they should be simplified or removed.
- A smaller set of higher-level integration-style tests should remain to prove that daemon, runtime orchestration, status domain, and renderer-facing notifications still compose correctly.
- Tests covering IPC and snapshot behavior should verify shared contracts and typed payloads rather than ad hoc object shapes.
- Logging behavior should be tested only where it reflects an externally meaningful contract or guards an important failure path; tests should not become brittle by asserting incidental log wording.
- Relevant prior art already exists in the app's daemon-focused tests, status-manager tests, status-reconciler tests, IPC service tests, snapshot contract tests, and snapshot provider tests. These should inform fixtures and style, but the new suite should move away from broad internal reach-throughs.

## Out of Scope

- Introducing new user-facing status behaviors, settings, actions, or source types.
- Redefining status business rules for protected statuses, holiday semantics, correction policy, or manual actions beyond what is necessary to preserve existing behavior during extraction.
- Reworking source detection, source arbitration, polling cadence, or daemon lifecycle behavior beyond interface adjustments required by the new status-domain boundaries.
- Redesigning the renderer UI or changing the appearance of settings, dashboard, or status-management screens.
- Replacing the overall snapshot architecture with a different renderer synchronization model.
- General-purpose logging infrastructure redesign unrelated to status-domain consistency and release diagnosis.
- Non-status-related cleanup work elsewhere in the codebase.

## Further Notes

- This PRD should be treated as the architectural follow-up to the runtime orchestration cut. PRD-005 reduced runtime complexity; this effort targets the remaining complexity concentrated in the status domain.
- The main product reason to do this work is release-risk reduction, not feature delivery speed as an end in itself.
- If implementation reveals that a supposedly behavior-neutral extraction is blocked by undocumented rule ambiguity, that ambiguity should be surfaced explicitly as a follow-up decision instead of being silently resolved in code.
- A successful outcome should leave the team with clearer ownership boundaries, fewer fragile tests, more reliable status-related releases, and lower confidence risk when estimating future work in this area.
