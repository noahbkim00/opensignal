import { Octokit } from "@octokit/rest";
import type { GitHubClient } from "../core/interfaces";
import type { GitHubIssue } from "../core/types";

export class GitHubClientImpl implements GitHubClient {
  private octokit: Octokit;
  private issueCache: Map<string, { issues: GitHubIssue[]; etag?: string }> =
    new Map();

  constructor(token?: string) {
    this.octokit = new Octokit({
      auth: token || process.env.GITHUB_TOKEN,
    });
  }

  async fetchIssuesForRepo(
    owner: string,
    name: string,
    labels: string[]
  ): Promise<GitHubIssue[]> {
    // GitHub's `labels` filter uses AND semantics (an issue must carry every
    // listed label). Matching requires ANY label, so query each label
    // separately and union the results, deduping by issue id.
    const byId = new Map<number, GitHubIssue>();

    for (const label of labels) {
      const issues = await this.fetchByLabel(owner, name, label);
      for (const issue of issues) {
        byId.set(issue.id, issue);
      }
    }

    return Array.from(byId.values());
  }

  private async fetchByLabel(
    owner: string,
    name: string,
    label: string
  ): Promise<GitHubIssue[]> {
    const cacheKey = `${owner}/${name}::${label}`;
    const cached = this.issueCache.get(cacheKey);

    try {
      const response = await this.octokit.issues.listForRepo({
        owner,
        repo: name,
        state: "open",
        labels: label,
        per_page: 100,
        headers: cached?.etag ? { "If-None-Match": cached.etag } : undefined,
      });

      const issues: GitHubIssue[] = response.data
        .filter((issue) => !issue.pull_request) // Exclude PRs
        .map((issue) => ({
          id: issue.id,
          number: issue.number,
          title: issue.title,
          url: issue.html_url,
          labels: issue.labels
            .map((l) => (typeof l === "string" ? l : l.name))
            .filter((name): name is string => !!name),
          createdAt: new Date(issue.created_at),
          state: issue.state as "open" | "closed",
          assignee: issue.assignee?.login ?? null,
        }));

      const etag = response.headers.etag;
      this.issueCache.set(cacheKey, { issues, etag });

      return issues;
    } catch (error: unknown) {
      // Octokit throws on 304 Not Modified; serve cached issues instead.
      if (this.isNotModifiedError(error) && cached) {
        return cached.issues;
      }
      if (this.isRateLimitError(error)) {
        const resetTime = this.getRateLimitReset(error);
        throw new Error(`GitHub rate limit exceeded. Resets at ${resetTime}`);
      }
      throw error;
    }
  }

  async validateRepoExists(
    owner: string,
    name: string
  ): Promise<{ exists: boolean; isPublic: boolean }> {
    try {
      const response = await this.octokit.repos.get({ owner, repo: name });
      return {
        exists: true,
        isPublic: !response.data.private,
      };
    } catch (error: unknown) {
      if (this.isNotFoundError(error)) {
        return { exists: false, isPublic: false };
      }
      throw error;
    }
  }

  async fetchIssueStatus(
    owner: string,
    name: string,
    issueNumber: number
  ): Promise<GitHubIssue | null> {
    try {
      const response = await this.octokit.issues.get({
        owner,
        repo: name,
        issue_number: issueNumber,
      });

      const issue = response.data;

      return {
        id: issue.id,
        number: issue.number,
        title: issue.title,
        url: issue.html_url,
        labels: issue.labels
          .map((l) => (typeof l === "string" ? l : l.name))
          .filter((name): name is string => !!name),
        createdAt: new Date(issue.created_at),
        state: issue.state as "open" | "closed",
        assignee: issue.assignee?.login ?? null,
      };
    } catch (error: unknown) {
      if (this.isNotFoundError(error)) {
        return null;
      }
      throw error;
    }
  }

  clearCache(): void {
    this.issueCache.clear();
  }

  private isNotModifiedError(error: unknown): boolean {
    return (
      typeof error === "object" &&
      error !== null &&
      "status" in error &&
      (error as { status: number }).status === 304
    );
  }

  private isRateLimitError(error: unknown): boolean {
    return (
      typeof error === "object" &&
      error !== null &&
      "status" in error &&
      (error as { status: number }).status === 403
    );
  }

  private isNotFoundError(error: unknown): boolean {
    return (
      typeof error === "object" &&
      error !== null &&
      "status" in error &&
      (error as { status: number }).status === 404
    );
  }

  private getRateLimitReset(error: unknown): string {
    if (
      typeof error === "object" &&
      error !== null &&
      "response" in error &&
      typeof (error as { response: unknown }).response === "object" &&
      (error as { response: { headers?: { "x-ratelimit-reset"?: string } } })
        .response?.headers?.["x-ratelimit-reset"]
    ) {
      const resetTimestamp = parseInt(
        (error as { response: { headers: { "x-ratelimit-reset": string } } })
          .response.headers["x-ratelimit-reset"],
        10
      );
      return new Date(resetTimestamp * 1000).toISOString();
    }
    return "unknown";
  }
}
