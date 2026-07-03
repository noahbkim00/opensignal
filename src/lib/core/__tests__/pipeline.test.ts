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
  ensuredSheetCount: number;
} {
  return {
    appendedIssues: [],
    statusUpdates: [],
    ensuredSheetCount: 0,
    async ensureSheet() {
      this.ensuredSheetCount++;
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

  it("fetches matching issues from repos with bounded concurrency", async () => {
    const curatedRepos: CuratedRepoConfig[] = Array.from(
      { length: 8 },
      (_, index) => ({
        owner: "test",
        name: `repo-${index}`,
        languages: ["javascript"],
        labelMapping: ["good first issue"],
      })
    );

    let activeFetches = 0;
    let maxActiveFetches = 0;

    const github: GitHubClient = {
      async fetchIssuesForRepo() {
        activeFetches++;
        maxActiveFetches = Math.max(maxActiveFetches, activeFetches);

        await new Promise((resolve) => setTimeout(resolve, 10));

        activeFetches--;
        return [];
      },
      async validateRepoExists() {
        return { exists: true, isPublic: true };
      },
      async fetchIssueStatus() {
        return null;
      },
    };

    const result = await runPipeline("user-1", "manual", {
      github,
      sheets: createFakeSheetProvider(),
      repos: createFakeRepositories({ curatedRepos }),
    });

    expect(result.success).toBe(true);
    expect(maxActiveFetches).toBeGreaterThan(1);
    expect(maxActiveFetches).toBeLessThanOrEqual(5);
  });

  it("uses fetched matching issues to detect assigned tracked issues without status refetch", async () => {
    const issues: GitHubIssue[] = [
      {
        id: 100,
        number: 1,
        title: "First issue",
        url: "https://github.com/test/repo/issues/1",
        labels: ["good first issue"],
        createdAt: new Date(),
        state: "open",
        assignee: "someone",
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

    let statusFetches = 0;
    const github: GitHubClient = {
      async fetchIssuesForRepo() {
        return issues;
      },
      async validateRepoExists() {
        return { exists: true, isPublic: true };
      },
      async fetchIssueStatus() {
        statusFetches++;
        throw new Error("should not fetch status for issues already fetched");
      },
    };

    const sheets = createFakeSheetProvider();
    const repos = createFakeRepositories({ trackedIssues });

    const result = await runPipeline("user-1", "manual", {
      github,
      sheets,
      repos,
    });

    expect(result.success).toBe(true);
    expect(result.staleIssuesCount).toBe(1);
    expect(statusFetches).toBe(0);
    expect(sheets.statusUpdates[0]).toEqual({
      sheetRowId: "row-100",
      status: "assigned",
    });
  });

  it("uses run-time language and repo overrides without changing saved config", async () => {
    const issues: GitHubIssue[] = [
      {
        id: 200,
        number: 2,
        title: "Override issue",
        url: "https://github.com/custom/repo/issues/2",
        labels: ["good first issue"],
        createdAt: new Date(),
        state: "open",
        assignee: null,
      },
    ];

    const github = createFakeGitHubClient(new Map([["custom/repo", issues]]));
    const sheets = createFakeSheetProvider();
    const repos = createFakeRepositories({
      config: { selectedLanguages: [] },
      customRepos: [],
    });

    const result = await runPipeline(
      "user-1",
      "manual",
      { github, sheets, repos },
      {
        languages: [],
        repos: [{ owner: "custom", name: "repo" }],
      }
    );

    expect(result.success).toBe(true);
    expect(result.newIssuesCount).toBe(1);
    expect(result.effectiveRepos).toEqual([
      {
        owner: "custom",
        name: "repo",
        labelMapping: ["good first issue", "help wanted"],
      },
    ]);
    expect(sheets.appendedIssues[0].repo).toEqual({
      owner: "custom",
      name: "repo",
    });
  });

  it("limits new issue writes when maxIssues is provided", async () => {
    const issues: GitHubIssue[] = [1, 2, 3].map((id) => ({
      id,
      number: id,
      title: `Issue ${id}`,
      url: `https://github.com/test/repo/issues/${id}`,
      labels: ["good first issue"],
      createdAt: new Date(),
      state: "open" as const,
      assignee: null,
    }));

    const github = createFakeGitHubClient(new Map([["test/repo", issues]]));
    const sheets = createFakeSheetProvider();
    const repos = createFakeRepositories({});

    const result = await runPipeline(
      "user-1",
      "manual",
      { github, sheets, repos },
      { maxIssues: 2 }
    );

    expect(result.success).toBe(true);
    expect(result.matchedIssuesCount).toBe(3);
    expect(result.newIssuesCount).toBe(2);
    expect(sheets.appendedIssues.map((issue) => issue.id)).toEqual([1, 2]);
  });

  it("returns context without writing to sheets in dry-run mode", async () => {
    const issues: GitHubIssue[] = [
      {
        id: 300,
        number: 3,
        title: "Dry run issue",
        url: "https://github.com/test/repo/issues/3",
        labels: ["good first issue"],
        createdAt: new Date(),
        state: "open",
        assignee: null,
      },
    ];

    const github = createFakeGitHubClient(new Map([["test/repo", issues]]));
    const sheets = createFakeSheetProvider();
    const repos = createFakeRepositories({ sheetId: null });

    const result = await runPipeline(
      "user-1",
      "manual",
      { github, sheets, repos },
      { dryRun: true }
    );

    expect(result.success).toBe(true);
    expect(result.dryRun).toBe(true);
    expect(result.newIssuesCount).toBe(1);
    expect(result.actions).toEqual({
      fetchedRepos: 1,
      createdSheet: false,
      appendedRows: 0,
      updatedStatuses: 0,
      skippedSheetWrites: true,
    });
    expect(sheets.ensuredSheetCount).toBe(0);
    expect(sheets.appendedIssues).toHaveLength(0);
    expect(sheets.statusUpdates).toHaveLength(0);
  });
});
