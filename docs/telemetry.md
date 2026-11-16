# Usage collection in the desktop host

The Electron main process owns the only PostHog client. Collection defaults to on,
including when an existing profile has no collection preference. Settings →
Automation contains the shared usage/diagnostic switch and copyable diagnostic ID.
The switch discards pending data; previously ingested records follow the existing
project retention. It does not delete remote records.

## Configuration

Use the public capture configuration for the existing Slack Status Bot project
(EU project 352472). Never provide a personal/administrative API key to a build.
For local development, export these directly in your local `.envrc` or shell:

```sh
export SLACK_STATUS_BOT_TELEMETRY_ENVIRONMENT=development
export SLACK_STATUS_BOT_POSTHOG_HOST=https://eu.i.posthog.com
export SLACK_STATUS_BOT_POSTHOG_TOKEN=phc_REPLACE_WITH_VERIFIED_PUBLIC_CAPTURE_TOKEN
```

`host:build` and `host:watch` write the public configuration to the ignored
`dist/telemetry-config.json`. These commands explicitly select development unless
the environment variable overrides it. `electron-build` explicitly builds for
production. The JSON and SDK runtime dependencies are included in the app archive.
Runtime variables override bundled values, including for a packaged test launch.
No packaging heuristic or `NODE_ENV` value selects production. Missing/invalid
capture configuration disables output with a local warning and keeps the app
working; invalid environments never become production. The builder rejects invalid
environment values and non-public tokens before writing configuration.

## Event and extension contract

`createHostTelemetry` in `src/main/telemetry.ts` exposes `start`, typed `capture`,
`getSettings`, `setEnabled`, shared diagnostics and bounded `shutdown`. Call `start` once during host
startup, independently of window visibility and the Slack daemon. The activity event is:

| Event | Allowed caller properties | Meaning |
| --- | --- | --- |
| `app_activity` | `reason: startup \| daily` | Process startup and every 24 hours while it runs |

Every event receives trusted `environment`, `app_version`, `os_platform`,
`os_release`, `os_arch`, `$process_person_profile=false` and disabled GeoIP.
PostHog `distinct_id` is `<environment>:<random installation UUID>`.
Settings exposes the UUID without the environment prefix. Investigations need both.
The UUID and opt-out preference persist in the existing config store; unrelated
configuration is preserved. There is no identify/alias call, named-person profile,
Slack identity, hardware identity, host name or renderer analytics SDK.

Later slices extend the typed Zod allowlist in `src/main/telemetryEvents.ts` at
this same host boundary. Unknown events and invalid payloads are dropped; unknown
properties are stripped. Caller fields cannot override identity, environment,
version, or SDK controls. Activity/outcome/settings fields admit no free text.
Explicit diagnostic text passes targeted sanitization and public-output redaction
checks described below; no whole errors, headers, logs or configurations are sent.

## Transport and counting limits

The Node SDK uses memory only, at most 100 queued events, batches of 20, a five
second flush interval, two second requests and one retry after one second.
Compression is disabled for these small events. Normal shutdown allows at most
three seconds for best-effort delivery, then aborts active requests and permanently
closes that SDK instance's outgoing gate. Transport failures never become remote
diagnostics. Exception autocapture, application log export and AI instrumentation
are disabled, as required by the approved PRD.

SDK `disable()` alone does not clear queued data in the selected SDK. Opt-out
therefore retires the entire instance: close its per-instance outgoing gate, abort
requests, disable capture, drain/discard its memory through the closed gate, and
drop ownership. A fresh instance is created only for new events after re-enable.
Old queues/retries cannot send through it. Already transmitted requests cannot be
recalled. No disabled-period events are accumulated or replayed.

Count distinct installation identities in a period, never startup records. A
running installation is not evidence of successful Slack use. Multiple profiles or
devices count separately; deleting a profile may create a new identity. Offline
periods, full queues and abrupt termination can lose events. This is no audit log.

## Packaged real-ingestion verification

