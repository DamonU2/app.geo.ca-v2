# CATS 3.0.2 Manual Checklist

Use this checklist with the CATS 3.0.2 Test guide and Test report. It covers the RP-facing conformance assertions that require human-observed evidence. Automated tests may support an assertion, but do not replace the required request, response, registration, browser, or server evidence.

The guide's CanadaLogin discovery metadata, registration, and OP TLS posture are test inputs or OP responsibilities. This checklist verifies that the RP consumes them correctly, uses exact registered values, and uses secure transport. CanadaLogin's own compliance is out of scope.

## Scope and output

- Manual assertions covered: DR1-DR9, AA1-AA15, AP1-AP11, sign-in-failure AC1-AC3, LP1-LP2, SSO1-SSO2, LO1-LO6, and BLO1-BLO12. Client-secret token assertions CS-AC1-CS-AC2 and FLO1-FLO7 are retained as conditional references and are `not applicable` for the supplied staging registration.
- Each assertion must end with a clear outcome: pass, fail, or blocked.
- Every pass/fail decision must include attached evidence artifacts.
- Use the exact assertion IDs from the CATS guide. Do not reuse `AC1` from the sign-in failure table for the token authentication table without recording the section name.

## Staging registration profile

Use this profile when executing the checklist against the supplied staging registration form. Record a different profile before testing another environment.

| Registration item              | Staging value                                          | Checklist impact                                                       |
| ------------------------------ | ------------------------------------------------------ | ---------------------------------------------------------------------- |
| Redirect URI                   | `https://app-stage.geo.ca/sign-in/receive`             | DR3, DR4, AA3                                                          |
| Post-logout redirect URI       | `https://app-stage.geo.ca/sign-in/logout`              | DR3, DR6, LO1-LO3                                                      |
| Logout request URL             | `https://app-stage.geo.ca/sign-in/back-channel-logout` | BLO1-BLO12 applicable; FLO1-FLO7 not applicable                        |
| Client/authentication          | Confidential, Authorization Code, `private_key_jwt`    | AP1-AP11 applicable; token-table CS-AC1-CS-AC2 not applicable          |
| Key exchange                   | Offline public certificate/JWK; no RP `jwks_uri`       | DR9 verifies registered offline key and `kid`; do not fetch an RP JWKS |
| Requested scopes               | `openid` only                                          | AA5 applies; do not require profile/email/phone/language claims        |
| PKCE                           | S256                                                   | AA13 applies                                                           |
| RP message signing             | Token endpoint, RS256                                  | AP1-AP11 applies; request-object tests do not apply                    |
| CanadaLogin message validation | ID Token, RS256                                        | AA14-AA15 apply; UserInfo tests do not apply                           |
| Encryption/decryption          | Not selected                                           | Do not require JWE, JARM, or encrypted-message evidence                |

The public certificate/JWK from the form is registration evidence. Do not copy private key material into this checklist or evidence artifacts.

## Start here: tester runbook

Use this section if you are running the application tests for the first time. The remaining sections explain the CATS assertion details and provide the evidence to save.

### 1. Confirm the application is ready

Before opening a browser, obtain the staging deployment URL, build/commit identifier, a CanadaLogin test user, and access to the RP deployment logs. Confirm the environment is the staging registration described above. Do not use a local URL for a staging pass.

Open one of these application entry points:

- English: `https://app-stage.geo.ca/en-ca`
- French: `https://app-stage.geo.ca/fr-ca`

To run the supporting automated checks from the repository root, use:

```powershell
npm --prefix packages/web-app run test:cats
```

The command should finish with zero failed tests. Save its terminal output or CI link with the evidence set.

The sign-in button starts the RP flow. The RP sends the browser to CanadaLogin, then CanadaLogin returns the browser to the fixed callback `https://app-stage.geo.ca/sign-in/receive`.

### 2. Prepare browser evidence

Use Chrome or Edge and open DevTools with `F12` before starting a flow.

1. Select **Network**.
2. Turn on **Preserve log** and **Disable cache** while DevTools is open.
3. Clear the existing network entries.
4. Start the flow from the RP, not by typing a callback URL directly.
5. Use the Network filter to find `authorize`, `token`, `logout`, or `back-channel`.
6. Open a request and record its method, full URL, status, query parameters, form body, and response location. Use screenshots or **Save all as HAR**; redact secrets and tokens before storing the file.
7. Use **Application > Cookies** only to confirm that cookies appear or are cleared. Never include cookie values in evidence.

For a sign-in request, the useful sequence is: RP page -> `authorize` request -> CanadaLogin login page -> `/sign-in/receive?code=...&state=...` -> protected RP page. For RP-initiated logout, the sequence is: RP sign-out action -> `end_session_endpoint` -> CanadaLogin confirmation/redirect -> `/sign-in/logout`.

### 3. Prepare screenshots and logs

For every screenshot, include the browser address bar when the URL matters. Capture the page before and after the action, not only the final page. For server evidence, save the log lines covering the same timestamp as the browser request and search for the relevant endpoint category, such as `discovery`, `authorization`, `token-exchange`, `id-token`, or `back-channel-logout`.

Use one artifact folder per run, for example `CATS-3.0.2-evidence/staging/20260924/`. Name files with the assertion ID and step, such as `20260924-1430-AA2-authorization-request.har` or `20260924-1435-BLO10-response.png`.

### 4. Use the result rules

- **Pass:** the observed behavior matches the Expected result and the required evidence is saved.
- **Fail:** the behavior is observable but does not match; record the expected value, observed value, and evidence path.
- **Blocked:** the behavior could not be tested because a required account, registration, endpoint, log, or second RP was unavailable.
- **Not applicable:** the assertion is for an unregistered mechanism. For this staging profile, use this for CS-AC1-CS-AC2 and FLO1-FLO7.

Do not mark a test pass only because an automated unit test passed. Unit tests prove implementation behavior; browser, registration, CanadaLogin, and deployment assertions require the corresponding live evidence.

### 5. Run the blocks in order

1. **Block A:** prove discovery, registration, endpoints, keys, and TLS.
2. **Block B:** capture one successful English sign-in, then repeat the language portion in French.
3. **Block C:** test controlled sign-in failures, then run the three RP-initiated logout variants and the back-channel baseline.
4. **Block E:** use two RPs for logout propagation and session targeting.
5. **Block F:** use the same two RPs for SSO. Block D is skipped for the supplied staging registration because front-channel logout is not registered.

At the end of each block, complete its rows in the Compact execution log immediately while the evidence and timestamps are available.

### 6. Run the live discovery smoke test

Run this before Block A. It checks the live CanadaLogin discovery document and the RP-initiated logout endpoint, but it does not sign a user in, inspect client registration, or replace the browser/manual tests.

From the repository root in PowerShell:

```powershell
$env:CATS_DISCOVERY_URL = "https://auth.login-connexion.alpha.canada.ca/oauth2/.well-known/openid-configuration"
npm --prefix packages/web-app run test:cats:live
npm --prefix packages/web-app run test:cats:evidence
```

What the commands do:

1. `test:cats:live` downloads the discovery JSON over HTTPS.
2. It checks DR1 for non-empty `issuer`, `authorization_endpoint`, `token_endpoint`, and `jwks_uri` fields.
3. It checks DR2 by requesting the discovered `end_session_endpoint` and recording whether it is available.
4. `test:cats:evidence` incorporates the live result into the generated CATS summary files.

Expected output files:

- `docs/generated/cats-live-smoke.json`: discovery URL, DR1/DR2 status, and endpoint details.
- `docs/generated/cats-results.json`: assertion-level evidence summary.
- `docs/generated/cats-results.md`: human-readable evidence summary.

How to interpret the result:

- `DR1: pass` means the required discovery fields were present; it does not prove the RP consumed them correctly.
- `DR2: pass` means the discovered logout endpoint responded without a missing-endpoint failure; it does not prove RP-initiated logout works end to end.
- If the script prints `Skipping: CATS_DISCOVERY_URL is not set`, the smoke test was not run. Record it as blocked or rerun with the environment variable set; never record it as pass.
- If the command fails, save the terminal output, record the observed HTTP status or error, and continue only with the remaining tests that do not depend on the failed discovery result.

After the smoke test, attach `cats-live-smoke.json` to the DR1 and DR2 sign-off evidence and continue with the registration screenshots and browser checks in Block A.

## Application route map

| What you are testing         | Where to start or look                                       | What success looks like                                                                                  |
| ---------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| English sign-in              | `https://app-stage.geo.ca/en-ca` then the RP sign-in control | CanadaLogin opens, then the RP callback and protected page load                                          |
| French sign-in               | `https://app-stage.geo.ca/fr-ca` then the RP sign-in control | Same flow with French RP/OP presentation where supported                                                 |
| Authorization callback       | `https://app-stage.geo.ca/sign-in/receive`                   | The callback is reached with a one-time `code` and matching `state`; it is not a page to visit manually  |
| RP-initiated logout          | Signed-in RP profile/menu **Sign out** control               | Browser visits CanadaLogin `end_session_endpoint`, then the registered post-logout URI                   |
| Local post-logout landing    | `https://app-stage.geo.ca/sign-in/logout`                    | Local auth cookies are cleared and the user reaches the language-appropriate RP page                     |
| Back-channel logout receiver | `https://app-stage.geo.ca/sign-in/back-channel-logout`       | CanadaLogin sends a server-to-server `logout_token`; the RP returns HTTP 204 after successful processing |

The callback and back-channel URLs are endpoints used by the flow. A tester should normally reach them through the sign-in or logout action and should not paste them into the address bar as a substitute for the real flow.

## Automated coverage boundary

The focused suite was run with `npm --prefix packages/web-app run test:cats` on 2026-09-24: 12 files and 121 tests passed. Use those results as supporting evidence for the following implementation-level checks:

- `AA4-AA7`, `AA10-AA13`: authorization URL construction, `code` response type, scopes, state/nonce generation, PKCE, and authorization-code token parameters are covered by `sign-in-core.test.ts` and `sign-in-core-token-exchange.test.ts`.
- `AA8`, `AA14-AA15`, and `LP1`: RP locale emission and ID-token `exp`, `nbf`, issuer, audience, nonce, and signature validation are covered by `sign-in-core.test.ts`, `id-token-verification.test.ts`, and `oidc-claims.test.ts`.
- `AP1-AP11`: client assertion shape, signature, `iss`, `sub`, `aud`, `exp`, `iat`, `jti`, and per-request generation are covered by `client-assertion.test.ts` and token-exchange tests.
- Token-table `CS-AC1-CS-AC2` (official CATS IDs AC1-AC2): client-secret token request behavior is covered by `sign-in-core-token-exchange.test.ts`, but is not applicable to the supplied staging registration.
- Callback failure handling and local logout safety are covered by `sign-in-receive-route.test.ts`, `sign-in-post-auth.test.ts`, `sign-in-logout-route.test.ts`, and `front-channel-logout-route.test.ts`.
- Back-channel token validation and acknowledgement status are covered by `back-channel-logout.test.ts` and `back-channel-logout-route.test.ts`.

The suite does not establish live CanadaLogin behavior or deployment evidence. For the supplied staging profile, perform the manual checks for discovery and registration (`DR1-DR9`), live request transport and exact values (`AA1-AA3`, `AA8-AA9`), browser language and SSO (`LP1-LP2`, `SSO1-SSO2`), live sign-in failure behavior (AC1-AC3), RP-initiated logout variants (`LO1-LO6`), and back-channel propagation/session targeting (`BLO1-BLO12`). Mark client-secret token assertions (`CS-AC1-CS-AC2`, official CATS IDs AC1-AC2) and front-channel assertions (`FLO1-FLO7`) not applicable. Attach the test report or focused test output to the relevant sign-off rows instead of treating it as a substitute for manual checks.

## Test preconditions

1. Confirm target environment and stage name (for example: staging).
2. Confirm RP build/version under test.
3. Prepare two browser profiles (or one normal window + one private window) for multi-session checks.
4. Enable browser network capture (HAR or DevTools export) when required below.
5. Ensure log access is available for RP server logs and OP logout events.
6. For LO4-LO6, BLO2, BLO10, and BLO12 (multi-RP sign-out): have access to a second OIDC RP integrated with CanadaLogin. The CanadaLogin test-environment RP simulator (rp.app.login-connexion.alpha.canada.ca) may be used as the second RP; it is not itself CATS-compliant but is sufficient for these checks. Cross-protocol logout is not supported, so the second RP must also be OIDC.
7. For the supplied staging profile, test back-channel logout only. Do not execute FLO1-FLO7 unless a later CanadaLogin registration explicitly enables front-channel logout.
8. A Canada.ca subdomain is required only when front-channel logout is registered. It is not required for the supplied staging profile, which uses back-channel logout.
9. Complete Block A (discovery and registration) before Blocks C-F: those tests confirm `end_session_endpoint` responds as expected and is a required input for RP-initiated logout testing.
10. Record the RP profile under test. For supplied staging, use confidential Authorization Code + `private_key_jwt` with offline key exchange. `client_secret_basic` is not implemented by this RP; `client_secret_post` is only a localhost development fallback. Public clients using PKCE S256 are not currently supported by CanadaLogin.
11. For sign-in tests, capture both the outbound authorization request and the inbound callback, with `state`, `nonce`, `code`, and tokens redacted where necessary but still correlatable.
12. For sign-out tests, record whether the RP is registered for back-channel or front-channel logout and whether session-required back-channel behavior is configured.

## Evidence capture standard

1. Include timestamp in every artifact filename: YYYYMMDD-HHMM-<assertion>-<step>.<ext>.
2. Capture full URL bar in screenshots whenever endpoint correctness is part of the assertion.
3. Capture response status code and key fields for network evidence.
4. Redact secrets, tokens, and personal identifiers before storing artifacts.
5. Record artifact links/paths in the sign-off table at the end of this file.

## Execution plan

Use this order to minimize repeated setup and surface high-risk issues early.

### Block A - Discovery, registration, and transport

Assertions: DR1-DR9

Estimated time:

- 25 to 40 minutes

Shared setup:

- Retrieve the CanadaLogin discovery metadata over HTTPS (`GET /.well-known/openid-configuration`) and save a copy for the test record. Discovery and registration are test inputs, not objects of RP compliance testing; these checks confirm the RP's client registration aligns with the CATS 3.0.2 profile.
- Open CanadaLogin registration/configuration screens.
- Open RP config or deployment evidence needed for endpoint and key registration checks.
- Open browser DevTools for DR8 capture.

Tester actions:

1. Open the staging registration record and keep it beside the RP deployment configuration.
2. In a new browser tab, request the staging discovery URL from the Integration Guide: `https://auth.login-connexion.alpha.canada.ca/oauth2/.well-known/openid-configuration`.
3. Save the JSON response before formatting or editing it. Highlight the `issuer`, `authorization_endpoint`, `token_endpoint`, `jwks_uri`, and `end_session_endpoint` fields in a copy or screenshot.
4. Open the CanadaLogin RP registration or onboarding record for the **staging client**. This is the registration submitted to CanadaLogin or the client-configuration page/export provided by the CanadaLogin administrator; it is not a page in the RP application and it is not the RP deployment configuration. If you only have the submitted PDF, use its completed OIDC configuration section and request the final CanadaLogin client-registration confirmation if available.
5. In that record, locate these three fields and compare them character-for-character with the staging registration profile and the runtime requests:

- **Redirect URL(s):** `https://app-stage.geo.ca/sign-in/receive` (used after CanadaLogin sign-in).
- **Post Logout Redirect URL(s):** `https://app-stage.geo.ca/sign-in/logout` (used after RP-initiated logout).
- **Logout request URL:** `https://app-stage.geo.ca/sign-in/back-channel-logout` (where CanadaLogin sends the server-to-server Logout Token).

Check the scheme, hostname, path, port, query string, and trailing slash. Save a screenshot or export showing the field labels and values, with client identifiers and any sensitive material redacted. This artifact supports DR3, DR4, DR6, and the BLO registration evidence. 6. Open the **staging runtime configuration** for the deployed RP. This means the deployment/environment settings used by the staging web application and its server-side functions, not the public application page and not only a local `.env` file. A deployment administrator may find it in the SST/AWS deployment configuration, the deployed function environment settings, or the approved staging configuration record. Compare the following non-secret settings with the registration and code:

- `OIDC_CLIENT_ID`: present and the same client ID shown in the CanadaLogin staging registration.
- `OIDC_CUSTOM_DOMAIN`: the staging CanadaLogin host, not a test or production host.
- `OIDC_USE_PRIVATE_KEY_JWT`: enabled for staging.
- `OIDC_JWT_KID`: present and the same key identifier used in the client assertion header and offline public-key registration.
- Private-key reference: a configured Secrets Manager secret reference such as `OIDC_PRIVATE_KEY_SECRET_ID`/the deployment’s approved equivalent is present, without revealing its value or the private key.

Capture a redacted configuration screenshot or deployment record showing the setting names and safe values, plus the build/stage identifier. Do not expose `client_secret`, secret contents, private-key PEM/JWK material, access tokens, or cookies. This evidence supports DR7, DR8, DR9, AP1-AP11, and the staging profile comparison. 7. Run the live HTTPS/TLS checks in DR8 only after the endpoint and registration comparison is complete:

- In DevTools **Network**, enable **Preserve log**, clear the list, and repeat one English sign-in and one RP-initiated logout.
- Inspect the browser-visible requests to the staging RP, CanadaLogin authorization page, callback, CanadaLogin logout page, and registered post-logout page. Confirm every Request URL begins with `https://` and record the response status and final redirect location.
- Open the DevTools **Security** panel for the RP and CanadaLogin pages. Capture the connection protocol, cipher suite, certificate validity, certificate chain, and hostname match. A normal browser lock icon alone is not sufficient evidence.
- Use the deployment configuration or server trace to verify the backend-only calls that the browser cannot show: discovery, token, CanadaLogin JWKS, and `end_session_endpoint`. Confirm every configured or discovered URL uses `https://` and that certificate validation is not disabled.
- If a TLS scanner or platform report is available, save it with the run. Record the scanner date, target host, protocol versions, cipher result, and any limitations.
- Save artifacts as `YYYYMMDD-HHMM-DR8-<description>.*`, for example `20260924-1430-DR8-staging-network.har` and `20260924-1432-DR8-canadalogin-security.png`.

Pass DR8 only when browser and server-side evidence both cover the endpoints used by this RP. If only browser evidence is available, record the server-side portion as blocked rather than assuming it is secure.

Expected outputs:

- Registration screenshots
- Config extracts
- TLS/browser evidence
- Offline certificate/public-key registration proof
- Token request capture for auth-method confirmation
- Short conclusion notes

### Block B - Authorization request, token exchange, and language behavior

Assertions: AA1-AA15, AP1-AP11, LP1-LP2

Estimated time:

- 10 to 20 minutes

Shared setup:

- Use one clean browser session.
- Keep registration or onboarding records available for `client_id` and `redirect_uri` comparisons.
- Keep screenshots from both CanadaLogin and RP pages.
- Capture the token request separately from the authorization request. For staging, execute the `private_key_jwt` assertions in Table 3; mark Table 4 client-secret assertions not applicable.

Tester actions:

1. Start on the English staging entry point and click the application’s sign-in control.
2. In Network, open the request whose URL contains `/oauth2/authorize`. Save the request URL and query parameters for AA1-AA8. Keep `client_id`, `redirect_uri`, `response_type`, `scope`, `code_challenge`, `code_challenge_method`, and `ui_locales` visible because they are the values being tested. Redact or mask the following before saving the screenshot/HAR: all `Cookie` and `Set-Cookie` headers; `Authorization` headers; access, ID, and refresh tokens; client secrets; private-key PEM/JWK or certificate private material; personal information in URLs, headers, or page content; and any test-user credentials. Mask `state` and `nonce` while preserving a short consistent suffix or a documented hash so the request can still be paired with the callback. Do not include a callback `code` in this artifact; capture it separately in the callback evidence and redact it there as described in AA10-AA13.
3. Check `client_id`, `redirect_uri`, `response_type`, `scope`, `state`, `nonce`, `code_challenge`, `code_challenge_method`, and `ui_locales` against the relevant assertion procedure.
4. Complete the CanadaLogin login with the test user. When the browser returns to `/sign-in/receive`, save the callback request with `code` and `state` redacted but still identifiable as the same transaction.
5. First inspect the browser requests separately. The RP flow cookies are normally visible on the RP callback request/response, not on the CanadaLogin `/oauth2/authorize` request:

- Click the request whose URL ends in `/sign-in/receive`.
- Open **Headers** and look under **Request Headers > Cookie** for request-side cookie names.
- Look under **Response Headers > Set-Cookie**, or open the request's **Cookies** tab, for response-side cookie names. Some browsers hide `Set-Cookie` from the general response-header list; the Cookies tab is the reliable place to inspect it.
- The CanadaLogin `/oauth2/authorize` request is a different request. Use its **Query String Parameters** section for `client_id`, `redirect_uri`, `scope`, `state`, `nonce`, `ui_locales`, and the PKCE challenge. Do not expect the RP's `access_token`, `id_token`, or `refresh_token` cookies to appear on that CanadaLogin request.

Then open the RP’s server-side token exchange evidence or use the deployment log/proxy capture. The browser usually cannot show this token request because it is made server-to-server.

For the deployed staging function, start with the AWS Lambda function's **Monitor > View CloudWatch logs** link, or the CloudWatch log group attached to the deployed SST function that handles `/sign-in/receive`. Search the relevant invocation window for `[auth/token-exchange]` and its `correlationId`. The current implementation logs failure events such as `missing_required_input`, `policy_blocked_fallback`, `insecure_token_endpoint_rejected`, `token_request_failed`, and `token_request_exception`; it does not log the successful request body or `client_assertion` fields. A successful exchange therefore requires an approved outbound proxy capture or temporary redacted diagnostic instrumentation. Never add raw token, code, verifier, secret, or private-key values to normal application logs.

If CloudWatch contains only `INIT_START`, `START`, `END`, `REPORT`, and `[+layout.server] User state loaded` entries, it is not showing the token exchange. Those entries only prove that a Lambda invocation loaded the current session state; `signedIn: true` means an existing authenticated session was found. Confirm that the request actually reached `/sign-in/receive` and that you are viewing the log group/function for that deployed route. If no `[auth/token-exchange]` event or approved proxy capture exists after a fresh sign-in, record the token-request evidence as blocked rather than inferring the request fields from layout logs. Redact user UUIDs from saved evidence.

For a temporary CATS evidence run, enable the server-only flag in the approved deployment environment before deploying:

