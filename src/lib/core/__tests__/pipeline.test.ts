import { describe, it, expect } from "vitest";
import { runPipeline, type PipelineDeps } from "../pipeline";
import type { GitHubClient, SheetProvider, Repositories } from "../interfaces";
import type {
  GitHubIssue,
  CuratedRepoConfig,
  TrackedIssueRecord,
  MatchedIssue,
  IssueStatus,
} from "../types";

function createFakeGitHubClient(
  issues: Map<string, GitHubIssue[]> = new Map()
): GitHubClient {
  return {
    async fetchIssuesForRepo(owner, name) {
      return issues.get(`${owner}/${name}`) || [];
    },
    async validateRepoExists() {
      return { exists: true, isPublic: true };
    },
    async fetchIssueStatus(owner, name, issueNumber) {
      const repoIssues = issues.get(`${owner}/${name}`) || [];
      const issue = repoIssues.find((i) => i.number === issueNumber);
      return issue || null;
    },
  };
}

function createFakeSheetProvider(): SheetProvider & {
  appendedIssues: MatchedIssue[];
  statusUpdates: Array<{ sheetRowId: string; status: IssueStatus }>;
} {
  return {
    appendedIssues: [],
    statusUpdates: [],
    async ensureSheet() {
      return "test-spreadsheet-id";
    },
    async appendIssues(_spreadsheetId, issues) {
      this.appendedIssues.push(...issues);
      return new Map(issues.map((i) => [i.id, `row-${i.id}`]));
    },
    async updateStatuses(_spreadsheetId, updates) {
      this.statusUpdates.push(...updates);
    },
    async checkSheetExists() {
      return true;
    },
  };
}

function createFakeRepositories(options: {
  config?: { selectedLanguages: string[] };
  curatedRepos?: CuratedRepoConfig[];
  customRepos?: Array<{ owner: string; name: string }>;
  trackedIssues?: TrackedIssueRecord[];
  sheetId?: string | null;
  hasActiveRun?: boolean;
}): Repositories & {
  trackedIssues: TrackedIssueRecord[];
  runStatuses: Array<{ runId: string; status: string }>;
} {
  const trackedIssues = options.trackedIssues || [];
  const runStatuses: Array<{ runId: string; status: string }> = [];

  return {
    trackedIssues,
    runStatuses,
    async getUserById() {
      return { id: "user-1", email: "test@test.com", needsReconnect: false };
    },
    async setUserNeedsReconnect() {},
    async getUserConfig() {
      return options.config || { selectedLanguages: ["javascript"] };
    },
    async getCuratedRepos() {
      return (
        options.curatedRepos || [
          {
            owner: "test",
            name: "repo",
            languages: ["javascript"],
            labelMapping: ["good first issue"],
          },
        ]
      );
    },
    async getCustomRepos() {
      return options.customRepos || [];
    },
    async getTrackedIssues() {
      return trackedIssues;
    },
    async upsertTrackedIssue(userId, issue, sheetRowId) {
      const existing = trackedIssues.find((t) => t.githubIssueId === issue.id);
      if (!existing) {
        trackedIssues.push({
          id: `tracked-${issue.id}`,
          githubIssueId: issue.id,
          issueNumber: issue.number,
          repoOwner: issue.repo.owner,
          repoName: issue.repo.name,
          issueUrl: issue.url,
          issueTitle: issue.title,
          labels: issue.labels,
          status: "open",
          sheetRowId,
        });
      }
    },
    async updateTrackedIssueStatus(userId, githubIssueId, status) {
      const issue = trackedIssues.find((t) => t.githubIssueId === githubIssueId);
      if (issue) {
        issue.status = status;
      }
    },
    async createRun() {
      return "run-1";
    },
    async updateRunStatus(runId, status) {
      runStatuses.push({ runId, status });
    },
    async hasActiveRun() {
      return options.hasActiveRun || false;
    },
    async getSheetId() {
      return options.sheetId ?? "existing-sheet-id";
    },
    async setSheetId() {},
    async deleteSheetRecord() {},
    async getAccessToken() {
      return "test-access-token";
    },
  };
}

