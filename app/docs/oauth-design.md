# Native Slack authorization

Status: Design confirmed by Martin on 2026-09-25. This is the design interview record; the [implementation specification](native-slack-oauth-spec.md) is the consolidated reference for subsequent work. The confirmation does not authorize changes to live Slack configuration or production systems.

## Agreed requirements

- Users connect Slack from the desktop app. The desktop app no longer depends on the separate token website.
- Martin manages installation of the Slack app in the relevant workspaces. Public self-service distribution or a Slack Marketplace listing is not a goal.
- Each workspace has a separate Slack app registration, managed by Martin. The desktop app must support the corresponding distinct client IDs and retain the appropriate registration for each connection's authorization and renewal.
- Ordinary users must not need to obtain, understand, or manually enter client IDs. Martin enters each Slack app registration's details once and generates a reusable setup link. Adding a registration must not require a desktop app release.
- Opening a setup link starts authorization in the desktop app, which opens Slack in the system browser and receives the callback through its existing custom URI scheme. Setup links contain registration identifiers, never client secrets or user credentials. After initial setup, users reconnect directly from the app.
- Each workspace has at most one workspace connection. A successful new authorization replaces that workspace's connection, including when the authorized Slack user changes. It never replaces another workspace's connection.
- Existing working tokens remain usable during migration. Identify their workspaces and replace them individually when the user successfully reconnects the corresponding workspace.
- For duplicate legacy tokens in the same workspace, retain the first valid entry in the original order. A later successful authorization replaces it normally. Transient verification failures must not cause premature reordering or loss of unverified entries.
- Retry identifying existing tokens after transient network failures. Show definitively invalid tokens as legacy connections that could not be migrated, and offer fresh authorization; do not guess their workspace or alter other connections.
- Authorization, token renewal, connection errors, and disconnecting apply to one workspace. A workspace that needs renewed authorization must not stop other connected workspaces from operating.
- Status automation remains shared: the goal is the same Slack status across connected workspaces, not independent status policies per workspace. Credential isolation and failure handling must not be confused with separate status automation.
- Preserve a stable connection order. The first reachable workspace provides the profile reference for the existing shared status/protection rules; when it is unavailable, try the next reachable workspace. Reconnecting a workspace must not reorder unrelated workspaces.
- When a workspace recovers, bring it up to date with the current shared status rather than allowing its stale status to become the shared reference. Do not replay missed intermediate statuses.
- Show a compact row for each workspace with its observed Slack status and connection health. An unavailable status must be shown as unavailable, not as a successful online state. Shared status controls remain shared.
- When a workspace requires fresh authorization, show one desktop notification per occurrence and a persistent, workspace-specific reconnect indication in the app. Repeated failures must not repeatedly notify the user.
- Removing a workspace connection deletes its credentials and registration association from this desktop installation only. It must not call Slack's revocation or uninstall APIs, modify other workspaces, or change another desktop installation. Remote revocation is outside this change's scope.
- The existing token website and its eventual retirement are outside this change's scope.

## Agreed synchronization approach

- Reuse the existing correction-cycle schedule for retrying workspace synchronization. The current `correctStatus()` alone is insufficient: it reads one profile, evaluates day/status protection rules, and returns early when a source is active.
- Keep the existing shared status decision and workspace synchronization as distinct steps in the same cycle. Skipping a day-status correction because music or a meeting is active must not skip syncing that active shared status to a recovering workspace.
- Trigger the same synchronization operation immediately after successful authorization/reconnection; ordinary transient recovery can be caught by the next correction cycle, currently every 60 seconds, with API rate-limit backoff respected.
- Write only to connected workspaces that require synchronization. Successful workspaces are not rolled back or repeatedly rewritten because another workspace failed. Track partial success so a workspace that missed an update is retried even if the shared target itself has not changed.
- Keep a recovering workspace out of reference selection until its stale state has been reconciled against the current shared state. Once reconciled, restore the agreed stable reference order.
- Synchronize the current status and still-applicable presence/DND intent, not old commands or expired status deadlines. Preserve absolute expiration times; do not extend an ended meeting, holiday, or DND period by replaying its original duration.
- If no trustworthy shared target is available, use the existing shared status/protection rules with a fresh reachable profile before forcing synchronization. Do not invent a status from missing data.

## Confirmation

Martin confirmed shared understanding after the correction-cycle approach for Q14 and local removal for Q15 were explained. The interview is complete; the requirements and synchronization behavior are consolidated into the implementation specification.

## Technical requirements

