import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const environment = process.env.SLACK_STATUS_BOT_TELEMETRY_ENVIRONMENT ?? process.argv[2];
if (!['production', 'development', 'test'].includes(environment)) {
  throw new Error('An explicit production, development or test telemetry environment is required.');
}
// Only the public capture token belongs in desktop artifacts. Never read a CLI/admin API key here.
const config = {
  environment,
  host: process.env.SLACK_STATUS_BOT_POSTHOG_HOST,
  captureToken: process.env.SLACK_STATUS_BOT_POSTHOG_TOKEN,
};
if (config.captureToken && !/^phc_[a-zA-Z0-9_]+$/.test(config.captureToken)) {
  throw new Error('Only a public PostHog project capture token may be bundled.');
}
if (config.host) {
  const url = new URL(config.host);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('The PostHog ingestion host must be an HTTPS origin.');
  }
}
fs.mkdirSync(path.join(appDir, 'dist'), { recursive: true });
fs.writeFileSync(path.join(appDir, 'dist', 'telemetry-config.json'), JSON.stringify(config));
if (!config.host || !config.captureToken) {
  console.warn('[Telemetry] Public host/token not configured; this build will not collect events.');
}
