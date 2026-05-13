import type { Cookies } from '@sveltejs/kit';
import type { TokenPayload, TokenResponse } from '$lib/db/db-types';

/**
 * Decodes a base64url-encoded string into UTF-8 text.
 *
 * @param input - Base64url string from a JWT segment.
 * @returns Decoded UTF-8 string.
 */
function decodeBase64Url(input: string): string {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
  return Buffer.from(padded, 'base64').toString('utf-8');
}

/**
 * Parses a JWT payload segment without validating the token signature.
 *
 * @param token - Raw JWT string.
 * @returns Parsed payload claims when decoding succeeds; otherwise null.
 */
function parseJwt(token: string): TokenPayload | null {
  const parts = token.split('.');
  if (parts.length < 2 || !parts[1]) {
    return null;
  }

  try {
    const payload = decodeBase64Url(parts[1]);
    return JSON.parse(payload) as TokenPayload;
  } catch {
    return null;
  }
}

/**
 * Parses id_token from cookies and returns its decoded payload if valid.
 *
 * @param cookies - The cookies object containing user session data.
 * @returns A token response containing an ok flag and decoded claims when available.
 */
export async function getToken(cookies: Cookies): Promise<TokenResponse> {
  const token = cookies.get('id_token');
  if (!token) {
    return { ok: false };
  }

  const value = parseJwt(token);
  if (!value?.sub && !value?.username) {
    return { ok: false };
  }

  return {
    ok: true,
    value,
  };
}
