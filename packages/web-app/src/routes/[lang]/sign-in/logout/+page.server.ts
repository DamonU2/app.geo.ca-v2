import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { clearAuthCookies } from '$lib/utils/sign-in.server';

/**
 * Clears local auth cookies and redirects to the map browser.
 */
export const load: PageServerLoad = ({ cookies, params }: Parameters<PageServerLoad>[0]): Promise<void> => {
  clearAuthCookies(cookies);
  throw redirect(303, `/${params.lang}/map-browser`);
};
