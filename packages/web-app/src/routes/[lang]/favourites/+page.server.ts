import type { Actions, PageServerLoad } from './$types';
import { GEOCORE_API_DOMAIN } from '$env/static/private';
import { getUserData } from '$lib/db/user';
import { clearFavourites, removeFromFavourites } from '$lib/actions';
import { sanitize } from '$lib/utils/data-sanitization/geocore-result';
import type { GeospatialRecord, UserInfo } from '$lib/db/db-types';
import { getAppLanguage } from '$lib/utils/language';
import { buildCatalogTitle, buildPageTitle, buildSeoMetadata } from '$lib/utils/metadata';

/**
 * Loads the favourites page data by reading user favourites, fetching matching
 * GeoCore records, and preparing localized SEO metadata.
 */
export const load: PageServerLoad = async ({ fetch, params, url, cookies }) => {
  const lang = getAppLanguage(params.lang);
  let response: GeospatialRecord[] = [];
  let userData: UserInfo | undefined;
  let sanitizedResults: GeospatialRecord[] = [];

  const seo = buildSeoMetadata(url, lang, 'favourites', {
    en: 'Browse your saved resources and create a custom map.',
    fr: 'Consultez vos ressources sauvegardées et créez une carte personnalisée.',
  });

  try {
    // Keep the page rendering even if user lookup fails.
    userData = await getUserData(cookies);
  } catch (e) {
    console.error('error fetching user data in records: \n', e);
  }

  try {
    response = await getRecords(userData?.Item.favourites ?? [], lang, fetch);
  } catch (e) {
    console.error('error fetching records: \n', e);
  }

  try {
    sanitizedResults = sanitize(response, lang);
  } catch (e) {
    console.error('error fetching records: \n', e);
  }

  return {
    lang,
    tTitle1: buildCatalogTitle(url, lang),
    tTitle2: buildPageTitle(url, lang, 'Favourites', 'Favoris'),
    results: sanitizedResults,
    userData: userData?.Item || { uuid: null, favourites: [], mapConfigs: [] },
    canonicalUrl: seo.canonicalUrl,
    alternateUrl: seo.alternateUrl,
    alternateLang: seo.alternateLang,
    metaDescription: seo.metaDescription,
  };
};

/**
 * Gets a record from the GeoCore API.
 *
 * @param id - The record ID.
 * @param lang - The language code.
 * @param fetch - The fetch function.
 * @returns A promise that resolves to the fetch response.
 */
function getRecord(id: string, lang: string, fetch: (url: string | URL, options?: RequestInit) => Promise<Response>): Promise<Response> {
  const url = new URL(`${GEOCORE_API_DOMAIN}/id`);
  const params = {
    id: id,
    lang: lang.split('-')[0],
  };
  url.search = new URLSearchParams(params).toString();
  return fetch(url);
}

/**
 * Gets multiple records from the GeoCore API.
 *
 * @param idIterator - An iterable of record IDs.
 * @param lang - The language code.
 * @param fetch - The fetch function.
 * @returns A promise that resolves to an array of records.
 */
async function getRecords(
  idIterator: Iterable<string>,
  lang: string,
  fetch: (url: string | URL, options?: RequestInit) => Promise<Response>
): Promise<GeospatialRecord[]> {
  const promises = [];

  for (const id of idIterator) {
    promises.push(getRecord(id, lang, fetch));
  }

  const results = await Promise.all(promises);
  const values = [...results];

  const ret = await Promise.all(
    values.map(async (value) => {
      try {
        const contents = (await value.json()) as { Items?: GeospatialRecord[] };
        if (contents.Items?.[0]) return contents.Items[0];
      } catch (error) {
        console.log(error);
      }
    })
  );

  return ret.filter((item): item is GeospatialRecord => item !== undefined);
}

/**
 * Server actions for mutating favourites from the favourites page UI.
 */
export const actions = {
  removeFromFavourites: removeFromFavourites,
  clearFavourites: clearFavourites,
} satisfies Actions;
