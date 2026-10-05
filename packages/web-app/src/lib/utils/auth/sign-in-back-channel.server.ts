import { createHash, randomUUID } from 'node:crypto';
import { decodeBase64UrlJson } from '$lib/utils/auth/base64url';
import { splitJwt } from '$lib/utils/auth/jwt';
import { verifyJwtSignatureWithJwks } from '$lib/utils/auth/jwt-signature.server';
import { getAudienceValues, hasNumericIat, hasValidExp, issuerMatches } from '$lib/utils/auth/oidc-claims.server';
import { getOidcMinimalConfigOrFail, resolveVerifiedDiscovery } from '$lib/utils/auth/oidc.server';
import type { JwtHeader } from '$lib/utils/auth/jwt-types';

const BACK_CHANNEL_LOGOUT_EVENT = 'http://schemas.openid.net/event/backchannel-logout';

function getEvidenceFingerprint(value: string | undefined): string | null {
  return value ? createHash('sha256').update(value).digest('base64url') : null;
}

/**
 * Back-channel logout token claims used by logout notification verification.
 */
export type BackChannelLogoutTokenPayload = {
  iss?: string;
  sub?: string;
  aud?: string | string[];
  exp?: number;
  iat?: number;
  jti?: string;
  sid?: string;
  events?: Record<string, unknown>;
  [key: string]: unknown;
};

/**
 * Verifies a back-channel logout token from the provider.
 *
 * @param logoutToken - JWT logout token from the provider.
 * @returns The validated payload when verification succeeds; otherwise null.
 */
export async function verifyBackChannelLogoutToken(logoutToken: string): Promise<BackChannelLogoutTokenPayload | null> {
  const evidenceCorrelationId = randomUUID();
  const tokenFingerprint = getEvidenceFingerprint(logoutToken);
  const reject = (reason: string, details: Record<string, unknown> = {}): null => {
    if ((process.env.OIDC_AUTH_EVIDENCE_LOGGING ?? '').toLowerCase() === 'true') {
      console.warn('[auth/back-channel-logout-evidence] rejected', {
        correlationId: evidenceCorrelationId,
        endpointCategory: 'back_channel_logout',
        tokenFingerprint,
        reason,
        ...details,
      });
    }
    return null;
  };

  const parts = splitJwt(logoutToken);
  if (!parts) {
    return reject('malformed_jwt');
  }

  const header = decodeBase64UrlJson<JwtHeader>(parts.header);
  const payload = decodeBase64UrlJson<BackChannelLogoutTokenPayload>(parts.payload);
  if (!header || !payload) {
    return reject('decode_failed');
  }

  const oidcConfig = getOidcMinimalConfigOrFail();
  if (!oidcConfig) {
    return reject('missing_oidc_config');
  }
  const { clientId, customDomain } = oidcConfig;

  if (header.alg !== 'RS256') {
    return reject('unsupported_algorithm', { algorithm: header.alg });
  }

  const discovery = await resolveVerifiedDiscovery(customDomain);
  if (!discovery) {
    return reject('discovery_failed');
  }

  if (!issuerMatches(payload.iss, discovery.issuer)) {
    return reject('issuer_mismatch', {
      iss: payload.iss ?? null,
      expectedIssuer: discovery.issuer,
    });
  }

  const audience = getAudienceValues(payload.aud);
  if (!audience.includes(clientId)) {
    return reject('audience_mismatch', { aud: audience, clientId });
  }

  if (!hasValidExp(payload.exp)) {
    return reject('invalid_exp', { exp: payload.exp ?? null });
  }

  if (!hasNumericIat(payload.iat)) {
    return reject('invalid_iat', { iat: payload.iat ?? null });
  }
  if (typeof payload.jti !== 'string' || payload.jti.length === 0) {
    return reject('missing_jti');
  }
  if ('nonce' in payload) {
    return reject('nonce_present');
  }
  if (!payload.events) {
    return reject('missing_events');
  }
  if (!(BACK_CHANNEL_LOGOUT_EVENT in payload.events)) {
    return reject('missing_backchannel_logout_event', { eventTypes: Object.keys(payload.events) });
  }

  const signatureResult = await verifyJwtSignatureWithJwks(header, parts, [discovery.jwksUri]);
  if (!signatureResult.ok) {
    return reject('signature_verification_failed', {
      algorithm: header.alg,
      kid: typeof header.kid === 'string' ? header.kid : null,
      signatureFailure: signatureResult.reason,
    });
  }

  if ((process.env.OIDC_AUTH_EVIDENCE_LOGGING ?? '').toLowerCase() === 'true') {
    console.info('[auth/back-channel-logout-evidence] verified', {
      correlationId: randomUUID(),
      endpointCategory: 'back_channel_logout',
      tokenFingerprint: createHash('sha256').update(logoutToken).digest('base64url'),
      iss: payload.iss,
      aud: audience,
      algorithm: header.alg,
      kid: typeof header.kid === 'string' ? header.kid : null,
      exp: payload.exp,
      iat: payload.iat,
      hasSub: typeof payload.sub === 'string' && payload.sub.length > 0,
      subFingerprint: getEvidenceFingerprint(payload.sub),
      jti: getEvidenceFingerprint(payload.jti),
      events: Object.keys(payload.events ?? {}),
      nonce: 'nonce' in payload ? 'present' : null,
      sid: getEvidenceFingerprint(payload.sid),
    });
  }

  return payload;
}
