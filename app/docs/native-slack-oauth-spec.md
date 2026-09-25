# Native Slack OAuth and workspace connections

Product design and testing approach confirmed by Martin on 2026-09-25. This specification does not authorize changes to live Slack registrations or production systems.

## Problem Statement

Connecting Slack Status Bot currently requires users to visit a separate token website, authorize Slack access there, copy a token, and paste it into the desktop app. This exposes technical setup details to users and leaves the desktop app dependent on an independently maintained website.

The app supports multiple tokens but does not identify their workspaces. Saving newly entered tokens replaces the entire list, so connecting one workspace can remove access to another. Runtime failures can also affect unrelated workspaces: reads use the first token, and a failed write can stop subsequent workspaces from being updated. The single status display cannot show these differences accurately.

Martin creates a separate private Slack App Registration in each relevant workspace. Users should be able to authorize those registrations without handling client IDs, client secrets, or tokens. Workspace credentials must be isolated while the app continues to maintain one Shared Status across workspaces.

## Solution

Martin prepares a reusable Setup Link for each Slack App Registration. A user with the desktop app installed opens that link, approves access in Slack through the system browser, and returns to the desktop app. Native OAuth with PKCE establishes a Workspace Connection without a token website or authentication backend.

Each workspace has at most one Workspace Connection. Successful authorization replaces only the connection for the same verified workspace, including when the user signs in as a different Slack user. Other workspace credentials and their ordering are preserved. Reconnect is available directly in the app once the registration is known.

Existing working tokens are migrated without requiring immediate reauthorization. Token renewal, failures, and local removal are handled per workspace. The app retains shared status controls and rules, while a compact row per workspace shows its observed status and connection health. A recovering workspace catches up to the current Shared Status without replaying old updates or making its stale status the reference for other workspaces.

## User Stories

1. As an administrator, I want to use a separate Slack App Registration in each workspace, so that I can manage private installations without public app distribution.
2. As an administrator, I want to enter a registration's details once and generate a reusable Setup Link, so that users do not need to find or understand a client ID.
3. As an administrator, I want a Setup Link to contain registration information without credentials, so that distributing it does not distribute access to a user's Slack account.
4. As an administrator, I want to add another registration without releasing a new desktop build, so that workspace setup remains independent of application releases.
5. As a user, I want a Setup Link to open the desktop app and start Slack authorization, so that I do not need a separate token website.
6. As a user, I want to grant permission in the system browser, so that I can use my normal Slack login session.
7. As a user, I want the authorization result to return to the desktop app automatically, so that I do not copy codes or tokens between applications.
8. As a user, I want an authorization link to work when the desktop app is already running or must be launched, so that connecting does not depend on its window state.
9. As a user, I want to see which workspace and Slack user were connected, so that I can recognize an incorrect account selection.
10. As a user, I want successful authorization for a new workspace to add a connection, so that I can manage my status in more than one workspace.
11. As a user, I want successful authorization for an existing workspace to replace only that workspace's connection, so that I never lose access to other workspaces.
12. As a user, I want to replace the Slack user connected to a workspace without retaining a second connection to that workspace, so that each workspace has one clear account association.
13. As a user, I want cancelled or failed authorization to leave existing connections intact, so that trying to reconnect cannot break working access.
14. As a user, I want mismatched, expired, or repeated callbacks to be rejected, so that only a valid authorization I initiated can replace a connection.
15. As a user, I want to reconnect an established native connection directly from the app, so that I do not need to obtain its Setup Link again.
16. As an existing user, I want valid saved tokens to continue working through the upgrade, so that the new setup flow does not interrupt my automation.
17. As an existing user, I want saved tokens to be associated with their verified workspaces, so that future reconnects replace the correct connection.
18. As an existing user, I want the first valid token in the original order to be retained when several tokens belong to one workspace, so that migration behaves predictably.
19. As an existing user, I want temporary migration failures to be retried, so that a network outage is not mistaken for invalid credentials.
20. As an existing user, I want an invalid legacy connection to be identified as not migrated and offered fresh setup, so that I can repair it without disturbing working workspaces.
21. As an existing user, I want the app to explain when a legacy connection needs its Setup Link for the first native reconnection, so that missing registration information is actionable.
22. As a user, I want credentials to renew automatically, so that ordinary use does not require repeated logins.
23. As a user, I want renewal to recover after sleep or restart, so that leaving the app inactive briefly does not break it.
24. As a user, I want renewal and authorization for one workspace to preserve every other workspace's credentials, so that concurrent activity cannot lose connections.
25. As a user, I want a late response to respect a newer connection or a local removal, so that old requests cannot undo my actions.
26. As a user, I want a persistent reconnect indication and one desktop notification when fresh authorization becomes necessary, so that I notice the problem without repeated alerts.
27. As a user, I want temporary Slack or network failures to be distinguished from required reauthorization, so that I am not asked to log in unnecessarily.
28. As a user, I want healthy workspaces to keep receiving updates when another workspace fails, so that one connection problem does not disable the whole app.
29. As a user, I want the same intended status across connected workspaces, so that I continue to manage my availability through shared controls.
30. As a user, I want the first reachable eligible workspace in a stable order to serve as the Reference Workspace, so that an unavailable first connection does not block the shared status rules.
31. As a user, I want existing custom-status and holiday protection rules to remain shared and deliberate, so that changing authorization does not introduce separate status policies.
32. As a user, I want a recovering workspace to receive the current Shared Status, so that old meeting or music updates are not replayed after recovery.
33. As a user, I want catch-up to work while music or a meeting is active, so that active sources do not prevent synchronization.
34. As a user, I want synchronization immediately after a successful connection and periodic retries after temporary failures, so that recovery does not wait for a new status event.
35. As a user, I want status expiration and time-limited availability settings to retain their real deadlines, so that reconnecting does not extend an expired state.
36. As a user, I want each workspace's actual observed status and connection health displayed together, so that I can verify whether the shared intent reached every workspace.
37. As a user, I want unavailable observations and partial failures shown truthfully, so that a missing response is not reported as a successful online status.
38. As a user, I want removing a workspace to delete its local connection without revoking access elsewhere, so that other installations and workspaces keep functioning.
39. As a user, I want credentials stored securely and excluded from displayed state and logs, so that using or diagnosing the app does not expose my Slack access.
40. As an administrator, I want the native flow validated with a test registration before enabling it on intended workspaces, so that irreversible Slack settings are changed only after the desktop app is ready.

