import type { LayoutServerLoad } from './$types';
import enFooterLinks from '$lib/components/footer/i18n/en/links.json';
import enLegal from '$lib/components/footer/i18n/en/legal.json';
import frFooterLinks from '$lib/components/footer/i18n/fr/links.json';
import frLegal from '$lib/components/footer/i18n/fr/legal.json';
import enNavitems from '$lib/components/header/i18n/en/navitems.json';
import frNavitems from '$lib/components/header/i18n/fr/navitems.json';
import enHeaderTranslations from '$lib/components/header/i18n/en/translations.json';
import frHeaderTranslations from '$lib/components/header/i18n/fr/translations.json';
import enShareTranslations from '$lib/components/share/i18n/en/translations.json';
import frShareTranslations from '$lib/components/share/i18n/fr/translations.json';
import { getUserData } from '$lib/db/user';
import { isOidcConfigured } from '$lib/utils/auth/sign-in-core.server';
import { getAppLanguage, isFrench, pickByLanguage } from '$lib/utils/language';

type NavLink = {
  title: string;
  href: string;
  info?: string;
  tipId?: string;
};

type NavOption = {
  colTitle?: string;
  links: NavLink[];
};

type NavItem = {
  title: string;
  href?: string;
  counter?: boolean;
  localStorageKey?: string;
  options?: NavOption[];
};

type NavItems = Record<string, NavItem>;

/**
 * Loads global layout data for language-specific navigation, footer content,
 * and signed-in user context used across pages.
 *
 * @param event - SvelteKit load event containing params and cookies.
 * @returns Layout data used by shared navigation, footer, and profile UI.
 */
export const load: LayoutServerLoad = async ({ params, cookies, depends }) => {
  depends('app:favourites');

  const lang = getAppLanguage(params.lang);
  const userInfo = await getUserData(cookies);
  const signedIn = Boolean(userInfo.Item.uuid);
  const userDataUnavailable = userInfo.status === 'unavailable';
  const navitems = structuredClone(pickByLanguage(lang, enNavitems, frNavitems)) as NavItems;

  if (signedIn && !userDataUnavailable && navitems.favourites) {
    // Datasets and saved maps are stored separately and shown as tab-specific counters.
    const datasetsCount = (userInfo.Item.favourites ?? []).length;
    const mapConfigsCount = (userInfo.Item.mapConfigs ?? []).length;
    const datasetsLabel = isFrench(lang) ? 'Jeux de donnees' : 'Datasets';
    const mapsLabel = isFrench(lang) ? 'Cartes' : 'Maps';

    navitems.favourites = {
      title: navitems.favourites.title,
      options: [
        {
          links: [
            {
              title: `${datasetsLabel} (${datasetsCount})`,
              href: `/${lang}/favourites/datasets`,
            },
            {
              title: `${mapsLabel} (${mapConfigsCount})`,
              href: `/${lang}/favourites/maps`,
            },
          ],
        },
      ],
    };
  }

  return {
    lang,
    signedIn,
    FEATURE_SIGN_IN: isOidcConfigured(),
    userData: userInfo.Item,
    userDataStatus: userInfo.status,
    footerLinks: pickByLanguage(lang, enFooterLinks, frFooterLinks),
    legalData: pickByLanguage(lang, enLegal, frLegal),
    navitems,
    headerTranslations: pickByLanguage(lang, enHeaderTranslations, frHeaderTranslations),
    shareTranslations: pickByLanguage(lang, enShareTranslations, frShareTranslations),
  };
};
