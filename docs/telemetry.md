# Usage collection and diagnostics

The Electron main process owns the only PostHog client. Collection defaults to on
for new and existing profiles. Settings → Automation contains one persistent
usage/diagnostic switch and a copyable diagnostic ID. Disabling discards pending
records and diagnostic episodes. It does not delete already ingested data.

## Configuration and checks

Use the existing Slack Status Bot EU project **352472**. Export public capture
configuration directly in an ignored local `.envrc` or shell, then run `direnv allow`
if using direnv. Never put a personal/administrative API key in the app or a build.

```sh
export SLACK_STATUS_BOT_TELEMETRY_ENVIRONMENT=development
export SLACK_STATUS_BOT_POSTHOG_HOST=https://eu.i.posthog.com
export SLACK_STATUS_BOT_POSTHOG_TOKEN=phc_REPLACE_WITH_VERIFIED_PUBLIC_CAPTURE_TOKEN
npm ci
npm test
npm run host:smoke
npm run dev
```

Use the repository's npm version, **12.2.1**. `host:build` and `host:watch` default
to development and write ignored `dist/telemetry-config.json`. `electron-build`
explicitly selects production. SDK dependencies and matching JavaScript/source
maps are packaged. Runtime variables override bundled values. `NODE_ENV` and
packaging alone never select production. Missing/invalid capture configuration is
a locally warned no-op; invalid environments never fall back to production. The
builder rejects invalid environments and non-public tokens.

Normal tests substitute external Slack/PostHog responses and run offline. The
ordinary package smoke builds temporary installers, starts a temporary profile
with collection disabled, and verifies host/preload IPC, preferences, dependencies,
source maps, updater metadata and renderer behavior.

For an explicitly authorized ingestion check, load the verified **public** capture
configuration first, then reuse that same package test. Both build and runtime
must be test. This sends only safe synthetic activity and diagnostics to PostHog;
all Slack/browser responses are injected and the real daemon stays stopped.

```sh
SLACK_STATUS_BOT_TELEMETRY_ENVIRONMENT=test \
SLACK_STATUS_BOT_POSTHOG_INGESTION_TEST=1 \
SLACK_STATUS_BOT_POSTHOG_DIAGNOSTIC_TEST=1 \
SLACK_STATUS_BOT_POSTHOG_CONNECTION_TEST=1 \
SLACK_STATUS_BOT_POSTHOG_TEST_RESULT=/tmp/slack-status-bot-ingestion.json \
npm run package:smoke
```

The diagnostic and connection scenarios share one isolated installation. They
exercise setup, cancellation, permission failure, Reconnect, restoration, renewal,
partial/complete delivery and count-two diagnostic recovery. The automatic-source
scenario (`src/main/automaticScenario.ts`) separately injects all source commands
and Slack requests, including protected skips and a genuine synthetic command
failure. Each scenario requires test collection and a fresh temporary profile.
Package success or HTTP acceptance alone does not establish remote ingestion:
query the reported `distinct_id`, environment, version and time window in PostHog.

## Events and interpretation

Every record receives trusted `environment=production|development|test`,
`app_version`, OS/platform/architecture, `$process_person_profile=false` and
`$geoip_disable=true`. Identity is `<environment>:<random installation UUID>`.
The UUID persists across restarts/upgrades and is exposed without its environment
prefix in Settings. There is no identify/alias, named-person profile, Slack
identity linkage, hardware identity, host name or renderer SDK.

| Event | Interpretation |
| --- | --- |
| `app_activity` | Startup and every 24 hours while running, independently of window visibility and Slack use |
| `connection_started` | Valid Setup Link or Settings Reconnect; random operation/ref and `flow=setup|reconnect` |
| `connection_completed` | Verified and securely persisted success, technical failure or cancellation, with fixed step/reason |
| `connections_restored` | Once per existing-store lifetime; counts connected/unverified/authorization-required entries, never new onboarding |
| `connection_renewal` | Authorization maintenance attempt: renewed, retrying or reconnect_required |
| `status_operation` | One completed logical manual, automatic or correction action, including actual delivery/skip outcome |
| `slack_request` | Individual mutating request/backoff, with step, attempt, result and shared operation/ref; never a usage count |
| `settings_changed` | Successfully persisted structural source, priority, meeting-DND, autostart or custom-status change |
| `$exception` | First sanitized diagnostic record of a local failure episode, accepted by native Error Tracking |
| `diagnostic_summary` | Changed episode's cumulative count, at most once per 60 seconds plus SDK batching |
| `diagnostic_recovered` | Final cumulative count after actual success at the affected step/ref |

Count **distinct installation identities**, not startup events or people. Activity
is separate from successful use. New onboarding requires `connection_completed`
with **flow=setup AND outcome=success AND replaced_existing=false**. A Setup Link
can replace an existing workspace. Reconnect and restoration are separate.
`first_connection` only means the local store was empty, not a person's first use.
Unmatched callbacks cannot safely complete a known attempt; browser closure,
shutdown or event loss can leave a start without completion.

