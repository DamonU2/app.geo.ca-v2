import { createHash, randomBytes } from 'node:crypto';
import type { Cookies } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { getUserData, putUserData } from '$lib/db/user';

export const PKCE_VERIFIER_COOKIE_NAME = 'pkce_verifier';

type OAuthTokenResponse = {
  id_token?: string;
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
};

/**
 * Removes a trailing slash from URLs to avoid double-slash endpoint joins.
 *
 * @param url - Base URL value.
 * @returns URL without trailing slash.
 */
function ensureTrailingSlashless(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

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
 * Encodes binary data to base64url without padding.
 *
 * @param buffer - Binary payload.
 * @returns Base64url-encoded string.
 */
function toBase64Url(buffer: Buffer): string {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

/**
 * Generates a PKCE code verifier.
 *
 * @returns Random base64url verifier string.
 */
export function createPkceVerifier(): string {
  return toBase64Url(randomBytes(32));
}

/**
 * Derives a PKCE S256 code challenge from a verifier.
 *
 * @param verifier - PKCE code verifier.
 * @returns Base64url-encoded SHA-256 challenge.
 */
export function createPkceChallenge(verifier: string): string {
  return toBase64Url(createHash('sha256').update(verifier).digest());
}

/**
 * Reads OIDC settings from the server environment.
 *
 * @returns Client id, client secret, and normalized custom domain.
 */
function getOidcConfig(): { clientId: string; clientSecret: string; customDomain: string } {
  const clientId = env.OIDC_CLIENT_ID ?? process.env.OIDC_CLIENT_ID ?? '';
  const clientSecret = env.OIDC_CLIENT_SECRET ?? process.env.OIDC_CLIENT_SECRET ?? '';
  const customDomain = ensureTrailingSlashless(env.OIDC_CUSTOM_DOMAIN ?? process.env.OIDC_CUSTOM_DOMAIN ?? '');

  return { clientId, clientSecret, customDomain };
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
 * @returns Authorize URL when configured; otherwise null.
 */
export function getSignInUrl(requestUrl: URL, state: string, codeChallenge: string): string | null {
  const { clientId, customDomain } = getOidcConfig();
  if (!clientId || !customDomain) {
    return null;
  }

  const redirectUri = getRedirectUri(requestUrl);
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    scope: 'openid',
    redirect_uri: redirectUri,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  return `${customDomain}/oauth2/authorize?${params.toString()}`;
}

export function setPkceVerifierCookie(cookies: Cookies, requestUrl: URL, verifier: string): void {
  cookies.set(PKCE_VERIFIER_COOKIE_NAME, verifier, getCookieOptions(requestUrl, 60 * 10));
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
 * @returns True when all required tokens are present and stored.
 */
export function setAuthCookies(cookies: Cookies, requestUrl: URL, tokenResponse: OAuthTokenResponse): boolean {
  if (!tokenResponse.id_token || !tokenResponse.access_token || !tokenResponse.refresh_token) {
    return false;
  }

  const tokenMaxAge = tokenResponse.expires_in ?? 3600;
  cookies.set('id_token', tokenResponse.id_token, getCookieOptions(requestUrl, tokenMaxAge));
  cookies.set('access_token', tokenResponse.access_token, getCookieOptions(requestUrl, tokenMaxAge));
  cookies.set('refresh_token', tokenResponse.refresh_token, getCookieOptions(requestUrl, 60 * 60 * 24 * 30));
  return true;
}

/**
 * Clears all authentication cookies.
 *
 * @param cookies - Cookie jar from the request context.
 */
export function clearAuthCookies(cookies: Cookies): void {
  cookies.delete('access_token', { path: '/' });
  cookies.delete('id_token', { path: '/' });
  cookies.delete('refresh_token', { path: '/' });
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