## Implementation Decisions

- Use the glossary concepts Slack App Registration, Setup Link, Workspace Connection, Reconnect, Shared Status, and Reference Workspace. Follow ADR-004 for native authorization and preserve the existing status-protection and External Status Command decisions.
- Use Slack OAuth v2 with PKCE S256 in the Electron main process. Open consent in the system browser and reuse the existing application URI scheme for setup and callbacks. Keep these actions distinct from existing External Status Commands.
- Provide administrator configuration for generating reusable Setup Links from registration details. Ordinary users consume those links and do not enter client IDs, client secrets, or tokens. A link contains only non-secret registration information; an optional expected workspace must be checked against Slack's verified response.
- Treat setup links, browser callbacks, IPC inputs, and Slack responses as external data requiring validation. Use a fresh verifier and state for each pending authorization, bind the attempt to its registration and any expected workspace, and expire pending attempts. Reject unsolicited, cancelled, mismatched, expired, or replayed completions without mutating connections.
- Identify a Workspace Connection by Slack's immutable workspace identity, not by its display name, token value, position, or user identity. Keep the authorized user as connection metadata. Reauthorizing the same workspace replaces its credentials even if the user changes.
- Replace the bare token list as the active connection model with workspace records containing verified workspace/user metadata, registration client ID when known, credential references, expiry information, connection health, and stable ordering. Permit legacy records without native registration or refresh metadata until they are reconnected.
- Have one host-owned connection lifecycle manage authorization, persistence, refresh, and local removal. Extend the existing setup IPC and app snapshot contracts to expose connection actions and non-secret workspace state. The renderer must never receive raw credentials.
- Coordinate writes against the latest stored connections. Serialize changes for the same workspace and prevent late refresh or authorization responses from overwriting newer credentials or recreating removed connections. Concurrent updates to separate workspaces must preserve both results.
- Persist replacement access and refresh credentials safely. Use OS-backed secure storage for credentials and explicit errors when it cannot be used, rather than silently falling back to plaintext. Remove legacy plaintext credential entries only after their secure replacement is durably stored; failed migration must not lose existing access. Keep unrelated application preferences intact.
- Migrate existing tokens by verifying their workspace and user identities through Slack. Retain the first valid original entry per workspace, preserve order, and make the migration restart-safe. Do not discard or misassign a token solely because its verification had a transient failure. Display definitively invalid unassigned tokens as failed legacy migrations.
- Do not infer missing registration client IDs from token strings. A working legacy connection continues to operate; its first native reconnect may require the administrator's Setup Link. Once native authorization succeeds, retain the registration for direct Reconnect.
- Renew each native connection using its own registration and refresh credentials. Handle expiry, sleep, and restart; distinguish transient failures from authorization that requires user action. Respect Slack rate-limit backoff and avoid parallel duplicate refreshes for the same connection.
- Request the user permissions needed by active features: profile reading and writing, presence writing, and DND writing. Do not request bot permissions or add unused permissions solely for inactive helper methods.
- Preserve one Shared Status and the existing shared status/protection policies. Read the reference profile from the first reachable eligible connection in stable order, falling back to the next connection on failure. Reconnecting does not reorder unrelated connections.
- Continue writes to healthy workspaces after another workspace fails. Track per-workspace delivery outcomes so an unchanged Shared Status can still be retried where its prior update failed. Do not roll back successful workspaces or rewrite them repeatedly solely because another failed.
- Extend the existing correction cycle with a workspace synchronization step. The shared correction decision and delivery synchronization remain distinct: active music or meetings may skip day-status correction without skipping catch-up.
- Trigger that same synchronization operation immediately after successful authorization/reconnection and through the existing approximately 60-second correction cycle for transient recovery. Respect rate-limit delays instead of promising a strict recovery deadline.
- Keep a recovering workspace's stale profile out of reference selection until it is reconciled with the current shared state. Once synchronized, it can participate in the agreed stable reference order again. If no trustworthy shared target exists, obtain a fresh reachable profile and apply existing shared status/protection rules before forcing updates.
- Apply only current status and still-applicable presence/DND intent on recovery. Preserve absolute expiration deadlines and do not replay intermediate updates, restart an old duration, or invent a status from unavailable data.
- Display one compact row per workspace with its separately observed status, account identity, and connection health. Retain shared action controls. Missing observations must not be converted into an online/success state; partial delivery must remain visible.
- Emit one reconnect notification per authorization-loss occurrence and retain an actionable in-app indication until resolved. Persist sufficient health information to avoid repeating the same alert on ordinary retries or restarts; a new later loss after successful recovery is a new occurrence.
- Remove connections locally by deleting their credentials and local registration association. Do not call Slack revocation or uninstall APIs. Invalidate pending operations for the removed connection.
- Exclude tokens, refresh tokens, authorization codes, full callback URLs, and credential-bearing error payloads from logs and renderer state. Record useful non-secret lifecycle outcomes, workspace identifiers, failure categories, and synchronization results using existing logging facilities.

