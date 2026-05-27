import type { Cookies } from '@sveltejs/kit';
import type { TokenPayload, TokenResponse } from '$lib/db/db-types';
import { verifyIdToken } from '$lib/utils/auth/id-token.server';

/**
 * Parses id_token from cookies and verifies it against provider JWKS metadata.
 *
 * @param cookies - The cookies object containing user session data.
 * @returns A token response containing an ok flag and verified claims when available.
 */
export async function getToken(cookies: Cookies): Promise<TokenResponse> {
  const token = cookies.get('id_token');
  if (!token) {
    return { ok: false };
  }

  const value: TokenPayload | null = await verifyIdToken(token);
  if (!value?.sub && !value?.username) {
    return { ok: false };
  }

  return {
    ok: true,
    value,
  };
}
