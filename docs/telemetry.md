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
`getSettings`, `setEnabled` and bounded `shutdown`. Call `start` once during host
startup, independently of window visibility and the Slack daemon. The current
allowlist contains one event:

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

Later slices must extend the typed Zod event allowlist at this same host boundary.
Unknown events and invalid payloads are dropped; unknown properties are stripped.
Caller fields cannot override identity, environment, version, or SDK controls.
Current events admit no free text at all, so status/song text, credentials, paths,
raw errors, headers, configuration and logs cannot leave through them. Diagnostic
text schemas added in the diagnostic slice must perform targeted sanitization and
receive representative public-output redaction tests before admitting text. Do not
use passthrough schemas or send whole error/request/response objects. Diagnostic
aggregation added later must clear its state on this same host opt-out boundary.

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
profile is temporary, has no Slack tokens and performs no status changes. Only a
startup activity event is sent; the test waits for the asynchronous batch and then
disables collection through real IPC. The report contains the diagnostic ID,
`distinct_id`, environment, actual app version and time window, with ingestion
explicitly marked pending remote verification.

The parent loads `/private/tmp/slack-posthog-implementation/capture-config.json`
without printing its token, invokes that command, and queries the existing project
via the prescribed PostHog CLI workflow for the reported `distinct_id`. Confirm
`app_activity`, `reason=startup`, `environment=test`, version and production-view
exclusion remotely. Packaging or a successful HTTP request alone does not establish
ingestion. Actual event retention must be read from the account metadata; session
recording retention is a different setting. No retention value is claimed here.

Official references: [Node SDK](https://posthog.com/docs/libraries/node),
[SDK reference](https://posthog.com/docs/libraries/node/reference).
