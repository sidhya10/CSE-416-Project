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

Email/password registration and sign-in do not depend on Google's configuration or SDK availability. No database migration or new npm dependency is required for this change.

## Account behavior

- A new Google identity creates one account; returning Google sign-in looks up its stable Google subject ID.
- A Google identity already linked to a password account signs into that same account. Linking never replaces the password hash, app email, username, memberships or budgets.
- For an existing matching Gmail or Google Workspace address, verified Google sign-in can link to the existing account. For third-party email addresses, sign in with the password first and explicitly connect Google in Account settings.
- Profile linking targets the currently authenticated app account, even if its email differs from the Google email. It refuses a Google identity/email already associated with another app account, or replacement of a different already-linked identity. It does not merge accounts.
- Google-only accounts remain Google-only; this change does not introduce password recovery or a set-password flow for those accounts.

## Browser/API boundary

`POST /api/auth/google/start` accepts `{ nonce, intent: "signin" | "link" }` and returns `{ clientId, nonce, state }`. Link preparation requires an existing app session. A signed, HttpOnly, ten-minute browser cookie binds the state, nonce, intent and starting app user. The client initializes Google once per page with a random page nonce and uses a separate state for each rendered button/attempt.

`POST /api/auth/google` or authenticated `POST /api/auth/google/link` accepts `{ credential, state }`. The server verifies browser state and intent, validates the Google token signature/audience/expiration with Google's library, checks verified email and nonce, and then creates/signs in/links the appropriate user. A changed app session rejects a late Google response, so a successful normal login cannot be replaced by a pending popup. Completed attempt cookies are cleared. Google ID tokens are not saved in browser storage or the database.

The client handles SDK failure/timeouts and mismatched client IDs with visible errors and retry. Popup cancellation needs no recovery step. Vite and Vercel set `Cross-Origin-Opener-Policy: same-origin-allow-popups` so the Google window can communicate with the app. Preserve this header if hosting the frontend elsewhere; CSPs must also permit Google's GIS script, frames, styles and connections.

## Troubleshooting

- **No Google button / loading error:** check the API is running, `/api/auth/google/start` succeeds, and the browser can load `https://accounts.google.com/gsi/client`; retry after correcting blockers/network problems.
- **Client IDs do not match:** use the same Web client ID in both variables and restart/rebuild the frontend and backend.
- **Google reports an unauthorized origin or invalid client:** check the Web client type and exact address/port shown in the browser against Google's Authorized JavaScript origins. A popup can still be refused by Google even though the app has read the client ID correctly.
- **Popup blocked/blank:** allow popups for the app and check the frontend's COOP/CSP headers. Use `http://localhost:5173` for local development or a registered HTTPS frontend origin.
- **Google account already associated:** sign into that account; this flow deliberately does not combine two app accounts.

## Native mobile release

The web popup supports the current mobile web UI. A future native iOS/Android or Expo build must use a platform Google sign-in SDK or the system-browser authorization session, with platform-specific OAuth clients and app return URLs. Do not embed Google's login page in an app WebView. This repository does not currently contain an Expo/native client, so this change does not claim to implement native SDK integration.

## Validation

Frontend tests cover sign-in/sign-up popup configuration, profile linking, stale callbacks, SDK failure/retry and usable password login during configuration errors. Database integration tests mock Google's verifier while exercising real account creation, password compatibility, subject lookup, conflicting links and browser-bound nonce/state/session checks.

Playwright tests open a real browser popup using a stub Google provider and stub auth responses to exercise the full client callback and cancellation flow. They never use real Google credentials. Existing Playwright flows still exercise ordinary email registration/login against the API/database. A live Google account chooser and token exchange require the project's real client configuration and a manual check in an authorized browser origin.

References: [Google JavaScript API](https://developers.google.com/identity/gsi/web/reference/js-reference), [Google web setup](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid), [server token verification](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token), [native application OAuth](https://developers.google.com/identity/protocols/oauth2/native-app).
