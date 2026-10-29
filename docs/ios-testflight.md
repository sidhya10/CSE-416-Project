# iOS and TestFlight

## Architecture

The iPhone app is a separate Capacitor 8 shell in `ios/`. It opens the existing production client at `https://cse-416-project-tau.vercel.app` inside the system `WKWebView`. This keeps the mobile beta on the same origin as the browser app, so it uses the same cookies, Render API, Neon data, and deployed feature set.

The iOS project does not replace, configure, or deploy the Vercel application. Work on the native target can remain on the `ios-testflight` branch until the team is ready to merge it.

Current native settings:

| Setting | Value |
|---|---|
| Display name | CSE 416 Budget |
| Bundle identifier | `com.cse416.personalgroupbudget` |
| Version | `1.0` |
| Build | `1` |
| Minimum iOS version | iOS 15 |
| Devices | iPhone |
| Orientation | Portrait |

## Prerequisites

- A Mac running a Capacitor-supported version of Xcode.
- Membership in the Apple Developer Program.
- App Manager, Developer, or Admin access in App Store Connect.
- An App Store Connect app record whose bundle identifier matches `com.cse416.personalgroupbudget`.
- A unique bundle identifier if the default identifier is unavailable. If it changes, update both `capacitor.config.ts` and the Xcode target.

No Apple passwords, signing certificates, provisioning profiles, or App Store Connect API keys belong in this repository.

## Build and run locally

From the repository root on macOS:

```sh
npm ci
npm run mobile:sync
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

Increment `CURRENT_PROJECT_VERSION` for every uploaded build. Increase `MARKETING_VERSION` for user-visible releases.

## Beta validation checklist

- Register with the required phone number, then sign in with username, email, and phone number.
- Reset a password with a saved recovery code and change it from Profile.
- Search for, add, and remove a friend.
- Create a group, scan or enter a receipt, split it, and verify each member's share.
- Confirm a settlement and verify it clears only after creditor confirmation.
- Connect Plaid Sandbox, synchronize transactions, review a charge, and link it to a group expense.
- Verify the payer's budget counts only the payer's share of the linked expense.
- Test camera and photo-library receipt selection on a physical iPhone.
- Test light and dark appearance, narrow layouts, and the app after backgrounding and reopening it.

## Current mobile-provider limitations

### Google

Google blocks OAuth authentication flows in embedded webviews. The browser version keeps Google Identity Services, but the first TestFlight build should use identifier/password login and recovery codes. Supporting Google login in the iPhone app requires the native Google Sign-In SDK and a Capacitor bridge; it should not be represented as working until that integration is added and tested.

### Plaid

The existing Plaid Sandbox flow can be exercised during the internal beta. Production mobile-bank OAuth is better handled with Plaid's native iOS SDK or Hosted Link plus a verified universal-link return path. Before a public release, replace the embedded flow with one of those supported approaches and test OAuth institutions on a physical device.

### Network access

The shell depends on the deployed Vercel client and Render API. It does not provide offline operation. Render's free service may need time to wake after inactivity, so the first request can be slower.

## Keeping the web deployment unchanged

- Build and upload the iOS project from Xcode; do not run a Vercel production deployment for a mobile-only release.
- Keep mobile work on a non-production branch until it has been reviewed.
- Do not place Apple signing material in Vercel, Render, GitHub, or source control.
- A later merge of the native project may cause an automatic Vercel build if repository hooks are enabled, but it does not change the web application output. The `ios/` directory and Capacitor files are not part of Vite's production bundle.
