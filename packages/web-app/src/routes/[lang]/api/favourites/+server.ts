import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { getUserData, putUserData } from '$lib/db/user';

/**
 * Normalizes a candidate favourite id from request payload.
 *
 * @param value - Unknown JSON field value.
 * @returns Trimmed id string or an empty string when invalid.
 */
function sanitizeId(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Adds a record id to the signed-in user's favourites.
 */
export const POST: RequestHandler = async ({ cookies, request }): Promise<Response> => {
  const userData = await getUserData(cookies);
  if (!userData.Item.uuid) {
    return json({ ok: false, favourites: [] }, { status: 401 });
  }

  const payload = (await request.json()) as { id?: string };
  const id = sanitizeId(payload.id);
  if (!id) {
    return json({ ok: false, favourites: userData.Item.favourites }, { status: 400 });
  }

  userData.Item.favourites = Array.from(new Set([...(userData.Item.favourites ?? []), id]));
  const result = await putUserData(userData.Item, cookies);
  return json({ ok: result.ok, favourites: userData.Item.favourites });
};

/**
 * Removes a record id from the signed-in user's favourites.
 */
export const DELETE: RequestHandler = async ({ cookies, request }): Promise<Response> => {
  const userData = await getUserData(cookies);
  if (!userData.Item.uuid) {
    return json({ ok: false, favourites: [] }, { status: 401 });
  }

  const payload = (await request.json()) as { id?: string };
  const id = sanitizeId(payload.id);
  if (!id) {
    return json({ ok: false, favourites: userData.Item.favourites }, { status: 400 });
  }

  userData.Item.favourites = (userData.Item.favourites ?? []).filter((favourite: string) => favourite !== id);
  const result = await putUserData(userData.Item, cookies);
  return json({ ok: result.ok, favourites: userData.Item.favourites });
};

/**
 * Clears all favourites for the signed-in user.
 */
export const PUT: RequestHandler = async ({ cookies }): Promise<Response> => {
  const userData = await getUserData(cookies);
  if (!userData.Item.uuid) {
    return json({ ok: false, favourites: [] }, { status: 401 });
  }

  userData.Item.favourites = [];
  const result = await putUserData(userData.Item, cookies);
  return json({ ok: result.ok, favourites: [] });
};