## Testing Decisions

- **Confirmed primary seam:** use one host/application integration boundary for connection commands, URI entry points, and runtime cycles. Reuse existing IPC registration and daemon construction patterns; add only the composition needed to exercise real connection lifecycle, persistence, Slack request handling, and shared status execution together.
- Stub external Slack HTTP responses and OS integrations rather than the app's own connection or status behavior. Use controlled time for expiry/retry cases and isolated temporary storage for persistence and restart cases. This is one shared integration harness with focused scenarios, not a separate mock-heavy suite for every helper.
- Assert externally meaningful outcomes: which workspace is connected, which credentials its outbound request uses, which state survives a reload, which workspace receives a status update, and which notification/snapshot reaches the user. Avoid assertions about private method order or internal object shapes.
- Existing setup IPC tests demonstrate driving application commands; daemon tests demonstrate shared status behavior; configuration-store tests demonstrate temporary persistence and recovery; snapshot and Dashboard tests demonstrate user-visible state. Preserve useful behavioral assertions from this prior art, while moving external fakes low enough that the new integration scenarios do not mock away the feature being tested.
- Cover native setup and callback validation, including an already-running app, a launched app, cancellation, wrong or expired state, workspace mismatch, and replay. Rejected completions must preserve all existing connections.
- Cover the central isolation scenario with two independent registrations and workspaces: reconnect A, renew A, and remove A; B's credentials, registration, order, and ability to update remain intact. Include simultaneous completion for different workspaces and late responses after replacement/removal.
- Cover migration of valid legacy credentials, duplicate workspace credentials, invalid unassigned credentials, transient verification failure, and restart during migration. Verify that unrelated settings survive and unknown metadata is not fabricated.
- Cover proactive refresh, expiry after sleep/restart, durable replacement credentials, and prolonged inactivity requiring Reconnect. Repeated failures produce one notification per occurrence; recovery clears the indication and allows a later occurrence to notify again.
- Cover a failed first workspace with a healthy second workspace: reference fallback and writes to B continue. After A recovers, it receives the latest Shared Status even when the correction policy skips because a source is active, without replaying old statuses or changing B unnecessarily.
- Cover partial write outcomes and retries when the Shared Status has not changed, as well as time-limited status/presence/DND recovery without extending expired deadlines. Verify that no trustworthy reference results in explicit unavailable state rather than fabricated success.
- Supplement the host scenarios with focused existing-style UI tests for per-workspace observed state, reconnect/remove actions, missing observations, and partial failure. Avoid duplicating the full OAuth lifecycle in component tests.
- Before changing intended Slack registrations, perform a focused packaged-app check using a separate test registration to verify the real system-browser callback and secure-storage integration. This is necessary because simulated Slack and OS boundaries cannot prove platform protocol registration or actual Slack acceptance. It is not authorization to alter production registrations during specification work.
- Do not test Slack's internals, PKCE cryptographic primitives, or framework behavior. Run the relevant existing status-protection and External Status Command checks after implementation to verify that the integration preserves those product behaviors.

