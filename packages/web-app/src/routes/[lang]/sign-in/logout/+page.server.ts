import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { clearAuthCookies, getPostLogoutRedirectPath } from '$lib/utils/auth/sign-in.server';

/**
 * Clears local auth cookies and redirects to the map browser.
 *
 * @param event - SvelteKit load event containing cookies and language params.
 * @returns Redirect response to the language-scoped map browser page.
 */
export const load: PageServerLoad = ({ cookies, params }: Parameters<PageServerLoad>[0]): Promise<void> => {
  clearAuthCookies(cookies);
  throw redirect(303, getPostLogoutRedirectPath(params.lang));
};
