# PostHog overview maintenance

One existing EU project, **352472**, contains both views. The production starter
keeps the prescribed `Analytics basics (wizard)` name and `wizard` tag. Each saved
insight also keeps `(wizard)` and that tag. Development/test insight names have an
additional prefix to distinguish them in the project-wide list.

[Production overview](https://eu.posthog.com/project/352472/dashboard/1120662) ·
[Development/test view](https://eu.posthog.com/project/352472/dashboard/1120679).
Deployed IDs and exact returned URLs are in [deployed.json](deployed.json). The complete desired
payloads are [production.json](production.json) and
[development-test.json](development-test.json). These are normal CLI payloads plus
local `key` identifiers for matching an insight to its deployed ID. No credentials,
application capture token or personal profiles belong here.

## Reading the views

| Area | Meaning |
| --- | --- |
| Active installations / complete delivery | Daily distinct IDs, separated from actual successful use |
| Returning activity / successful use | Native weekly recurring retention, eight intervals; later incomplete intervals are not churn |
| Setup → successful use | Native ordered installation-level funnel within 14 days: setup start → new saved setup → first subsequent complete delivery |
| Setup / Reconnect / restoration | Separate logical counts; new setup requires flow=setup, outcome=success, replaced_existing=false |
| Connection outcomes / renewal | Cancellation and failed steps; renewal retry/renewed/Reconnect required is maintenance |
| Sources / manual actions | Logical status_operation records by actual outcome; external identifies External Status Commands |
| Delivery / workspaces | Complete, partial, failed and skipped; targeted versus fully delivered workspace totals |
| Settings / enabled sources | Structural changes versus latest observed configuration, separate from source use |
| Failure frequency / episodes | MAX cumulative count per installation/environment/episode, summed across episodes; actual local recovery and diagnostic references |
| Native first exceptions | Captured $exception records by code/step/version, not recurrence frequency |

Activity does not imply successful delivery. Retries never inflate action counts.
Funnel steps belong to an installation, not an individual attempt or workspace;
several attempts can precede a successful new connection. The last funnel step is
the first qualifying use after setup in its window, not necessarily the first-ever
operation. Reconnect/restoration do not create new setup conversions. Weekly
retention cohorts require elapsed weeks before sustained use can be assessed.

Native queries handle activity, retention, funnels and categorical counts/sums.
Only latest-configuration and diagnostic-episode aggregation use SQL. The latest
configuration is selected per installation from events **within the selected
window**. Six fixed source categories include zeros; installations without a
configuration-bearing record are absent. SQL explicitly decodes PostHog's stored
JSON-string array before checking source membership.

Episode frequency is the greatest cumulative count found in the selected records.
It can include failures from before the window; it is not an interval delta.
Missing recovery can mean ongoing failure or lost data. The detail table shows up
to 500 latest episodes, including component/step/cause/version, environment,
installation/connection refs, operation IDs, native issue ID and local recovery.
A native issue can remain active after one installation recovers. Do not globally
resolve an issue merely because a local recovery appeared.

Every native production series/retention entity has both a visible environment
filter and a HogQL property guard. PostHog can replace a series filter when a
dashboard selects that same property. The additional guard remains in place even
under a conflicting dashboard environment selection; this was checked against
actual test records. The analysis still uses native query nodes, not SQL charts.
Every production SQL query has a literal production predicate in addition to
`{filters}`. Removing or replacing dashboard environment filters therefore does not expose test data. The
other dashboard independently admits only `development` and `test`; narrow its
environment filter to either one. All constituents explicitly set
`filterTestAccounts=false`, so the project's separate cohort default cannot hide
safe test fixtures or silently alter the production measure. Environment is the
boundary here. App-version/OS/diagnostic filters can be added for investigations.

Dashboard dates default to 30 days and override native insight dates. Standalone
retention insights default to eight weeks. SQL `{filters}` follows the date picker
and environment/version/diagnostic filters. A development-only selection should be
empty until actual development events exist. No synthetic production events were
created to fill the production view.

## Read back or update through the CLI

Use the authenticated EU `posthog-cli` normally. Before an account session, load
`posthog-cli api --agent-help`, run `posthog-cli api skill list`, and install/read
matching helpers outside this repository. Consult the complete metric catalog
before metric queries, discover actual event schemas/values, and read/drill down
any tool schema with hints. Do not infer schema absence from a stale taxonomy
snapshot; inspect known safe ingested records using confirmed event-table columns.

```sh
export POSTHOG_CLI_PROJECT_ID=352472
posthog-cli api info dashboard-get
posthog-cli api info insight-get
posthog-cli api info insight-query
posthog-cli api info dashboard-insights-run
posthog-cli api call dashboard-get "$(jq '{id: .production.dashboard.id}' docs/posthog/deployed.json)"
posthog-cli api call --json dashboard-insights-run "$(jq '{id: .production.dashboard.id, refresh: "force_blocking", filters_override: {properties: [], filterTestAccounts: false}}' docs/posthog/deployed.json)"
```

The dashboard-insights-run command deliberately removes dashboard property filters to check the
independent production predicates. For one saved insight, use its numeric `id` or
`short_id` from the manifest with `insight-get` / `insight-query`.

After a deliberately reviewed definition change, update the existing insight
instead of duplicating dashboards. For example, construct the full activity
payload, validate it, then apply and run the saved query:

```sh
posthog-cli api info insight-update
jq --slurpfile deployed docs/posthog/deployed.json '
  .insights[] | select(.key == "activity") |
  {id: $deployed[0].production.insights.activity.id, name, description, query, tags}
' docs/posthog/production.json > /tmp/posthog-insight-update.json
posthog-cli api call --dry-run insight-update "$(cat /tmp/posthog-insight-update.json)"
posthog-cli api call insight-update "$(cat /tmp/posthog-insight-update.json)"
posthog-cli api call --json insight-query "$(jq '{insightId: .id}' /tmp/posthog-insight-update.json)"
```

To rebuild after an authorized deletion, dry-run/create `.dashboard`, attach each
`.insights[] | del(.key)` with `dashboards: [returned_id]`, read back tile IDs, then
apply the manifest's `layouts.sm`/groups and definition's `.filters` with
`dashboard-update`. Dry-run each exact mutation first and replace the manifest
with the returned IDs/URLs. This is a manual maintenance procedure, not a startup
migration; ordinary app/tests never call administrative APIs.

Native Error Tracking can be read without changing issue state:

```sh
posthog-cli api info query-error-tracking-issues-list
posthog-cli api call --json query-error-tracking-issues-list "$(cat docs/posthog/error-tracking-production.json)"
posthog-cli api call --json query-error-tracking-issues-list "$(cat docs/posthog/error-tracking-development-test.json)"
```

These requests select all issue states and explicit environments. Do not mistake
native `occurrences` for the app's cumulative repeated-failure count.

## Verified delivery and limits

On 2026-11-16 the existing packaged path ran version **2.3.4**, test build and test
runtime, under diagnostic ID `d86be956-12e5-4e0e-a04d-cdd41a0038b1` (12:48:52–12:50:09 UTC).
Remote records confirmed activity, one new setup, cancellation/two failed setups,
Reconnect, one restored snapshot, renewal retry/retry/renewed/Reconnect required,
manual partial/partial/success, two count-two summaries and three count-two recoveries.
All Slack/browser adapters were injected; no live status/source/authorization was
changed. Earlier source fixture `test:67eb8a26-9f08-4c43-9b48-8d4a6ab60262`
confirmed automatic partial/success/protected-skip, enabled Zoom, safe exit-2/SIGTERM
probe failure and count-two actual recovery. Native issues have original TS frames.
The saved-query readback verifies inclusion/exclusion independently of titles.

Existing events retention is **24 months**, with no project/organization override
and a current plan maximum of 24 months, verified 2026-11-16. Query retention is
unrestricted at that check. No settings or retention were changed. No public
sharing is enabled. Installation counts are not people; opt-out, offline/buffer
loss, process termination, episode eviction and false detections limit analysis.
No released production adoption or multi-week retention is claimed by these safe
test fixtures. See [telemetry.md](../telemetry.md) for transport, privacy and opt-out.
