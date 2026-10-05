import { randomUUID } from 'node:crypto';
import type { RequestHandler } from './$types';
import { markUserAuthRevoked } from '$lib/db/user';
import { verifyBackChannelLogoutToken } from '$lib/utils/auth/sign-in-back-channel.server';

/**
 * Receives provider back-channel logout notifications and revokes the matching user session.
 *
 * Accepts either form-encoded or JSON payloads containing a `logout_token` JWT.
 *
 * @param event - SvelteKit request event containing the inbound logout request.
 * @returns HTTP 204 when revocation succeeds, otherwise an error response.
 */
export const POST: RequestHandler = async ({ request }) => {
  const evidenceLoggingEnabled = (process.env.OIDC_AUTH_EVIDENCE_LOGGING ?? '').toLowerCase() === 'true';
  const contentType = request.headers.get('content-type') ?? '';
  const requestCorrelationId = randomUUID();
  const evidenceContext = {
    correlationId: requestCorrelationId,
    endpointCategory: 'back_channel_logout',
  };

  if (evidenceLoggingEnabled) {
    console.info('[auth/back-channel-logout-evidence] request_received', {
      ...evidenceContext,
      method: request.method,
      path: new URL(request.url).pathname,
      contentType: contentType || null,
      contentLength: request.headers.get('content-length'),
    });
  }

  const logoutToken = contentType.includes('application/json')
    ? String(((await request.json()) as { logout_token?: string }).logout_token ?? '').trim()
    : String((await request.formData()).get('logout_token') ?? '').trim();

  if (!logoutToken) {
    if (evidenceLoggingEnabled) {
      console.warn('[auth/back-channel-logout-evidence] rejected', {
        ...evidenceContext,
        reason: 'missing_logout_token',
        contentType: contentType || null,
      });
    }
    return new Response('Missing logout_token', { status: 400 });
  }

  const token = await verifyBackChannelLogoutToken(logoutToken);
  if (!token?.sub || !token.jti) {
    if (evidenceLoggingEnabled) {
      console.warn('[auth/back-channel-logout-evidence] rejected', {
        ...evidenceContext,
        reason: 'missing_required_sub_or_jti',
        hasSub: Boolean(token?.sub),
        hasJti: Boolean(token?.jti),
      });
    }
    return new Response('Invalid logout_token', { status: 400 });
  }

  // Use provider iat when present; fallback keeps revocation monotonic if a malformed token slips through.
  const revokedAt = token.iat ?? Math.floor(Date.now() / 1000);
  const stored = await markUserAuthRevoked(token.sub, revokedAt, token.jti, token.sid);
  if (stored === 'replayed') {
    // Treat replays as idempotent success so provider retries do not fail noisily.
    return new Response(null, { status: 204 });
  }

  if (stored !== 'stored') {
    if (evidenceLoggingEnabled) {
      console.error('[auth/back-channel-logout-evidence] revocation_store_failed', {
        ...evidenceContext,
        sidPresent: Boolean(token.sid),
      });
    }
    return new Response('Unable to revoke session', { status: 500 });
  }

  return new Response(null, { status: 204 });
};
