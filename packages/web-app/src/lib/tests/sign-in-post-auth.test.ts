import type { Cookies } from '@sveltejs/kit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getUserData, putUserData } from '$lib/db/user';
import { getPostAuthRedirect, mergeGuestFavourites } from '$lib/utils/auth/sign-in-post-auth.server';

vi.mock('$lib/db/user', () => ({
  getUserData: vi.fn(),
  putUserData: vi.fn(),
}));

const mockedGetUserData = vi.mocked(getUserData);
const mockedPutUserData = vi.mocked(putUserData);

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

describe('sign-in post-auth helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('falls back to map-browser when state points to another origin', () => {
    const redirectPath = getPostAuthRedirect(
      new URL('https://example.test/sign-in/receive'),
      'https://malicious.example/phishing',
      'en-ca'
    );

    expect(redirectPath).toBe('/en-ca/map-browser');
  });

  it('merges guest favourites with server favourites and clears cookie when persisted', async () => {
    mockedGetUserData.mockResolvedValue({
      Item: {
        uuid: 'user-123',
        favourites: ['dataset-a', 'dataset-b'],
        mapConfigs: [],
      },
    });
    mockedPutUserData.mockResolvedValue({ ok: true });

    const { cookies, deletedNames } = createCookieHarness({
      guest_favourites: encodeURIComponent('dataset-b, dataset-c, dataset-d, dataset-c'),
    });

    await mergeGuestFavourites(cookies);

    expect(mockedPutUserData).toHaveBeenCalledTimes(1);
    expect(mockedPutUserData.mock.calls[0][0]).toEqual({
      uuid: 'user-123',
      favourites: ['dataset-a', 'dataset-b', 'dataset-c', 'dataset-d'],
      mapConfigs: [],
    });
    expect(deletedNames).toContain('guest_favourites');
  });

  it('does not clear guest favourites cookie when persistence fails', async () => {
    mockedGetUserData.mockResolvedValue({
      Item: {
        uuid: 'user-123',
        favourites: ['dataset-a'],
        mapConfigs: [],
      },
    });
    mockedPutUserData.mockResolvedValue({ ok: false });

    const { cookies, deletedNames } = createCookieHarness({
      guest_favourites: 'dataset-z',
    });

    await mergeGuestFavourites(cookies);

    expect(mockedPutUserData).toHaveBeenCalledTimes(1);
    expect(deletedNames).not.toContain('guest_favourites');
  });
});
