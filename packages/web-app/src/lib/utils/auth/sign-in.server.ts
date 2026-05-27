import { createHash, randomBytes } from 'node:crypto';
import type { Cookies } from '@sveltejs/kit';
import { decodeBase64UrlJson, encodeBase64Url } from '$lib/utils/auth/base64url';
import { splitJwt } from '$lib/utils/auth/jwt';
import { verifyJwtSignatureWithJwks } from '$lib/utils/auth/jwt-signature.server';
import { getAudienceValues, hasNumericIat, hasValidExp, issuerMatches } from '$lib/utils/auth/oidc-claims.server';
import { ensureTrailingSlashless, getOidcConfig, getOpenIdConfiguration } from '$lib/utils/auth/oidc.server';
import type { JwtHeader } from '$lib/utils/auth/jwt-types';
import { getUserData, putUserData } from '$lib/db/user';
export { clearAuthCookies } from '$lib/utils/auth/auth-cookies';

/**
 * Cookie name used to persist the one-time PKCE verifier between send and receive routes.
 */
export const PKCE_VERIFIER_COOKIE_NAME = 'pkce_verifier';

/**
 * Cookie name used to persist the one-time OIDC nonce between send and receive routes.
 */
export const OIDC_NONCE_COOKIE_NAME = 'oidc_nonce';

type OAuthTokenResponse = {
  id_token?: string;
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
};

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

const BACK_CHANNEL_LOGOUT_EVENT = 'http://schemas.openid.net/event/backchannel-logout';

/**
 * Builds the locale-independent OIDC callback URL.
 *
 * @param requestUrl - Current request URL.
 * @returns Absolute callback URL used for authorize/token exchange.
 */
function getRedirectUri(requestUrl: URL): string {
  return `${requestUrl.origin}/sign-in/receive`;
}

/**
 * Generates a PKCE code verifier.
 *
 * @returns Random base64url verifier string.
 */
export function createPkceVerifier(): string {
  return encodeBase64Url(randomBytes(32));
}

/**
 * Generates a one-time OIDC nonce used to bind authorize and callback.
 *
 * @returns Random base64url nonce string.
 */
export function createOidcNonce(): string {
  return encodeBase64Url(randomBytes(32));
}

/**
 * Derives a PKCE S256 code challenge from a verifier.
 *
 * @param verifier - PKCE code verifier.
 * @returns Base64url-encoded SHA-256 challenge.
 */
export function createPkceChallenge(verifier: string): string {
  return encodeBase64Url(createHash('sha256').update(verifier).digest());
}

/**
 * Reports whether the minimum OIDC configuration exists to show auth UI.
 *
 * @returns True when client id and custom domain are both configured.
 */
export function isOidcConfigured(): boolean {
  const { clientId, customDomain } = getOidcConfig();
  return Boolean(clientId && customDomain);
}

/**
 * Builds common cookie options for auth cookies.
 *
 * @param requestUrl - Current request URL.
 * @param maxAge - Optional cookie max age in seconds.
 * @returns Cookie option object for secure server-side cookies.
 */
function getCookieOptions(
  requestUrl: URL,
  maxAge?: number
): { path: string; httpOnly: true; sameSite: 'lax'; secure: boolean; maxAge?: number } {
  return {
    path: '/',
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: requestUrl.protocol === 'https:',
    ...(typeof maxAge === 'number' ? { maxAge } : {}),
  };
}

/**
 * Creates the provider authorize URL for starting OIDC sign-in.
 *
 * @param requestUrl - Current request URL.
 * @param state - Return-to value for post-auth redirect.
 * @param codeChallenge - PKCE S256 challenge for this auth request.
 * @param nonce - One-time nonce to bind the ID token to this login request.
 * @returns Authorize URL when configured; otherwise null.
 */
export function getSignInUrl(requestUrl: URL, state: string, codeChallenge: string, nonce: string): string | null {
  const { clientId, customDomain } = getOidcConfig();
  if (!clientId || !customDomain) {
    return null;
  }

  const redirectUri = getRedirectUri(requestUrl);
  // Include nonce so the callback can bind ID token claims to this authorize request.
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    scope: 'openid',
    redirect_uri: redirectUri,
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  return `${customDomain}/oauth2/authorize?${params.toString()}`;
}

/**
 * Verifies a back-channel logout token from the provider.
 *
 * @param logoutToken - JWT logout token from the provider.
 * @returns The validated payload when verification succeeds; otherwise null.
 */