Ordinary `npm test` uses fake PostHog transport. `npm run package:smoke` creates
temporary installers and a temporary profile with no Slack tokens and collection
disabled. It checks actual host/preload IPC, persistent opt-out, diagnostic ID,
packaged dependencies, updater configuration and the existing renderer behavior.

For the one explicitly authorized real-ingestion run, supply the verified public
host/token and set `SLACK_STATUS_BOT_POSTHOG_INGESTION_TEST=1` when running the same
package smoke. Set the build environment to production to verify that the test
launcher explicitly overrides a packaged production configuration to test. Set
`SLACK_STATUS_BOT_POSTHOG_TEST_RESULT` to a temporary JSON output path. The test
profile is temporary, has no Slack tokens and performs no live status changes.
By default only startup activity is sent; the test waits for the asynchronous batch and then
disables collection through real IPC. The report contains the diagnostic ID,
`distinct_id`, environment, actual app version and time window, with ingestion
explicitly marked pending remote verification.

The parent loads `/private/tmp/slack-posthog-implementation/capture-config.json`
without printing its token, invokes that command, and queries the existing project
via the prescribed PostHog CLI workflow for the reported `distinct_id`. Confirm
`app_activity`, `reason=startup`, `environment=test`, version and production-view
exclusion remotely. Packaging or a successful HTTP request alone does not establish
ingestion. Parent verified actual event retention on 2026-11-16: no project/organization
override, default and current plan maximum 24 months, no active query-retention
restriction. Session recording retention is a different setting. The earlier
packaged startup and manual diagnostic scenarios were remotely observed as test
traffic. Final dashboard-level exclusion remains part of the dashboard setup.

