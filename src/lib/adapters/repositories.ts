import { eq, and, or } from "drizzle-orm";
import { db } from "../db";
import {
  users,
  oauthTokens,
  userConfigs,
  customRepos,
  curatedRepos,
  trackedIssues,
  runs,
  sheets,
} from "../db/schema";
import { decrypt } from "../crypto";
import { determineIssueStatus } from "../core/matching";
import type { Repositories } from "../core/interfaces";
import type {
  CuratedRepoConfig,
  RepoIdentifier,
  TrackedIssueRecord,
  IssueStatus,
  RunTrigger,
  MatchedIssue,
} from "../core/types";

async function refreshAccessToken(
  userId: string
): Promise<string | null> {
  const [token] = await db
    .select()
    .from(oauthTokens)
    .where(eq(oauthTokens.userId, userId))
    .limit(1);

  if (!token) {
    return null;
  }

  // Check if current access token is still valid (with 5 min buffer)
  if (
    token.accessToken &&
    token.accessTokenExpiresAt &&
    new Date(token.accessTokenExpiresAt) > new Date(Date.now() + 5 * 60 * 1000)
  ) {
    return token.accessToken;
  }

  // Refresh the token
  const refreshToken = decrypt(token.encryptedRefreshToken);

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  const newAccessToken = data.access_token as string;
  const expiresIn = data.expires_in as number;

  // Update stored access token
  await db
    .update(oauthTokens)
    .set({
      accessToken: newAccessToken,
      accessTokenExpiresAt: new Date(Date.now() + expiresIn * 1000),
      updatedAt: new Date(),
    })
    .where(eq(oauthTokens.userId, userId));

  return newAccessToken;
}

export class RepositoriesImpl implements Repositories {
  async getUserById(
    userId: string
  ): Promise<{ id: string; email: string; needsReconnect: boolean } | null> {
    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        needsReconnect: users.needsReconnect,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    return user || null;
  }

  async setUserNeedsReconnect(
    userId: string,
    needsReconnect: boolean
  ): Promise<void> {
    await db
      .update(users)
      .set({ needsReconnect, updatedAt: new Date() })
      .where(eq(users.id, userId));
  }

  async getUserConfig(
    userId: string
  ): Promise<{ selectedLanguages: string[] } | null> {
    const [config] = await db
      .select({ selectedLanguages: userConfigs.selectedLanguages })
      .from(userConfigs)
      .where(eq(userConfigs.userId, userId))
      .limit(1);

    return config || null;
  }

  async getCuratedRepos(): Promise<CuratedRepoConfig[]> {
    const repos = await db.select().from(curatedRepos);

    return repos.map((r) => ({
      owner: r.owner,
      name: r.name,
      languages: r.languages,
      labelMapping: r.labelMapping,
    }));
  }

  async getCustomRepos(userId: string): Promise<RepoIdentifier[]> {
    const repos = await db
      .select({ owner: customRepos.owner, name: customRepos.name })
      .from(customRepos)
      .where(eq(customRepos.userId, userId));

    return repos;
  }

  async getTrackedIssues(userId: string): Promise<TrackedIssueRecord[]> {
    const issues = await db
      .select()
      .from(trackedIssues)
      .where(eq(trackedIssues.userId, userId));

    return issues.map((i) => ({
      id: i.id,
      githubIssueId: i.githubIssueId,
      issueNumber: i.issueNumber,
      repoOwner: i.repoOwner,
      repoName: i.repoName,
      issueUrl: i.issueUrl,
      issueTitle: i.issueTitle,
      labels: i.labels,
      status: i.status as IssueStatus,
      sheetRowId: i.sheetRowId,
    }));
  }

  async upsertTrackedIssue(
    userId: string,
    issue: MatchedIssue,
    sheetRowId: string
  ): Promise<void> {
    await db
      .insert(trackedIssues)
      .values({
        userId,
        githubIssueId: issue.id,
        issueNumber: issue.number,
        repoOwner: issue.repo.owner,
        repoName: issue.repo.name,
        issueUrl: issue.url,
        issueTitle: issue.title,
        labels: issue.labels,
        status: determineIssueStatus(issue),
        issueOpenedAt: issue.createdAt,
        sheetRowId,
      })
      .onConflictDoUpdate({
        target: [trackedIssues.userId, trackedIssues.githubIssueId],
        set: {
          lastCheckedAt: new Date(),
        },
      });
  }

  async updateTrackedIssueStatus(
    userId: string,
    githubIssueId: number,
    status: IssueStatus
  ): Promise<void> {
    await db
      .update(trackedIssues)
      .set({ status, lastCheckedAt: new Date() })
      .where(
        and(
          eq(trackedIssues.userId, userId),
          eq(trackedIssues.githubIssueId, githubIssueId)
        )
      );
  }

  async createRun(userId: string, trigger: RunTrigger): Promise<string> {
    const [run] = await db
      .insert(runs)
      .values({
        userId,
        trigger,
        status: "pending",
      })
      .returning({ id: runs.id });

    return run.id;
  }

  async updateRunStatus(
    runId: string,
    status: "running" | "success" | "failed",
    counts?: { newIssuesCount?: number; staleIssuesCount?: number },
    error?: string
  ): Promise<void> {
    await db
      .update(runs)
      .set({
        status,
        newIssuesCount: counts?.newIssuesCount,
        staleIssuesCount: counts?.staleIssuesCount,
        error,
        finishedAt: status !== "running" ? new Date() : undefined,
      })
      .where(eq(runs.id, runId));
  }

  async hasActiveRun(userId: string): Promise<boolean> {
    const [activeRun] = await db
      .select({ id: runs.id })
      .from(runs)
      .where(
        and(
          eq(runs.userId, userId),
          or(eq(runs.status, "pending"), eq(runs.status, "running"))
        )
      )
      .limit(1);

    return !!activeRun;
  }

  async getSheetId(userId: string): Promise<string | null> {
    const [sheet] = await db
      .select({ spreadsheetId: sheets.spreadsheetId })
      .from(sheets)
      .where(eq(sheets.userId, userId))
      .limit(1);

    return sheet?.spreadsheetId || null;
  }

  async setSheetId(userId: string, spreadsheetId: string): Promise<void> {
    await db
      .insert(sheets)
      .values({ userId, spreadsheetId })
      .onConflictDoUpdate({
        target: sheets.userId,
        set: { spreadsheetId },
      });
  }

  async deleteSheetRecord(userId: string): Promise<void> {
    await db.delete(sheets).where(eq(sheets.userId, userId));
  }

  async getAccessToken(userId: string): Promise<string | null> {
    return refreshAccessToken(userId);
  }
}
