# CATS 3.0.2 Test Procedure

This procedure executes and records CATS 3.0.2 conformance evidence for the CanadaLogin relying party. Use [cats-3.0.2-test-matrix.json](cats-3.0.2-test-matrix.json) as the assertion inventory and [cats-3.0.2-manual-checklist.md](cats-3.0.2-manual-checklist.md) as the detailed manual-test record.

## 1. Prepare the test run

1. Record the target environment, deployment URL, build or commit identifier, test date (UTC), and tester initials.
2. Confirm the target environment has the intended CanadaLogin configuration and RP registration.
3. For the supplied staging run, use the staging registration profile in [cats-3.0.2-manual-checklist.md](cats-3.0.2-manual-checklist.md): back-channel logout, `private_key_jwt`, offline public-key exchange, and no front-channel/UserInfo/encryption/decryption assertions.
4. Prepare one test user and two browser profiles or devices for multi-session, multi-RP, and SSO scenarios.
5. Ensure access is available to:

- CanadaLogin client registration or onboarding records.
- RP deployment configuration and server logs.
- Browser DevTools with Network, Security, and Console tabs.

6. Create an evidence folder outside of version control, such as `CATS-3.0.2-evidence/<environment>/<YYYYMMDD>/`.
7. Use timestamped artifact names: `YYYYMMDD-HHMM-<assertion>-<description>.<ext>`.
8. Redact access tokens, ID tokens, secrets, personal identifiers, and private-key material before saving any artifact.

## 2. Run deterministic tests

From `packages/web-app`, run:

```powershell
npm run test:cats
npx vitest run src/lib/tests/user-data-loading.test.ts src/lib/tests/user-revocation.test.ts
```

Expected result:

- Both commands complete with no failed tests.
- The first command covers the deterministic assertions in the matrix.
- The second command provides targeted coverage for sid-specific and sub-fallback session revocation used by BLO12.

Capture:

- Terminal output or CI job URL showing successful test counts.

Evidence location:

- Test source ownership is recorded in [cats-3.0.2-test-matrix.json](cats-3.0.2-test-matrix.json).
- The deterministic JSON artifact is generated in `docs/generated/cats-vitest.json` by the next step.

## 3. Generate deterministic evidence artifacts

From `packages/web-app`, run:

```powershell
npm run test:cats:artifacts
```

Expected result:

- `docs/generated/cats-vitest.json` is refreshed with the deterministic execution results.
- `docs/generated/cats-results.json` and `docs/generated/cats-results.md` are refreshed.

Capture:

- Keep the generated files with the CATS submission package or archive their commit/version with the evidence set.

## 4. Run live discovery checks

Set the discovery URL for the target CanadaLogin environment, then run:

```powershell
$env:CATS_DISCOVERY_URL = "https://<canadalogin-host>/oauth2/.well-known/openid-configuration"
npm run test:cats:live
npm run test:cats:evidence
```

Use the discovery endpoint that returns the CanadaLogin OpenID configuration document. For the current staging host, the known path is:

```text
https://auth.login-connexion.alpha.canada.ca/oauth2/.well-known/openid-configuration
```

Expected result:

- DR1 passes when discovery contains `issuer`, `authorization_endpoint`, `token_endpoint`, and `jwks_uri`.
- DR2 passes when `end_session_endpoint` is present and reachable.

Capture:

- `docs/generated/cats-live-smoke.json` for discovery fields and endpoint availability status.
- `docs/generated/cats-results.json` and `docs/generated/cats-results.md` after the evidence command.

## 5. Complete manual evidence blocks

Complete the blocks below in the indicated order. Record observations in the compact execution log and final rows of [cats-3.0.2-manual-checklist.md](cats-3.0.2-manual-checklist.md).

### Block A: Registration and transport

Assertions: DR4, DR6, DR7, DR8, DR9

1. Open CanadaLogin registration or onboarding records.
2. Compare registered callback and logout redirect URIs with the RP runtime values.
3. Verify all registered redirect URIs use HTTPS.
4. Compare the registered client authentication method with an observed token request.
5. Capture TLS/HTTPS evidence for browser and server-side discovery, authorization, token, JWKS, and logout endpoints.
6. Capture offline public certificate/JWK registration evidence, `kid`, and algorithm. Do not fetch an RP JWKS for the supplied staging profile.
7. Confirm redirect URI domains follow the approved domain policy where that policy applies.

Evidence to save:

- Registration/onboarding screenshots.
- Runtime config extracts with secrets redacted.
- Authorization and token request captures.
- DevTools Security screenshots, HAR, TLS scan, or platform attestation.
- Certificate/inline-key registration evidence for staging offline exchange; JWKS HTTP 200 evidence is only required for an environment explicitly registered with `jwks_uri`.

### Block B: Authorization request and language behavior

Assertions: AA2, AA3, AA8, AA9, LP1, LP2

1. Start sign-in from the RP with DevTools Network capture enabled.
2. Save the authorization request containing `client_id` and `redirect_uri`.
3. Compare both values exactly to the CanadaLogin registration or onboarding record.
4. Capture `ui_locales` for English and French. Record the exact emitted values and resolve their accepted representation against the CanadaLogin Integration guide or live provider behavior.
5. Change language on the CanadaLogin sign-in page.
6. Complete the sign-in flow and confirm the returned RP page uses the expected language.

Evidence to save:

- Authorization request trace.
- Registration/onboarding record extract.
- CanadaLogin language screenshot.
- RP page screenshot after callback.

### Block C: Single-RP logout and back-channel baseline

