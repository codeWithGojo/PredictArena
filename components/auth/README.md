# Auth session model

Tokens are kept only in React memory. They are never written to localStorage, cookies or persistent browser storage. This reduces the impact of an injected script reading browser storage.

The PKCE verifier, state and nonce live in sessionStorage only long enough to validate the Hosted UI redirect. After the authorization-code exchange, the refresh token stays in memory alongside the access token. The provider schedules a token refresh before expiry. A page reload clears the in-memory session, so the user can sign in again through Cognito's managed-login session without storing application tokens locally.

`NEXT_PUBLIC_DEV_AUTH_MODE=free` or `premium` enables a mock user outside production only. It exists for UI preview and must never be relied on by the API.
