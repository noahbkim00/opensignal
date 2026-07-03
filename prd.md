# Requirements Document — Open Source Starter Issues

**Version:** 1.0
**Date:** 2026-07-02
**Status:** Approved for implementation planning

The key words MUST, MUST NOT, SHOULD, SHOULD NOT, and MAY in this document are to be interpreted as described in RFC 2119.

---

## 1. Product Summary

A multi-user web application that helps users begin contributing to open source. Users configure the programming languages/technologies they are comfortable with and optionally add specific repositories of interest. On a daily schedule and on demand, the system scans a curated set of open source repositories plus each user's custom repositories for beginner-friendly issues matching the user's language filters, and writes matching issues to a Google Sheet in that user's own Google Drive. The web application is a configuration surface only; the Google Sheet is the product's output surface.

## 2. Definitions

| Term | Definition |
|---|---|
| **Curated repo** | A repository in the system-maintained default list, with metadata including languages and a label mapping. |
| **Custom repo** | A repository added by an individual user, visible only to that user. |
| **Effective repo set** | For a given user: (curated repos whose languages intersect the user's selected languages) ∪ (the user's custom repos). |
| **Label mapping** | The set of GitHub issue labels that qualify an issue as beginner-friendly for a given repo (e.g., `good first issue`, `E-easy`). |
| **Matching issue** | An open GitHub issue in a repo in the user's effective repo set that carries at least one label in that repo's label mapping. |
| **Tracked issue** | An issue previously written to a user's sheet, recorded in the database for deduplication and staleness detection. |
| **Stale** | A tracked issue that has since been closed OR assigned to someone. |
| **Run** | One execution of the pipeline for one user: fetch → diff → write to sheet. |

## 3. Goals and Non-Goals

### 3.1 Goals (v1)
- G1. Multi-user product with per-user configuration and per-user output sheets.
- G2. Daily scheduled runs plus user-triggered on-demand runs.
- G3. Issue matching by label + language filters only.
- G4. Auto-created Google Sheet per user, written via the Google Sheets API using the user's own Google OAuth credentials.
- G5. GitHub data fetched with a single server-side credential.

### 3.2 Non-Goals (explicitly out of scope for v1)
- NG1. Per-user GitHub OAuth. The design MUST NOT require it; it MAY be added later for rate-limit scaling or personalization.
- NG2. Heuristic or LLM-based issue scoring/ranking. Matching is filter-based only.
- NG3. In-app issue browsing. The web UI MUST NOT display issue lists; issues live in the sheet.
- NG4. "Bring your own sheet." Out of scope for v1, but see R-SHEET-6 for the mandatory extensibility requirement. Note: under the `drive.file`-only scope policy (R-AUTH-2, R-AUTH-7), this future feature MUST be implemented via the Google Picker (which grants the app per-file access) rather than a pasted URL.
- NG5. Notifications (email, Slack, etc.).
- NG6. Contribution tracking (whether the user actually worked on an issue).

## 4. Functional Requirements

### 4.1 Authentication & Accounts

- **R-AUTH-1.** The system MUST use Google OAuth 2.0 as the sole sign-in mechanism. A Google account is both the user identity and the credential source for Sheets access.
- **R-AUTH-2.** The OAuth flow MUST request only `https://www.googleapis.com/auth/drive.file` plus basic profile/email scopes. The broad `spreadsheets` and `drive` scopes MUST NOT be requested. Rationale: `drive.file` restricts the app to files it created (or files explicitly granted via the Google Picker), which satisfies R-AUTH-7.
- **R-AUTH-7.** The system MUST NOT be able to read, list, modify, or delete any file in the user's Google Drive other than the spreadsheet(s) it created for that user (or, in future versions, a file the user explicitly granted via the Google Picker). This is a hard privacy constraint; any implementation choice requiring broader Drive visibility is rejected.
- **R-AUTH-3.** The system MUST obtain and persist a Google refresh token per user (offline access) so scheduled runs can execute without the user present.
- **R-AUTH-4.** OAuth refresh tokens MUST be encrypted at rest.
- **R-AUTH-5.** If a user's Google token is revoked or refresh fails, the run for that user MUST fail gracefully (no crash, other users unaffected), the failure MUST be recorded, and the UI MUST surface a "reconnect Google" state.
- **R-AUTH-6.** GitHub access MUST use a single server-side credential (GitHub App installation token or PAT held in server environment configuration). End users MUST NOT be asked to authenticate with GitHub in v1.

