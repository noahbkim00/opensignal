import type { GitHubClient, SheetProvider, Repositories } from "./interfaces";
import type {
  RunResult,
  RunTrigger,
  MatchedIssue,
  IssueStatus,
  RepoWithLabels,
} from "./types";
import {
  resolveEffectiveRepoSet,
  filterMatchingIssues,
  determineIssueStatus,
} from "./matching";

export interface PipelineDeps {
  github: GitHubClient;
  sheets: SheetProvider;
  repos: Repositories;
}

const PIPELINE_FETCH_CONCURRENCY = 5;

export async function runPipeline(
  userId: string,
  trigger: RunTrigger,
  deps: PipelineDeps
): Promise<RunResult> {
  const { github, sheets, repos } = deps;

  // Check for active run (concurrency control)
  const hasActive = await repos.hasActiveRun(userId);
  if (hasActive) {
    return {
      success: false,
      newIssuesCount: 0,
      staleIssuesCount: 0,
      error: "A run is already in progress",
    };
  }

  // Create run record
  const runId = await repos.createRun(userId, trigger);

  try {
    await repos.updateRunStatus(runId, "running");

    // Get user config
    const config = await repos.getUserConfig(userId);
    if (!config) {
      throw new Error("User configuration not found");
    }

    // Get access token
    const accessToken = await repos.getAccessToken(userId);
    if (!accessToken) {
      await repos.setUserNeedsReconnect(userId, true);
      throw new Error("No valid access token. Please reconnect Google account.");
    }

    // Resolve effective repo set
    const curatedRepos = await repos.getCuratedRepos();
    const customRepos = await repos.getCustomRepos(userId);
    const effectiveRepos = resolveEffectiveRepoSet(
      config.selectedLanguages,
      curatedRepos,
      customRepos
    );

    if (effectiveRepos.length === 0) {
      await repos.updateRunStatus(runId, "success", {
        newIssuesCount: 0,
        staleIssuesCount: 0,
      });
      return { success: true, newIssuesCount: 0, staleIssuesCount: 0 };
    }

    // Fetch issues from all repos
    const allMatchedIssues = await fetchAllMatchingIssues(
      effectiveRepos,
      curatedRepos,
      github
    );

    // Get tracked issues for diff
    const trackedIssues = await repos.getTrackedIssues(userId);
    const trackedIssueIds = new Set(trackedIssues.map((t) => t.githubIssueId));

    // Find new issues (not yet tracked)
    const newIssues = allMatchedIssues.filter(
      (issue) => !trackedIssueIds.has(issue.id)
    );

    // Ensure sheet exists
    let spreadsheetId = await repos.getSheetId(userId);
    if (spreadsheetId) {
      const exists = await sheets.checkSheetExists(spreadsheetId, accessToken);
      if (!exists) {
        await repos.deleteSheetRecord(userId);
        spreadsheetId = null;
      }
    }

    if (!spreadsheetId) {
      spreadsheetId = await sheets.ensureSheet(userId, accessToken);
      await repos.setSheetId(userId, spreadsheetId);
    }

    // Append new issues to sheet
    let newIssuesCount = 0;
    if (newIssues.length > 0) {
      const rowIdMap = await sheets.appendIssues(
        spreadsheetId,
        newIssues,
        accessToken
      );

      // Track new issues
      for (const issue of newIssues) {
        const sheetRowId = rowIdMap.get(issue.id) || issue.id.toString();
        await repos.upsertTrackedIssue(userId, issue, sheetRowId);
      }
      newIssuesCount = newIssues.length;
    }

    // Check for stale issues
    const staleUpdates = await detectStaleIssues(
      trackedIssues,
      allMatchedIssues,
      github
    );
    let staleIssuesCount = 0;

    if (staleUpdates.length > 0) {
      // Update statuses in sheet
      const sheetUpdates = staleUpdates
        .filter((u) => u.sheetRowId)
        .map((u) => ({
          sheetRowId: u.sheetRowId!,
          status: u.newStatus,
        }));

      if (sheetUpdates.length > 0) {
        await sheets.updateStatuses(spreadsheetId, sheetUpdates, accessToken);
      }

      // Update statuses in DB
      for (const update of staleUpdates) {
        await repos.updateTrackedIssueStatus(
          userId,
          update.githubIssueId,
          update.newStatus
        );
      }
      staleIssuesCount = staleUpdates.length;
    }

    await repos.updateRunStatus(runId, "success", {
      newIssuesCount,
      staleIssuesCount,
    });

    return { success: true, newIssuesCount, staleIssuesCount };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    await repos.updateRunStatus(runId, "failed", undefined, errorMessage);

    return {
      success: false,
      newIssuesCount: 0,
      staleIssuesCount: 0,
      error: errorMessage,
    };
  }
}