export async function verifyBackChannelLogoutToken(logoutToken: string): Promise<BackChannelLogoutTokenPayload | null> {
  const parts = splitJwt(logoutToken);
  if (!parts) {
    return null;
  }

  const header = decodeBase64UrlJson<JwtHeader>(parts.header);
  const payload = decodeBase64UrlJson<BackChannelLogoutTokenPayload>(parts.payload);
  if (!header || !payload) {
    return null;
  }

  const { clientId, customDomain } = getOidcConfig();
  if (!clientId || !customDomain) {
    return null;
  }

  if (header.alg !== 'RS256' || typeof header.kid !== 'string') {
    return null;
  }

  const openIdConfiguration = await getOpenIdConfiguration(customDomain);
  if (!openIdConfiguration?.issuer || !openIdConfiguration.jwks_uri) {
    return null;
  }

  const normalizedIssuer = ensureTrailingSlashless(openIdConfiguration.issuer);
  if (!issuerMatches(payload.iss, normalizedIssuer)) {
    return null;
  }

  const audience = getAudienceValues(payload.aud);
  if (!audience.includes(clientId)) {
    return null;
  }

  if (!hasValidExp(payload.exp)) {
    return null;
  }

  if (!hasNumericIat(payload.iat) || !payload.events || !(BACK_CHANNEL_LOGOUT_EVENT in payload.events)) {
    return null;
  }

  const signatureResult = await verifyJwtSignatureWithJwks(header, parts, [openIdConfiguration.jwks_uri]);
  if (!signatureResult.ok) {
    return null;
  }

  return payload;
}

/**
 * Stores the one-time PKCE verifier in an HTTP-only cookie for callback exchange.
 *
 * @param cookies - Cookie jar from the request context.
 * @param requestUrl - Current request URL.
 * @param verifier - PKCE verifier generated for this auth attempt.
 */
export function setPkceVerifierCookie(cookies: Cookies, requestUrl: URL, verifier: string): void {
  cookies.set(PKCE_VERIFIER_COOKIE_NAME, verifier, getCookieOptions(requestUrl, 60 * 10));
}

/**
 * Stores the one-time OIDC nonce in an HTTP-only cookie for callback verification.
 *
 * @param cookies - Cookie jar from the request context.
 * @param requestUrl - Current request URL.
 * @param nonce - Nonce generated for this auth attempt.
 */
export function setOidcNonceCookie(cookies: Cookies, requestUrl: URL, nonce: string): void {
  cookies.set(OIDC_NONCE_COOKIE_NAME, nonce, getCookieOptions(requestUrl, 60 * 10));
}

/**
 * Reads and clears the PKCE verifier cookie for one-time token exchange.
 *
 * @param cookies - Cookie jar from the request context.
 * @returns PKCE verifier when present; otherwise null.
 */
export function consumePkceVerifierCookie(cookies: Cookies): string | null {
  const verifier = cookies.get(PKCE_VERIFIER_COOKIE_NAME) ?? null;
  cookies.delete(PKCE_VERIFIER_COOKIE_NAME, { path: '/' });
  return verifier;
}

/**
 * Reads and clears the OIDC nonce cookie for one-time ID token verification.
 *
 * @param cookies - Cookie jar from the request context.
 * @returns Nonce when present; otherwise null.
 */
export function consumeOidcNonceCookie(cookies: Cookies): string | null {
  const nonce = cookies.get(OIDC_NONCE_COOKIE_NAME) ?? null;
  cookies.delete(OIDC_NONCE_COOKIE_NAME, { path: '/' });
  return nonce;
}

/**
 * Exchanges an authorization code for provider tokens.
 *
 * @param code - OAuth authorization code from callback.
 * @param requestUrl - Current request URL.
 * @param codeVerifier - PKCE verifier used during the authorize request.
 * @returns Token payload from provider or null when exchange fails.
 */
export async function exchangeCodeForTokens(
  code: string,
  requestUrl: URL,
  codeVerifier: string | null
): Promise<OAuthTokenResponse | null> {
  const { clientId, clientSecret, customDomain } = getOidcConfig();
  if (!clientId || !clientSecret || !customDomain || !codeVerifier) {
    return null;
  }

  // Construct token endpoint URL and request body for exchanging code
  const tokenUrl = `${customDomain}/oauth2/token`;
  const redirectUri = getRedirectUri(requestUrl);

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  });

  // Make the token request to the provider
  try {
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as OAuthTokenResponse;
  } catch {
    return null;
  }
}

/**
 * Persists auth tokens in secure HTTP-only cookies.
 *
 * @param cookies - Cookie jar from the request context.
 * @param requestUrl - Current request URL.
 * @param tokenResponse - Token payload returned by provider.
 * @returns True when required tokens are present and stored.
 */
