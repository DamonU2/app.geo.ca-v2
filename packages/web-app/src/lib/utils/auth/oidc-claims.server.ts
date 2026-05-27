import { ensureTrailingSlashless } from '$lib/utils/auth/oidc.server';

/**
 * Normalizes an OIDC audience claim into a string array.
 *
 * @param aud - Raw audience claim value.
 * @returns Audience values filtered to strings.
 */
export function getAudienceValues(aud: unknown): string[] {
  return Array.isArray(aud)
    ? aud.filter((value): value is string => typeof value === 'string')
    : [aud].filter((value): value is string => typeof value === 'string');
}

/**
 * Checks whether a token issuer claim matches the expected issuer.
 *
 * @param iss - Raw issuer claim value.
 * @param expectedIssuer - Expected issuer URI without trailing slash.
 * @returns True when issuer exists and matches the expected issuer.
 */
export function issuerMatches(iss: unknown, expectedIssuer: string): iss is string {
  return typeof iss === 'string' && ensureTrailingSlashless(iss) === expectedIssuer;
}

/**
 * Validates that a token expiration claim is present and in the future.
 *
 * @param exp - Raw expiration claim value in epoch seconds.
 * @returns True when exp is numeric and not expired.
 */
export function hasValidExp(exp: unknown): exp is number {
  return typeof exp === 'number' && exp * 1000 > Date.now();
}

/**
 * Validates that a token issued-at claim is present and numeric.
 *
 * @param iat - Raw issued-at claim value in epoch seconds.
 * @returns True when iat is numeric.
 */
export function hasNumericIat(iat: unknown): iat is number {
  return typeof iat === 'number';
}