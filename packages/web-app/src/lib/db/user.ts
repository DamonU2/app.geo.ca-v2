import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { getToken } from '$lib/utils/auth/parse-jwt';
import { getAwsRegion } from '$lib/utils/aws-region';
import type { UserInfo, UserData, TokenResponse } from './db-types';
import type { Cookies } from '@sveltejs/kit';
import { USER_TABLE_NAME } from '$env/static/private';
import { clearAuthCookies } from '$lib/utils/auth/auth-cookies';

const awsRegion = getAwsRegion();
const client = new DynamoDBClient({ region: awsRegion });
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

let didWarnExpiredAwsToken = false;

/**
 * Checks whether an SDK error indicates expired AWS temporary credentials.
 *
 * @param error - Unknown error thrown by AWS SDK call.
 * @returns True when the error matches an expired token shape.
 */
function isExpiredAwsTokenError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const candidate = error as { name?: unknown; __type?: unknown };
  const name = typeof candidate.name === 'string' ? candidate.name : '';
  const type = typeof candidate.__type === 'string' ? candidate.__type : '';
  return name.includes('ExpiredTokenException') || type.includes('ExpiredTokenException');
}

/**
 * Logs a single actionable warning for expired local AWS credentials.
 */
function warnExpiredAwsTokenOnce(): void {
  if (didWarnExpiredAwsToken) {
    return;
  }

  didWarnExpiredAwsToken = true;
  console.warn('[auth/user] AWS session credentials are expired; DynamoDB user data is unavailable until credentials are refreshed.');
}

/**
 * Extracts the stable user identifier from decoded token claims.
 *
 * @param token - Parsed token response.
 * @returns User key (`sub` preferred, `username` fallback) or null.
 */
function getUserKey(token: TokenResponse): string | null {
  if (!token.ok || !token.value) {
    return null;
  }
  return (token.value.sub as string | undefined) ?? (token.value.username as string | undefined) ?? null;
}

/**
 * Extracts the issue time from the token payload.
 *
 * @param token - Parsed token response.
 * @returns The issue time in seconds since epoch when available; otherwise null.
 */
function getTokenIssuedAt(token: TokenResponse): number | null {
  if (!token.ok || !token.value || typeof token.value.iat !== 'number') {
    return null;
  }

  return token.value.iat;
}

/**
 * Fetches user data from the database using the provided cookies.
 *
 * @param cookies - The cookies object containing user session data.
 * @returns A promise that resolves to the user data.
 */
const getUserData = async (cookies: Cookies): Promise<UserInfo> => {
  const token: TokenResponse = await getToken(cookies);
  const userKey = getUserKey(token);
  if (!userKey) return { Item: { uuid: null, favourites: [], mapConfigs: [] } };

  const fallbackUserData: UserInfo = { Item: { uuid: userKey, favourites: [], mapConfigs: [] } };

  if (!USER_TABLE_NAME) {
    return fallbackUserData;
  }

  const command = new GetCommand({
    TableName: USER_TABLE_NAME,
    Key: {
      uuid: userKey,
    },
  });

  let response: UserInfo;
  try {
    response = (await docClient.send(command)) as unknown as UserInfo;
  } catch (error) {
    if (isExpiredAwsTokenError(error)) {
      warnExpiredAwsTokenOnce();
      return fallbackUserData;
    }

    console.error('Error fetching user data.');
    console.error(error);
    return fallbackUserData;
  }

  if (response?.Item === undefined || response.Item === null) {
    return fallbackUserData;
  }

  if (!Array.isArray(response.Item.mapConfigs)) {
    response.Item.mapConfigs = [];
  }

  const tokenIssuedAt = getTokenIssuedAt(token);
  // Back-channel revocation is stored server-side; reject tokens issued before that marker.
  if (typeof response.Item.authRevokedAt === 'number' && (tokenIssuedAt === null || tokenIssuedAt <= response.Item.authRevokedAt)) {
    clearAuthCookies(cookies);
    return { Item: { uuid: null, favourites: [], mapConfigs: [] } };
  }

  return response;
};

/**
 * Stores user data in the database.
 *
 * @param data - The user data to store.
 * @param cookies - The cookies object containing user session data.
 * @returns A promise that resolves to the result of the operation.
 */
const putUserData = async (data: Partial<UserData>, cookies: Cookies): Promise<Record<'ok', boolean>> => {
  const token: TokenResponse = await getToken(cookies);
  const userKey = getUserKey(token);
  if (!userKey) return { ok: false };

  if (!USER_TABLE_NAME) {
    return { ok: false };
  }

  data.uuid = userKey;

  try {
    await docClient.send(
      new PutCommand({
        TableName: USER_TABLE_NAME,
        Item: data,
      })
    );
    return { ok: true };
  } catch (error) {
    if (isExpiredAwsTokenError(error)) {
      warnExpiredAwsTokenOnce();
      return { ok: false };
    }

    console.error('Error storing user data.');
    console.error(error);
    return { ok: false };
  }
};

/**
 * Marks a user session as revoked for back-channel logout handling.
 *
 * @param userKey - Stable user identifier from the token.
 * @param revokedAt - Revocation time in seconds since epoch.
 * @returns True when the revocation marker is stored successfully.
 */
const markUserAuthRevoked = async (userKey: string, revokedAt: number): Promise<boolean> => {
  if (!USER_TABLE_NAME) {
    return false;
  }

  try {
    await docClient.send(
      new UpdateCommand({
        TableName: USER_TABLE_NAME,
        Key: {
          uuid: userKey,
        },
        UpdateExpression: 'SET authRevokedAt = :authRevokedAt',
        ExpressionAttributeValues: {
          ':authRevokedAt': revokedAt,
        },
      })
    );
    return true;
  } catch (error) {
    if (isExpiredAwsTokenError(error)) {
      warnExpiredAwsTokenOnce();
      return false;
    }

    console.error('Error storing auth revocation marker.');
    console.error(error);
    return false;
  }
};

export { getUserData, putUserData, markUserAuthRevoked };
