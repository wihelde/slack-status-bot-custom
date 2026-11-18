import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { SourceMap } from 'node:module';
import { z } from 'zod';

const sourceMapPayload = z.object({ version: z.literal(3), file: z.string().default(''),
  sourceRoot: z.string().default(''), sources: z.array(z.string()),
  sourcesContent: z.array(z.string()).default([]), names: z.array(z.string()).default([]), mappings: z.string() });
const applicationMaps = new Map<string, SourceMap>();

/** Electron's archive-aware fs can read maps that native Node stack resolution misses. */
function applicationSourceMap(filename: string) {
  if (applicationMaps.has(filename)) return applicationMaps.get(filename);
  try {
    const payload = sourceMapPayload.parse(JSON.parse(fs.readFileSync(path.resolve(__dirname, '../..', `${filename}.map`), 'utf8')));
    const map = new SourceMap(payload);
    applicationMaps.set(filename, map);
    return map;
  } catch {
    // A missing map keeps the safe generated location; diagnostics must still work.
    return undefined;
  }
}

/** Redact known operation contents first, then recognizable secrets and personal data. */
export function sanitizeDiagnosticText(value: string, sensitive: readonly string[] = []): string {
  let text = value;
  for (const secret of [...sensitive].filter(Boolean).sort((a, b) => b.length - a.length)) {
    text = text.split(secret).join('[redacted]');
  }
  return text
    .replace(/(?:Bearer|Basic)\s+[^\s,;"'}]+/gi, '[credential]')
    .replace(/(?:xox[a-z]-|xapp-|ph[xcp]_|sk-)[a-zA-Z0-9_-]+/g, '[credential]')
    .replace(/(["']?(?:authorization|cookie|set-cookie|access_token|refresh_token|client_secret|code_verifier|code|state|token|status_text|status_emoji|song|artist|title|returnDate)["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\n]*)/gi, '$1[redacted]')
    .replace(/[a-z][a-z0-9+.-]*:\/\/[^\s)]+/gi, '[url]')
    .replace(/(?:[A-Z]:\\|\/)(?:[^\s():]+[\\/])+[^\s():]*/g, '[path]')
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[email]')
    .replace(/\b[UTWCDB][A-Z0-9]{8,}\b/g, '[slack-id]')
    .replace(/\b(?:\d{1,2}\.\d{1,2}\.\d{4}|\d{4}-\d{2}-\d{2})\b/g, '[date]')
    .slice(0, 1000);
}

/** Keep code locations without machine/user paths, stack messages or arbitrary process output. */
export function sanitizedFrames(stack: string | undefined) {
  return (stack?.split('\n').slice(0, 31) ?? []).flatMap(line => {
    if (line.includes('/node_modules/') || line.includes('\\node_modules\\')) return [];
    const match = line.match(/(?:^|[/\\\s])((?:src|dist|build)[/\\][a-zA-Z0-9_./\\-]+\.[cm]?[jt]sx?):(\d+):(\d+)\)?$/);
    if (!match) return [];
    const frame = { filename: match[1].replaceAll('\\', '/'), lineno: Number(match[2]), colno: Number(match[3]), in_app: true };
    if (frame.filename.split('/').includes('..') || !Number.isSafeInteger(frame.lineno) || !Number.isSafeInteger(frame.colno)) return [];
    if (frame.filename.startsWith('dist/') || frame.filename.startsWith('build/')) {
      const origin = applicationSourceMap(frame.filename)?.findOrigin(frame.lineno, frame.colno);
      if (origin && 'fileName' in origin) {
        const source = origin.fileName.replaceAll('\\', '/').match(/(?:^|\/)(src\/[a-zA-Z0-9_./-]+\.[cm]?[jt]sx?)$/)?.[1];
        if (source && !source.split('/').includes('..')) {
          Object.assign(frame, { filename: source, lineno: origin.lineNumber, colno: origin.columnNumber });
        }
      }
    }
    return [frame];
  });
}

const errorFields = z.object({ name: z.string().optional(),
  cause: z.object({ code: z.string().optional(), message: z.string().optional() }).catch({}).optional(),
  message: z.string().optional(), stack: z.string().optional(),
  code: z.string().optional(), response: z.object({ status: z.number().optional(),
    headers: z.object({ 'retry-after': z.union([z.string(), z.number()]).optional() }).optional(),
    data: z.object({ error: z.string().optional(), needed: z.string().optional(), provided: z.string().optional() }).optional(),
  }).optional() });

/** Extract only technical fields, never serialize an Error/Axios response. */
export function diagnosticError(error: unknown, sensitive: readonly string[] = []) {
  const parsed = errorFields.safeParse(error);
  const fields = parsed.success ? parsed.data : {};
  const serviceCode = fields.response?.data?.error;
  const safeCode = serviceCode && /^[a-zA-Z0-9_.:-]{1,80}$/.test(serviceCode) && sanitizeDiagnosticText(serviceCode, sensitive) === serviceCode ? serviceCode : undefined;
  const code = fields.code ?? fields.cause?.code ?? (fields.name === 'TimeoutError' ? 'ETIMEDOUT' : fields.name === 'AbortError' ? 'ABORT_ERR' : undefined);
  const networkCode = code && /^[A-Z0-9_]{1,50}$/.test(code) && sanitizeDiagnosticText(code, sensitive) === code ? code : undefined;
  const message = sanitizeDiagnosticText([fields.message ?? serviceCode ?? 'Unknown technical failure', fields.cause?.message].filter(Boolean).join(': '), sensitive);
  const frames = sanitizedFrames(fields.stack);
  const scopeNames = (value?: string) => value?.split(/[ ,]+/).filter(scope => /^[a-z_.]+:[a-z_.]+$/.test(scope)).slice(0, 30);
  const retry = Number(fields.response?.headers?.['retry-after']);
  return { message, frames,
    stack: frames.length ? `${message}\n${frames.map(frame => `    at ${frame.filename}:${frame.lineno}:${frame.colno}`).join('\n')}` : undefined,
    code: safeCode ?? networkCode,
    network_code: networkCode,
    timeout: networkCode ? ['ECONNABORTED', 'ETIMEDOUT'].includes(networkCode) : undefined,
    http_status: fields.response?.status,
    rate_limited: fields.response?.status === 429 || safeCode === 'ratelimited',
    retry_after_seconds: Number.isFinite(retry) && retry >= 0 ? Math.min(Math.ceil(retry), 1_000_000_000) : undefined,
    needed_scopes: scopeNames(fields.response?.data?.needed),
    provided_scopes: scopeNames(fields.response?.data?.provided),
  };
}

export function diagnosticFingerprint(value: object): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
