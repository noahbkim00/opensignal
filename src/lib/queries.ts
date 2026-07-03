import { eq, and, desc } from "drizzle-orm";
import { db } from "./db";
import {
  users,
  userConfigs,
  customRepos,
  runs,
  sheets,
} from "./db/schema";

export async function getConfig(userId: string): Promise<string[]> {
  const [config] = await db
    .select({ selectedLanguages: userConfigs.selectedLanguages })
    .from(userConfigs)
    .where(eq(userConfigs.userId, userId))
    .limit(1);

  return config?.selectedLanguages ?? [];
}

export async function setLanguages(
  userId: string,
  languages: string[]
): Promise<void> {
  await db
    .insert(userConfigs)
    .values({ userId, selectedLanguages: languages })
    .onConflictDoUpdate({
      target: userConfigs.userId,
      set: { selectedLanguages: languages, updatedAt: new Date() },
    });
}

export async function listCustomRepos(userId: string) {
  return db
    .select({
      id: customRepos.id,
      owner: customRepos.owner,
      name: customRepos.name,
    })
    .from(customRepos)
    .where(eq(customRepos.userId, userId))
    .orderBy(customRepos.createdAt);
}

export async function addCustomRepo(
  userId: string,
  owner: string,
  name: string
): Promise<void> {
  await db
    .insert(customRepos)
    .values({ userId, owner, name })
    .onConflictDoNothing();
}

export async function removeCustomRepo(
  userId: string,
  repoId: string
): Promise<void> {
  await db
    .delete(customRepos)
    .where(and(eq(customRepos.id, repoId), eq(customRepos.userId, userId)));
}

export async function getLatestRun(userId: string) {
  const [run] = await db
    .select()
    .from(runs)
    .where(eq(runs.userId, userId))
    .orderBy(desc(runs.startedAt))
    .limit(1);

  return run ?? null;
}

export async function getSpreadsheetId(userId: string): Promise<string | null> {
  const [sheet] = await db
    .select({ spreadsheetId: sheets.spreadsheetId })
    .from(sheets)
    .where(eq(sheets.userId, userId))
    .limit(1);

  return sheet?.spreadsheetId ?? null;
}

export async function getUserFlags(userId: string) {
  const [user] = await db
    .select({ needsReconnect: users.needsReconnect, email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return user ?? null;
}

export async function listAllUserIds(): Promise<string[]> {
  const rows = await db.select({ id: users.id }).from(users);
  return rows.map((r) => r.id);
}
