import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { getUserData, putUserData } from '$lib/db/user';
import type { MapConfigFavourite } from '$lib/db/db-types';

const MAX_SAVED_MAPS = 25;

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
 * Normalizes a map name value from request payload.
 */
function sanitizeName(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Returns true when a payload looks like a serializable config object.
 */
function isValidMapConfig(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Generates a unique map name based on existing saved map names.
 */
function createUniqueMapName(baseName: string, existingMaps: MapConfigFavourite[]): string {
  const normalizedBase = baseName || 'My Map';
  const existingNames = new Set(existingMaps.map((mapItem) => mapItem.name));

  if (!existingNames.has(normalizedBase)) {
    return normalizedBase;
  }

  let suffix = 2;
  let candidate = `${normalizedBase} ${suffix}`;
  while (existingNames.has(candidate)) {
    suffix += 1;
    candidate = `${normalizedBase} ${suffix}`;
  }

  return candidate;
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
  userData.Item.mapConfigs = userData.Item.mapConfigs ?? [];
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
  userData.Item.mapConfigs = userData.Item.mapConfigs ?? [];
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
  userData.Item.mapConfigs = userData.Item.mapConfigs ?? [];
  const result = await putUserData(userData.Item, cookies);
  return json({ ok: result.ok, favourites: [] });
};

/**
 * Mutates saved map configs for the signed-in user.
 */
export const PATCH: RequestHandler = async ({ cookies, request }): Promise<Response> => {
  const userData = await getUserData(cookies);
  if (!userData.Item.uuid) {
    return json({ ok: false, mapConfigs: [] }, { status: 401 });
  }

  const payload = (await request.json()) as {
    action?: 'createMapConfig' | 'deleteMapConfig';
    id?: string;
    name?: string;
    config?: unknown;
  };

  const mapConfigs = userData.Item.mapConfigs ?? [];

  if (payload.action === 'createMapConfig') {
    if (mapConfigs.length >= MAX_SAVED_MAPS) {
      return json({ ok: false, mapConfigs, reason: 'limit' }, { status: 400 });
    }

    if (!isValidMapConfig(payload.config)) {
      return json({ ok: false, mapConfigs, reason: 'invalid-config' }, { status: 400 });
    }

    const requestedName = sanitizeName(payload.name);
    const baseName = requestedName || 'My Map';
    const finalName = createUniqueMapName(baseName, mapConfigs);
    const createdAt = new Date().toISOString();

    const mapConfig: MapConfigFavourite = {
      id: crypto.randomUUID(),
      name: finalName,
      config: payload.config,
      createdAt,
    };

    userData.Item.mapConfigs = [...mapConfigs, mapConfig];
    userData.Item.favourites = userData.Item.favourites ?? [];

    const result = await putUserData(userData.Item, cookies);
    if (!result.ok) {
      return json({ ok: false, mapConfigs, reason: 'persist-failed' }, { status: 500 });
    }

    return json({ ok: result.ok, mapConfigs: userData.Item.mapConfigs });
  }

  if (payload.action === 'deleteMapConfig') {
    const id = sanitizeId(payload.id);
    if (!id) {
      return json({ ok: false, mapConfigs, reason: 'invalid-id' }, { status: 400 });
    }

    userData.Item.mapConfigs = mapConfigs.filter((mapItem) => mapItem.id !== id);
    userData.Item.favourites = userData.Item.favourites ?? [];

    const result = await putUserData(userData.Item, cookies);
    if (!result.ok) {
      return json({ ok: false, mapConfigs, reason: 'persist-failed' }, { status: 500 });
    }

    return json({ ok: result.ok, mapConfigs: userData.Item.mapConfigs });
  }

  return json({ ok: false, mapConfigs, reason: 'invalid-action' }, { status: 400 });
};
