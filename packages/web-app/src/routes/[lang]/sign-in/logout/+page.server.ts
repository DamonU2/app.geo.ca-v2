import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { completeLocalLogout } from '$lib/utils/auth/sign-in-post-auth.server';
import { getCookieDomainOptions } from '$lib/utils/auth/cookie-policy.server';

/**
 * Clears local auth cookies and redirects to the map browser.
 *
 * @param event - SvelteKit load event containing cookies and language params.
 * @returns Redirect response to the language-scoped map browser page.
 */
export const load: PageServerLoad = ({ cookies, params, url }: Parameters<PageServerLoad>[0]): Promise<void> => {
  const destination = completeLocalLogout(cookies, url, params.lang);
  if (url.searchParams.get('reason') === 'session-expired') {
    cookies.set('session_expired', '1', {
      path: '/',
      ...getCookieDomainOptions(),
      httpOnly: true,
      sameSite: 'lax',
      secure: url.protocol === 'https:',
      maxAge: 60,
    });
  }
  throw redirect(303, destination);
};
