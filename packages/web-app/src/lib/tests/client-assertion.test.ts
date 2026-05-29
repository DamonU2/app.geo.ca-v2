import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestSigningKey } from '$lib/tests/auth-test-helpers';
import { createClientAssertionJwt } from '$lib/utils/auth/client-assertion.server';
import { decodeBase64UrlJson } from '$lib/utils/auth/base64url';

/** Decoded JWT header shape used in client assertion verification tests. */
type TestJwtHeader = {
  alg?: string;
  typ?: string;
};

/** Decoded JWT payload shape used in client assertion verification tests. */
type TestJwtPayload = {
  iss?: string;
  sub?: string;
  aud?: string;
  iat?: number;
  exp?: number;
};

describe('createClientAssertionJwt', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates a valid RS256 JWT assertion', () => {
    const clientId = 'test-client-id';
    const tokenEndpointUrl = 'https://auth.example.com/oauth2/token';
    const { privateKeyPem } = createTestSigningKey('test-key-1');

    const assertion = createClientAssertionJwt(clientId, tokenEndpointUrl, privateKeyPem);

    // Verify compact JWT format (three dot-separated parts)
    const parts = assertion.split('.');
    expect(parts).toHaveLength(3);

    // Decode and validate header
    const header = decodeBase64UrlJson<TestJwtHeader>(parts[0]);
    expect(header).toMatchObject({
      alg: 'RS256',
      typ: 'JWT',
    });

    // Decode and validate payload
    const payload = decodeBase64UrlJson<TestJwtPayload>(parts[1]);
    expect(payload).toMatchObject({
      iss: clientId,
      sub: clientId,
      aud: tokenEndpointUrl,
    });

    // Verify iat and exp are present and numeric
    expect(typeof payload?.iat).toBe('number');
    expect(typeof payload?.exp).toBe('number');
    expect(payload?.exp).toBe((payload?.iat ?? 0) + 300); // 5 minute expiration
  });

  it('sets correct expiration time (iat + 300 seconds)', () => {
    const now = Math.floor(Date.now() / 1000);
    vi.setSystemTime(new Date(now * 1000));

    const clientId = 'test-client-id';
    const tokenEndpointUrl = 'https://auth.example.com/oauth2/token';
    const { privateKeyPem } = createTestSigningKey('test-key-1');

    const assertion = createClientAssertionJwt(clientId, tokenEndpointUrl, privateKeyPem);
    const parts = assertion.split('.');
    const payload = decodeBase64UrlJson<TestJwtPayload>(parts[1]);

    expect(payload?.iat).toBe(now);
    expect(payload?.exp).toBe(now + 300);
  });

  it('includes the correct issuer and subject claims', () => {
    const clientId = 'my-oauth-client-123';
    const tokenEndpointUrl = 'https://auth.example.com/oauth2/token';
    const { privateKeyPem } = createTestSigningKey('test-key-1');

    const assertion = createClientAssertionJwt(clientId, tokenEndpointUrl, privateKeyPem);
    const parts = assertion.split('.');
    const payload = decodeBase64UrlJson<TestJwtPayload>(parts[1]);

    expect(payload?.iss).toBe(clientId);
    expect(payload?.sub).toBe(clientId);
  });

  it('includes the token endpoint URL as the audience claim', () => {
    const clientId = 'test-client-id';
    const tokenEndpointUrl = 'https://auth.example.com/oauth2/token';
    const { privateKeyPem } = createTestSigningKey('test-key-1');

    const assertion = createClientAssertionJwt(clientId, tokenEndpointUrl, privateKeyPem);
    const parts = assertion.split('.');
    const payload = decodeBase64UrlJson<TestJwtPayload>(parts[1]);

    expect(payload?.aud).toBe(tokenEndpointUrl);
  });

  it('produces different signatures for different private keys', () => {
    const clientId = 'test-client-id';
    const tokenEndpointUrl = 'https://auth.example.com/oauth2/token';
    const { privateKeyPem: key1 } = createTestSigningKey('key-1');
    const { privateKeyPem: key2 } = createTestSigningKey('key-2');

    vi.setSystemTime(new Date());

    const assertion1 = createClientAssertionJwt(clientId, tokenEndpointUrl, key1);
    const assertion2 = createClientAssertionJwt(clientId, tokenEndpointUrl, key2);

    // Signatures should be different for different keys
    expect(assertion1).not.toBe(assertion2);

    // But header and payload should be identical
    const parts1 = assertion1.split('.');
    const parts2 = assertion2.split('.');
    expect(parts1[0]).toBe(parts2[0]); // Same header
    expect(parts1[1]).toBe(parts2[1]); // Same payload
    expect(parts1[2]).not.toBe(parts2[2]); // Different signatures
  });

  it('throws error for invalid private key format', () => {
    const clientId = 'test-client-id';
    const tokenEndpointUrl = 'https://auth.example.com/oauth2/token';
    const invalidPrivateKey = 'not-a-valid-pem-key';

    expect(() => {
      createClientAssertionJwt(clientId, tokenEndpointUrl, invalidPrivateKey);
    }).toThrow();
  });

  it('handles special characters in client ID and URL', () => {
    const clientId = 'client-with-special_chars-123';
    const tokenEndpointUrl = 'https://auth.example.com:8443/oauth2/v1/token?version=2.0';
    const { privateKeyPem } = createTestSigningKey('test-key-1');

    const assertion = createClientAssertionJwt(clientId, tokenEndpointUrl, privateKeyPem);
    const parts = assertion.split('.');
    const payload = decodeBase64UrlJson<TestJwtPayload>(parts[1]);

    expect(payload?.iss).toBe(clientId);
    expect(payload?.aud).toBe(tokenEndpointUrl);
  });

  it('produces deterministic output for the same timestamp', () => {
    const clientId = 'test-client-id';
    const tokenEndpointUrl = 'https://auth.example.com/oauth2/token';
    const { privateKeyPem } = createTestSigningKey('test-key-1');

    // Fix system time
    const fixedTime = new Date('2024-01-15T12:00:00Z');
    vi.setSystemTime(fixedTime);

    const assertion1 = createClientAssertionJwt(clientId, tokenEndpointUrl, privateKeyPem);
    const assertion2 = createClientAssertionJwt(clientId, tokenEndpointUrl, privateKeyPem);

    // Same input, same time = same output (deterministic signing with same key)
    expect(assertion1).toBe(assertion2);
  });
});