export function setAuthCookies(cookies: Cookies, requestUrl: URL, tokenResponse: OAuthTokenResponse): boolean {
  if (!tokenResponse.id_token || !tokenResponse.access_token) {
    return false;
  }

  const tokenMaxAge = tokenResponse.expires_in ?? 3600;
  cookies.set('id_token', tokenResponse.id_token, getCookieOptions(requestUrl, tokenMaxAge));
  cookies.set('access_token', tokenResponse.access_token, getCookieOptions(requestUrl, tokenMaxAge));
  if (tokenResponse.refresh_token) {
    cookies.set('refresh_token', tokenResponse.refresh_token, getCookieOptions(requestUrl, 60 * 60 * 24 * 30));
  }
  return true;
}

/**
 * Normalizes and validates post-auth state redirects.
 *
 * @param requestUrl - Current request URL.
 * @param state - Optional state value from auth round-trip.
 * @param lang - Active language segment.
 * @returns Safe in-app path for redirect.
 */
function normalizeStateUrl(requestUrl: URL, state: string | null, lang: string): string {
  const fallbackPath = `/${lang}/map-browser`;
  if (!state) {
    return fallbackPath;
  }

  try {
    // Only allow same-origin redirects to prevent open redirect issues.
    const parsed = new URL(state, requestUrl.origin);
    if (parsed.origin !== requestUrl.origin) {
      return fallbackPath;
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallbackPath;
  }
}

/**
 * Infers the language segment from round-trip state.
 *
 * @param state - State value from auth round-trip.
 * @returns `fr-ca` when state points to French routes; otherwise `en-ca`.
 */
export function getLangFromState(state: string | null): 'en-ca' | 'fr-ca' {
  if (!state) {
    return 'en-ca';
  }

  try {
    const parsed = new URL(state);
    if (parsed.pathname.startsWith('/fr-ca/')) {
      return 'fr-ca';
    }
  } catch {
    if (state.startsWith('/fr-ca/')) {
      return 'fr-ca';
    }
  }

  return 'en-ca';
}

/**
 * Merges guest favourites captured before sign-in into the signed-in profile.
 *
 * @param cookies - Cookie jar from the request context.
 */
export async function mergeGuestFavourites(cookies: Cookies): Promise<void> {
  const guestCookie = cookies.get('guest_favourites') ?? '';
  if (!guestCookie) {
    return;
  }

  let decodedGuestCookie = guestCookie;
  try {
    decodedGuestCookie = decodeURIComponent(guestCookie);
  } catch {
    // Keep raw cookie content when decoding fails.
  }

  // Retrieve guest favourites from cookies
  const guest = decodedGuestCookie
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0);

  if (guest.length === 0) {
    cookies.delete('guest_favourites', { path: '/' });
    return;
  }

  const userData = await getUserData(cookies);
  if (!userData.Item.uuid) {
    return;
  }

  const server = userData.Item.favourites ?? [];
  const merged = Array.from(new Set([...server, ...guest]));

  let didPersist = true;

  // Write only when order/content changed to avoid unnecessary DynamoDB writes.
  if (merged.length !== server.length || server.some((id, index) => id !== merged[index])) {
    const result = await putUserData(
      {
        uuid: userData.Item.uuid,
        favourites: merged,
        mapConfigs: userData.Item.mapConfigs ?? [],
      },
      cookies
    );
    didPersist = result.ok;
  }

  if (didPersist) {
    cookies.delete('guest_favourites', { path: '/' });
  }
}

/**
 * Computes a safe redirect target after successful authentication.
 *
 * @param requestUrl - Current request URL.
 * @param state - Optional state value from auth round-trip.
 * @param lang - Active language segment.
 * @returns Safe post-auth path.
 */
export function getPostAuthRedirect(requestUrl: URL, state: string | null, lang: string): string {
  return normalizeStateUrl(requestUrl, state, lang);
}

/**
 * Returns the in-app destination used after local sign-out cookie cleanup.
 *
 * @param lang - Optional language segment. Defaults to `en-ca` when missing.
 * @returns Language-scoped map browser path.
 */
export function getPostLogoutRedirectPath(lang?: string): string {
  return `/${lang ?? 'en-ca'}/map-browser`;
}

/**
 * Builds the provider logout URL.
 *
 * @param requestUrl - Current request URL.
 * @returns Provider logout URL or null when OIDC config is missing.
 */
export function getOidcLogoutUrl(requestUrl: URL): string | null {
  const { clientId, customDomain } = getOidcConfig();
  if (!clientId || !customDomain) {
    return null;
  }

  const logoutUri = `${requestUrl.origin}/sign-in/logout`;
  return `${customDomain}/oauth2/logout?client_id=${encodeURIComponent(clientId)}&logout_uri=${encodeURIComponent(logoutUri)}`;
}
