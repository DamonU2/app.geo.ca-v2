import { createHash, randomBytes } from 'node:crypto';
import type { Cookies } from '@sveltejs/kit';
import { encodeBase64Url } from '$lib/utils/auth/base64url';
import { getOidcConfig } from '$lib/utils/auth/oidc.server';

/**
 * Cookie name used to persist the one-time PKCE verifier between send and receive routes.
 */
export const PKCE_VERIFIER_COOKIE_NAME = 'pkce_verifier';

/**
 * Cookie name used to persist the one-time OIDC nonce between send and receive routes.
 */
export const OIDC_NONCE_COOKIE_NAME = 'oidc_nonce';

const TEN_MINUTES_SECONDS = 60 * 10;
const ONE_HOUR_SECONDS = 3600;
const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30;

type OAuthTokenResponse = {
  id_token?: string;
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
};

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
 * Stores the one-time PKCE verifier in an HTTP-only cookie for callback exchange.
 *
 * @param cookies - Cookie jar from the request context.
 * @param requestUrl - Current request URL.
 * @param verifier - PKCE verifier generated for this auth attempt.
 */
export function setPkceVerifierCookie(cookies: Cookies, requestUrl: URL, verifier: string): void {
  cookies.set(PKCE_VERIFIER_COOKIE_NAME, verifier, getCookieOptions(requestUrl, TEN_MINUTES_SECONDS));
}

/**
 * Stores the one-time OIDC nonce in an HTTP-only cookie for callback verification.
 *
 * @param cookies - Cookie jar from the request context.
 * @param requestUrl - Current request URL.
 * @param nonce - Nonce generated for this auth attempt.
 */
export function setOidcNonceCookie(cookies: Cookies, requestUrl: URL, nonce: string): void {
  cookies.set(OIDC_NONCE_COOKIE_NAME, nonce, getCookieOptions(requestUrl, TEN_MINUTES_SECONDS));
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

  const tokenMaxAge = tokenResponse.expires_in ?? ONE_HOUR_SECONDS;
  cookies.set('id_token', tokenResponse.id_token, getCookieOptions(requestUrl, tokenMaxAge));
  cookies.set('access_token', tokenResponse.access_token, getCookieOptions(requestUrl, tokenMaxAge));
  if (tokenResponse.refresh_token) {
    cookies.set('refresh_token', tokenResponse.refresh_token, getCookieOptions(requestUrl, THIRTY_DAYS_SECONDS));
  }
  return true;
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
