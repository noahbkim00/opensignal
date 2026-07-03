# Self Hosting OpenSignal

This guide covers the pieces needed to run OpenSignal on your own hosting setup.

## Requirements

- Node.js 20 or newer
- A Postgres database reachable from the app
- A Google Cloud project for OAuth and Google Sheets/Drive API access
- A GitHub token that can read public repository issues
- A scheduler that can call an HTTP endpoint daily
- A secure place to store environment variables

## 1. Prepare the App

Install dependencies and verify the app builds locally:

```bash
npm install
npm run test:run
npm run build
```

Create the production environment variables in your hosting provider:

| Variable | Description |
|---|---|
| `DATABASE_URL` | Postgres connection string used by Drizzle |
| `NEXTAUTH_SECRET` | Random secret used to sign Auth.js tokens |
| `NEXTAUTH_URL` | Public URL of your deployed app |
| `GOOGLE_CLIENT_ID` | Google OAuth web client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth web client secret |
| `GITHUB_TOKEN` | Server-side GitHub token for fetching issues |
| `TOKEN_ENCRYPTION_KEY` | 32-byte base64 key for encrypting refresh tokens |
| `CRON_SECRET` | Secret used to authorize scheduled runs |

Generate `NEXTAUTH_SECRET` and `TOKEN_ENCRYPTION_KEY` with separate random values:

```bash
openssl rand -base64 32
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## 2. Provision Postgres

Create a Postgres database and set `DATABASE_URL` to its connection string.

Apply the schema and seed the curated repository list:

```bash
npm run db:migrate
npm run db:seed
```

If you are not using generated migrations yet, use `npm run db:push` instead of `npm run db:migrate`.

## 3. Create Google OAuth Credentials

Go to the Google Cloud Console and create or select a project.

Enable these APIs:

- Google Sheets API
- Google Drive API

Configure the OAuth consent screen:

1. Choose the appropriate user type for your deployment.
2. Fill in the app name, support email, and developer contact email.
3. Add only these scopes:
   - `openid`
   - `.../auth/userinfo.email`
   - `.../auth/userinfo.profile`
   - `https://www.googleapis.com/auth/drive.file`
4. Do not add broad Drive or Sheets scopes.
5. Add test users if the app is still in testing mode.

Create an OAuth client:

1. Create credentials for a Web application.
2. Add a local redirect URI if you test locally:
   - `http://localhost:3000/api/auth/callback/google`
3. Add your production redirect URI:
   - `https://YOUR_DOMAIN/api/auth/callback/google`
4. Copy the client ID and client secret into `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

The app requires a refresh token for scheduled runs. The existing auth flow requests offline access and consent so users can grant that token during Google sign-in.

## 4. Create a GitHub Token

Create a GitHub token for server-side issue fetching and set it as `GITHUB_TOKEN`.

The app does not ask end users to authenticate with GitHub. One server-side credential is used for all public issue lookups.

## 5. Deploy the Web App

Use a host that can run a Next.js production build.

The deploy command sequence is:

```bash
npm install
npm run build
npm run start
```

Your host must expose the app over HTTPS and set `NEXTAUTH_URL` to that public origin.

## 6. Configure Scheduled Runs

OpenSignal exposes a cron endpoint:

```text
GET /api/cron
Authorization: Bearer <CRON_SECRET>
```

Configure your scheduler to call it once per day. For example:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://YOUR_DOMAIN/api/cron
```

The included `vercel.json` schedules this endpoint daily at `06:00 UTC` for Vercel deployments. For other hosts, configure the equivalent scheduler in that platform or in an external cron service.

## 7. Smoke Test Production

After deployment:

1. Open the deployed app.
2. Sign in with Google.
3. Select at least one language.
4. Optionally add a public custom repository.
5. Click "Run now".
6. Confirm a Google Sheet named `OpenSignal Issues` appears in the signed-in user's Drive.
7. Confirm the latest run status appears on the dashboard.

If Google token refresh fails later, the dashboard will show a reconnect state and the user should sign out and sign back in.

## Operational Notes

- Keep `TOKEN_ENCRYPTION_KEY` stable. Changing it makes stored refresh tokens unreadable.
- Keep `CRON_SECRET` private. Anyone with it can trigger scheduled work.
- The app uses the Google `drive.file` scope, so it can access only files it creates or files explicitly granted in the future.
- The run pipeline is idempotent by `(user, GitHub issue ID)`, so repeated runs should not duplicate sheet rows.
- If a user deletes their sheet, the next run creates a replacement sheet.
