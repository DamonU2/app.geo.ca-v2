import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { getOidcLogoutUrl } from '$lib/utils/sign-in.server';

/**
 * Redirects to the provider logout endpoint when available,
 * otherwise falls back to local sign-out.
 *
 * In local development (`localhost`/`127.0.0.1`), provider logout is skipped
 * to avoid back-channel logout failures against non-public callback URLs.
 */
export const load: PageServerLoad = ({ url, params }: Parameters<PageServerLoad>[0]): Promise<void> => {
  const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (isLocalhost) {
    throw redirect(303, `/${params.lang}/sign-in/logout`);
  }

  const oidcLogoutUrl = getOidcLogoutUrl(url);
  if (!oidcLogoutUrl) {
    throw redirect(303, `/${params.lang}/sign-in/logout`);
  }

  throw redirect(303, oidcLogoutUrl);
};