```powershell
$env:OIDC_AUTH_EVIDENCE_LOGGING = "true"
npx sst deploy --stage <approved-cats-stage>
```

After deployment, complete one fresh sign-in and search the same Lambda log group for `[auth/token-exchange-evidence] request_prepared` and `[auth/token-exchange-evidence] success`. These events contain presence flags, auth method, `grant_type`, redirect URI, key metadata, fingerprints, status, and timing; they do not contain raw codes, verifiers, assertions, tokens, secrets, or private keys. Use the shared `correlationId` to pair the prepared request with the success event. After saving redacted evidence, disable the flag and redeploy:

```powershell
$env:OIDC_AUTH_EVIDENCE_LOGGING = "false"
npx sst deploy --stage <approved-cats-stage>
```

Verify that a subsequent request emits no evidence event. Never enable this flag on an unapproved environment or leave it enabled after the evidence run.

When a redacted server/proxy capture is available, confirm `grant_type`, `code`, `redirect_uri`, `code_verifier`, and the `private_key_jwt` assertion fields. If the capture includes cookies, record cookie **names only** and redact every value:

- Request-side flow cookies normally include `oidc_nonce`, `oidc_return_to`, `oidc_state`, and `pkce_verifier`. `guest_favourites` may also be present, and `AMCV_A90F2A0D55423F537` is an optional analytics cookie; neither is an OIDC conformance value.
- Response-side cookies may include `access_token`, `id_token`, and `refresh_token`, plus the flow cookies and `guest_favourites`. These token values must always be fully redacted. Do not treat the presence of a cookie name as proof that the token is valid; use the token request/response and RP logs for that evidence.
- Do not fail the test because optional analytics or favourites cookies are present or absent. The CATS checks concern the OIDC request, token exchange, and resulting authenticated session.

6. Repeat the browser portion from the French staging entry point and save the paired language screenshots for AA9, LP1, and LP2.

Expected outputs:

- CanadaLogin screenshots
- Authorization request capture
- Registration or onboarding record extracts
- RP screenshots after return
- Short note confirming language continuity or mismatch

### Block C - Sign-in failures and single-RP logout

Assertions: AC1-AC3 (sign-in failure table), LO1-LO3, and the applicable back-channel assertions BLO1-BLO12

Estimated time:

- 20 to 35 minutes

Shared setup:

- Keep RP server logs open.
- Prepare one signed-in session and, for BLO12, a second session when needed.
- Session targeting rule (verbatim from the CATS 3.0.2 test guide): for back-channel logout, the RP must terminate sessions identified by the Logout Token. When `sid` is present (session-required mode), map `sid` to the correct RP session instance(s) and terminate them. Otherwise, use `sub` as the fallback key according to RP policy (typically terminating all sessions for that subject).
- For sign-in failure cases, use a controlled test client configuration with an invalid/missing signing key or shared secret, then restore the valid configuration before continuing. Do not expose secrets in evidence.

Tester actions:

1. Finish the successful sign-in from Block B before testing logout, so the browser has a real RP session and CanadaLogin session.
2. For the sign-in failure cases, coordinate with the deployment administrator. Change only the test configuration, capture the resulting safe error page and matching server log, then restore the valid configuration and confirm a normal sign-in works again.
3. For LO1, use the RP’s normal **Sign out** control while the ID-token cookie is present. Capture the outbound request and verify `id_token_hint`, `client_id`, and the registered `post_logout_redirect_uri`.
4. For LO2, use a request tool or browser address bar to construct a request containing only `post_logout_redirect_uri`. Do not reuse the RP’s normal Sign out URL because it includes `client_id` and may include `id_token_hint`.
5. For LO3, construct a request containing `client_id` and `post_logout_redirect_uri` but no `id_token_hint`. Capture the CanadaLogin confirmation page and click its Sign out control.
6. For each variant, return to a protected RP page after logout. A successful local logout should require a new sign-in.
7. For BLO tests, keep the server log open while triggering logout. Locate the incoming `logout_token`, the validation result, the revocation/session key used, and the HTTP 204 response.

Expected outputs:

- Logout trace
- RP logs
- Decoded logout token with `sid` when applicable
- Session-targeting evidence

### Block D - Front-channel logout browser flow (conditional)

Assertions: FLO1-FLO7 only when front-channel logout is registered; otherwise not applicable for staging.

Estimated time:

- 15 to 25 minutes

Shared setup:

- Use an OP-initiated or global logout flow.
- Keep browser network capture running through the full flow.

Expected outputs:

- Discovery or registration proof of front-channel support
- Browser trace to front-channel logout URI
- Parameter capture
- Protected-page reload proof of logout

### Block E - Multi-RP back-channel logout propagation

Assertions: BLO2, LO4, LO5, LO6

Estimated time:

- 30 to 45 minutes

Shared setup:

- Prepare two RP sessions under the same OP session (the CanadaLogin RP simulator may serve as the second RP; see test preconditions).
- Keep before/after screenshots and RP logs for both RPs.
- Apply the session targeting rule from Block C when interpreting which session(s) each RP invalidates.

Tester actions:

1. Sign in to RP-A and RP-B in the same browser profile, using separate tabs and the same CanadaLogin user.
2. Record which RP pages are protected and visibly signed in before logout.
3. Trigger logout from RP-A, then immediately inspect RP-B without refreshing. Record whether the UI changed.
4. Refresh RP-B and open a protected page. Record whether the server now requires sign-in.
5. Start fresh sessions and repeat with RP-B as the initiating RP. Save both RP logs and browser screenshots; do not infer RP-B’s result from RP-A’s result.

Expected outputs:

- Multi-RP screenshots
- RP logs
- Before/after session-state notes
- Repeatability note

### Block F - Single sign-on behavior

Assertions: SSO1, SSO2

Estimated time:

- 15 to 25 minutes

Shared setup:

- Prepare the multi-RP environment used for SSO.
- Identify any policy or prompt control needed for the reauthentication path.

Tester actions:

1. Sign in to RP-A and leave the CanadaLogin session in the same browser profile.
2. Open RP-B in a new tab immediately. Record whether CanadaLogin displays a credential prompt or proceeds directly to authorization.
3. For SSO2, wait for the documented one-hour inactivity condition or use an approved test policy that forces reauthentication. Record the start/end times.
4. Start RP-B sign-in again and capture the CanadaLogin page showing whether credentials are requested.

Expected outputs:

- Step screenshots
- Prompt/no-prompt evidence
- Short behavioral note

### Recommended run order

1. Block A
2. Block B
3. Block C
4. Block D
5. Block E
6. Block F

### High-priority subset

If time is limited, start with: DR8, DR9, DR7, AA2, AA3, BLO10, BLO11, BLO12, LO1, LO2, LO3, LO4, LO5.

## Assertion procedures

### DR1 - Discovery contains required metadata

1. Retrieve the CanadaLogin discovery document over HTTPS and save the unmodified JSON.
2. Confirm `issuer`, `authorization_endpoint`, `token_endpoint`, and `jwks_uri` are present and well formed. Confirm `userinfo_endpoint` too when the RP uses UserInfo.
3. Compare the discovered issuer and endpoints with the values used by the RP.

Expected result:

- Required discovery fields exist, use HTTPS, and the RP uses the discovered values rather than hard-coded alternatives.

Required evidence: Discovery JSON with required fields highlighted and RP configuration or logs showing the values consumed.

### DR2 - Discovery exposes RP-initiated logout endpoint

1. Locate `end_session_endpoint` in discovery.
2. Open or request it without completing logout and record its availability and expected response.

Expected result:

- `end_session_endpoint` is present, reachable, and is the endpoint used for RP-initiated logout.

Required evidence: Discovery JSON and a redacted request/response or browser capture.