describe("runPipeline", () => {
  it("returns error when run is already active", async () => {
    const deps: PipelineDeps = {
      github: createFakeGitHubClient(),
      sheets: createFakeSheetProvider(),
      repos: createFakeRepositories({ hasActiveRun: true }),
    };

    const result = await runPipeline("user-1", "manual", deps);

    expect(result.success).toBe(false);
    expect(result.error).toBe("A run is already in progress");
  });

  it("returns success with zero counts when no repos match", async () => {
    const deps: PipelineDeps = {
      github: createFakeGitHubClient(),
      sheets: createFakeSheetProvider(),
      repos: createFakeRepositories({ config: { selectedLanguages: [] } }),
    };

    const result = await runPipeline("user-1", "manual", deps);

    expect(result.success).toBe(true);
    expect(result.newIssuesCount).toBe(0);
  });

  it("appends new issues to sheet", async () => {
    const issues: GitHubIssue[] = [
      {
        id: 100,
        number: 1,
        title: "First issue",
        url: "https://github.com/test/repo/issues/1",
        labels: ["good first issue"],
        createdAt: new Date(),
        state: "open",
        assignee: null,
      },
    ];

    const github = createFakeGitHubClient(new Map([["test/repo", issues]]));
    const sheets = createFakeSheetProvider();
    const repos = createFakeRepositories({});

    const result = await runPipeline("user-1", "manual", { github, sheets, repos });

    expect(result.success).toBe(true);
    expect(result.newIssuesCount).toBe(1);
    expect(sheets.appendedIssues).toHaveLength(1);
    expect(sheets.appendedIssues[0].id).toBe(100);
  });

  it("does not duplicate already tracked issues", async () => {
    const issues: GitHubIssue[] = [
      {
        id: 100,
        number: 1,
        title: "First issue",
        url: "https://github.com/test/repo/issues/1",
        labels: ["good first issue"],
        createdAt: new Date(),
        state: "open",
        assignee: null,
      },
    ];

    const trackedIssues: TrackedIssueRecord[] = [
      {
        id: "tracked-100",
        githubIssueId: 100,
        issueNumber: 1,
        repoOwner: "test",
        repoName: "repo",
        issueUrl: "https://github.com/test/repo/issues/1",
        issueTitle: "First issue",
        labels: ["good first issue"],
        status: "open",
        sheetRowId: "row-100",
      },
    ];

    const github = createFakeGitHubClient(new Map([["test/repo", issues]]));
    const sheets = createFakeSheetProvider();
    const repos = createFakeRepositories({ trackedIssues });

    const result = await runPipeline("user-1", "manual", { github, sheets, repos });

    expect(result.success).toBe(true);
    expect(result.newIssuesCount).toBe(0);
    expect(sheets.appendedIssues).toHaveLength(0);
  });

  it("detects and updates stale issues (closed)", async () => {
    const issues: GitHubIssue[] = [
      {
        id: 100,
        number: 1,
        title: "First issue",
        url: "https://github.com/test/repo/issues/1",
        labels: ["good first issue"],
        createdAt: new Date(),
        state: "closed", // Now closed
        assignee: null,
      },
    ];

    const trackedIssues: TrackedIssueRecord[] = [
      {
        id: "tracked-100",
        githubIssueId: 100,
        issueNumber: 1,
        repoOwner: "test",
        repoName: "repo",
        issueUrl: "https://github.com/test/repo/issues/1",
        issueTitle: "First issue",
        labels: ["good first issue"],
        status: "open",
        sheetRowId: "row-100",
      },
    ];

    const github = createFakeGitHubClient(new Map([["test/repo", issues]]));
    const sheets = createFakeSheetProvider();
    const repos = createFakeRepositories({ trackedIssues });

    const result = await runPipeline("user-1", "manual", { github, sheets, repos });

    expect(result.success).toBe(true);
    expect(result.staleIssuesCount).toBe(1);
    expect(sheets.statusUpdates).toHaveLength(1);
    expect(sheets.statusUpdates[0]).toEqual({
      sheetRowId: "row-100",
      status: "closed",
    });
  });

  it("detects and updates stale issues (assigned)", async () => {
    const issues: GitHubIssue[] = [
      {
        id: 100,
        number: 1,
        title: "First issue",
        url: "https://github.com/test/repo/issues/1",
        labels: ["good first issue"],
        createdAt: new Date(),
        state: "open",
        assignee: "someone", // Now assigned
      },
    ];

    const trackedIssues: TrackedIssueRecord[] = [
      {
        id: "tracked-100",
        githubIssueId: 100,
        issueNumber: 1,
        repoOwner: "test",
        repoName: "repo",
        issueUrl: "https://github.com/test/repo/issues/1",
        issueTitle: "First issue",
        labels: ["good first issue"],
        status: "open",
        sheetRowId: "row-100",
      },
    ];

    const github = createFakeGitHubClient(new Map([["test/repo", issues]]));
    const sheets = createFakeSheetProvider();
    const repos = createFakeRepositories({ trackedIssues });

    const result = await runPipeline("user-1", "manual", { github, sheets, repos });

    expect(result.success).toBe(true);
    expect(result.staleIssuesCount).toBe(1);
    expect(sheets.statusUpdates[0].status).toBe("assigned");
  });
});