### 4.2 User Configuration

- **R-CFG-1.** A user MUST be able to select one or more languages/technologies from a system-defined list.
- **R-CFG-2.** A user MUST be able to add custom repos by `owner/name` (or full GitHub URL, which the system MUST normalize to `owner/name`).
- **R-CFG-3.** On adding a custom repo, the system MUST validate that the repo exists and is public. If the repo has no open issues carrying any label in the default label mapping (see R-MATCH-3), the system SHOULD warn the user but MUST still allow the add.
- **R-CFG-4.** A user MUST be able to remove custom repos and change language selections at any time; changes take effect on the next run.
- **R-CFG-5.** Custom repos are scoped per user and MUST NOT affect other users.

### 4.3 Curated Repo List

- **R-CUR-1.** The system MUST maintain a curated list of repositories in the database, each entry containing at minimum: `owner`, `name`, one or more associated languages, and a label mapping.
- **R-CUR-2.** Each curated entry MAY override the default label mapping with repo-specific labels.
- **R-CUR-3.** The curated list MUST be seedable via a checked-in seed script/fixture. Initial seed SHOULD contain roughly 30–50 well-known repositories across popular languages.
- **R-CUR-4.** Curated list management in v1 is operator-only (seed/migration/admin script). No end-user or admin UI is required.

### 4.4 Issue Matching

- **R-MATCH-1.** An issue qualifies if and only if: it is open, it belongs to a repo in the user's effective repo set, and it carries at least one label in that repo's label mapping. No other scoring or ranking logic is permitted in v1.
- **R-MATCH-2.** For curated repos, language filtering is applied via the repo's associated languages intersecting the user's selected languages.
- **R-MATCH-3.** Custom repos MUST bypass the language filter (the user chose them explicitly) and MUST use the default label mapping of `good first issue` and `help wanted` unless a curated entry exists for the same repo, in which case the curated label mapping takes precedence.
- **R-MATCH-4.** Label comparison MUST be case-insensitive.

### 4.5 Run Pipeline

