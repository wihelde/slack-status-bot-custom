# Native Slack OAuth: ticket breakdown

Status: Breakdown approved by Martin; all seven tasks published to Todoist and verified on 2026-09-25.

Target: Todoist project `slack-status-bot`, label `agent-task`. Every published description contains its acceptance criteria and direct blockers' titles, Todoist IDs, and links. Numbered references below preserve the approved breakdown. The parent specification is unchanged.

## Published tasks

| Slice | Todoist task | ID |
| --- | --- | --- |
| 1 | [Bestehende Slack-Verbindungen sicher je Workspace übernehmen](https://app.todoist.com/app/task/bestehende-slack-verbindungen-sicher-je-workspace-ubernehmen-6hcfwgRh94gHXqf9) | `6hcfwgRh94gHXqf9` |
| 2 | [Workspaces über Einrichtungslinks direkt in der App verbinden](https://app.todoist.com/app/task/workspaces-uber-einrichtungslinks-direkt-in-der-app-verbinden-6hcfwjQF5cFmGhG9) | `6hcfwjQF5cFmGhG9` |
| 3 | [Einzelne Workspace-Verbindungen ausschließlich lokal entfernen](https://app.todoist.com/app/task/einzelne-workspace-verbindungen-ausschlielich-lokal-entfernen-6hcfwjcvHwhhPgR9) | `6hcfwjcvHwhhPgR9` |
| 4 | [Workspace-Tokens automatisch erneuern und gezielt neu anmelden](https://app.todoist.com/app/task/workspace-tokens-automatisch-erneuern-und-gezielt-neu-anmelden-6hcfwjhCG4r5VG59) | `6hcfwjhCG4r5VG59` |
| 5 | [Gesunde Workspaces trotz anderer Ausfälle weiter aktualisieren](https://app.todoist.com/app/task/gesunde-workspaces-trotz-anderer-ausfalle-weiter-aktualisieren-6hcfwjwCMVh5MrX9) | `6hcfwjwCMVh5MrX9` |
| 6 | [Zurückkehrende Workspaces auf den aktuellen gemeinsamen Status bringen](https://app.todoist.com/app/task/zuruckkehrende-workspaces-auf-den-aktuellen-gemeinsamen-status-bringen-6hcfwjwqFV3Wf3g9) | `6hcfwjwqFV3Wf3g9` |
| 7 | [Den installierten OAuth-Ablauf mit einer Slack-Test-App abnehmen](https://app.todoist.com/app/task/den-installierten-oauth-ablauf-mit-einer-slack-test-app-abnehmen-6hcfwm56vC3jW4Ch) | `6hcfwm56vC3jW4Ch` |

Parent specification: native-slack-oauth-spec.md. Vocabulary and architectural decisions follow the project glossary and ADR-004.

AFK means implementable using the confirmed design and simulated external boundaries. HITL requires Martin's participation for Slack consent and a separate test registration. Neither classification authorizes changes to production systems.

All implementation tickets use the confirmed host/application integration seam with real application logic, controlled Slack/OS boundaries, and temporary persistence. Apply TDD one behavior at a time: failing behavior test, implementation, then the next behavior. Include focused UI checks where the ticket changes visible behavior. Preserve existing status-protection and External Status Command behavior. No separate speculative refactoring ticket is needed; introduce the necessary composition and compatible migration path in ticket 1.

## 1. Bestehende Slack-Verbindungen sicher je Workspace übernehmen

Type: AFK

Parent spec:
native-slack-oauth-spec.md

What to build:

Existing users keep working after the upgrade. Saved tokens become securely stored Workspace Connections with verified workspace/user identities, stable order, and a compact workspace/account display. Existing status actions continue using these connections. Unresolved or invalid legacy connections are visible rather than silently discarded.

Acceptance criteria:
- [ ] Working existing tokens are identified through Slack and remain usable for status actions after migration and restart.
- [ ] The first valid original token per workspace is retained. Temporary verification failures preserve unresolved entries for retry without guessing identities or prematurely changing ordering.
- [ ] Definitively invalid legacy tokens appear as connections that could not be migrated. The UI does not fabricate a workspace association; native recovery is added in ticket 2.
- [ ] Credentials use OS-backed secure storage. Plaintext entries are removed only after durable secure replacement; unavailable secure storage or interrupted migration does not lose working access. Unrelated settings survive.
- [ ] The app displays verified workspace/account metadata without exposing credentials. Existing runtime behavior remains usable while later tickets add independent failure handling.
- [ ] A shared host/application integration harness verifies migration, reload, visible connection state, and a real application status action with two simulated Slack workspaces. It does not mock the app's own persistence or status logic.

Blocked by:
None

User stories addressed:
- User stories 16, 17, 18, 19, 20, 36, 39. The repair action in story 20 is completed by ticket 2; observed per-workspace status in story 36 is completed by ticket 5.

## 2. Workspaces über Einrichtungslinks direkt in der App verbinden

Type: AFK

Parent spec:
native-slack-oauth-spec.md

What to build:

Martin configures a private Slack App Registration and generates a reusable Setup Link. A user opens it, authorizes in the system browser, and returns to a working Workspace Connection in the desktop app. Connecting the same workspace replaces only that workspace. Native connections can subsequently reconnect directly from the app; migrated connections can receive their missing registration through a Setup Link.

Acceptance criteria:
- [ ] Administrator setup produces reusable links from separate registrations without a new application release. Links contain no client secrets or user credentials.
- [ ] Opening a link in a running or launched desktop app starts native PKCE authorization in the system browser and handles the callback through the existing application URI scheme without disrupting External Status Commands.
- [ ] Verified workspace and user metadata appear in the app, credentials survive restart securely, and the connection can perform a normal shared status action without using the token website.
- [ ] A new workspace is added; an existing workspace is replaced even when its Slack user changes. Another workspace's credentials, registration association, and order are preserved.
- [ ] PKCE/state/expiry and expected-workspace checks reject unsolicited, cancelled, failed, mismatched, expired, or replayed completions without changing existing connections. Late superseded authorization attempts cannot overwrite newer ones.
- [ ] Concurrent authorizations for different workspaces preserve both results. No raw credentials or callback codes appear in logs, setup links, or renderer state.
- [ ] Native Reconnect uses saved registration details. Legacy connections without those details request the Setup Link instead of guessing a client ID; failed legacy migration entries have an actionable native setup path.
- [ ] Host/application tests exercise successful setup, cross-workspace replacement isolation, rejected callbacks, restart, and registration-aware reconnect. Focused UI tests cover administrator link generation and the user connection flow.
- [ ] Request only required user scopes, including DND writing. Actual intended Slack registrations remain unchanged; live protocol acceptance is validated in ticket 7.

Blocked by:
- Ticket 1: Bestehende Slack-Verbindungen sicher je Workspace übernehmen

User stories addressed:
- User stories 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 20, 21, 24, 25, 39. Refresh-specific behavior in stories 24 and 25 is completed by ticket 4.

## 3. Einzelne Workspace-Verbindungen ausschließlich lokal entfernen

Type: AFK

Parent spec:
native-slack-oauth-spec.md

What to build:

A user removes one Workspace Connection from the desktop app. Its local credentials and registration association disappear, it receives no further status updates, and other workspaces continue to work. Removing a connection never revokes its Slack authorization or affects another desktop installation.

Acceptance criteria:
- [ ] A workspace row offers local removal. Removing A updates visible state and durable storage; after restart A is absent and B remains connected and usable.
- [ ] Credential deletion and runtime detachment affect only the selected workspace. Pending authorization for the removed connection cannot recreate it when a late callback arrives.
- [ ] No Slack revocation or uninstall request is made. Existing Slack status is not reset as a side effect of removal.
- [ ] Removing the final connection produces an accurate unconnected state. The app can connect again through a Setup Link.
- [ ] Host/application tests exercise removal with another healthy workspace, late authorization, and restart. Focused UI coverage verifies the selected connection is the one removed.

Blocked by:
- Ticket 2: Workspaces über Einrichtungslinks direkt in der App verbinden

User stories addressed:
- User stories 25, 38, 39. Late refresh after removal is covered when refresh is introduced in ticket 4.

## 4. Workspace-Tokens automatisch erneuern und gezielt neu anmelden

Type: AFK

Parent spec:
native-slack-oauth-spec.md

What to build:

Native Workspace Connections renew their credentials automatically and recover after sleep or restart. If fresh user consent becomes necessary, the affected workspace receives one notification and a persistent Reconnect action. Temporary failures do not ask users to log in again or alter other connections.

Acceptance criteria:
- [ ] Each connection renews with its own registration and refresh credentials before expiry, persists replacements safely, and uses the new credentials for subsequent Slack actions after restart.
- [ ] Sleep, restart, temporary failures, and Slack rate limits are handled without concurrent duplicate renewal for the same workspace.
- [ ] Updates for different workspaces preserve each other. A late refresh cannot overwrite a newer authorization or recreate a locally removed connection.
- [ ] Definitively expired/revoked authorization shows a workspace-specific Reconnect action and one desktop notification per occurrence. Retries and restarts do not repeat the same notification; a later separate occurrence may notify after successful recovery.
- [ ] Reconnect repairs only the affected connection. Network failures are reported separately from missing authorization, and existing healthy connections remain usable.
- [ ] Tokens, refresh credentials, and credential-bearing error payloads remain absent from logs and renderer state; lifecycle outcomes are observable through existing non-secret logging.
- [ ] Host/application tests use controlled time to verify expiry, durable rotation, restart, simultaneous workspace updates, late responses after Reconnect/removal, and notification occurrence handling. UI checks cover the persistent reconnect state.

Blocked by:
- Ticket 3: Einzelne Workspace-Verbindungen ausschließlich lokal entfernen

User stories addressed:
- User stories 15, 22, 23, 24, 25, 26, 27, 39.

## 5. Gesunde Workspaces trotz anderer Ausfälle weiter aktualisieren

Type: AFK

Parent spec:
native-slack-oauth-spec.md

What to build:

An unavailable workspace no longer blocks healthy ones. Shared status rules use the first reachable eligible Reference Workspace in stable order. The dashboard shows each workspace's independently observed status and health, including partial successes, while status controls remain shared.

Acceptance criteria:
- [ ] With A unavailable and B healthy, B continues to receive profile, presence, and applicable DND updates. A thrown request failure or Slack error does not abort unrelated workspace operations.
- [ ] Reference reads fall back in stable order to a reachable eligible workspace. Existing custom-status and holiday rules remain shared; no per-workspace automation is introduced.
- [ ] Per-workspace results retain successful deliveries and failed deliveries separately. Consumers do not report complete success when only some workspaces were updated.
- [ ] Each workspace row displays its own observed profile and connection health. Missing observations are unavailable, never a fabricated online state or a copy of another workspace's profile.
- [ ] Successful workspaces are not rolled back because another failed. When no reference can be obtained, shared protection rules handle the unavailable input conservatively.
- [ ] Host/application tests drive shared actions and runtime cycles through real application logic with independent Slack responses for A and B. Focused UI checks cover partial success and unavailable observations; existing shared status-protection checks still pass.

Blocked by:
- Ticket 1: Bestehende Slack-Verbindungen sicher je Workspace übernehmen

User stories addressed:
- User stories 28, 29, 30, 31, 36, 37.

## 6. Zurückkehrende Workspaces auf den aktuellen gemeinsamen Status bringen

Type: AFK

Parent spec:
native-slack-oauth-spec.md

What to build:

A recovering workspace receives the current Shared Status immediately after successful native connection or during the existing correction cycle after transient recovery. It does not replay old updates or impose its stale profile as the shared reference. Catch-up also works while music or a meeting is active.

Acceptance criteria:
- [ ] Successful connection/Reconnect invokes the same synchronization behavior used by the periodic correction cycle, currently approximately 60 seconds with rate-limit backoff respected.
- [ ] When a workspace missed a delivery, it is retried even if the Shared Status has not changed. Healthy synchronized workspaces are not repeatedly rewritten solely because another failed.
- [ ] Active sources can skip day-status correction without skipping workspace catch-up. A recovered workspace receives the latest shared state, not missed intermediate commands.
- [ ] A stale recovering workspace is excluded from reference selection until reconciled. After reconciliation, stable reference order applies again.
- [ ] Status expiration and still-applicable presence/DND intent retain real deadlines. Recovery does not restart an old duration, revive an expired state, or fabricate a target when none is trustworthy.
- [ ] Per-workspace status and delivery health reflect successful catch-up and persistent failure accurately.
- [ ] Host/application tests cover A recovering while B already has the latest state, active music/meeting sources, unchanged-target retries, native Reconnect, expiration, and no trustworthy reference. No second scheduling system is introduced.

Blocked by:
- Ticket 2: Workspaces über Einrichtungslinks direkt in der App verbinden
- Ticket 5: Gesunde Workspaces trotz anderer Ausfälle weiter aktualisieren

User stories addressed:
- User stories 28, 29, 30, 31, 32, 33, 34, 35, 36, 37.

## 7. Den installierten OAuth-Ablauf mit einer Slack-Test-App abnehmen

Type: HITL

Parent spec:
native-slack-oauth-spec.md

What to build:

Validate the installed desktop app against a separate Slack test registration, including Setup Link handling, browser consent, return to the app, secure storage, and renewal. Produce concise administrator setup guidance for the intended private registrations after validation, without changing those registrations automatically.

Acceptance criteria:
- [ ] Martin provides or configures a separate test registration and completes required consent. Intended production registrations and the existing token website are not modified.
- [ ] Verify link delivery through the intended client, the system-browser callback when the app is running or launched, and persistence through restart in the packaged app. Record any real platform restriction and resolve blockers before sign-off.
- [ ] Validate actual Slack PKCE acceptance and renewal with the test registration, including OS-backed credential storage. Do not expose credentials in recorded evidence.
- [ ] Complete the automated two-workspace acceptance scenarios across all prior slices, including Reconnect/refresh/removal isolation, legacy migration, reference fallback, active-source recovery, and truthful partial-failure UI.
- [ ] Record the build/platform and outcomes. Provide administrator instructions for per-workspace PKCE, callback configuration, required scopes, and Setup Link generation, with the irreversible PKCE setting made explicit.
- [ ] Document that manual rollout to intended registrations is a separate administrator action. Do not retire the website, publish to the Marketplace, revoke credentials, or perform production configuration changes as part of this ticket.

Blocked by:
- Ticket 4: Workspace-Tokens automatisch erneuern und gezielt neu anmelden
- Ticket 6: Zurückkehrende Workspaces auf den aktuellen gemeinsamen Status bringen

User stories addressed:
- User stories 1, 2, 5, 6, 7, 8, 22, 23, 39, 40, with acceptance coverage for the full specification.

## Dependency and coverage review

- Start with ticket 1. Tickets 2 and 5 can then proceed independently.
- Ticket 3 follows the native lifecycle from ticket 2. Ticket 4 follows ticket 3 so its late-refresh tests can exercise real Reconnect and removal through the application boundary rather than mocks.
- Ticket 6 needs native connection events from ticket 2 and independent delivery/reference behavior from ticket 5. It does not wait for renewal because transient recovery and successful authorization already supply complete recovery scenarios.
- Ticket 7 is the join after tickets 4 and 6, which transitively include all implementation tickets.
- User stories 1 through 40 are covered. Shared stories deliberately span slices where the behavior has multiple independently verifiable stages; credentials and callback validation are mandatory in the first slice that handles them, never deferred to a generic hardening ticket.