Official references: [Node SDK](https://posthog.com/docs/libraries/node),
[SDK reference](https://posthog.com/docs/libraries/node/reference).

## Manual delivery and shared diagnostics

`src/main/telemetryEvents.ts` is the typed event allowlist. `status_operation`
records one completed logical manual action, with fixed `action` (online, away,
focus, meeting, break, holiday, travel, sick, remeet, dog, custom, external), `entry_point` (dashboard, tray,
external, unknown), `operation_id`, `trigger`, safe meeting-DND/protection flags,
custom-status count, host-observed `autostart_enabled` when available, `targeted_workspaces`, `successful_workspaces`, and
`workspace_results`. Each workspace has a random process-local `connection_ref`
and separate profile/presence/DND results. Arbitrary configured IDs map to custom;
no arbitrary label, emoji, text, or holiday date is sent. References survive
connection reordering in the same service instance; replacement credentials or
restarting the service may create new references. They identify neither Slack
accounts nor people.

A successful workspace completed every requested sub-operation. `success` means
all targets completed; `partial` means at least one sub-operation succeeded but
full delivery did not; `failed` means none succeeded or an unexpected exception
escaped; `skipped` means no request was planned. `skipped` in a workspace result
means that sub-operation was not requested or was deferred by retry-after. The
associated `slack_request.reason=rate_limit_backoff` distinguishes deferral.
An invalid action targets zero workspaces. A UI state-change event is never used
as delivery evidence. These outcomes describe API acknowledgements and the
existing verification/retry behavior, not a guarantee against later Slack edits.

`slack_request` records each mutating Slack attempt (or explicit backoff), using
`step`, `result`, `reason`, duration, attempt and the same operation/connection
references. Verification and catch-up retries keep the original operation ID;
they do not emit another usage event. Counts on the original operation remain its
completion-time snapshot. A later successful request/recovery describes catch-up.
Count `status_operation`, never `slack_request`, for user action usage.

`settings_changed` records successful autostart changes as a boolean and custom
status save/reset as a count and reset flag. Manual operations include current
meeting-DND, protected-status and custom-status-count context even when defaults
have never been changed. The host reads autostart once and refreshes that bounded
context after successful settings changes; an unavailable OS setting stays absent. Source-specific settings and automatic operations belong
to the automatic-source integration.

`HostTelemetry.reportDiagnostic(error, context, sensitiveValues?)` extracts only
allowlisted technical cause fields. `context` identifies a fixed component and
step, optional random connection/operation references, timing/attempt and fatal
classification. The Slack boundary supplies token and current status values for
redaction across all sub-operations. Future connection/source callers must supply
known credentials and private text explicitly; never pass raw stdout or whole
HTTP payloads as context. Structured code, HTTP status, network code, timeout,
retry-after, rate-limit and provided/needed scope names remain when available.
Messages remove recognizable secrets, authorization/cookie fields, OAuth values,
URLs, emails, Slack IDs, dates, status/music fields, known sensitive values and
personal paths. Stack frames retain only relative application code locations.
This is targeted sanitization, not a claim that arbitrary free text is safe.

Each exception frame includes the SDK's unknown-function marker `?`, which the
ingestion service requires even when no safe function name is retained. Matching
packaged source maps are read through Electron's archive-aware filesystem before
retaining only the original relative filename and position. Native Node stack
mapping alone does not reliably resolve maps inside an app archive. Missing maps
keep the safe generated location; source text and code context are not sent.

The first failure enqueues a PostHog `$exception` with a sanitized exception list,
Node frame platform, severity and a fixed SHA-256 fingerprint. Local episodes are
separate by environment, component, step, technical cause/location and connection
reference. Server grouping uses cause/environment without installation-specific
connection references. At most 100 episodes remain in memory. Repetitions emit
`diagnostic_summary` every 60 seconds only when more failures occurred; the SDK
may add its normal five-second batch delay. `occurrence_count` is cumulative for
the episode, not an interval delta. `first_seen`/`last_seen` and
`first_operation_id`/`last_operation_id` retain its endpoints. To count frequency,
use the greatest observed count per episode, not the sum of cumulative summaries.
Eviction, restart, opt-out and abrupt shutdown can lose unsent counts.

Call `recoverDiagnostic({component, step, connection_ref?, operation_id?})` only
following actual success of the affected operation/component. It closes matching
cause episodes with final count and `recovery_operation_id`. Inactivity, source
disablement and app shutdown never imply recovery. This is the shared path for
source and connection diagnostics. Opt-out clears episodes and retires the
capture epoch, so in-flight/retained operation links and disabled-period attempts
cannot reappear after re-enable. SDK buffer clearing remains unchanged. No raw
global exception handler is installed; explicit observation preserves existing
return values and thrown errors. Callers still own their fatal/nonfatal policy.

## Original source stacks and diagnostic ingestion

Host builds produce source maps with embedded original sources; packaged apps
include the maps and enable Node source-map resolution before diagnostics, with
archive-aware lookup for frames that native resolution misses. Sanitization
retains `src/...ts:line:column` when a matching map is available, or safe
`dist/...js` locations otherwise. It drops dependency frames and machine paths.
The packaged diagnostic scenario reports and checks the actual mapped frame.
Release artifacts must preserve matching JS/maps from
the same build. No source-map upload, administrative token or remote source-code
context is added by this slice. A packaged test on 2026-11-16 was observed in
native Error Tracking with resolved TypeScript frames and no ingestion errors.
If remote unminification/code context
is desired for unmapped frames, the release pipeline needs matching source-map
artifact upload per the official Node source-map instructions.

The existing packaged test accepts the additional flag
`SLACK_STATUS_BOT_POSTHOG_DIAGNOSTIC_TEST=1` together with the explicit ingestion
flag. It requires `environment=test`, an empty temporary profile, and replaces
**every** synthetic Slack request with an in-process Axios adapter. It never
starts source polling or writes live Slack state. The compiled scenario performs
two partial meeting actions, waits for the real 60-second summary interval, then
performs a successful action that recovers the affected API step. The report adds
expected event names, cause, occurrence count, original-source frame and time
window. The same capture ID identifies activity and diagnostics. Normal package
smoke leaves this optional ingestion path off.

Parent verification must observe actual `status_operation` success/partial,
`$exception` with useful original-source frames, `diagnostic_summary` count 2,
`diagnostic_recovered`, operation linkage and environment=test in project 352472.
The 2026-11-16 packaged test confirmed these records and native Error Tracking
rendering. Final production-dashboard exclusion remains external acceptance.
No live Slack mutation is required.