async function fetchAllMatchingIssues(
  effectiveRepos: RepoWithLabels[],
  curatedRepos: { owner: string; name: string; languages: string[] }[],
  github: GitHubClient
): Promise<MatchedIssue[]> {
  const curatedByRepo = new Map(
    curatedRepos.map((repo) => [
      `${repo.owner}/${repo.name}`.toLowerCase(),
      repo,
    ])
  );

  const issueGroups = await mapWithConcurrency(
    effectiveRepos,
    PIPELINE_FETCH_CONCURRENCY,
    async (repo) => {
      try {
        const issues = await github.fetchIssuesForRepo(
          repo.owner,
          repo.name,
          repo.labelMapping
        );

        const matchingIssues = filterMatchingIssues(issues, repo.labelMapping);

        const curatedEntry = curatedByRepo.get(
          `${repo.owner}/${repo.name}`.toLowerCase()
        );
        const languages = curatedEntry?.languages ?? [];

        return matchingIssues.map((issue) => ({
          ...issue,
          repo: { owner: repo.owner, name: repo.name },
          languages,
        }));
      } catch (error) {
        // Log but continue with other repos
        console.error(
          `Failed to fetch issues for ${repo.owner}/${repo.name}:`,
          error
        );
        return [];
      }
    }
  );

  return issueGroups.flat();
}

async function detectStaleIssues(
  trackedIssues: { githubIssueId: number; issueNumber: number; repoOwner: string; repoName: string; status: IssueStatus; sheetRowId: string | null }[],
  fetchedIssues: MatchedIssue[],
  github: GitHubClient
): Promise<
  Array<{
    githubIssueId: number;
    sheetRowId: string | null;
    newStatus: IssueStatus;
  }>
> {
  const updates: Array<{
    githubIssueId: number;
    sheetRowId: string | null;
    newStatus: IssueStatus;
  }> = [];

  // Only check issues that are currently "open"
  const openIssues = trackedIssues.filter((t) => t.status === "open");
  const fetchedById = new Map(fetchedIssues.map((issue) => [issue.id, issue]));
  const statusChecks: typeof openIssues = [];

  for (const tracked of openIssues) {
    const fetchedIssue = fetchedById.get(tracked.githubIssueId);
    if (!fetchedIssue) {
      statusChecks.push(tracked);
      continue;
    }

    const newStatus = determineIssueStatus(fetchedIssue);
    if (newStatus !== tracked.status) {
      updates.push({
        githubIssueId: tracked.githubIssueId,
        sheetRowId: tracked.sheetRowId,
        newStatus,
      });
    }
  }

  const checkedUpdates = await mapWithConcurrency(
    statusChecks,
    PIPELINE_FETCH_CONCURRENCY,
    async (tracked) => {
      try {
        const currentIssue = await github.fetchIssueStatus(
          tracked.repoOwner,
          tracked.repoName,
          tracked.issueNumber
        );

        if (!currentIssue) {
          return null; // Issue may have been deleted
        }

        const newStatus = determineIssueStatus(currentIssue);

        if (newStatus !== tracked.status) {
          return {
            githubIssueId: tracked.githubIssueId,
            sheetRowId: tracked.sheetRowId,
            newStatus,
          };
        }
      } catch (error) {
        console.error(
          `Failed to check status for issue ${tracked.githubIssueId}:`,
          error
        );
      }

      return null;
    }
  );

  for (const update of checkedUpdates) {
    if (update) {
      updates.push(update);
    }
  }

  return updates;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await mapper(items[index], index);
    }
  }

  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, worker));

  return results;
}
