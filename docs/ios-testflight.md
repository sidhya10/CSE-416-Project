# iOS and TestFlight

## Architecture

The iPhone app is a separate Capacitor 8 shell in `ios/`. It opens the existing production client at `https://cse-416-project-tau.vercel.app` inside the system `WKWebView`. This keeps the mobile beta on the same origin as the browser app, so it uses the same cookies, Vercel API, Prisma Postgres data, and deployed feature set.

The iOS project does not replace, configure, or deploy the Vercel application. The native target and Google bridge are merged into `main`. An initial build has been uploaded; native SDK/configuration changes require a new upload.

Current native settings:

| Setting | Value |
|---|---|
| Display name | CSE 416 Budget |
| Bundle identifier | `com.cse416.divvy` |
| Version | `1.0` |
| Build | `1` |
| Minimum iOS version | iOS 15 |
| Devices | iPhone |
| Orientation | Portrait |

## Prerequisites

- A Mac running a Capacitor-supported version of Xcode.
- Membership in the Apple Developer Program.
- App Manager, Developer, or Admin access in App Store Connect.
- An App Store Connect app record whose bundle identifier matches `com.cse416.divvy`.
- Keep the existing registered bundle identifier for updates to this app; the Google iOS OAuth client and callback scheme are tied to it.

No Apple passwords, signing certificates, provisioning profiles, or App Store Connect API keys belong in this repository.

## Build and run locally

From the repository root on macOS:

```sh
npm ci
npm run mobile:sync
npm run mobile:google -- --check
npm run mobile:open
```

In Xcode:

1. Select the `App` target and open **Signing & Capabilities**.
2. Enable automatic signing and choose the team's Apple Developer account.
3. Select an iPhone simulator or connected iPhone.
4. Run the `App` scheme.

Run `npm run mobile:sync` whenever Capacitor configuration, plugins, or local web assets change. The production URL is declared in `capacitor.config.ts` and is independent from Xcode signing.

## TestFlight upload

1. In App Store Connect, create the app record with the matching bundle identifier.
2. In Xcode, select **Any iOS Device (arm64)** as the destination.
3. Choose **Product → Archive**.
4. In Organizer, validate the archive and choose **Distribute App → TestFlight & App Store**.
5. Upload the build and complete the export-compliance and privacy questions in App Store Connect.
6. Add internal testers after Apple finishes processing the build. External testers require TestFlight beta review.

The table above lists repository defaults. Increment `CURRENT_PROJECT_VERSION` above the highest build already uploaded for every new upload. Increase `MARKETING_VERSION` for user-visible releases.

## Beta validation checklist

- Register with the required phone number, then sign in with username, email, and phone number.
- Reset a password with a saved recovery code and change it from Profile.
- Search for, add, and remove a friend.
- Create a group, scan or enter a receipt, split it, and verify each member's share.
- Confirm a settlement and verify it clears only after creditor confirmation.
- In an isolated test environment, connect Plaid Sandbox, synchronize transactions, review a charge, and link it to a group expense. Production uses production Plaid credentials; real-bank tests require an authorized tester.
- Verify the payer's budget counts only the payer's share of the linked expense.
- Test camera and photo-library receipt selection on a physical iPhone.
- Test light and dark appearance, narrow layouts, and the app after backgrounding and reopening it.

## Current mobile-provider limitations

### Google

Browsers retain Google Identity Services. On iOS, the app uses Google's native SDK through `DivvyGoogleSignInPlugin`, with the configured iOS client and callback scheme for `com.cse416.divvy`. Keep the backend and browser configured with the Web client ID. Run `npm run mobile:google -- --check` after syncing. See [Google setup](google-auth.md#configure-the-ios-build). A new TestFlight binary is required; verify sign-in, sign-up, account linking, recovery, and cancellation on a physical iPhone. The simulator CI job is currently queued and native compilation has not yet been verified.

### Plaid

The production backend is configured with production Plaid credentials. A successful Link-token request does not establish that bank OAuth works on iOS. Production mobile-bank OAuth is better handled with Plaid's native iOS SDK or Hosted Link plus a verified universal-link return path. Before a public release, replace the embedded flow with one of those supported approaches and test OAuth institutions on a physical device.

### Network access

The shell depends on the deployed Vercel client/API and Prisma Postgres database. It does not provide offline operation. Render is suspended and is retained only as a rollback option.

## Keeping the web deployment unchanged

- Build and upload the iOS project from Xcode; do not run a Vercel production deployment for a mobile-only release.
- Pull the latest reviewed `main` before syncing and archiving.
- Do not place Apple signing material in Vercel, Render, GitHub, or source control.
- A later merge of the native project may cause an automatic Vercel build if repository hooks are enabled, but it does not change the web application output. The `ios/` directory and Capacitor files are not part of Vite's production bundle.

## Budget CSV export

Budget export uses the Capacitor Filesystem and Share plugins on iOS. Sync the
native project (`npm run mobile:sync`) and upload a new TestFlight binary after
adding these plugins. The app writes a temporary CSV in its cache, opens the
system share sheet (including Save to Files), and removes its temporary copy
when sharing finishes or is cancelled. Older installed builds show an update
message rather than attempting an unsupported WebView download.

Verify on a physical iPhone: export the selected month, save to Files, reopen the
CSV, cancel an export, and export again. Verify Safari still downloads the CSV.
The app privacy manifest declares the Filesystem plugin's file timestamp usage.