- Keep token exchange and renewal in the Electron main process. Use PKCE S256, a fresh verifier, and state bound to each pending authorization; validate the callback before replacing credentials. Do not accept a setup link as an OAuth completion.
- Obtain the definitive workspace and user identities from verified Slack responses. Validate any expected workspace from the setup or reconnect request. A cancelled, failed, expired, mismatched, or replayed callback must not mutate existing connections.
- Persist each connection's workspace identity, Slack app client ID when known, user identity, access credentials, refresh credentials, expiry, and stable ordering. Refresh or replace only that workspace's credentials.
- Serialize credential renewal and replacement for the same workspace. A late renewal response must not overwrite a newer authorization or recreate a removed connection; concurrent updates for different workspaces must not lose each other's changes.
- Store tokens using OS-backed secure storage. Do not place raw tokens, refresh tokens, authorization codes, or full callback URLs in logs, setup links, or renderer-visible state.
- Renew credentials automatically before expiry and recover from sleep or restart. Persist replacement refresh credentials safely before treating renewal as complete. Distinguish temporary network failures from revoked or expired authorization.
- Migrated legacy tokens do not necessarily reveal their Slack app client ID. Keep them working without inventing registration metadata. Their first native reconnection may need Martin's setup link; subsequently retain the registration for direct reconnection.
- Request only scopes required by active functionality: profile reading/writing, presence writing, and DND writing. Keep the existing website and live Slack app settings outside the implementation's automatic changes.
- The per-workspace control display must use separately observed profiles; it must not repeat the reference workspace's profile as if it were verified for every workspace. Show partial failures truthfully.

## Behavioral acceptance checks

- With workspaces A and B connected, successfully reconnecting A replaces only A's credentials and leaves B's credentials and ordering unchanged. Cancelling or failing authorization preserves both connections.
- A refresh or authorization result arriving after its connection was replaced or removed cannot overwrite the new credentials or recreate a deleted connection. Concurrent successful updates for A and B preserve both results.
- A failing workspace cannot stop another workspace's writes or shared-reference fallback. Failures and observed statuses are shown per workspace without claiming global success.
- Recovery catches up to the current shared status during active music/meeting sources as well as ordinary day status. It does not replay outdated statuses or make a stale recovered workspace the reference prematurely.
- Migration preserves working legacy connections, selects the first valid duplicate per workspace, retries temporary validation failures, and surfaces invalid unknown connections without guessing their identity.
- An expired authorization produces one notification for that occurrence and a persistent reconnect indication. A subsequent successful reconnect clears the problem; repeated failures do not repeatedly notify.
- Setup links work without users entering client IDs or tokens. Invalid or mismatched OAuth callbacks do not change stored connections, and credential values are absent from UI state and logs.
- Local removal affects only the selected workspace on the current desktop installation and makes no Slack revocation or uninstall request.

## Rollout constraints

- First implement and test native authorization and renewal against a separate test registration. The existing working-token path must continue to function during the transition.
- Martin enables PKCE and registers the desktop callback in each intended Slack app only after the desktop flow is ready. PKCE activation cannot be undone without Slack support.
- Extended inactivity can exhaust a refresh token's lifetime and require reconnecting that workspace. Successful renewals issue replacement refresh tokens; this is not a forced login every 30 days.

## Verified constraints

- The existing app stores only token strings and replaces the complete list when saving tokens.
- Slack profile reads currently use the first token; status writes use all tokens. A thrown request error can stop a write loop before later workspaces are processed.
- The first token's profile also drives shared status protection and recovery. Its unavailable or protected status can prevent updates in other workspaces, while protected statuses in later workspaces are not individually checked. The existing dashboard displays a single status.
- Slack's PKCE flow supports the existing custom URI scheme without embedding a client secret. Enabling PKCE cannot be reversed without Slack support.
- Native authorization through a custom URI scheme produces rotating tokens. Access tokens last 12 hours; PKCE refresh tokens expire after 30 days and are replaced on successful renewal. Extended inactivity can therefore require reconnecting a workspace.
- `auth.test` can identify the workspace and user for a working existing token. An invalid token cannot reliably be assigned to a workspace this way.
- The existing website's requested scopes omit `dnd:write`, which the app's active DND operations require. Native authorization must request the scopes needed by the active features.

Sources: [Slack PKCE](https://docs.slack.dev/authentication/using-pkce/), [token rotation](https://docs.slack.dev/authentication/using-token-rotation/), [auth.test](https://docs.slack.dev/reference/methods/auth.test/), [DND](https://docs.slack.dev/reference/methods/dnd.setSnooze/).