### DR3 - Registered redirect URI sets exactly match runtime values

1. Export the CanadaLogin `redirect_uris` and, when used, `post_logout_redirect_uris` registration values.
2. Capture the exact authorization `redirect_uri` and logout `post_logout_redirect_uri` sent by the RP.
3. Compare scheme, host, port, path, query, encoding, and trailing slash character-for-character.
4. Send a controlled request using an unregistered redirect URI and confirm it is rejected with a safe user-facing error.

Expected result:

- Every runtime redirect value is registered exactly. Unregistered values are rejected without arbitrary forwarding.

Required evidence: Registration screenshot/export, paired request capture, and rejected-request trace or error-page screenshot.

### DR4 - Redirect URIs use HTTPS and exact strings match registration

1. Open OP client registration settings for the RP.
2. Capture registered callback URL list.
3. Capture RP-configured callback URL value used by the environment.
4. Compare host, path, scheme, and trailing slash behavior exactly.

Expected result:

- All callback URLs are https.
- Registered callback values exactly match RP runtime values.

Required evidence:

- Screenshot of OP registration callback URL list.
- Screenshot or config extract showing RP callback URL.
- One comparison note listing matched URLs line by line.

### DR5 - Redirect endpoints are not open redirectors

1. Attempt to append or substitute an attacker-controlled destination in authorization and logout return parameters.
2. Repeat with alternate host, scheme, path, query, and encoded URL forms.
3. Confirm the RP follows the normal preregistered flow or displays a safe error page.

Expected result:

- No RP endpoint forwards to an arbitrary external destination or reflects attacker-controlled redirect values.

Required evidence: Redacted HTTP traces for rejected variants and the resulting safe page or fixed registered destination.

### DR6 - post_logout_redirect_uri is preregistered when RP logout is used

1. Open OP client registration settings.
2. Locate allowed post logout redirect URIs.
3. Capture RP-configured logout callback target.
4. Compare for exact match.

Expected result:

- RP post logout redirect URI appears in OP registration and matches exactly.

Required evidence:

- Registration screenshot for post logout redirect URIs.
- RP config extract or route evidence showing logout callback target.

### DR7 - Registered authentication method in CanadaLogin matches the runtime token path

For the supplied staging registration, the expected method is `private_key_jwt`. The client-secret alternatives below are reference procedures for other registrations only.

1. Open CanadaLogin registration or onboarding configuration for the RP.
2. Record the configured token-endpoint authentication method for the client.
3. Capture a token request from the RP during the selected test path.
4. Compare the configured method to the runtime request behavior:

- `private_key_jwt` should send `client_assertion_type` and `client_assertion`.
- `client_secret_post` should send `client_secret` in the body and omit `client_assertion`.
- `client_secret_basic` should use HTTP Basic authentication if that path is configured.

Expected result:

- The authentication method registered in CanadaLogin matches the runtime token request behavior used by the RP.

Required evidence:

- Registration screenshot or onboarding/config extract showing the configured authentication method.
- Token request capture showing the runtime method used by the RP.

### AA1 - Authorization request uses an allowed HTTP form

1. Capture the outbound authorization request.
2. Confirm it is either an HTTP GET with URL-encoded query parameters or an HTTP POST with `Content-Type: application/x-www-form-urlencoded`.

Expected result: The RP uses one of the allowed request forms and does not put credentials or tokens in the request.

Required evidence: Browser/proxy capture showing method, content type, and redacted parameters.

### AA2 - Authentication request includes client_id matching CanadaLogin registration or onboarding record

1. Capture the outbound authorization request from the RP.
2. Record the `client_id` value used in the request.
3. Compare it to the CanadaLogin registration or onboarding record.

Expected result:

- The authorization request contains `client_id`.
- The `client_id` exactly matches the registered or onboarded value.

Required evidence:

- Authorization request capture showing `client_id`.
- Registration screenshot or onboarding record showing the expected client identifier.

### AA3 - Authentication request includes redirect_uri matching CanadaLogin registration or onboarding record

1. Capture the outbound authorization request from the RP.
2. Record the `redirect_uri` value used in the request.
3. Compare it to the redirect URI values registered in CanadaLogin.

Expected result:

- The authorization request contains `redirect_uri`.
- The `redirect_uri` exactly matches one of the registered values.

Required evidence:

- Authorization request capture showing `redirect_uri`.
- Registration screenshot or onboarding/config evidence showing the registered redirect URI set.

### AA4-AA8 - Required authorization request parameters

1. From the same captured authorization request, verify `response_type=code` (AA4), `scope` contains `openid` as a space-delimited value (AA5), `state` is present and correlatable to server-side state (AA6), `nonce` is present and generated with at least 128 bits of entropy (AA7), and `ui_locales` specifies the user's Canadian official-language preference, such as `en-CA` or `fr-CA` (AA8).
2. Do not place raw state, nonce, or token values in the report; retain a redacted value and generation/validation evidence.

Expected result: All required parameters are present with the exact values and entropy requirements in the guide.

Required evidence: Redacted authorization request, state/nonce generation or validation log, and language/config evidence.

### AA9 - Authentication dialogue and RP pages use the user's language

1. Set the user's language preference and start sign-in.
2. Capture the CanadaLogin dialogue and the RP page after callback.
3. Repeat for both supported Canadian official languages.

Expected result: CanadaLogin and the RP render the authentication and returned application pages in the user's selected language.

Required evidence: Paired CanadaLogin/RP screenshots and the corresponding `ui_locales` request capture.

### AA10-AA13 - Authorization-code binding

1. Capture the token request and pair it with the callback that supplied the code.
2. Verify `grant_type=authorization_code` (AA10), the posted `code` equals the callback code (AA11), and the callback `state` exactly equals the sent state (AA12).
3. When PKCE is enabled, verify `code_verifier` is posted and, where possible, that the configured challenge equals `BASE64URL(SHA256(code_verifier))` (AA13).

Expected result: The token exchange is bound to the same authorization response and browser transaction.

Required evidence: Paired redacted callback and token request captures, plus RP state-validation evidence.

### AA14-AA15 - ID-token time and identity validation

1. Decode the received ID token in a controlled test record.
2. Confirm the RP accepts only `exp` and `nbf` values within the permitted 3-to-5 minute clock-skew policy (AA14).
3. Confirm the RP validates `iss` against discovery, `aud` contains the RP client ID, and `nonce` matches the original request (AA15).

Expected result: A token failing any of these checks is rejected and the user receives the RP's safe authentication error handling.

Required evidence: Redacted token claims, discovery JSON, original request capture, and validation log.

### AP1-AP11 - private_key_jwt token authentication

Run only when the RP is registered for `private_key_jwt`.

1. Capture two token requests and decode both client assertions without exposing private material.
2. Confirm `client_assertion_type` is `urn:ietf:params:oauth:client-assertion-type:jwt-bearer` (AP1), `client_assertion` is present and freshly generated for each request (AP2), and `grant_type=authorization_code` plus `code` are present (AP3-AP4).
3. Verify the assertion signature against the registered public key (AP5), and verify `iss` (AP6), `sub` (AP7), `aud` containing the token endpoint (AP8), `exp` (AP9), `iat` (AP10), and unique `jti` (AP11).

Expected result: CanadaLogin can validate each assertion using the registered RP key and every required claim is present and valid.

Required evidence: Two redacted token captures, decoded assertion headers/payloads, signature verification output, and registration/JWKS evidence.

### CS-AC1-CS-AC2 (CATS token authentication table AC1-AC2) - client-secret token authentication

Run only when the RP is registered for `client_secret_basic` or `client_secret_post`. Mark CS-AC1-CS-AC2 not applicable for the supplied staging registration, which uses `private_key_jwt`.

