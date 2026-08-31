import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { clearAuthCookies } from '$lib/utils/auth/auth-cookies';
import { getPostLogoutRedirectPath } from '$lib/utils/auth/sign-in-post-auth.server';
import { isAppLanguage } from '$lib/utils/language';

/**
 * Clears local auth cookies after provider logout and returns to a language-aware map browser path.
 *
 * @param event - SvelteKit load event containing cookies.
 * @returns Redirect response to a language-scoped map browser page.
 */
export const load: PageServerLoad = ({ cookies, url }: Parameters<PageServerLoad>[0]): Promise<void> => {
  clearAuthCookies(cookies);
  const returnTo = url.searchParams.get('returnTo');
  const cookieLang = cookies.get('post_logout_lang');
  cookies.delete('post_logout_lang', { path: '/' });
  const langHint = isAppLanguage(cookieLang) ? cookieLang : undefined;
  throw redirect(303, getPostLogoutRedirectPath(langHint, returnTo));
};
