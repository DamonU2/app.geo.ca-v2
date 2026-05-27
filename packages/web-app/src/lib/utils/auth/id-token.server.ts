import type { TokenPayload } from '$lib/db/db-types';
import { decodeBase64UrlJson } from '$lib/utils/auth/base64url';
import { splitJwt } from '$lib/utils/auth/jwt';
import { verifyJwtSignatureWithJwks } from '$lib/utils/auth/jwt-signature.server';
import { getAudienceValues, hasNumericIat, hasValidExp, issuerMatches } from '$lib/utils/auth/oidc-claims.server';
import { ensureTrailingSlashless, getOidcPublicConfig, getOpenIdConfiguration } from '$lib/utils/auth/oidc.server';
import type { JwtHeader } from '$lib/utils/auth/jwt-types';

/**
 * Verifies the ID token signature and required OIDC claims against provider metadata.
 *
 * @param idToken - Raw ID token JWT.
 * @param expectedNonce - Optional nonce expected from the authorize request.
 * @returns Verified token payload when valid; otherwise null.
 */
export async function verifyIdToken(idToken: string, expectedNonce?: string | null): Promise<TokenPayload | null> {
  const isNonProd = process.env.NODE_ENV !== 'production';
  const fail = (reason: string, details?: Record<string, unknown>): null => {
    if (isNonProd) {
      console.warn('[id-token] Verification failed', {
        reason,
        ...(details ?? {}),
      });
    }
    return null;
  };

  const parts = splitJwt(idToken);
  if (!parts) {
    return fail('malformed_jwt');
  }

  const header = decodeBase64UrlJson<JwtHeader>(parts.header);
  const payload = decodeBase64UrlJson<TokenPayload>(parts.payload);
  if (!header || !payload) {
    return fail('decode_failed');
  }

  const { clientId, customDomain } = getOidcPublicConfig();
  if (!clientId || !customDomain) {
    return fail('missing_oidc_config', {
      hasClientId: Boolean(clientId),
      hasCustomDomain: Boolean(customDomain),
    });
  }

  if (header.alg !== 'RS256' || typeof header.kid !== 'string') {
    return fail('unsupported_header', {
      alg: header.alg,
      hasKid: typeof header.kid === 'string',
    });
  }

  const openIdConfiguration = await getOpenIdConfiguration(customDomain);
  const fallbackIssuer = typeof payload.iss === 'string' ? ensureTrailingSlashless(payload.iss) : null;
  const normalizedIssuer = openIdConfiguration?.issuer ? ensureTrailingSlashless(openIdConfiguration.issuer) : fallbackIssuer;
  const configuredJwksUri = openIdConfiguration?.jwks_uri ?? null;
  const discoveryFailureDetails = {
    hasIssuer: Boolean(openIdConfiguration?.issuer),
    hasJwksUri: Boolean(openIdConfiguration?.jwks_uri),
    hasFallbackIssuer: Boolean(fallbackIssuer),
    customDomain,
  };

  if (!normalizedIssuer) {
    return fail('discovery_failed', discoveryFailureDetails);
  }

  const issuerOrigin = (() => {
    try {
      return new URL(normalizedIssuer).origin;
    } catch {
      return null;
    }
  })();

  const jwksCandidates = Array.from(
    new Set(
      [
        configuredJwksUri,
        `${normalizedIssuer}/.well-known/jwks.json`,
        `${normalizedIssuer}/jwks`,
        issuerOrigin ? `${issuerOrigin}/.well-known/jwks.json` : null,
        issuerOrigin ? `${issuerOrigin}/oauth2/jwks` : null,
      ].filter((value): value is string => typeof value === 'string' && value.length > 0)
    )
  );

  if (jwksCandidates.length === 0) {
    return fail('discovery_failed', discoveryFailureDetails);
  }

  if (!issuerMatches(payload.iss, normalizedIssuer)) {
    return fail('issuer_mismatch', {
      tokenIss: payload.iss,
      expectedIss: normalizedIssuer,
    });
  }

  const audience = getAudienceValues(payload.aud);
  if (!audience.includes(clientId)) {
    return fail('audience_mismatch', {
      audience,
      clientId,
    });
  }

  if (!hasValidExp(payload.exp)) {
    return fail('expired_or_missing_exp', {
      exp: payload.exp,
    });
  }

  if (!hasNumericIat(payload.iat) || (!payload.sub && !payload.username)) {
    return fail('missing_required_claims', {
      hasIat: hasNumericIat(payload.iat),
      hasSub: Boolean(payload.sub),
      hasUsername: Boolean(payload.username),
    });
  }

  // Strict nonce mode: expected nonce must round-trip in the ID token and match exactly.
  if (expectedNonce && (typeof payload.nonce !== 'string' || payload.nonce !== expectedNonce)) {
    return fail('nonce_mismatch', {
      hasExpectedNonce: true,
      hasTokenNonce: typeof payload.nonce === 'string',
    });
  }

  const failFromSignatureResult = (result: Exclude<Awaited<ReturnType<typeof verifyJwtSignatureWithJwks>>, { ok: true }>): null => {
    if (result.reason === 'jwks_fetch_failed') {
      return fail('jwks_fetch_failed', {
        status: result.status,
        candidatesTried: jwksCandidates,
      });
    }

    if (result.reason === 'jwk_not_found') {
      return fail('jwk_not_found', {
        kid: header.kid,
        keyCount: result.keyCount,
      });
    }

    if (result.reason === 'signature_invalid') {
      return fail('signature_invalid');
    }

    return fail('verification_exception', {
      error: result.error,
    });
  };

  const signatureResult = await verifyJwtSignatureWithJwks(header, parts, jwksCandidates);
  if (!signatureResult.ok) {
    return failFromSignatureResult(signatureResult);
  }

  return payload;
}