Assertions: LO2, BLO10, BLO11, BLO12

1. Sign in to the RP, then manually construct and send a sign-out request to `end_session_endpoint` containing only `post_logout_redirect_uri` (no `id_token_hint`, no `client_id`) — this is CATS variant 4b. The RP's own Sign out action never produces this variant; it always sends variant 4a (`id_token_hint`) or 4c (`client_id`).
2. Confirm CanadaLogin displays its sign-out confirmation page and click Sign out. Observe whether the browser returns to the registered post-logout URI. The CATS Test report lists LO evidence as N/A; no screenshot or redirect trace is required.
3. Trigger a successful back-channel logout for an RP registered for it.
4. Observe whether the RP acknowledges successful handling with HTTP `200` or `204`. Evidence is N/A for BLO10 per the CATS Test report; logs and HTTP traces are not required.
5. If session-required back-channel logout is configured, capture registration/config evidence and a decoded, redacted Logout Token payload showing `sid` for BLO11. Do not retain the raw token or signature.
6. Create at least two sessions for the same user (for example two browsers or two devices), trigger back-channel logout for one session only, and verify only the session matching `sid` is invalidated when session-required is enabled. When `sid` is absent (non-session-required mode), verify the RP uses `sub` to terminate the user's session(s) according to its policy.

Evidence: N/A for LO2 and BLO10 per the CATS Test report. For BLO11, provide registration/config evidence and a decoded, redacted token payload containing `sid` when session-required mode applies. For BLO12, provide session-targeting logs and browser screenshots showing which session(s) were invalidated; redact/hash identifiers.

### Block D: Front-channel logout browser flow (conditional)

Assertions: FLO5, FLO6, FLO7 only when front-channel logout is registered. Mark not applicable for the supplied staging registration.

1. Confirm discovery metadata contains `frontchannel_logout_supported=true` for the test flow.
2. Trigger OP-initiated or global logout.
3. Capture the browser GET request to the RP front-channel logout URI.
4. Confirm the request contains `sid` or `logout`.
5. Reload a protected RP page and confirm a new sign-in is required.

Evidence to save:

- Discovery JSON with `frontchannel_logout_supported=true`.
- Browser/DevTools trace of the front-channel request and query parameters.
- RP log or request capture for the same request.
- Protected-page screenshot after reload.

### Block E: Multi-RP logout propagation

Assertions: BLO2, LO4, LO5, LO6

1. Sign in to RP-A and RP-B under the same OP session.
2. Trigger logout from RP-A and record RP-B state before logout, immediately after, and after refresh/rerender.
3. Start fresh sessions, trigger logout from RP-B, and record RP-A using the same sequence.
4. Repeat one propagation path with fresh sessions and compare results for consistency.
5. Observe whether RP-A and RP-B process logout according to the registered mechanism. The CATS Test report lists LO4-LO6 and BLO2 evidence as N/A; logs and screenshots are optional.

Evidence: N/A for LO4-LO6 and BLO2 per the CATS Test report. Record the outcomes; screenshots, logs, and traces are optional.

### Block F: Single sign-on behavior

Assertions: SSO1, SSO2

CanadaLogin's SSO window is 1 hour. If a second CATS-compliant RP is not available, the CanadaLogin test-environment RP simulator (rp.app.login-connexion.alpha.canada.ca) may be used as RP-B.

1. Sign in to RP-A.
2. In the same browser profile, immediately (within the 1-hour SSO window) begin sign-in to RP-B.
3. Record whether CanadaLogin suppresses the credential prompt for the preserved SSO path.
4. Wait for more than 60 minutes of inactivity (or otherwise trigger the configured reauthentication condition).
5. Begin sign-in to RP-B again and record whether CanadaLogin prompts for credentials.

Evidence: N/A for SSO1-SSO2 per the CATS Test report. Record whether CanadaLogin prompted for credentials in each scenario; screenshots and policy artifacts are optional.

## 6. Record manual outcomes

For each manual assertion:

1. Set the outcome to `pass`, `fail`, `blocked`, or `not applicable` in the sign-off record in [cats-3.0.2-manual-checklist.md](cats-3.0.2-manual-checklist.md). Put `automated`, `live`, or `manual` evidence-source labels in Notes.
2. Record tester initials, UTC date, environment, artifact paths where required (otherwise enter `N/A - not required`), and a short conclusion.
3. For a failure, include the expected result, observed result, impact, and issue reference.
4. For a blocked result, state the missing prerequisite or unavailable environment capability.

## 7. Produce the final evidence summary

From `packages/web-app`, run:

```powershell
npm run test:cats:evidence
```

Review:

- `docs/generated/cats-results.md` for the human-readable summary.
- `docs/generated/cats-results.json` for assertion-level status and execution details.
- `docs/generated/cats-vitest.json` for deterministic test output.
- `docs/generated/cats-live-smoke.json` for DR1/DR2 live discovery evidence.
- [cats-3.0.2-manual-checklist.md](cats-3.0.2-manual-checklist.md) for the manual sign-off record and artifact links.

## 8. Final acceptance review

1. Confirm every matrix assertion has a result: automated pass/fail, live pass/fail, manual pass/fail, blocked, or not applicable.
2. Confirm all generated artifacts are from the same target environment and current build/version.
3. Confirm every manual `pass` includes artifact links or paths where the CATS Test report requires evidence; confirm N/A evidence rows are marked `N/A - not required`.
4. Confirm all evidence has been redacted appropriately.
5. Resolve or formally accept every `fail` and `blocked` result before certifying the report.