import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { clearAuthCookies, getPostLogoutRedirectPath } from '$lib/utils/auth/sign-in.server';

/**
 * Clears local auth cookies after provider logout and returns to the default map browser.
 *
 * @param event - SvelteKit load event containing cookies.
 * @returns Redirect response to the default English map browser page.
 */
export const load: PageServerLoad = ({ cookies }: Parameters<PageServerLoad>[0]): Promise<void> => {
  clearAuthCookies(cookies);
  throw redirect(303, getPostLogoutRedirectPath());
};