1. Capture the authorization-code token request.
2. Confirm `client_assertion_type` and `client_assertion` are absent (AC1).
3. Confirm `code` and `grant_type=authorization_code` are present (AC2).
4. For `client_secret_basic`, confirm the secret is sent only in HTTP Basic authentication; for `client_secret_post`, confirm it is sent in the form body. Redact the value.

Expected result: The request matches the registered client-secret method and contains no private-key assertion parameters.

Required evidence: Registration screenshot and redacted token request showing method, parameters, and authentication location.

### DR8 - TLS posture and no downgrade behavior

Automated coverage: the RP now fails closed (returns null / refuses to send the request) if its configured authorize, token, discovery, or logout endpoint URL is not `https://` (localhost is the only exception, for local dev). See [packages/web-app/src/lib/tests/sign-in-core.test.ts](../packages/web-app/src/lib/tests/sign-in-core.test.ts) and [packages/web-app/src/lib/tests/sign-in-core-token-exchange.test.ts](../packages/web-app/src/lib/tests/sign-in-core-token-exchange.test.ts). This manual procedure should focus on real TLS/cipher negotiation and certificate validation, not on re-confirming plaintext-fallback rejection.

1. Open the RP in a fresh browser session.
2. Open DevTools (F12), then:

- Network tab: enable Preserve log
- Security tab: keep visible

3. Run the critical auth flow:

- RP sign-in start
- Redirect to Canada Login
- Callback to RP
- Logout flow

4. For each key request/host in Network:

- Click request
- Confirm Request URL starts with https://

5. For each key page state (RP, OP login, callback landing):

- Go to Security tab
- Open Connection details / Certificate info
- Capture:
  - Protocol version (TLS 1.2/1.3)
  - Cipher suite name
  - Certificate validity/chain status

6. Check for mixed content:

- Console tab: look for mixed-content warnings
- Security tab: confirm page is marked secure

7. Capture server-side transport evidence for non-browser RP calls:

- Token endpoint URL configured by the RP uses `https://`.
- Discovery/JWKS/logout endpoint URLs configured or discovered by the RP use `https://`.
- If available, capture server logs, configuration screenshots, or deployment configuration proving the RP does not use plaintext fallback endpoints.

8. Export evidence:

- Save HAR from Network
- Take screenshots of Security details showing protocol/cipher

Expected result:

- TLS policy meets project requirement.
- All RP calls to CanadaLogin use HTTPS/TLS for browser and server-side endpoints involved in sign-in and sign-out.
- No insecure transport path or plaintext fallback is configured for discovery, authorization, token, JWKS, or logout endpoints.
- Browser evidence shows secure transport for browser-observed steps; supplementary config/log evidence covers server-side steps.

Required evidence:

- Browser HAR/screenshots showing HTTPS and protocol/cipher details for browser-observed steps.
- Config, deployment, or server-trace evidence covering token, discovery, JWKS, and logout endpoint URLs used server-side.
- Scanner report, platform attestation, or equivalent environment evidence where available.
- Short conclusion note stating pass/fail criteria met and identifying which evidence covered browser-side versus server-side traffic.

DR8 evidence worksheet (copy/paste):

| Host | Flow step | URL (or endpoint) | TLS version observed | Cipher suite observed | Cert valid/hostname match (yes/no) | Mixed content seen (yes/no) | Pass/fail vs CCCS baseline | Artifact refs |
| ---- | --------- | ----------------- | -------------------- | --------------------- | ---------------------------------- | --------------------------- | -------------------------- | ------------- |
|      |           |                   |                      |                       |                                    |                             |                            |               |
|      |           |                   |                      |                       |                                    |                             |                            |               |
|      |           |                   |                      |                       |                                    |                             |                            |               |

DR8 minimum artifact set:

1. Security tab screenshot for RP endpoint showing TLS version and cipher suite.
2. Security tab screenshot for OP endpoint showing TLS version and cipher suite.
3. Network screenshot or HAR snippet showing auth/logout requests use https URLs.
4. Console/Security screenshot confirming no mixed-content warnings during flow.
5. Config or server-trace evidence showing token, discovery, JWKS, and logout endpoints are configured over `https://`.
6. One short conclusion note listing allowed/disallowed findings against CCCS policy and any evidence limitations.

Suggested conclusion note format:

- Overall result: pass/fail
- Observed TLS versions: ...
- Observed ciphers: ...
- Weak/legacy protocols or ciphers seen: yes/no (if yes, list)
- Mixed content seen: yes/no
- Server-side endpoint evidence reviewed: ...
- Plaintext fallback or disabled cert validation seen: yes/no
- Reviewer and timestamp (UTC): ...

### DR9 - private_key_jwt public key material is registered

1. Confirm the staging registration uses offline exchange rather than `jwks_uri`.
2. Capture registration evidence showing the public certificate/JWK was supplied to CanadaLogin. Do not include private key material.
3. Decode the public key metadata used by the RP and confirm the signing algorithm is RS256 and the configured `kid` matches the JWT assertion header.
4. Confirm the registered public key corresponds to the private key used by the staging deployment.
5. If encryption is configured in a different environment, verify encryption keys are distinct from signing keys. This is not applicable to the supplied staging registration.

Expected result:

- CanadaLogin registration contains the RP key material required for `private_key_jwt`.
- The offline-registered public key contains the signing information needed by CanadaLogin.
- Key identifiers are stable and traceable to the RP configuration used for token requests.
- No RP JWKS endpoint is required for the supplied staging profile.

Required evidence:

- Registration screenshot showing offline exchange and public certificate/JWK configuration.
- Redacted public-key metadata or certificate evidence showing RS256 and the registered key identifier.
- Deployment/config evidence showing the same `kid` is used by the client assertion.

### LP1 - Language preference is sent in the authorization request

1. Set the RP language to English and capture the authorization request.
2. Repeat with French.
3. Verify `ui_locales` specifies the user's preferred Canadian official language using the CATS-required regional values: `en-CA` for English and `fr-CA` for French. The CATS report explicitly gives these values as examples; the CanadaLogin Integration Guide does not define this request parameter, so retain the live request as evidence.

Expected result: The RP sends `ui_locales=en-CA` for English and `ui_locales=fr-CA` for French, and CanadaLogin accepts the requests.

Required evidence: Redacted request captures for both languages and the RP language/configuration evidence.

### LP2 - Language continuity across OP and RP

1. Initiate sign-in from one language path (for example en-ca).
2. At OP, switch language to alternate locale where supported.
3. Complete login and return to RP.
4. Verify RP language and key labels after redirect.

Expected result:

- OP reflects selected language.
- RP lands in expected locale and labels match that locale.

Required evidence:

- Screenshot at OP language selection/result.
- Screenshot after return to RP showing locale-specific UI text.

### Sign-in failure cases (AC1-AC3 from the sign-in failure table)

1. In a controlled test deployment, use an invalid signing key or shared secret and start sign-in (AC1).
2. Restore the configuration, then remove the signing key or shared secret and repeat (AC1).
3. Restore valid credentials. Where permitted, skew the RP clock more than five minutes ahead and behind, complete sign-in, and capture the callback (AC2).
4. Confirm all failures are handled by the RP with a safe error page or message and no authenticated session is created (AC1 and AC3).

Expected result:

- Invalid or missing client credentials and invalid `exp`/`nbf` responses are rejected. The RP displays a useful, non-sensitive error and logs a correlatable failure.

Required evidence: Redacted error screenshots, server logs, and clock-skew/test-configuration notes. Restore and verify the valid configuration after testing.

### SSO1 - Existing OP session should suppress second prompt

