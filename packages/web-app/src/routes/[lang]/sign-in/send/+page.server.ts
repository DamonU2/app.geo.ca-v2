import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { createPkceChallenge, createPkceVerifier, getSignInUrl, setPkceVerifierCookie } from '$lib/utils/sign-in.server';

/**
 * Starts the OIDC sign-in flow by redirecting to the provider authorized URL.
 */
export const load: PageServerLoad = async ({ cookies, params, url }: Parameters<PageServerLoad>[0]): Promise<void> => {
  // Log OIDC config status in non-production environments for easier debugging
  if (process.env.NODE_ENV !== 'production') {
    const oidcDomain = process.env.OIDC_CUSTOM_DOMAIN ?? '';
    const oidcHost = oidcDomain ? new URL(oidcDomain).host : '';
    console.info('[sign-in/send] OIDC config status', {
      hasClientId: Boolean(process.env.OIDC_CLIENT_ID),
      hasClientSecret: Boolean(process.env.OIDC_CLIENT_SECRET),
      hasCustomDomain: Boolean(oidcDomain),
      oidcHost,
    });
  }

  const fallbackPath = `/${params.lang}/map-browser`;
  const state = url.searchParams.get('state') ?? fallbackPath;
  const pkceVerifier = createPkceVerifier();
  const signInUrl = getSignInUrl(url, state, createPkceChallenge(pkceVerifier));

  if (!signInUrl) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[sign-in/send] Missing OIDC config, redirecting to fallback path');
    }
    throw redirect(303, fallbackPath);
  }

  setPkceVerifierCookie(cookies, url, pkceVerifier);
  throw redirect(303, signInUrl);
};
