import { beforeEach, describe, expect, it, vi } from 'vitest';

const { docSendMock, getTokenMock, clearAuthCookiesMock } = vi.hoisted(() => ({
  docSendMock: vi.fn(),
  getTokenMock: vi.fn(),
  clearAuthCookiesMock: vi.fn(),
}));

vi.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: vi.fn(),
}));

vi.mock('@aws-sdk/lib-dynamodb', () => {
  class GetCommand {
    input: unknown;

    constructor(input: unknown) {
      this.input = input;
    }
  }

  return {
    DynamoDBDocumentClient: {
      from: vi.fn(() => ({ send: docSendMock })),
    },
    GetCommand,
    PutCommand: class {},
    UpdateCommand: class {},
  };
});

vi.mock('$lib/utils/aws-region', () => ({
  getAwsRegion: vi.fn(() => 'ca-central-1'),
}));

vi.mock('$lib/utils/auth/parse-jwt', () => ({
  getToken: getTokenMock,
}));

vi.mock('$lib/utils/auth/auth-cookies', () => ({
  clearAuthCookies: clearAuthCookiesMock,
}));

vi.mock('$env/static/private', () => ({
  USER_TABLE_NAME: 'users-table',
}));

import { getUserData } from '$lib/db/user';

describe('getUserData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTokenMock.mockResolvedValue({ ok: true, value: { sub: 'user-123', iat: 1700000001 } });
  });

  it('marks user data as unavailable when DynamoDB reads fail', async () => {
    docSendMock.mockRejectedValueOnce(new Error('ddb unavailable'));

    await expect(getUserData({} as never)).resolves.toMatchObject({
      status: 'unavailable',
      Item: { uuid: 'user-123', favourites: [], mapConfigs: [] },
    });
  });

  it('marks user data as missing when no DynamoDB item exists yet', async () => {
    docSendMock.mockResolvedValueOnce({});

    await expect(getUserData({} as never)).resolves.toMatchObject({
      status: 'missing',
      Item: { uuid: 'user-123', favourites: [], mapConfigs: [] },
    });
  });
});