CanadaLogin's SSO window is 1 hour. If a second CATS-compliant RP is not available, the CanadaLogin test-environment RP simulator (rp.app.login-connexion.alpha.canada.ca) may be used as RP-B; it is not itself CATS-compliant but is sufficient to exercise this flow.

1. Sign in to RP-A and complete flow.
2. In same browser profile, immediately (within the 1-hour SSO window) start sign-in to RP-B that trusts same OP.
3. Observe whether OP prompts for credentials again.

Expected result:

- RP-B sign-in completes without a fresh credential prompt when SSO is expected.

Required evidence:

- Step screenshots for RP-A success, RP-B initiation, and RP-B completion.
- Optional HAR showing immediate authorize-to-callback progression.

### SSO2 - Reauthentication path should force prompt

1. After completing SSO1, wait for more than 60 minutes of inactivity (or otherwise trigger the reauthentication condition: policy, prompt parameter, or OP session age rule).
2. Start second RP sign-in under that condition.
3. Observe whether OP requires fresh authentication.

Expected result:

- OP prompts for authentication when reauth condition is active.

Required evidence:

- Screenshot of reauth trigger condition (or policy setting), and elapsed-time note if using the 60-minute inactivity trigger.
- Screenshot of credential prompt during second sign-in.

### LO1 - RP-initiated logout with id_token_hint and post_logout_redirect_uri

1. Sign in to the RP and capture the ID token hint value in redacted form.
2. Trigger RP-initiated logout with both `id_token_hint` and the registered `post_logout_redirect_uri`.
3. Capture the request, CanadaLogin response, redirect, and protected-page reload.

Expected result: The user is logged out and redirected to the registered post-logout URI.

Required evidence: Redacted logout request, registration proof, browser trace, and protected-page reload screenshot.

### LO2 - RP initiated logout triggers browser-visible logout flow

This is CATS request variant 4b: `post_logout_redirect_uri` only, with no `id_token_hint` and no `client_id`. The app's own Sign out action never produces this variant (it always sends variant 4a when a session id_token is available, or variant 4c otherwise), so this request must be constructed and sent manually against the RP's `end_session_endpoint` for this test.

1. Sign in to RP.
2. Manually construct a sign-out request to the `end_session_endpoint` containing only `post_logout_redirect_uri` (omit `id_token_hint` and `client_id`).
3. Send the request and confirm CanadaLogin displays its sign-out confirmation page instead of logging out silently.
4. Click the Sign out button on CanadaLogin's confirmation page.
5. Capture browser navigation and final landing page.
6. Verify RP session is cleared on next protected navigation attempt.

Expected result:

- CanadaLogin requires an explicit Sign out click on its confirmation page for this variant.
- After confirming, logout flow executes and session is invalidated.
- User cannot access protected page without reauth.

Required evidence:

- The manually constructed request URL (redacted of any session-identifying values not relevant to the test).
- Browser trace or HAR covering logout request chain, including the confirmation page.
- Screenshot of post-logout landing and protected page re-check.

### LO3 - RP-initiated logout with client_id and post_logout_redirect_uri

1. Sign in to the RP.
2. Send a logout request containing `client_id` and the registered `post_logout_redirect_uri`, without `id_token_hint`.
3. Confirm CanadaLogin displays its sign-out confirmation page, click Sign out, and capture the final redirect.

Expected result: The user is logged out and redirected to the registered post-logout URI after explicit confirmation.

Required evidence: Redacted request, confirmation-page screenshot, final redirect trace, and protected-page reload screenshot.

### LO4 - Multi-RP logout behavior is correct for RP-A initiated logout

1. Sign in to RP-A and RP-B under same OP session.
2. Trigger logout from RP-A.
3. Check RP-B session state immediately after (UI may not update until refresh/rerender).
4. Refresh or navigate RP-B page to force UI state sync with backend.
5. Confirm final session state after refresh.

Expected result:

- RP-B behavior matches configured logout propagation policy.
- After refresh/rerender, UI (sign-out button, protected page access, etc.) reflects invalidated session.
- Note: UI may lag backend invalidation; refresh is required to verify actual session state.

Required evidence:

- Screenshot of both RP-A and RP-B before RP-A logout.
- Screenshot of RP-B immediately after RP-A logout (showing UI lag if applicable).
- Screenshot of RP-B after refresh/rerender (showing final invalidated state).
- Short note explicitly stating: (1) whether session was invalidated per policy, (2) whether UI updated immediately or required refresh.

### LO5 - Multi-RP logout behavior is correct for RP-B initiated logout

1. Sign in to RP-A and RP-B under same OP session.
2. Trigger logout from RP-B.
3. Check RP-A session state immediately after (UI may not update until refresh/rerender).
4. Refresh or navigate RP-A page to force UI state sync with backend.
5. Confirm final session state after refresh.

Expected result:

- RP-A behavior matches configured logout propagation policy.
- After refresh/rerender, UI (sign-out button, protected page access, etc.) reflects invalidated session.
- Note: UI may lag backend invalidation; refresh is required to verify actual session state.

Required evidence:

- Screenshot of both RP-A and RP-B before RP-B logout.
- Screenshot of RP-A immediately after RP-B logout (showing UI lag if applicable).
- Screenshot of RP-A after refresh/rerender (showing final invalidated state).
- Short note explicitly stating: (1) whether session was invalidated per policy, (2) whether UI updated immediately or required refresh.

### LO6 - Repeatability check for logout propagation

1. Repeat LO4/LO5 once more with new sessions.
2. After triggering logout, refresh/rerender affected RPs to sync UI state.
3. Compare outcomes with first run.

Expected result:

- Logout propagation behavior is consistent across repeated runs.
- Session invalidation timing and UI refresh behavior match first run.

Required evidence:

- Second-run screenshots showing initial state, post-logout state (pre-refresh), and post-refresh state.
- Comparison note explicitly stating whether outcomes matched first run.

### BLO1 - Back-channel notification reaches the first registered RP

1. Confirm the first and second RPs are registered for back-channel logout.
2. Establish sessions in both RPs and trigger logout from each applicable flow.
3. Capture the POST request and processing result at the first RP. Repeat the same procedure for the second RP under BLO2 below.

Expected result: Each registered RP receives and processes a Logout Token at the guide's required steps.

Required evidence: Per-RP HTTP traces and server logs linked to the same logout event.

### BLO3-BLO8 - Back-channel Logout Token claims

For each captured Logout Token, decode only the payload needed for the report and verify:

- `iss` matches the CanadaLogin discovery issuer (BLO3).
- `aud` matches the receiving RP client ID (BLO4).
- `jti` is present and unique per token (BLO5).
- `iat` is present and numeric (BLO6).
- `events` contains `http://schemas.openid.net/event/backchannel-logout` (BLO7).
- `nonce` is absent (BLO8).

Expected result: Every required claim is present and valid, and the prohibited `nonce` claim is absent.

Required evidence: Redacted decoded payload, discovery JSON, RP client registration, and uniqueness comparison for `jti`.

### BLO9 - Back-channel acknowledgement status for the first RP

1. Capture the HTTP response from each RP after successful Logout Token validation.
2. Correlate the response with server logs showing validation and session revocation.

Expected result: The first registered RP returns HTTP 200 OK or HTTP 204 No Content after successful processing. Repeat for the second RP under BLO10 below.

Required evidence: HTTP trace and matching RP log excerpt for each RP.

### BLO2 - Back-channel logout propagates across participating RPs

1. Establish active sessions for all participating RPs.
2. Trigger OP event that emits back-channel logout token.
3. Verify each RP receives and processes logout signal.

Expected result:

- Intended RPs invalidate session according to policy.

Required evidence:

- RP logs showing back-channel logout receipt and processing.
- Browser verification screenshots per RP after signal.

