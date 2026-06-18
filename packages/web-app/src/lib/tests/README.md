# Web App Test Guide

This directory contains focused Vitest suites for the web-app package. Most of the current coverage is around the OIDC sign-in flow, logout handling, scope policy enforcement, and favourites API mutations.

## How to run tests

Run from the web-app package directory:

```bash
npm run test
```

Run a single suite:

```bash
npm run test -- src/lib/tests/id-token-verification.test.ts
```

Run a small group of related suites:

```bash
npm run test -- src/lib/tests/sign-in-core.test.ts src/lib/tests/sign-in-core-token-exchange.test.ts src/lib/tests/id-token-verification.test.ts
```

If you are starting from the repository root, change into the package first:

```bash
cd packages/web-app
npm run test
```

## Test runner configuration

- Test runner: Vitest
- Config file: `packages/web-app/vite.config.ts`
- Included test pattern: `src/**/*.test.ts`
- Runtime environment: Node

## Suite overview

### Auth flow

- `sign-in-send-route.test.ts`
  - Verifies the sign-in start route sets PKCE and nonce cookies and redirects to the provider, or falls back safely when auth is not configured.

- `sign-in-receive-route.test.ts`
  - Verifies the callback route handles missing codes, failed token exchange paths, ID token verification, auth cookie storage, and post-auth redirect behavior.

- `sign-in-post-auth.test.ts`
  - Verifies post-auth redirect sanitization and guest favourites merge behavior, including cookie cleanup only after persistence succeeds.

- `sign-in-core.test.ts`
  - Covers low-level auth helpers such as PKCE challenge generation, one-time cookie consumption, and authorize URL scope construction.

- `sign-in-core-token-exchange.test.ts`
  - Covers token exchange policy for `private_key_jwt` versus `client_secret_post`, including fail-closed behavior outside localhost.

- `scope-policy.test.ts`
  - Covers `OIDC_REQUESTED_SCOPES` parsing, authorize scope generation, and scoped ID token claim validation.

- `id-token-verification.test.ts`
  - Verifies ID token signature/claims handling including expiration, nonce validation, issuer discovery fallback, and scoped claim validation.

- `client-assertion.test.ts`
  - Covers RS256 client assertion JWT creation for `private_key_jwt`, including claim contents, expiration, determinism, and invalid key handling.

- `secrets-manager-policy.test.ts`
  - Verifies IAM policy generation for AWS Secrets Manager access to the private key used in `private_key_jwt` authentication.

### Logout handling

- `back-channel-logout.test.ts`
  - Verifies back-channel logout token validation, including audience, required logout event, `jti`, and supported signing algorithm checks.

- `back-channel-logout-route.test.ts`
  - Verifies the back-channel logout route returns the right status codes for missing tokens, invalid tokens, replayed logout notifications, persistence failures, and successful revocation.

- `sign-in-logout-route.test.ts`
  - Verifies the logout route clears auth cookies and redirects appropriately for signed-in and guest users.

- `user-revocation.test.ts`
  - Covers the `markUserAuthRevoked()` database operation that records back-channel logout revocation markers (`authRevokedAt`).

### Favourites

- `favourites-api.test.ts`
  - Covers map-config create/delete behavior in the favourites API, including duplicate-name auto-renaming and the max-item limit.

- `favourites-route-split.test.ts`
  - Verifies the split favourites routes (`/favourites`, `/favourites/datasets`, `/favourites/maps`, `/favourites/view`) correctly load page data and remain accessible to guests and signed-in users.

- `user-data-loading.test.ts`
  - Covers the `getUserData()` function for loading user DynamoDB records by UUID, including various load status states (anonymous, ok, missing, unavailable).

## Shared test helpers

- `auth-test-helpers.ts`
  - Provides reusable helpers for auth tests, including temporary RSA key generation, OIDC discovery/JWKS stubbing, and signed JWT creation.

## Practical tips

- Most auth route tests use `vi.mock(...)` to isolate route behavior from lower-level helpers.
- Many auth tests rely on `vi.stubEnv(...)` for OIDC configuration and scope policy setup.
- If a change affects OIDC flow behavior, the fastest validation set is usually:

```bash
npm run test -- src/lib/tests/sign-in-core.test.ts src/lib/tests/sign-in-core-token-exchange.test.ts src/lib/tests/id-token-verification.test.ts src/lib/tests/sign-in-receive-route.test.ts
```

- If a change affects logout handling, run:

```bash
npm run test -- src/lib/tests/back-channel-logout.test.ts src/lib/tests/back-channel-logout-route.test.ts src/lib/tests/sign-in-logout-route.test.ts
```

- If a change affects favourites routes or API, run:

```bash
npm run test -- src/lib/tests/favourites-api.test.ts src/lib/tests/favourites-route-split.test.ts src/lib/tests/user-data-loading.test.ts
```
