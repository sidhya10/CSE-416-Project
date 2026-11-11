# Google popup sign-in and account linking

The current client is a React/Vite web application designed for phone-sized screens. Login and sign-up use Google's rendered Sign in with Google button with `ux_mode: popup`, rather than One Tap's `prompt()` API. Profile → Account settings → Connect Google account uses the same popup to link the currently signed-in account. Closing the popup leaves normal email/password authentication available.

## Local setup

Use a Google OAuth **Web application** client ID. In Google Auth Platform → Clients → your Web client, add these Authorized JavaScript origins:

- `http://localhost`
- `http://localhost:5173`

Add the deployed frontend's exact HTTPS origin when using the hosted application. Complete the OAuth branding/audience configuration; add test users if the Google project requires them. This JavaScript callback flow does not require a client secret or a redirect URI.

Set these in the repository-root `.env` next to `package.json` (not `.env.example`):

```dotenv
GOOGLE_CLIENT_ID=your-web-client-id.apps.googleusercontent.com
VITE_GOOGLE_CLIENT_ID=your-web-client-id.apps.googleusercontent.com
```

Restart both frontend and backend with `npm run dev`. Vite now loads the root environment directory, exposing only `VITE_` variables to the browser. The server uses `GOOGLE_CLIENT_ID`, with `VITE_GOOGLE_CLIENT_ID` as a local convenience fallback if the server variable is blank. The server sends the public client ID to the button; a configured frontend ID must match it. In separately deployed services, configure the backend's client ID in its own environment, too. Keep the production browser API URL at `/api` to use the existing frontend proxy and same-origin session cookies.

Phone/password registration and identifier/password sign-in do not depend on Google's configuration or SDK availability. Password accounts require an email, username, and phone number at registration.

## Account behavior

- Google sign-up requires a phone number. A new Google identity creates one account; returning Google sign-in looks up its stable Google subject ID.
- A Google identity already linked to a password account signs into that same account. Linking never replaces the password hash, app email, username, memberships or budgets.
- For an existing matching Gmail or Google Workspace address, verified Google sign-in can link to the existing account. For third-party email addresses, sign in with the password first and explicitly connect Google in Account settings.
- Profile linking targets the currently authenticated app account and requires the verified Google email to exactly match that account's email. It also refuses a Google identity/email already associated with another app account, or replacement of a different already-linked identity. It does not merge accounts.
- Google-only accounts remain Google-only. Password reset is available only to accounts that already have a password.

## Browser/API boundary

`POST /api/auth/google/start` accepts `{ nonce, intent: "signin" | "signup" | "link" }` and returns `{ clientId, nonce, state }`. Link preparation requires an existing app session. A signed, HttpOnly, ten-minute browser cookie binds the state, nonce, intent and starting app user. The client initializes Google once per page with a random page nonce and uses a separate state for each rendered button/attempt.

`POST /api/auth/google` accepts `{ credential, state, phone? }`; Google sign-up requires `phone`. Authenticated `POST /api/auth/google/link` accepts the same browser proof and enforces the account-email match. The server verifies browser state and intent, validates the Google token signature/audience/expiration with Google's library, checks verified email and nonce, and then creates, signs in, or links the appropriate user. A changed app session rejects a late Google response, so a successful normal login cannot be replaced by a pending popup. Completed attempt cookies are cleared. Google ID tokens are not saved in browser storage or the database.

The client handles SDK failure/timeouts and mismatched client IDs with visible errors and retry. Popup cancellation needs no recovery step. Vite and Vercel set `Cross-Origin-Opener-Policy: same-origin-allow-popups` so the Google window can communicate with the app. Preserve this header if hosting the frontend elsewhere; CSPs must also permit Google's GIS script, frames, styles and connections.

## Troubleshooting

- **No Google button / loading error:** check the API is running, `/api/auth/google/start` succeeds, and the browser can load `https://accounts.google.com/gsi/client`; retry after correcting blockers/network problems.
- **Client IDs do not match:** use the same Web client ID in both variables and restart/rebuild the frontend and backend.
- **Google reports an unauthorized origin or invalid client:** check the Web client type and exact address/port shown in the browser against Google's Authorized JavaScript origins. A popup can still be refused by Google even though the app has read the client ID correctly.
- **Popup blocked/blank:** allow popups for the app and check the frontend's COOP/CSP headers. Use `http://localhost:5173` for local development or a registered HTTPS frontend origin.
- **Google account already associated:** sign into that account; this flow deliberately does not combine two app accounts.

