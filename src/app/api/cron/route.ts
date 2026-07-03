import { NextResponse } from "next/server";
import { runPipeline } from "@/lib/core/pipeline";
import { buildPipelineDeps } from "@/lib/pipeline-factory";
import { GitHubClientImpl } from "@/lib/adapters/github";
import { listAllUserIds } from "@/lib/queries";

export const maxDuration = 300;

const CHUNK_SIZE = 5;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userIds = await listAllUserIds();

  // Single GitHub client shared across the batch so each repo's issues
  // are fetched once (ETag cache), satisfying R-RUN-8.
  const sharedGitHub = new GitHubClientImpl();
  const deps = buildPipelineDeps(sharedGitHub);

  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < userIds.length; i += CHUNK_SIZE) {
    const chunk = userIds.slice(i, i + CHUNK_SIZE);

    const results = await Promise.allSettled(
      chunk.map((userId) => runPipeline(userId, "cron", deps))
    );

    for (const result of results) {
      processed++;
      if (result.status === "fulfilled" && result.value.success) {
        succeeded++;
      } else {
        failed++;
      }
    }
  }

  return NextResponse.json({ processed, succeeded, failed });
}
