import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import {
  consumePkceVerifierCookie,
  exchangeCodeForTokens,
  getLangFromState,
  getPostAuthRedirect,
  mergeGuestFavourites,
  setAuthCookies,
} from '$lib/utils/sign-in.server';

/**
 * Handles the OIDC callback without a language prefix, stores auth cookies,
 * and redirects back to the original in-app location.
 */
export const load: PageServerLoad = async ({ cookies, url }: Parameters<PageServerLoad>[0]): Promise<void> => {
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const lang = getLangFromState(state);
  const fallbackPath = `/${lang}/map-browser`;

  if (!code) {
    throw redirect(303, fallbackPath);
  }

  const codeVerifier = consumePkceVerifierCookie(cookies);
  const tokenResponse = await exchangeCodeForTokens(code, url, codeVerifier);
  if (!tokenResponse) {
    throw redirect(303, fallbackPath);
  }

  const didSetCookies = setAuthCookies(cookies, url, tokenResponse);
  if (!didSetCookies) {
    throw redirect(303, fallbackPath);
  }

  try {
    await mergeGuestFavourites(cookies);
  } catch {
    // Keep auth redirect resilient even if favourites merge fails.
  }

  throw redirect(303, getPostAuthRedirect(url, state, lang));
};
