import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { getAppLanguage } from '$lib/utils/language';

export const load: PageServerLoad = ({ params }) => {
  throw redirect(307, `/${getAppLanguage(params.lang)}/map-browser`);
};