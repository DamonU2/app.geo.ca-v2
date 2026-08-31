import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import {
  consumeOidcNonceCookie,
  consumeOidcStateCookies,
  consumePkceVerifierCookie,
  exchangeCodeForTokens,
  setAuthCookies,
} from '$lib/utils/auth/sign-in-core.server';
import { getLangFromState, getPostAuthRedirect } from '$lib/utils/auth/sign-in-post-auth.server';
import { mergeGuestFavourites } from '$lib/db/favourites';
import { verifyIdToken } from '$lib/utils/auth/id-token.server';
import { getPrivateKeyMaterial } from '$lib/utils/auth/oidc.server';
import { createSessionCookie } from '$lib/utils/auth/session-cookie.server';

const AUTH_ERROR_COOKIE_NAME = 'auth_error';

function setAuthErrorCookie(cookies: Parameters<PageServerLoad>[0]['cookies'], url: URL): void {
  cookies.set(AUTH_ERROR_COOKIE_NAME, 'signin_failed', {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: url.protocol === 'https:',
    maxAge: 60,
  });
}

/**
 * Handles the OIDC callback without a language prefix, stores auth cookies,
 * and redirects back to the original in-app location.
 *
 * @param event - SvelteKit load event containing callback URL and cookies.
 * @returns Redirect response to fallback or resolved post-auth path.
 */
export const load: PageServerLoad = async ({ cookies, url }: Parameters<PageServerLoad>[0]): Promise<void> => {
  const isNonProd = process.env.NODE_ENV !== 'production';
  const code = url.searchParams.get('code');
  const callbackState = url.searchParams.get('state');
  // Consume state before validation so a callback cannot replay the one-time auth transaction.
  const { stateToken: expectedStateToken, returnTo } = consumeOidcStateCookies(cookies);
  const lang = getLangFromState(returnTo ?? callbackState);
  const fallbackPath = `/${lang}/map-browser`;

  if (!code) {
    setAuthErrorCookie(cookies, url);
    if (isNonProd) {
      console.warn(`[sign-in/receive] ${reason}`, details);
    }
    throw redirect(303, fallbackPath);
  }

  if (!expectedStateToken || !callbackState || callbackState !== expectedStateToken) {
    setAuthErrorCookie(cookies, url);
    if (isNonProd) {
      console.warn('[sign-in/receive] State validation failed', {
        hasExpectedStateToken: Boolean(expectedStateToken),
        hasCallbackState: Boolean(callbackState),
        matchesStateToken: callbackState === expectedStateToken,
      });
    }
    throw redirect(303, fallbackPath);
  }

  const codeVerifier = consumePkceVerifierCookie(cookies);
  const expectedNonce = consumeOidcNonceCookie(cookies);
  const keyMaterial = await getPrivateKeyMaterial();
  const tokenResponse = await exchangeCodeForTokens(code, url, codeVerifier, keyMaterial?.pem ?? null, keyMaterial?.x5tS256 ?? null);
  if (!tokenResponse || !expectedNonce) {
    setAuthErrorCookie(cookies, url);
    if (isNonProd) {
      console.warn('[sign-in/receive] Token exchange/nonce validation failed', {
        hasCodeVerifier: Boolean(codeVerifier),
        hasExpectedNonce: Boolean(expectedNonce),
      });
    }
    throw redirect(303, fallbackPath);
  }

  const idTokenPayload = tokenResponse.id_token ? await verifyIdToken(tokenResponse.id_token, expectedNonce) : null;
  if (!idTokenPayload) {
    setAuthErrorCookie(cookies, url);
    if (isNonProd) {
      console.warn('[sign-in/receive] ID token verification failed', {
        hasIdToken: Boolean(tokenResponse.id_token),
        hasExpectedNonce: Boolean(expectedNonce),
      });
    }
    throw redirect(303, fallbackPath);
  }

  const didSetCookies = setAuthCookies(cookies, tokenResponse);
  if (!didSetCookies) {
    setAuthErrorCookie(cookies, url);
    if (isNonProd) {
      console.warn('[sign-in/receive] Failed to set auth cookies', {
        hasIdToken: Boolean(tokenResponse.id_token),
        hasAccessToken: Boolean(tokenResponse.access_token),
        hasRefreshToken: Boolean(tokenResponse.refresh_token),
      });
    }
    throw redirect(303, fallbackPath);
  }

  createSessionCookie(cookies, idTokenPayload.sub ?? idTokenPayload.username ?? '', idTokenPayload.sid ?? null);

  try {
    await mergeGuestFavourites(cookies);
  } catch {
    // Authentication is already established; a favourites persistence failure must not block sign-in.
    // Keep auth redirect resilient even if favourites merge fails.
  }

  throw redirect(303, getPostAuthRedirect(url, returnTo ?? callbackState, lang));
};