### BLO10 - Back-channel logout failure handling is visible and diagnosable

1. Trigger a normal back-channel logout event for an RP that is registered for back-channel logout.
2. Capture the RP server logs for the request window covering logout token receipt, validation, and session revocation handling.
3. Capture the HTTP trace for the RP back-channel logout endpoint response.
4. Confirm the RP returns HTTP 200 OK or HTTP 204 No Content after the logout token is validated and the logout handling succeeds.

Expected result:

- The RP acknowledges successful back-channel logout handling with HTTP 200 or HTTP 204.
- Server logs show the request was received and processed successfully.
- HTTP trace and logs correspond to the same successful logout event.

Required evidence:

- Server log excerpts showing logout token validation/processing for the successful request.
- HTTP trace or network capture showing the RP returned HTTP 200 or HTTP 204.
- Short note linking the log timestamp and HTTP response to the same logout event.

### BLO11 - Session-required back-channel logout token contains sid

1. Confirm the RP is registered or configured for session-required back-channel logout.
2. Trigger a back-channel logout event for a session-managed login.
3. Capture and decode the logout token payload delivered to the RP.
4. Confirm the decoded payload contains a non-empty `sid` claim.

Expected result:

- When session-required back-channel logout is configured, the delivered logout token contains `sid`.
- Registration/config evidence and the decoded token payload are consistent with the same logout mode.

Required evidence:

- Registration screenshot or config extract showing session-required back-channel logout behavior.
- Decoded logout token payload showing `sid`.
- Short note linking the configuration evidence and captured logout token to the same test run.

### BLO12 - sid/sub policy handling for session invalidation

1. Create at least two sessions for the same user (for example two browsers or two devices).
2. Trigger back-channel logout for one session only.
3. Verify only the session matching `sid` is terminated (and the other remains active) when session-required mode is enabled; when `sid` is not present (non-session-required mode), verify the RP uses `sub` to terminate the user's session(s) according to its policy.

Expected result:

- Session invalidation matches configured sid/sub policy exactly: `sid`-to-session mapping when session-required, `sub`-based fallback otherwise.

Required evidence:

- Session mapping note before logout (session identifiers may be hashed).
- RP session store/logs showing which session key was invalidated.
- RP logs showing sid/sub interpretation.
- Browser screenshots demonstrating one browser signed out while the other remains signed in (session-required mode), or all sessions signed out (non-session-required mode).

### FLO1 - Front-channel logout does not create an open redirector (conditional)

The supplied staging registration selects back-channel logout. Mark FLO1-FLO7 not applicable unless CanadaLogin provides a later registration enabling front-channel logout.

1. Send a front-channel logout request with an attacker-controlled return destination and encoded variants.
2. Follow the browser navigation and inspect the final destination.

Expected result: The RP does not forward values from the request to arbitrary user-provided URIs.

Required evidence: Redacted request trace and final browser destination.

### FLO2 - Front-channel state values are unpredictable

1. Capture state values from repeated authorization requests that lead to front-channel-capable sessions.
2. Confirm each state has at least 128 bits of entropy and is not reused.

Expected result: Every state value is unpredictable and unique for its request.

Required evidence: Redacted state samples, generation evidence, and entropy calculation or implementation test output.

### FLO3 - Front-channel registration does not span unrelated domains

1. Capture all registered redirect and front-channel logout URIs.
2. Compare their domains and document any domains that differ.

Expected result: The RP does not register multiple front-channel redirect URIs on different domains.

Required evidence: Registration export/screenshot and domain comparison note.

### FLO4 - Front-channel logout registration policy across domains

1. Open OP registration for front-channel logout/redirect settings.
2. Capture allowed domains and URIs.
3. Compare against policy for single-domain or approved-domain constraints.

Expected result:

- Registered domains/URIs comply with policy.

Required evidence:

- Registration screenshot with domain/URI list.
- Compliance note stating whether policy is met.

### FLO5 - Browser requests the RP front-channel logout URI

1. Confirm discovery metadata shows `frontchannel_logout_supported=true` for the RP/OP flow under test.
2. Trigger an OP-initiated or global logout flow that should notify the RP.
3. Capture the browser network trace showing a GET request to the RP front-channel logout URI.

Expected result:

- The browser requests the RP front-channel logout URI during the logout flow.

Required evidence:

- Discovery JSON showing `frontchannel_logout_supported=true`.
- Browser trace or DevTools capture showing the GET request to the RP front-channel logout URI.

### FLO6 - Front-channel logout request contains sid or logout parameter

1. Use the same OP-initiated or global logout flow captured for FLO5.
2. Inspect the browser request to the RP front-channel logout URI.
3. Confirm the request includes `sid` or `logout` in the query string and, when required by the flow, a validated `iss` value.

Expected result:

- The front-channel logout request contains `sid` or `logout`.

Required evidence:

- Browser trace showing the request URL and query parameters.
- RP log line or request capture confirming the same parameter set and issuer validation.

### FLO7 - Valid front-channel logout request invalidates the RP session cookie

1. Complete the FLO5/FLO6 flow so the RP receives a valid front-channel logout request.
2. Reload a protected RP page after the request is received.
3. Confirm the user is no longer authenticated and a new sign-in is required.

Expected result:

- The RP session cookie is no longer usable after a valid front-channel logout request.
- Reloading a protected page requires a new sign-in.

Required evidence:

- Browser trace showing the front-channel logout request.
- Screenshot of the protected page after reload showing signed-out or reauthentication-required state.

## Compact execution log

Use this section while running the manual tests. Keep entries short and move final artifact paths into the sign-off record below.

| Assertion                  | Setup / precondition | Key observed result | Evidence captured? | Follow-up |
| -------------------------- | -------------------- | ------------------- | ------------------ | --------- |
| DR1-DR9                    |                      |                     |                    |           |
| AA1-AA3                    |                      |                     |                    |           |
| AA4-AA15                   |                      |                     |                    |           |
| AP1-AP11                   |                      |                     |                    |           |
| AC1-AC3 (sign-in failure)  |                      |                     |                    |           |
| CS-AC1-CS-AC2 (token auth) |                      |                     |                    |           |
| LP1-LP2                    |                      |                     |                    |           |
| SSO1-SSO2                  |                      |                     |                    |           |
| LO1-LO6                    |                      |                     |                    |           |
| BLO1-BLO12                 |                      |                     |                    |           |
| FLO1-FLO7                  |                      |                     |                    |           |

## Sign-off record

Fill one row per manual assertion run. Use `pass`, `fail`, `blocked`, or `not applicable` in the Outcome column. Put `automated`, `live`, or `manual` evidence-source labels in Notes rather than combining them with the outcome value.

| Assertion                  | Outcome (pass/fail/blocked) | Tester | Date (UTC) | Environment | Artifact links/paths | Notes |
| -------------------------- | --------------------------- | ------ | ---------- | ----------- | -------------------- | ----- |
| DR1-DR9                    |                             |        |            |             |                      |       |
| AA1-AA3                    |                             |        |            |             |                      |       |
| AA4-AA15                   |                             |        |            |             |                      |       |
| AP1-AP11                   |                             |        |            |             |                      |       |
| AC1-AC3 (sign-in failure)  |                             |        |            |             |                      |       |
| CS-AC1-CS-AC2 (token auth) |                             |        |            |             |                      |       |
| LP1-LP2                    |                             |        |            |             |                      |       |
| SSO1-SSO2                  |                             |        |            |             |                      |       |
| LO1-LO6                    |                             |        |            |             |                      |       |
| BLO1-BLO12                 |                             |        |            |             |                      |       |
| FLO1-FLO7                  |                             |        |            |             |                      |       |
