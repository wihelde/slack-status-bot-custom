import { z } from 'zod';

const slackFailure = z.object({ error: z.string().regex(/^[a-z0-9_]{1,80}$/).optional(),
  needed: z.string().optional(), provided: z.string().optional() });

/** Retain technical response fields without retaining the credential-bearing response body. */
export function slackAuthorizationError(response: Response | undefined, data: unknown, fallback: string) {
  const parsed = slackFailure.safeParse(data);
  const fields = parsed.success ? parsed.data : {};
  return Object.assign(new Error(fields.error ?? fallback), { response: {
    status: response?.status,
    headers: { 'retry-after': response?.headers?.get('Retry-After') ?? undefined },
    data: fields,
  } });
}

/** JSON parser messages can quote credential-bearing bodies; preserve the failure category and status. */
export async function readSlackAuthorizationResponse(response: Response): Promise<unknown> {
  try { return await response.json(); }
  catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    if (!response.ok) return {};
    throw slackAuthorizationError(response, { error: 'invalid_json' }, 'Invalid Slack JSON response');
  }
}