A `status_operation` identifies its fixed action/source/entry point, operation ID,
targeted/successful workspace counts and per-workspace profile/presence/DND
results. Complete delivery is `success`; some delivered parts is `partial`; no
successful part or an escaped error is `failed`; no request planned is `skipped`.
Skipped sub-operations can mean unrequested or retry-after deferral. Logical action
counts never include `slack_request` retries. Later catch-up retains the original
operation ID and does not rewrite its completion-time outcome.

Manual categories include Online, Away, Focus, Meeting, Break, Holiday, Travel,
Sick, Remeet, Dog, custom and `external` for External Status Commands. Arbitrary
configured IDs map to custom. Sources are `spotify|appleMusic|youtubeMusic|zoom|teams|huddle`.
Automatic transitions/priority decisions and actual correction resets share the
operation path. A departing source remains context on a reset; it is not new
source activation. Protected, unchanged, cooldown, priority and missing-profile
skips are decisions, not exceptions. Unchanged polling stays quiet.

`enabled_sources`, `source_priority`, `meeting_dnd` and `custom_status_count` are
current structural configuration, rebuilt at the host boundary even for unchanged
defaults/activity. They are **not source usage**. Available autostart state is
host-observed. `active_sources`, winner, bounded source transitions, rule reason,
protection/user ownership and correction reason explain decisions without status
or music contents. Status protection and explicit command authority are unchanged.

## Diagnostic episodes, privacy and stacks

`HostTelemetry.reportDiagnostic` extracts only allowlisted technical causes before
Slack/OAuth/probe code reduces them to generic results. Component, named step,
code/message, HTTP/network/OS code, scopes, timeout, duration, attempt and retry
context remain when available. `recoverDiagnostic` closes only the affected
component/step/connection following real success. Inactive/disabled sources,
cancellation, shutdown and unrelated successful steps never imply recovery.

Local episodes distinguish environment, component/step, cause/location and random
connection ref. Server error fingerprints omit installation-specific connection
refs, so native issues can group across installations. Local refs rotate with a
process/store or credential replacement; they are not Slack IDs. Delivery refs
and connection-lifecycle refs are independent. At most 100 episodes are retained
in memory. **Frequency is MAX cumulative occurrence_count per installation,
environment and episode, then SUM across episodes**, never a sum of cumulative
summaries or native first-exception counts. Local recovery does not resolve a
shared native Error Tracking issue globally.

Probe diagnostics retain source, fixed step, command/parse/detector classification,
exit code/signal and known safe technical messages. Missing apps/processes,
expected no-match, paused/empty Now Playing and AppleScript -600 are inactivity.
Recovery requires that probe to succeed with an active source. Unknown stderr,
stdout, process lists and parser excerpts are withheld.

The single typed Zod allowlist in `src/main/telemetryEvents.ts` drops invalid
payloads and strips unknown fields. Trusted metadata is rebuilt at SDK output.
Known private values receive targeted redaction. No Slack tokens, OAuth values, callback
or Setup Links, Slack identities, personal paths, status/song text, holiday dates,
whole errors/configs/HTTP bodies/headers, application logs or source-code context
are uploaded. This is targeted sanitization, not a guarantee that arbitrary free
text is safe. Automatic exception capture, replay and log export are disabled.

Exception frames include the required Node platform and `function='?'` marker.
Matching source maps are read through Electron's archive-aware filesystem to retain
only original relative TypeScript locations. Missing maps leave safe generated
locations. Preserve JavaScript/maps from the same build. Real packaged records
were verified in native Error Tracking with original TS frames on 2026-11-16.
Remote source-code context/unminification for unmapped frames would require a
separate release-artifact upload; it is not configured here.

## Views, retention and limits

The delivered production and development/test dashboards, exact definitions,
query semantics and maintenance commands are in [posthog/README.md](posthog/README.md).
Every production constituent independently guards production, including under a
conflicting dashboard environment selection. Synthetic records
were observed in the test view and excluded with dashboard filters removed.

Verified on **2026-11-16**: no project/organization events-retention override;
default and current plan maximum **24 months**; no active query-retention
restriction. Existing settings were read, never changed. This is event retention,
not session-recording retention. No separate diagnostic TTL or deletion service
is configured. Recheck plan/retention metadata if these limits change.

The SDK has a memory queue of 100, batches of 20, five-second flushing,
two-second requests and one retry after one second. Normal shutdown permits at
most three seconds, then aborts requests. Telemetry failures stay local and cannot
fail automation. Opt-out retires the SDK instance, closes its fetch gate, aborts
requests, discards buffers/episodes and invalidates in-flight capture epochs.
SDK `disable()` alone is insufficient to discard its queue. Re-enable starts fresh
on the next event; disabled-period work never replays. Already sent requests
cannot be recalled.

Opted-out installations are invisible. Multiple profiles/devices count separately;
deleting a profile can create another identity. Offline/full-buffer loss, episode
eviction, abrupt termination, false detections and later Slack edits limit the
observed picture. This is neither an audit journal nor proof of unique people,
complete delivery, crash coverage or a guaranteed explanation of every failure.
