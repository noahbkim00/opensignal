export interface RepoIdentifier {
  owner: string;
  name: string;
}

export interface RepoWithLabels extends RepoIdentifier {
  labelMapping: string[];
}

export interface CuratedRepoConfig extends RepoWithLabels {
  languages: string[];
}

export interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  url: string;
  labels: string[];
  createdAt: Date;
  state: "open" | "closed";
  assignee: string | null;
}

export interface MatchedIssue extends GitHubIssue {
  repo: RepoIdentifier;
  languages: string[];
}

export type IssueStatus = "open" | "closed" | "assigned";

export interface TrackedIssueRecord {
  id: string;
  githubIssueId: number;
  issueNumber: number;
  repoOwner: string;
  repoName: string;
  issueUrl: string;
  issueTitle: string;
  labels: string[];
  status: IssueStatus;
  sheetRowId: string | null;
}

export interface RunResult {
  success: boolean;
  newIssuesCount: number;
  staleIssuesCount: number;
  error?: string;
  dryRun?: boolean;
  effectiveRepos?: RepoWithLabels[];
  matchedIssuesCount?: number;
  sheetId?: string | null;
  sheetUrl?: string | null;
  actions?: {
    fetchedRepos: number;
    createdSheet: boolean;
    appendedRows: number;
    updatedStatuses: number;
    skippedSheetWrites: boolean;
  };
  warnings?: string[];
}

export type RunTrigger = "cron" | "manual";
