# OpenSignal

OpenSignal is a multi-user web app that finds beginner-friendly open source issues matching a user's languages and custom repositories, then writes them to a Google Sheet in that user's own Google Drive.

The web UI is for configuration only. The Google Sheet is the output.

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

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Copy `.env.example` to `.env.local` and fill in each value:

```bash
cp .env.example .env.local
```

| Variable | Description |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `NEXTAUTH_SECRET` | Random secret for Auth.js |
| `NEXTAUTH_URL` | Local app URL, usually `http://localhost:3000` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth credentials |
| `GITHUB_TOKEN` | GitHub token for fetching public issues |
| `TOKEN_ENCRYPTION_KEY` | 32-byte base64 key for encrypting refresh tokens |
| `CRON_SECRET` | Bearer secret protecting `/api/cron` |

Generate a token encryption key with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### 3. Prepare the database

```bash
npm run db:push
npm run db:seed
```

### 4. Run the app

```bash
npm run dev
```

Open `http://localhost:3000`.

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

## Self Hosting

For production setup, OAuth configuration, database provisioning, and scheduler configuration, see [self_host.md](./self_host.md).
