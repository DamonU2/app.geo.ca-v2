import type { Cookies } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';
import {
  OIDC_NONCE_COOKIE_NAME,
  PKCE_VERIFIER_COOKIE_NAME,
  consumeOidcNonceCookie,
  consumePkceVerifierCookie,
  createPkceChallenge,
} from '$lib/utils/auth/sign-in-core.server';

type CookieHarness = {
  cookies: Cookies;
  deletedNames: string[];
};

function createCookieHarness(initialValues: Record<string, string> = {}): CookieHarness {
  const values = new Map<string, string>(Object.entries(initialValues));
  const deletedNames: string[] = [];

  const cookies = {
    get(name: string): string | undefined {
      return values.get(name);
    },
    set(name: string, value: string): void {
      values.set(name, value);
    },
    delete(name: string): void {
      deletedNames.push(name);
      values.delete(name);
    },
  } as unknown as Cookies;

  return { cookies, deletedNames };
}

describe('sign-in-core helpers', () => {
  it('creates the RFC7636 S256 code challenge from a known verifier', () => {
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';

    expect(createPkceChallenge(verifier)).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  it('consumes and clears the PKCE verifier cookie', () => {
    const { cookies, deletedNames } = createCookieHarness({
      [PKCE_VERIFIER_COOKIE_NAME]: 'pkce-value',
    });

    expect(consumePkceVerifierCookie(cookies)).toBe('pkce-value');
    expect(deletedNames).toContain(PKCE_VERIFIER_COOKIE_NAME);
  });

  it('clears the nonce cookie even when the value is missing', () => {
    const { cookies, deletedNames } = createCookieHarness();

    expect(consumeOidcNonceCookie(cookies)).toBeNull();
    expect(deletedNames).toContain(OIDC_NONCE_COOKIE_NAME);
  });
});