- **R-RUN-1.** The system MUST execute a daily scheduled run for every active user via Vercel Cron.
- **R-RUN-2.** The system MUST expose an authenticated "run now" action that executes a run for the requesting user only.
- **R-RUN-3.** A run for one user MUST perform: (1) resolve effective repo set; (2) fetch matching issues from GitHub; (3) diff against tracked issues; (4) append rows for new issues to the user's sheet; (5) mark newly stale tracked issues in the sheet and database; (6) record run outcome.
- **R-RUN-4.** Runs MUST be idempotent: executing the same run twice, or overlapping a scheduled run with an on-demand run, MUST NOT produce duplicate rows in the sheet. Deduplication key: (user, GitHub issue ID).
- **R-RUN-5.** The system MUST implement per-user concurrency control (e.g., a run lock) so at most one run per user executes at a time.
- **R-RUN-6.** A failure in one user's run MUST NOT abort or corrupt other users' runs.
- **R-RUN-7.** Each run's outcome (timestamp, trigger type, success/failure, counts of new and stale issues, error detail on failure) MUST be persisted and the most recent outcome MUST be visible in the UI.
- **R-RUN-8.** GitHub fetches SHOULD be shared across users within a scheduled batch (fetch each repo's issues once per batch, not once per user).

### 4.6 Google Sheet Output

- **R-SHEET-1.** On a user's first run, the system MUST create a spreadsheet in the user's Google Drive (suggested title: "Open Source Starter Issues") using the user's OAuth credentials, and MUST persist the spreadsheet ID.
- **R-SHEET-2.** Each matching issue MUST be written as one row with at minimum these columns: repository (`owner/name`), issue title, issue URL, labels, language(s), issue opened date, date added by the system, and status.
- **R-SHEET-3.** Sheet updates are append-plus-status: new issues are appended; existing rows MUST NOT be deleted or reordered by the system.
- **R-SHEET-4.** When a tracked issue becomes stale, the system MUST update that row's status column (e.g., `open` → `closed` or `assigned`). Status values MUST be drawn from a fixed enumeration: `open`, `closed`, `assigned`.
- **R-SHEET-5.** If the user deletes the sheet, the next run MUST detect this and recreate a sheet (re-appending currently-matching issues is acceptable; historical rows need not be restored).
- **R-SHEET-6.** Sheet creation and writing MUST sit behind a provider abstraction (e.g., `SheetProvider` with `ensureSheet`, `appendIssues`, `updateStatuses`) such that a future "user-selected sheet" implementation (via Google Picker, per NG4) can be added without changing the run pipeline.
- **R-SHEET-7.** Writes MUST use batch endpoints (`values.append`, `values.batchUpdate`) rather than per-row calls.

### 4.7 Web UI

- **R-UI-1.** The UI MUST include: Google sign-in; language multi-select; custom repo add/remove with validation feedback; a link to the user's sheet; last-run status; and a "run now" button.
- **R-UI-2.** The UI MUST NOT display fetched issues. (See NG3.)
- **R-UI-3.** The "run now" button MUST be disabled or debounced while a run for that user is in progress.

## 5. Non-Functional Requirements

- **R-NFR-1. Platform.** The application MUST be a Next.js application deployable on Vercel, using Vercel Cron for scheduling. Long-running work MUST fit within Vercel function execution limits or be chunked to do so.
- **R-NFR-2. Persistence.** A hosted Postgres database (Vercel Postgres, Neon, or Supabase) MUST store users, configs, curated repos, custom repos, tracked issues, run history, and encrypted tokens.
- **R-NFR-3. Rate limits.** The system MUST respect GitHub API rate limits, SHOULD use conditional requests (ETags) to reduce quota consumption, and MUST back off and defer (not crash) when limits are hit. Google Sheets API quota errors MUST be retried with exponential backoff.
- **R-NFR-4. Secrets.** All secrets (GitHub credential, Google client secret, token-encryption key, database URL) MUST be supplied via environment configuration and MUST NOT be committed to the repository.
- **R-NFR-5. Privacy.** One user's configuration, tokens, tracked issues, and sheet MUST NOT be readable or writable by another user.
- **R-NFR-6. Observability.** Run failures MUST be logged with enough context to diagnose (user ID, repo, API error). Logging MUST NOT include token values.
- **R-NFR-7. Scale target.** v1 MUST comfortably support on the order of 100 users and a combined repo set of a few hundred repos within a single daily cron window. Architecture SHOULD NOT preclude 10× growth.

## 6. Data Model (minimum required entities)

The implementation MUST include at least the following entities; naming and additional fields are at the implementer's discretion.

- `users` — Google identity, email, created_at.
- `oauth_tokens` — user_id, encrypted refresh token, scopes, updated_at.
- `user_configs` — user_id, selected languages.
- `custom_repos` — user_id, owner, name.
- `curated_repos` — owner, name, languages[], label_mapping[].
- `tracked_issues` — user_id, github_issue_id, repo, issue_url, status, first_seen_at, last_checked_at, sheet_row_ref (or equivalent means to locate the row).
- `runs` — user_id, trigger (`cron` | `manual`), started_at, finished_at, status, counts, error.
- `sheets` — user_id, spreadsheet_id, created_at.

## 7. Acceptance Criteria

1. A new user can sign in with Google, select languages, add a custom repo, and click "run now"; within that run a sheet appears in their Drive containing only issues that are open and match label mappings.
2. Running twice in a row produces zero duplicate rows.
3. Closing or assigning an issue on GitHub and re-running updates that row's status without moving or deleting it.
4. The daily cron processes all users; one user's revoked Google token does not affect other users, and that user sees a reconnect prompt.
5. A custom repo pointing at a nonexistent repository is rejected with a clear error; one with no matching labels is added with a warning.
6. No GitHub authentication is ever requested from an end user.
7. Deleting the sheet and re-running results in a fresh sheet being created automatically.
8. The Google consent screen requests no Drive scope broader than `drive.file`, and an attempt by the app to list or read any other Drive file fails with an authorization error.

## 8. Open Items Delegated to the Implementation Plan

These are intentionally left to the implementing agent, provided all requirements above are satisfied: choice of ORM, auth library, exact Postgres vendor, cron batching strategy, curated seed list contents, UI component library, and the mechanism for `sheet_row_ref` (row index tracking vs. issue-ID lookup column).
