import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";
import {
  getConfig,
  listCustomRepos,
  getLatestRun,
  getSpreadsheetId,
  getUserFlags,
} from "@/lib/queries";
import { APP_NAME } from "@/lib/constants";
import { DashboardClient } from "./dashboard-client";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/");
  }

  const userId = session.user.id;

  const [selectedLanguages, customRepos, latestRun, spreadsheetId, flags] =
    await Promise.all([
      getConfig(userId),
      listCustomRepos(userId),
      getLatestRun(userId),
      getSpreadsheetId(userId),
      getUserFlags(userId),
    ]);

  const sheetUrl = spreadsheetId
    ? `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`
    : null;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-6">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{APP_NAME}</h1>
          <p className="text-sm text-black/60 dark:text-white/60">
            {flags?.email}
          </p>
        </div>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <button
            type="submit"
            className="rounded-md border border-black/15 px-3 py-1.5 text-sm hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
          >
            Sign out
          </button>
        </form>
      </header>

      <DashboardClient
        initialLanguages={selectedLanguages}
        initialRepos={customRepos}
        sheetUrl={sheetUrl}
        needsReconnect={flags?.needsReconnect ?? false}
        latestRun={
          latestRun
            ? {
                status: latestRun.status,
                trigger: latestRun.trigger,
                startedAt: latestRun.startedAt.toISOString(),
                finishedAt: latestRun.finishedAt?.toISOString() ?? null,
                newIssuesCount: latestRun.newIssuesCount,
                staleIssuesCount: latestRun.staleIssuesCount,
                error: latestRun.error,
              }
            : null
        }
      />
    </main>
  );
}
