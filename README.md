# opensignal

A multi-user web app that finds beginner-friendly open source issues matching your languages and custom repositories, then writes them to a Google Sheet in your own Google Drive. The web UI is configuration only; the Sheet is the output.

## Stack

- Next.js 16 (App Router) on Vercel + Vercel Cron
- Drizzle ORM + Neon Postgres
- Auth.js v5 (Google OAuth, `drive.file` scope only)
- Octokit (single server-side GitHub credential)
- Google Sheets API (per-user OAuth)

## Architecture

Three layers with one direction of dependency:

- `src/app` — pages, API route handlers, cron endpoint, Auth.js.
- `src/lib/core` — framework-agnostic domain logic (`pipeline.ts`, `matching.ts`) depending only on interfaces.
- `src/lib/adapters` — implementations of `GitHubClient`, `SheetProvider`, `Repositories`.

## Setup

### 1. Install

```bash
npm install
```

### 2. Environment

Copy `.env.example` to `.env.local` and fill in:

| Variable | Description |
|---|---|
| `DATABASE_URL` | Neon Postgres connection string |
| `NEXTAUTH_SECRET` | Random secret for Auth.js |
| `NEXTAUTH_URL` | App URL (e.g. `http://localhost:3000`) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth credentials |
| `GITHUB_TOKEN` | GitHub PAT for fetching public issues |
| `TOKEN_ENCRYPTION_KEY` | 32-byte base64 key for encrypting refresh tokens |
| `CRON_SECRET` | Bearer secret protecting `/api/cron` |

Generate the encryption key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### 3. Google Cloud Console

This produces the `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. These identify the **application** (not you personally); every user signs in through them and receives their own per-user token.

**3.1 Create / select a project**

1. Go to https://console.cloud.google.com/.
2. In the top project selector, click **New Project** (or select an existing one). Name it (e.g. "opensignal") and click **Create**.

**3.2 Enable the required APIs**

1. Navigate to **APIs & Services → Library**.
2. Search for **Google Sheets API**, open it, click **Enable**.
3. Search for **Google Drive API**, open it, click **Enable**.

**3.3 Configure the OAuth consent screen**

1. Go to **APIs & Services → OAuth consent screen**.
2. Choose **External** user type, click **Create**.
3. Fill in the required app info (app name, user support email, developer contact email). Click **Save and Continue**.
4. On the **Scopes** step, click **Add or Remove Scopes** and add ONLY:
   - `openid`
   - `.../auth/userinfo.email`
   - `.../auth/userinfo.profile`
   - `https://www.googleapis.com/auth/drive.file`

   Do **not** add the broad `.../auth/drive` or `.../auth/spreadsheets` scopes. `drive.file` limits the app to files it creates, which is a hard privacy requirement.
5. Click **Save and Continue**.
6. On **Test users**, add the Google accounts allowed to sign in while the app is unpublished (see the note below). Click **Save and Continue**.

**3.4 Create the OAuth Client ID + Secret**

1. Go to **APIs & Services → Credentials**.
2. Click **Create Credentials → OAuth client ID**.
3. **Application type:** Web application.
4. **Name:** anything (e.g. "Web client").
5. Under **Authorized redirect URIs**, click **Add URI** and enter:
   - Local: `http://localhost:3000/api/auth/callback/google`
   - Production (add after deploy): `https://YOUR_DOMAIN/api/auth/callback/google`
6. Click **Create**. A dialog shows your **Client ID** and **Client secret**.
7. Copy them into your env file (and Vercel project settings) as:
   - `GOOGLE_CLIENT_ID` = the Client ID
   - `GOOGLE_CLIENT_SECRET` = the Client secret

   Treat the secret like a password. Never commit it; it lives only in `.env.local` and Vercel environment variables.

**3.5 Publishing (letting other users in)**

- While the consent screen is in **Testing** status, only the emails you added as test users can sign in, and their refresh tokens expire after 7 days.
- To allow arbitrary users, open **OAuth consent screen** and click **Publish App**. Because you only request the non-sensitive `drive.file` scope (not the broad `drive`/`spreadsheets` scopes), this typically does **not** trigger Google's full verification/security review.

### 4. Database

```bash
npm run db:push     # apply schema to Neon
npm run db:seed     # seed curated repos
```

### 5. Run

```bash
npm run dev
```

Open http://localhost:3000.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm run test:run` | Run unit tests (Vitest) |
| `npm run lint` | ESLint |
| `npm run db:generate` | Generate SQL migrations |
| `npm run db:push` | Push schema to database |
| `npm run db:seed` | Seed curated repos |

## Run Pipeline

Each run (manual via "Run now" or daily via cron): resolve effective repo set → fetch matching GitHub issues → diff against tracked issues → append new rows to the Sheet → mark newly stale (closed/assigned) rows → record the run. Deduplication key is `(user, GitHub issue ID)`; runs are idempotent and per-user concurrency-locked.

## Deployment (Vercel)

- Set all environment variables in the Vercel project.
- `vercel.json` schedules `/api/cron` daily at 06:00 UTC.
- Vercel Cron sends the `CRON_SECRET` as a Bearer token in the `Authorization` header.
