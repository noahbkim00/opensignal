import type {
  GitHubIssue,
  RepoIdentifier,
  CuratedRepoConfig,
  TrackedIssueRecord,
  IssueStatus,
  RunTrigger,
  MatchedIssue,
} from "./types";

export interface GitHubClient {
  fetchIssuesForRepo(
    owner: string,
    name: string,
    labels: string[]
  ): Promise<GitHubIssue[]>;

  validateRepoExists(owner: string, name: string): Promise<{ exists: boolean; isPublic: boolean }>;

  fetchIssueStatus(
    owner: string,
    name: string,
    issueNumber: number
  ): Promise<GitHubIssue | null>;
}

export interface SheetProvider {
  ensureSheet(userId: string, accessToken: string): Promise<string>;

  appendIssues(
    spreadsheetId: string,
    issues: MatchedIssue[],
    accessToken: string
  ): Promise<Map<number, string>>; // Returns map of githubIssueId -> sheetRowId

  updateStatuses(
    spreadsheetId: string,
    updates: Array<{ sheetRowId: string; status: IssueStatus }>,
    accessToken: string
  ): Promise<void>;

  checkSheetExists(spreadsheetId: string, accessToken: string): Promise<boolean>;
}

export interface Repositories {
  // Users
  getUserById(userId: string): Promise<{
    id: string;
    email: string;
    needsReconnect: boolean;
  } | null>;

  setUserNeedsReconnect(userId: string, needsReconnect: boolean): Promise<void>;

  // Config
  getUserConfig(userId: string): Promise<{ selectedLanguages: string[] } | null>;

  // Repos
  getCuratedRepos(): Promise<CuratedRepoConfig[]>;
  getCustomRepos(userId: string): Promise<RepoIdentifier[]>;

  // Tracked issues
  getTrackedIssues(userId: string): Promise<TrackedIssueRecord[]>;

  upsertTrackedIssue(
    userId: string,
    issue: MatchedIssue,
    sheetRowId: string
  ): Promise<void>;

  updateTrackedIssueStatus(
    userId: string,
    githubIssueId: number,
    status: IssueStatus
  ): Promise<void>;

  // Runs
  createRun(userId: string, trigger: RunTrigger): Promise<string>;

  updateRunStatus(
    runId: string,
    status: "running" | "success" | "failed",
    counts?: { newIssuesCount?: number; staleIssuesCount?: number },
    error?: string
  ): Promise<void>;

  hasActiveRun(userId: string): Promise<boolean>;

  // Sheets
  getSheetId(userId: string): Promise<string | null>;
  setSheetId(userId: string, spreadsheetId: string): Promise<void>;
  deleteSheetRecord(userId: string): Promise<void>;

  // Tokens
  getAccessToken(userId: string): Promise<string | null>;
}
