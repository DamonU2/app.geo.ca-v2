import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { clearAuthCookies } from '$lib/utils/sign-in.server';

/**
 * Clears local auth cookies after provider logout and returns to the default map browser.
 */
export const load: PageServerLoad = ({ cookies }: Parameters<PageServerLoad>[0]): Promise<void> => {
  clearAuthCookies(cookies);
  throw redirect(303, '/en-ca/map-browser');
};