## Out of Scope

- Operating, modifying, or retiring the existing token website, including its use by other scripts or services.
- A new authentication backend, hosted registration catalog, user account service, Slack Marketplace listing, or public app distribution.
- Automatically creating Slack App Registrations, enabling PKCE, changing permissions in live workspaces, rotating their client secrets, or uninstalling apps.
- Independent status automation, source preferences, or manual controls per workspace. The Shared Status remains the product model.
- Maintaining multiple active Slack-user connections to the same workspace in one desktop installation.
- Revoking Slack access remotely when a local connection is removed, or synchronizing credentials and settings across desktop installations.
- A wholesale UI redesign, new telemetry platform, unrelated status-rule changes, or replacement of existing music/meeting detection.
- Reworking legacy standalone scripts or implementing a general token export service.

## Further Notes

- The design interview is complete. Martin confirmed both the product behavior and the shared application-level testing approach, supplemented by focused UI checks and a packaged-app callback check with a test registration.
- ADR-004 records the architectural choice. The glossary distinguishes credential isolation from the deliberately shared status behavior.
- Slack documents that native PKCE redirects require user scopes and produce rotating tokens. Access tokens last 12 hours; PKCE refresh tokens have a 30-day lifetime and are replaced on successful renewal. This does not mean users must log in every 30 days, but prolonged inactivity can require Reconnect.
- Enabling PKCE cannot be reversed without Slack support. Validate a separate test registration and the desktop implementation first; Martin configures the intended Slack registrations afterward as a distinct operational step.
- Legacy credentials and native credentials coexist during migration. Native reconnection replaces only the matching workspace; no global credential reset is part of rollout.
- Custom-scheme Setup Link handling assumes the desktop app is installed. Verify actual link delivery behavior in the intended clients during implementation; the initial installer distribution is outside this feature.
- Sources: [Slack PKCE](https://docs.slack.dev/authentication/using-pkce/), [token rotation](https://docs.slack.dev/authentication/using-token-rotation/), [workspace identity verification](https://docs.slack.dev/reference/methods/auth.test/), and [DND permissions](https://docs.slack.dev/reference/methods/dnd.setSnooze/).
