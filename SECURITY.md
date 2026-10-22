# Security policy

## Scope

SHADOW PROTOCOL is a static, client-side browser game. It has no server, accounts, network requests at runtime, analytics or third-party scripts. The only data it stores is the player's settings, records and run checkpoint, in `localStorage` for the origin that serves it.

Relevant reports include, for example:

- a way for crafted `localStorage` contents to execute script or break the page persistently (save data is validated in `src/game/persistence.ts`);
- a vulnerable dependency that actually ships in the production bundle;
- a problem in the CI workflow or the build scripts that could expose the repository or its users.

## Supported versions

Only the latest release on `main` receives fixes.

| Version | Supported |
| --- | --- |
| 1.3.x | Yes |
| < 1.3 | No |

## Reporting a vulnerability

Please **do not open a public issue** for a security problem.

Report it privately through GitHub: open the repository's **Security** tab and choose **Report a vulnerability**. Include the affected version or commit, steps to reproduce, and the impact you expect.

You should get an acknowledgement within a week. Once a fix is ready it will be released and credited in the changelog, unless you prefer to stay anonymous.

## Dependency checks

`npm audit` reports dependency advisories. Most dependencies are build-time tools (Vite, TypeScript, ESLint, Vitest, Playwright Core); only React, React DOM and the two self-hosted font packages ship to players.
