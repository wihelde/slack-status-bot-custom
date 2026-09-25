# ADR-004: Authorize workspace connections in the desktop app

**Status:** Accepted  
**Date:** 2026-09-25

Use Slack OAuth with PKCE in the Electron app, with the system browser for consent and the app's existing URI scheme for callbacks. Martin maintains a separate Slack app registration per workspace and distributes reusable setup links containing registration identifiers. Users do not handle client IDs or tokens; the desktop flow needs neither the existing token website nor a new authentication backend.

Keep at most one connection per workspace. Authorization and renewal replace only that workspace's credentials, while status automation remains shared across all connected workspaces. This separates the scope of authorization from the intended shared status behavior.

This choice avoids operating an authentication service or embedding a client secret, but requires secure local credential storage and token renewal in the desktop app. Slack's PKCE setting cannot be disabled without Slack support, and prolonged inactivity can require fresh authorization. Enable it on intended registrations only after validating the new flow with a test registration. Website retirement is outside this decision.

See the [implementation specification](../native-slack-oauth-spec.md), the [design interview record](../oauth-design.md), and [Slack PKCE documentation](https://docs.slack.dev/authentication/using-pkce/).
