import { randomUUID } from 'node:crypto';
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

  const telemetry = {
    correlationId: randomUUID(),
    endpointCategory: 'discovery',
    providerHost: (() => {
      try {
        return new URL(customDomain).host;
      } catch {
        return null;
      }
    })(),
  };

  const now = Date.now();
  const cached = openIdConfigurationCache.get(customDomain);
  if (cached && now - cached.fetchedAt < OPENID_CONFIGURATION_CACHE_TTL_MS) {
    return cached.value;
  }

  let bestConfiguration: OpenIdConfiguration | null = null;
  const attempts: Array<{ path: string; status: number | null; error?: string }> = [];

  for (const path of OPENID_CONFIGURATION_PATHS) {
    try {
      const response = await fetch(`${customDomain}${path}`);
      if (!response.ok) {
        attempts.push({ path, status: response.status });
        continue;
      }

      const configuration = (await response.json()) as OpenIdConfiguration;
      attempts.push({ path, status: response.status });
      if (!bestConfiguration) {
        bestConfiguration = configuration;
      }

      if (configuration.issuer && configuration.jwks_uri) {
        bestConfiguration = configuration;
        break;
      }
    } catch (error) {
      attempts.push({
        path,
        status: null,
        error: error instanceof Error ? error.message : 'unknown_error',
      });
      // Continue trying alternate discovery paths.
    }
  }

  if (!bestConfiguration) {
    console.error('[auth/discovery] openid_configuration_unavailable', {
      ...telemetry,
      attempts,
    });
    return null;
  }

  if (!bestConfiguration.issuer || !bestConfiguration.jwks_uri) {
    console.error('[auth/discovery] openid_configuration_partial', {
      ...telemetry,
      attempts,
      hasIssuer: Boolean(bestConfiguration.issuer),
      hasJwksUri: Boolean(bestConfiguration.jwks_uri),
    });
  }

  openIdConfigurationCache.set(customDomain, { value: bestConfiguration, fetchedAt: now });
  return bestConfiguration;
}

/**
 * Fetches a secret value from AWS Secrets Manager.
 *
 * Used to retrieve the private key for private_key_jwt client authentication.
 * Only available in production environments with AWS credentials configured.
 *
 * @param secretId - Secret identifier (name or ARN) in Secrets Manager
 * @returns Secret string value when successful; null on error
 */
export async function fetchSecretFromSecretsManager(secretId: string): Promise<string | null> {
  const telemetry = {
    correlationId: randomUUID(),
    endpointCategory: 'secrets_manager',
    hasSecretId: Boolean(secretId),
  };

  try {
    // Dynamically import AWS SDK only when needed (production/server-side only)
    const { SecretsManagerClient, GetSecretValueCommand } = await import('@aws-sdk/client-secrets-manager');

    const client = new SecretsManagerClient();
    const command = new GetSecretValueCommand({ SecretId: secretId });
    const response = await client.send(command);

    return response.SecretString ?? null;
  } catch (error) {
    console.error('[auth/secrets-manager] secret_fetch_failed', {
      ...telemetry,
      error: error instanceof Error ? error.message : 'unknown_error',
    });
    return null;
  }
}

const privateKeyCache = new Map<string, { value: string; fetchedAt: number }>();
const PRIVATE_KEY_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Retrieves the OIDC client private key for private_key_jwt authentication.
 *
 * Returns null (falling back to client_secret_post) when either:
 * - `OIDC_USE_PRIVATE_KEY_JWT` is not set to `"true"` (e.g. local dev and development stage), or
 * - `OIDC_PRIVATE_KEY_SECRET_ID` is not configured.
 *
 * When the flag is enabled, fetches the PEM-formatted private key from AWS Secrets Manager
 * using the secret ID from `OIDC_PRIVATE_KEY_SECRET_ID`, with a 15-minute in-memory cache
 * to reduce API calls.
 *
 * @returns Private key in PEM format when private_key_jwt is active; null otherwise.
 */
export async function getPrivateKeyPem(): Promise<string | null> {
  const usePrivateKeyJwt = (env.OIDC_USE_PRIVATE_KEY_JWT ?? process.env.OIDC_USE_PRIVATE_KEY_JWT ?? '').toLowerCase() === 'true';
  const secretId = env.OIDC_PRIVATE_KEY_SECRET_ID ?? process.env.OIDC_PRIVATE_KEY_SECRET_ID;

  if (!usePrivateKeyJwt) {
    return null;
  }

  // Local development: no private key configured, use client_secret_post
  if (!secretId) {
    return null;
  }

  // Check cache first
  const now = Date.now();
  const cached = privateKeyCache.get(secretId);
  if (cached && now - cached.fetchedAt < PRIVATE_KEY_CACHE_TTL_MS) {
    return cached.value;
  }

  // Fetch from Secrets Manager
  const privateKey = await fetchSecretFromSecretsManager(secretId);
  if (privateKey) {
    privateKeyCache.set(secretId, { value: privateKey, fetchedAt: now });
  }

  return privateKey;
}
