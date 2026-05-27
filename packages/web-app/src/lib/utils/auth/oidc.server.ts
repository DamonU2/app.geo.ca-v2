import { env } from '$env/dynamic/private';
import type { OpenIdConfiguration } from '$lib/utils/auth/jwt-types';

const OPENID_CONFIGURATION_PATHS = ['/.well-known/openid-configuration', '/oauth2/.well-known/openid-configuration'];
const OPENID_CONFIGURATION_CACHE_TTL_MS = 5 * 60 * 1000;

const openIdConfigurationCache = new Map<string, { value: OpenIdConfiguration; fetchedAt: number }>();

/**
 * Removes a trailing slash from URLs to avoid double-slash endpoint joins.
 *
 * @param url - Base URL value.
 * @returns URL without trailing slash.
 */
export function ensureTrailingSlashless(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

/**
 * Reads OIDC settings from the server environment.
 *
 * @returns Client id, client secret, and normalized custom domain.
 */
export function getOidcConfig(): { clientId: string; clientSecret: string; customDomain: string } {
  const clientId = env.OIDC_CLIENT_ID ?? process.env.OIDC_CLIENT_ID ?? '';
  const clientSecret = env.OIDC_CLIENT_SECRET ?? process.env.OIDC_CLIENT_SECRET ?? '';
  const customDomain = ensureTrailingSlashless(env.OIDC_CUSTOM_DOMAIN ?? process.env.OIDC_CUSTOM_DOMAIN ?? '');

  return { clientId, clientSecret, customDomain };
}

/**
 * Reads public OIDC settings (without secret) from the server environment.
 *
 * @returns Client id and normalized custom domain.
 */
export function getOidcPublicConfig(): { clientId: string; customDomain: string } {
  const { clientId, customDomain } = getOidcConfig();
  return { clientId, customDomain };
}

/**
 * Fetches the provider's OIDC discovery document with a short-lived cache.
 *
 * @param customDomain - Normalized provider domain.
 * @returns Discovery document when available; otherwise null.
 */
export async function getOpenIdConfiguration(customDomain: string): Promise<OpenIdConfiguration | null> {
  if (!customDomain) {
    return null;
  }

  const now = Date.now();
  const cached = openIdConfigurationCache.get(customDomain);
  if (cached && now - cached.fetchedAt < OPENID_CONFIGURATION_CACHE_TTL_MS) {
    return cached.value;
  }

  let bestConfiguration: OpenIdConfiguration | null = null;

  for (const path of OPENID_CONFIGURATION_PATHS) {
    try {
      const response = await fetch(`${customDomain}${path}`);
      if (!response.ok) {
        continue;
      }

      const configuration = (await response.json()) as OpenIdConfiguration;
      if (!bestConfiguration) {
        bestConfiguration = configuration;
      }

      if (configuration.issuer && configuration.jwks_uri) {
        bestConfiguration = configuration;
        break;
      }
    } catch {
      // Continue trying alternate discovery paths.
    }
  }

  if (!bestConfiguration) {
    return null;
  }

  openIdConfigurationCache.set(customDomain, { value: bestConfiguration, fetchedAt: now });
  return bestConfiguration;
}