## Native mobile release

The browser uses the web popup. The Capacitor iOS app now uses Google's native SDK through `DivvyGoogleSignInPlugin`, registered by `DivvyBridgeViewController`. It never loads the GIS web popup on iOS. Older binaries without this plugin show an update/password-login message. Android native Google authentication is not implemented.

### Configure the iOS build

1. In Google Cloud's Google Auth Platform / Clients (or APIs & Services / Credentials), create an OAuth client of type **iOS** in the same Google project as the existing Web client. Set its bundle ID to the **exact identifier of the app already uploaded to App Store Connect**. This repository is configured for the confirmed TestFlight bundle ID `com.cse416.divvy`. Keep that identifier in Xcode and App Store Connect.
2. Copy the public iOS client ID, ending in `.apps.googleusercontent.com`. This is different from the Web client ID already configured on Vercel. No client secret belongs in the iOS app.
3. On your Mac, after pulling this change, run:

   ```sh
   npm ci
   npm run mobile:sync
   npm run mobile:google -- --client-id YOUR_IOS_CLIENT_ID.apps.googleusercontent.com
   npm run mobile:google -- --check
   npm run mobile:open
   ```

   The configuration command requires Python 3. It adds `GIDClientID` and its reversed callback URL scheme to `ios/App/App/Info.plist`, preserving other URL handlers and signing/bundle settings. Run it with the actual ID, not the example placeholder. The resulting configuration is public OAuth metadata; it may be committed to keep future builds consistent. The supplied iOS client and reversed callback scheme are now committed for `com.cse416.divvy`.
4. Xcode resolves the pinned GoogleSignIn 9.2.0 Swift package directly from the app project. It is separate from Capacitor's generated `CapApp-SPM/Package.swift`, so `cap sync` does not remove it. Version 9.2 includes custom nonce support while retaining this app's iOS 15 target.
5. Preserve your Apple signing team and existing bundle ID, increase the build number above the latest uploaded build, run on an iPhone, then archive and upload through App Store Connect. A Vercel deployment cannot install the native SDK into an existing TestFlight binary.

The native SDK's backend/server client ID comes from `/api/auth/google/start`, using the existing Web OAuth client. It receives a fresh nonce for each attempt. The ID token and state return to the same WebView's API client, preserving the HttpOnly attempt cookie. The server still checks Google's signature, Web client audience, verified email, nonce, state, intent, and linked session. No verifier checks are removed and no alternative token/session storage is introduced. The bridge accepts calls only from the production app origin or packaged `capacitor://localhost` content, and releases the Google SDK session after getting an ID token; Divvy continues to own its ordinary app session.

Callbacks are handled through SceneDelegate (including cold-start URL contexts) and the legacy AppDelegate path. A custom bridge controller registers the plugin for both the scene-created window and storyboard. Only basic identity is requested; this flow does not request Gmail, Drive, bank, or offline API access.

## Validation

Frontend tests cover native iOS dispatch, nonce/state transport, sign-in/sign-up/link/recovery routing, cancellation, missing plugin/configuration, and stale native completions, plus browser sign-in/sign-up popup configuration, profile linking, stale callbacks, SDK failure/retry and usable password login during configuration errors. Database integration tests mock Google's verifier while exercising real account creation, password compatibility, subject lookup, conflicting links and browser-bound nonce/state/session checks.

Playwright tests open a real browser popup using a stub Google provider and stub auth responses to exercise the full client callback and cancellation flow. They never use real Google credentials. Existing Playwright flows still exercise ordinary email registration/login against the API/database. A live Google account chooser and token exchange require the project's real client configuration and a manual check in an authorized browser origin.

References: [Google JavaScript API](https://developers.google.com/identity/gsi/web/reference/js-reference), [Google web setup](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid), [server token verification](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token), [native application OAuth](https://developers.google.com/identity/protocols/oauth2/native-app).


The `ios-build` CI job runs `mobile:sync`, validates the committed public iOS client metadata, and compiles the iOS simulator target without code signing. It does not authenticate to Google. A real-device sign-in/sign-up, cancellation/retry, account switching, linking, recovery, app relaunch/session persistence, and callback return must still be checked with the real OAuth client before uploading the new TestFlight build.
