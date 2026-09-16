# CATS 3.0.2 Evidence Summary

Generated at: 2026-09-24T15:26:13.495Z

Deterministic run success: true
Live smoke run present: yes

| Assertion | Automation | Status | Owner | Evidence |
| --- | --- | --- | --- | --- |
| DR1 | live-smoke | live-pass | packages/web-app/scripts/cats-live-smoke.mjs | http-trace |
| DR2 | live-smoke | live-pass | packages/web-app/scripts/cats-live-smoke.mjs | discovery-json |
| DR3 | deterministic | automated-pass | packages/web-app/src/lib/tests/sign-in-core.test.ts | unit-test |
| DR4 | manual | manual-pending | docs/cats-3.0.2-manual-checklist.md | registration-and-config |
| DR5 | deterministic | automated-pass | packages/web-app/src/lib/tests/sign-in-post-auth.test.ts | unit-test |
| DR6 | manual | manual-pending | docs/cats-3.0.2-manual-checklist.md | registration-screenshot |
| DR7 | manual | manual-pending | docs/cats-3.0.2-manual-checklist.md | registration-screenshot-and-token-request-capture |
| DR8 | manual | manual-pending | docs/cats-3.0.2-manual-checklist.md | tls-scan |
| DR9 | manual | manual-pending | docs/cats-3.0.2-manual-checklist.md | registration-screenshot-and-jwks-or-certificate-proof |
| AA1 | deterministic | automated-pass | packages/web-app/src/lib/tests/sign-in-send-route.test.ts | route-test |
| AA2 | manual | manual-pending | docs/cats-3.0.2-manual-checklist.md | registration-or-onboarding-record-and-request-capture |
| AA3 | manual | manual-pending | docs/cats-3.0.2-manual-checklist.md | registration-screenshot-and-request-capture |
| AA4 | deterministic | automated-pass | packages/web-app/src/lib/tests/sign-in-core.test.ts | unit-test |
| AA5 | deterministic | automated-pass | packages/web-app/src/lib/tests/sign-in-core.test.ts | unit-test |
| AA6 | deterministic | automated-pass | packages/web-app/src/lib/tests/sign-in-core.test.ts | unit-test |
| AA7 | deterministic | automated-pass | packages/web-app/src/lib/tests/sign-in-core.test.ts | unit-test |
| AA8 | deterministic | automated-pass | packages/web-app/src/lib/tests/sign-in-core.test.ts | unit-test |
| AA9 | manual | manual-pending | docs/cats-3.0.2-manual-checklist.md | screenshots |
| AA10 | deterministic | automated-pass | packages/web-app/src/lib/tests/sign-in-core-token-exchange.test.ts | unit-test |
| AA11 | deterministic | automated-pass | packages/web-app/src/lib/tests/sign-in-receive-route.test.ts | route-test |
| AA12 | deterministic | automated-pass | packages/web-app/src/lib/tests/sign-in-receive-route.test.ts | route-test |
| AA13 | deterministic | automated-pass | packages/web-app/src/lib/tests/sign-in-core-token-exchange.test.ts | unit-test |
| AA14 | deterministic | automated-pass | packages/web-app/src/lib/tests/id-token-verification.test.ts | unit-test |
| AA15 | deterministic | automated-pass | packages/web-app/src/lib/tests/id-token-verification.test.ts | unit-test |
| AP1 | deterministic | automated-pass | packages/web-app/src/lib/tests/sign-in-core-token-exchange.test.ts | unit-test |
| AP2 | deterministic | automated-pass | packages/web-app/src/lib/tests/client-assertion.test.ts | unit-test |
| AP3 | deterministic | automated-pass | packages/web-app/src/lib/tests/sign-in-core-token-exchange.test.ts | unit-test |
| AP4 | deterministic | automated-pass | packages/web-app/src/lib/tests/sign-in-receive-route.test.ts | route-test |
| AP5 | deterministic | automated-pass | packages/web-app/src/lib/tests/client-assertion.test.ts | unit-test |
| AP6 | deterministic | automated-pass | packages/web-app/src/lib/tests/client-assertion.test.ts | unit-test |
| AP7 | deterministic | automated-pass | packages/web-app/src/lib/tests/client-assertion.test.ts | unit-test |
| AP8 | deterministic | automated-pass | packages/web-app/src/lib/tests/client-assertion.test.ts | unit-test |
| AP9 | deterministic | automated-pass | packages/web-app/src/lib/tests/client-assertion.test.ts | unit-test |
| AP10 | deterministic | automated-pass | packages/web-app/src/lib/tests/client-assertion.test.ts | unit-test |
| AP11 | deterministic | automated-pass | packages/web-app/src/lib/tests/client-assertion.test.ts | unit-test |
| CS-AC1 | deterministic | automated-pass | packages/web-app/src/lib/tests/sign-in-core-token-exchange.test.ts | unit-test |
| CS-AC2 | deterministic | automated-pass | packages/web-app/src/lib/tests/sign-in-core-token-exchange.test.ts | unit-test |
| LP1 | deterministic | automated-pass | packages/web-app/src/lib/tests/sign-in-core.test.ts | unit-test |
| LP2 | manual | manual-pending | docs/cats-3.0.2-manual-checklist.md | screenshots |
| SSO1 | manual | manual-pending | docs/cats-3.0.2-manual-checklist.md | screenshots |
| SSO2 | manual | manual-pending | docs/cats-3.0.2-manual-checklist.md | screenshots |
| SF-AC1 | deterministic | automated-pass | packages/web-app/src/lib/tests/sign-in-receive-route.test.ts | route-test |
| SF-AC2 | deterministic | automated-pass | packages/web-app/src/lib/tests/id-token-verification.test.ts | unit-test |
| SF-AC3 | deterministic | automated-pass | packages/web-app/src/lib/tests/sign-in-receive-route.test.ts | route-test |
| LO1 | deterministic | automated-pass | packages/web-app/src/lib/tests/sign-in-core.test.ts | unit-test |
| LO2 | manual | manual-pending | docs/cats-3.0.2-manual-checklist.md | browser-trace |
| LO3 | deterministic | automated-pass | packages/web-app/src/lib/tests/sign-in-logout-route.test.ts | route-test |
| LO4 | manual | manual-pending | docs/cats-3.0.2-manual-checklist.md | multi-rp-screenshots |
| LO5 | manual | manual-pending | docs/cats-3.0.2-manual-checklist.md | multi-rp-screenshots |
| LO6 | manual | manual-pending | docs/cats-3.0.2-manual-checklist.md | multi-rp-screenshots |
| BLO1 | deterministic | automated-pass | packages/web-app/src/lib/tests/back-channel-logout-route.test.ts | integration-test |
| BLO2 | manual | manual-pending | docs/cats-3.0.2-manual-checklist.md | multi-rp-logs |
| BLO3 | deterministic | automated-pass | packages/web-app/src/lib/tests/back-channel-logout.test.ts | unit-test |
| BLO4 | deterministic | automated-pass | packages/web-app/src/lib/tests/back-channel-logout.test.ts | unit-test |
| BLO5 | deterministic | automated-pass | packages/web-app/src/lib/tests/back-channel-logout.test.ts | unit-test |
| BLO6 | deterministic | automated-pass | packages/web-app/src/lib/tests/back-channel-logout.test.ts | unit-test |
| BLO7 | deterministic | automated-pass | packages/web-app/src/lib/tests/back-channel-logout.test.ts | unit-test |
| BLO8 | deterministic | automated-pass | packages/web-app/src/lib/tests/back-channel-logout.test.ts | unit-test |
| BLO9 | deterministic | automated-pass | packages/web-app/src/lib/tests/back-channel-logout-route.test.ts | integration-test |
| BLO10 | manual | manual-pending | docs/cats-3.0.2-manual-checklist.md | multi-rp-logs |
| BLO11 | manual | manual-pending | docs/cats-3.0.2-manual-checklist.md | registration-config-and-decoded-logout-token |
| BLO12 | manual | manual-pending | docs/cats-3.0.2-manual-checklist.md | logs-and-screenshots |
| FLO1 | deterministic | automated-pass | packages/web-app/src/lib/tests/front-channel-logout-route.test.ts | route-test |
| FLO2 | deterministic | automated-pass | packages/web-app/src/lib/tests/sign-in-core.test.ts | unit-test |
| FLO4 | manual | manual-pending | docs/cats-3.0.2-manual-checklist.md | registration-screenshot |
| FLO5 | manual | manual-pending | docs/cats-3.0.2-manual-checklist.md | discovery-json-and-browser-trace |
| FLO6 | manual | manual-pending | docs/cats-3.0.2-manual-checklist.md | browser-trace-and-rp-logs |
| FLO7 | manual | manual-pending | docs/cats-3.0.2-manual-checklist.md | browser-trace-and-session-check |

Legend:
- automated-pass: Backing deterministic test suite ran and passed for the mapped owner file.
- automated-fail: Backing deterministic test suite ran and reported failures for the mapped owner file.
- automated-not-run: No deterministic execution artifact was found for the mapped owner file.
- live-pass/live-fail: Live smoke artifact contained a pass/fail result for that assertion.
- live-not-run: Live smoke artifact was not available for that assertion.
- manual-pending: Assertion requires manual execution and artifact capture.
- implementation-gap: Assertion is tracked but not yet implemented or mapped to an executable/manual workflow.
