"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LANGUAGES, LANGUAGE_LABELS } from "@/lib/constants";

interface CustomRepo {
  id: string;
  owner: string;
  name: string;
}

interface LatestRun {
  status: string;
  trigger: string;
  startedAt: string;
  finishedAt: string | null;
  newIssuesCount: number | null;
  staleIssuesCount: number | null;
  error: string | null;
}

interface Props {
  initialLanguages: string[];
  initialRepos: CustomRepo[];
  sheetUrl: string | null;
  needsReconnect: boolean;
  latestRun: LatestRun | null;
}

export function DashboardClient({
  initialLanguages,
  initialRepos,
  sheetUrl,
  needsReconnect,
  latestRun,
}: Props) {
  const router = useRouter();
  const [languages, setLanguages] = useState<string[]>(initialLanguages);
  const [repos, setRepos] = useState<CustomRepo[]>(initialRepos);
  const [repoInput, setRepoInput] = useState("");
  const [message, setMessage] = useState<{
    type: "error" | "warning" | "success";
    text: string;
  } | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [savePending, startSave] = useTransition();

  async function toggleLanguage(lang: string) {
    const next = languages.includes(lang)
      ? languages.filter((l) => l !== lang)
      : [...languages, lang];
    setLanguages(next);

    startSave(async () => {
      await fetch("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ languages: next }),
      });
    });
  }

  async function addRepo(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (!repoInput.trim()) return;

    const res = await fetch("/api/repos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repo: repoInput }),
    });
    const data = await res.json();

    if (!res.ok) {
      setMessage({ type: "error", text: data.error ?? "Failed to add repo" });
      return;
    }

    setRepoInput("");
    if (data.warning) {
      setMessage({ type: "warning", text: data.warning });
    } else {
      setMessage({
        type: "success",
        text: `Added ${data.repo.owner}/${data.repo.name}`,
      });
    }

    const listRes = await fetch("/api/repos");
    const listData = await listRes.json();
    setRepos(listData.repos);
  }

  async function removeRepo(id: string) {
    await fetch(`/api/repos?id=${id}`, { method: "DELETE" });
    setRepos((prev) => prev.filter((r) => r.id !== id));
  }

  async function runNow() {
    setIsRunning(true);
    setMessage(null);
    try {
      const res = await fetch("/api/run", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: "error", text: data.error ?? "Run failed" });
      } else {
        setMessage({
          type: "success",
          text: `Run complete: ${data.newIssuesCount} new, ${data.staleIssuesCount} updated.`,
        });
        router.refresh();
      }
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      {needsReconnect && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
          <p className="font-medium">Google connection needs attention</p>
          <p className="mt-1 text-black/70 dark:text-white/70">
            Your Google authorization failed. Please sign out and sign back in
            to reconnect.
          </p>
        </div>
      )}

      {message && (
        <div
          className={`rounded-md border p-3 text-sm ${
            message.type === "error"
              ? "border-red-500/40 bg-red-500/10"
              : message.type === "warning"
                ? "border-amber-500/40 bg-amber-500/10"
                : "border-green-500/40 bg-green-500/10"
          }`}
        >
          {message.text}
        </div>
      )}

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-black/50 dark:text-white/50">
          Languages
          {savePending && (
            <span className="ml-2 font-normal normal-case text-black/40">
              saving…
            </span>
          )}
        </h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {LANGUAGES.map((lang) => {
            const active = languages.includes(lang);
            return (
              <button
                key={lang}
                onClick={() => toggleLanguage(lang)}
                className={`rounded-full border px-3 py-1 text-sm transition ${
                  active
                    ? "border-black bg-black text-white dark:border-white dark:bg-white dark:text-black"
                    : "border-black/20 hover:bg-black/5 dark:border-white/25 dark:hover:bg-white/10"
                }`}
              >
                {LANGUAGE_LABELS[lang] ?? lang}
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-black/50 dark:text-white/50">
          Custom Repositories
        </h2>
        <form onSubmit={addRepo} className="mt-3 flex gap-2">
          <input
            value={repoInput}
            onChange={(e) => setRepoInput(e.target.value)}
            placeholder="owner/name or GitHub URL"
            className="flex-1 rounded-md border border-black/20 px-3 py-2 text-sm dark:border-white/25 dark:bg-transparent"
          />
          <button
            type="submit"
            className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/80 dark:bg-white dark:text-black dark:hover:bg-white/90"
          >
            Add
          </button>
        </form>

        <ul className="mt-3 flex flex-col gap-2">
          {repos.length === 0 && (
            <li className="text-sm text-black/50 dark:text-white/50">
              No custom repositories yet.
            </li>
          )}
          {repos.map((repo) => (
            <li
              key={repo.id}
              className="flex items-center justify-between rounded-md border border-black/10 px-3 py-2 text-sm dark:border-white/15"
            >
              <span>
                {repo.owner}/{repo.name}
              </span>
              <button
                onClick={() => removeRepo(repo.id)}
                className="text-black/50 hover:text-red-600 dark:text-white/50"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-4 rounded-lg border border-black/10 p-4 dark:border-white/15">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">Your Sheet</h2>
            {sheetUrl ? (
              <a
                href={sheetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 underline dark:text-blue-400"
              >
                Open Google Sheet
              </a>
            ) : (
              <p className="text-sm text-black/50 dark:text-white/50">
                Created on your first run.
              </p>
            )}
          </div>
          <button
            onClick={runNow}
            disabled={isRunning}
            className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/80 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-white/90"
          >
            {isRunning ? "Running…" : "Run now"}
          </button>
        </div>

        <div className="border-t border-black/10 pt-3 text-sm dark:border-white/15">
          <h3 className="font-medium">Last run</h3>
          {latestRun ? (
            <div className="mt-1 text-black/70 dark:text-white/70">
              <p>
                {latestRun.status} ({latestRun.trigger}) —{" "}
                {new Date(latestRun.startedAt).toLocaleString()}
              </p>
              {latestRun.status === "success" && (
                <p>
                  {latestRun.newIssuesCount ?? 0} new,{" "}
                  {latestRun.staleIssuesCount ?? 0} updated
                </p>
              )}
              {latestRun.error && (
                <p className="text-red-600 dark:text-red-400">
                  {latestRun.error}
                </p>
              )}
            </div>
          ) : (
            <p className="mt-1 text-black/50 dark:text-white/50">
              No runs yet.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
