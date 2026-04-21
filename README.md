# MVP Club Panopticon

A WorkOS sample app combining SSO, Directory Sync, and live webhook streaming into a single, satirically paranoid surveillance dashboard.

## Demo Video

View the demonstration video [at this youtube link](https://www.youtube.com/watch?v=ndO1PxL1Ytc)

## Origin and Features

This merges two WorkOS reference apps — [`node-sso-example`](https://github.com/workos/node-example-applications/tree/main/node-sso-example) and [`node-directory-sync-example`](https://github.com/workos/node-example-applications/tree/main/node-directory-sync-example) — into one integrated demo. If you've set up either separately before, the steps below will feel familiar; if not, this is the full setup from scratch.

Features:
- **SSO** via SAML (wired to Okta by default, any SAML IdP works)
- **Directory Sync** — read users and directories from your WorkOS organization
- **Realtime webhooks** — incoming events stream over Socket.IO into a classified, filterable log

## Prerequisites

- Node.js 18+
- A [WorkOS](https://workos.com) account
- An SSO IdP configured in WorkOS (Okta, Azure AD, Google Workspace, etc. — any SAML provider)
- A Directory Sync provider connected in WorkOS (to populate Subjects / Jurisdictions pages with real data)
- [ngrok](https://ngrok.com) (only for receiving webhooks during local development)

## 1. Clone & install

```bash
git clone https://github.com/workos/node-example-applications.git
cd node-example-applications/mvp-club-roster
npm install
```

## 2. WorkOS Dashboard setup

The app touches three WorkOS surfaces. Configure each before running.

### 2a. API credentials

From the [WorkOS Dashboard](https://dashboard.workos.com):
1. Copy your **API Key** (`sk_...`) from **API Keys**
2. Copy your **Client ID** (`client_...`) from **Configuration → Redirects**

### 2b. Organization

Under **Organizations**, create or select the organization users will sign in to. Copy its ID (`org_...`) — you'll set it as `WORKOS_ORGANIZATION_ID` in step 3.

### 2c. SSO connection (SAML / Okta)

Under your organization, add an SSO **Connection** — a SAML connection for Okta or your preferred IdP. Copy the connection ID (`conn_...`).

If you don't already have an IdP to connect with, setting one up under the Okta Free Trial is reasonable and what the author did.

Register these Redirect URIs on the connection:
- Local dev: `http://localhost:8000/callback`
- Production (Heroku): `https://<your-app>.herokuapp.com/callback`

Both can be registered simultaneously — WorkOS matches against the one in the auth request.

### 2d. Directory Sync connection

Under the same organization, configure a Directory Sync connection with your IdP. The **Subjects** and **Jurisdictions** pages query this via the WorkOS API; no extra env var is required beyond the API Key.

(Setup guidance for the Directory Sync side mirrors the stand-alone [node-directory-sync-example README](../node-directory-sync-example/README.md).)

### 2e. Webhooks

Under **Webhooks**, add an endpoint pointing at the app's `/webhooks` route:
- Local (via ngrok): `https://<your-ngrok-subdomain>.ngrok-free.app/webhooks`
- Production: `https://<your-app>.herokuapp.com/webhooks`

Subscribe to at least the `dsync.*` events; optionally `authentication.*` if your plan supports it (these drive the "I SEE YOU" audio cue on successful sign-ins).

Copy the **Webhook Secret** (`wl_...`) — the app uses it to verify signatures before broadcasting events.

## 3. Environment variables

Copy the template and fill it in:

```sh
cp .env.example .env
```

Each variable is annotated in [`.env.example`](./.env.example) with a pointer back to the dashboard step that produces its value.

`HOST_URL` must match a Redirect URI registered on the SSO connection (step 2c). For production, set it to your deployed origin with **no trailing slash**.

## 4. Run locally

Start the server:

```sh
npm start
```

In a second terminal, expose your local port so WorkOS can deliver webhooks:

```sh
ngrok http 8000
```

Register the ngrok URL as the webhook endpoint in the WorkOS Dashboard (step 2e).

Open <http://localhost:8000> — you should see the Panopticon's dark landing page. Click **Submit credentials via Okta** to authenticate.

## 5. Deploy to Heroku

The app is Heroku-ready — `app.set('trust proxy', 1)` is wired in `index.js` so secure session cookies work behind Heroku's TLS terminator.

```sh
heroku create my-panopticon
heroku config:set \
  WORKOS_API_KEY=sk_... \
  WORKOS_CLIENT_ID=client_... \
  WORKOS_ORGANIZATION_ID=org_... \
  WORKOS_CONNECTION_ID=conn_... \
  WORKOS_WEBHOOK_SECRET=wl_... \
  HOST_URL=https://my-panopticon.herokuapp.com
git push heroku main
```

Then register the Heroku URL in the WorkOS Dashboard as both:
- an SSO **Redirect URI** (`https://my-panopticon.herokuapp.com/callback`)
- a **Webhook endpoint** (`https://my-panopticon.herokuapp.com/webhooks`)

> **Session storage note:** sessions live in `express-session`'s default `MemoryStore`. That resets on every dyno restart and doesn't share state across dynos. For anything beyond a demo, swap in Redis or another shared store.

## What you're looking at

Once signed in, navigate via the top nav:

- **The Eye** (`/`) — pulsing hero, session event counter, tail of the last 6 confessions
- **Subjects** (`/users`) — users in the first connected directory, reached directly or via Jurisdictions
- **Jurisdictions** (`/directories`) — all Directory Sync directories in your org
- **Confessions** (`/webhooks`) — full event log, filter chips by category, per-row raw JSON expand

Events stream over Socket.IO. The classifier in `public/js/panopticon.js` maps WorkOS event types (`dsync.user.created`, `authentication.sso_succeeded`, etc.) to satirical narrations, severity, and filter categories. History persists across page navigations within a tab via `sessionStorage` — tab close clears it ("the Panopticon is only human").

## Need help?

Underlying WorkOS docs:
- [SSO guide](https://workos.com/docs/sso)
- [Directory Sync guide](https://workos.com/docs/directory-sync)
- [Webhooks guide](https://workos.com/docs/events/data-syncing-using-webhooks)

Or reach out to support@workos.com.
