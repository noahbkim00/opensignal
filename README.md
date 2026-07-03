# OpenSignal

OpenSignal is a multi-user web app that finds beginner-friendly open source issues matching a user's languages and custom repositories, then writes them to a Google Sheet in that user's own Google Drive.

The web UI is for configuration only. The Google Sheet is the output.

## Take-Home Requirement Checklist

| Requirement | How OpenSignal satisfies it |
|---|---|
| Authenticates with both APIs | Google uses per-user OAuth. GitHub uses one server-side token for public repository issue reads. |
| Supports dynamic authentication | Google authorization is dynamic per signed-in user and stores an encrypted refresh token for later runs. GitHub user OAuth is intentionally not implemented because the app only reads public repos. |
| Reads from one API and writes to another | The run pipeline reads GitHub issues and creates/appends/updates rows in the signed-in user's Google Sheet. |
| Handles at least one error case gracefully | Invalid params return `400`, unauthenticated requests return `401`, duplicate active runs return `409`, missing Google authorization marks the user for reconnect, and GitHub per-repo fetch failures do not stop the whole run. |
| Exposes a live HTTP endpoint | `POST /api/run` triggers the integration and accepts params that modify the run. `GET /api/cron` triggers scheduled runs with a bearer secret. |
| Returns workflow context | `/api/run` returns the effective repos, matched issue count, Google Sheet URL, action counts, warnings, and errors. |
| Deployable over the web | The production deployment is `https://www.opensig.dev`. |

## Stack

- Next.js 16 App Router
- Drizzle ORM with Postgres
- Auth.js v5 with Google OAuth and `drive.file` scope
- Octokit with one server-side GitHub credential
- Google Sheets API with per-user OAuth

## Architecture

The app is split into three layers with one direction of dependency:

- `src/app` - pages, API route handlers, cron endpoint, and Auth.js routing
- `src/lib/core` - framework-agnostic domain logic in `pipeline.ts` and `matching.ts`
- `src/lib/adapters` - implementations of `GitHubClient`, `SheetProvider`, and `Repositories`

## Local Development

OpenSignal depends on external services before it can run end to end: Postgres, Google OAuth with Sheets/Drive APIs enabled, a GitHub token, and app secrets. Use [self_host.md](./self_host.md) as the setup guide for those prerequisites, OAuth redirect URIs, database provisioning, and production smoke tests.

Once those services are configured, copy `.env.example` to `.env.local` and fill in the values from your local or hosted setup:

```bash
cp .env.example .env.local
```

Then install dependencies, prepare the database, and start the app:

```bash
npm install
npm run db:push
npm run db:seed
npm run dev
```

Open `http://localhost:3000`. If Google sign-in, token refresh, or Sheets writes fail locally, re-check the Google OAuth/API and database setup in [self_host.md](./self_host.md).

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start the development server |
| `npm run build` | Build the production app |
| `npm run start` | Start the production server after a build |
| `npm run test:run` | Run unit tests with Vitest |
| `npm run lint` | Run ESLint |
| `npm run db:generate` | Generate Drizzle migrations |
| `npm run db:migrate` | Apply Drizzle migrations |
| `npm run db:push` | Push the schema directly to the database |
| `npm run db:seed` | Seed curated repositories |

## Run Pipeline

Each run, whether triggered manually by "Run now" or by a scheduler, does the following:

1. Resolve the user's effective repository set.
2. Fetch matching GitHub issues.
3. Diff against tracked issues.
4. Append new rows to the user's Google Sheet.
5. Mark newly stale rows as `closed` or `assigned`.
6. Record the run outcome.

Runs are idempotent by `(user, GitHub issue ID)` and guarded by a per-user active-run check.

### Parameterized HTTP Run Endpoint

`POST /api/run` is the live endpoint to trigger the cross-system workflow for the signed-in user. It requires an Auth.js session cookie from Google sign-in.

Optional JSON body:

```json
{
  "languages": ["typescript"],
  "repos": ["vercel/next.js", "https://github.com/facebook/react"],
  "maxIssues": 10,
  "dryRun": false
}
```

Parameters:

| Param | Type | Behavior |
|---|---|---|
| `languages` | `string[]` | Overrides saved language preferences for this run only. Unsupported languages are ignored with warnings. |
| `repos` | `string[]` | Overrides saved custom repos for this run only. Values must be `owner/name` or GitHub URLs. |
| `maxIssues` | integer `1..100` | Limits how many new issues are written in this run. |
| `dryRun` | boolean | Reads GitHub and returns context without creating/updating Google Sheets rows. |

Example local request after signing in through the browser and copying the session cookie:

```bash
curl -X POST http://localhost:3000/api/run \
  -H "Content-Type: application/json" \
  -H "Cookie: $NEXTAUTH_COOKIE" \
  -d '{
    "languages": ["typescript"],
    "repos": ["vercel/next.js"],
    "maxIssues": 5,
    "dryRun": false
  }'
```

Successful responses include:

```json
{
  "success": true,
  "newIssuesCount": 3,
  "staleIssuesCount": 1,
  "dryRun": false,
  "effectiveRepos": [{ "owner": "vercel", "name": "next.js" }],
  "matchedIssuesCount": 8,
  "sheetUrl": "https://docs.google.com/spreadsheets/d/.../edit",
  "actions": {
    "fetchedRepos": 1,
    "createdSheet": false,
    "appendedRows": 3,
    "updatedStatuses": 1,
    "skippedSheetWrites": false
  }
}
```

### Authentication Model

Google is the user-owned write target, so OpenSignal uses Google OAuth for each user and requests `offline` access with the narrow `drive.file` scope. Refresh tokens are encrypted before storage and used to create/update the user's Google Sheet on manual and scheduled runs.

GitHub is the public read source. OpenSignal does not implement GitHub user OAuth because it only reads public repository issue metadata. Instead, it uses a server-side `GITHUB_TOKEN` to raise GitHub API limits and keep the workflow simple for interview/demo use.

## External Services

OpenSignal requires:

- Postgres for users, config, OAuth tokens, tracked issues, sheets, and run history.
- Google OAuth with Google Sheets API and Google Drive API enabled.
- A GitHub token with access to public repository issues.
- Optional production scheduler support for `GET /api/cron`.

## Error Handling

- `POST /api/run` returns `400` for invalid JSON or invalid params.
- Authenticated endpoints return `401` when no user session is present.
- `/api/cron` returns `401` when the bearer secret is missing or wrong.
- Active duplicate runs return a structured `409` response.
- If Google access-token refresh fails, the run fails gracefully and the dashboard prompts the user to reconnect.
- If one GitHub repository fails during a run, the pipeline logs that repo failure and continues with the remaining repos.
- Google Sheets `429` responses are retried with exponential backoff.

## Assumptions

- GitHub repositories are public; private repository support and per-user GitHub OAuth are intentionally out of scope.
- The app writes only to Google Sheets it creates under the signed-in user's account.
- The default label mappings target beginner-friendly issues such as `good first issue` and `help wanted`.
- The production deployment has all required environment variables configured before demo day.

## Self Hosting

For production setup, OAuth configuration, database provisioning, and scheduler configuration, see [self_host.md](./self_host.md).

## Vercel Deployment

This repo is linked to the Vercel project `n5m/opensignal`.

- Production URL: `https://www.opensig.dev`
- Cron endpoint: `GET /api/cron`, scheduled daily at `06:00 UTC` by `vercel.json`
- Required Vercel env vars: `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_TOKEN`, `TOKEN_ENCRYPTION_KEY`, `CRON_SECRET`

After changing Vercel env vars, redeploy the project so the new values are attached to the deployment.
