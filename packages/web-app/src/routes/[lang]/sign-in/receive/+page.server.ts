import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';

/**
 * Preserves compatibility with legacy localized callback URLs.
 */
export const load: PageServerLoad = async ({ url }: Parameters<PageServerLoad>[0]): Promise<void> => {
  throw redirect(303, `/sign-in/receive${url.search}`);
};
