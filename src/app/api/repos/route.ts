import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  listCustomRepos,
  addCustomRepo,
  removeCustomRepo,
} from "@/lib/queries";
import { parseRepoInput } from "@/lib/repo-utils";
import { GitHubClientImpl } from "@/lib/adapters/github";
import { DEFAULT_LABEL_MAPPING, filterMatchingIssues } from "@/lib/core/matching";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const repos = await listCustomRepos(session.user.id);
  return NextResponse.json({ repos });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const input = body?.repo;

  if (typeof input !== "string" || !input.trim()) {
    return NextResponse.json(
      { error: "Provide a repo as owner/name or a GitHub URL" },
      { status: 400 }
    );
  }

  const parsed = parseRepoInput(input);
  if (!parsed) {
    return NextResponse.json(
      { error: "Could not parse repo. Use owner/name or a GitHub URL." },
      { status: 400 }
    );
  }

  const github = new GitHubClientImpl();

  const { exists, isPublic } = await github.validateRepoExists(
    parsed.owner,
    parsed.name
  );

  if (!exists) {
    return NextResponse.json(
      { error: `Repository ${parsed.owner}/${parsed.name} does not exist.` },
      { status: 404 }
    );
  }

  if (!isPublic) {
    return NextResponse.json(
      { error: `Repository ${parsed.owner}/${parsed.name} is not public.` },
      { status: 400 }
    );
  }

  // Warn (but still allow) if no matching beginner-friendly issues exist
  let warning: string | undefined;
  try {
    const issues = await github.fetchIssuesForRepo(
      parsed.owner,
      parsed.name,
      DEFAULT_LABEL_MAPPING
    );
    const matching = filterMatchingIssues(issues, DEFAULT_LABEL_MAPPING);
    if (matching.length === 0) {
      warning = `No open issues with '${DEFAULT_LABEL_MAPPING.join(
        "' or '"
      )}' labels found. Added anyway.`;
    }
  } catch {
    // Non-fatal: still allow the add
  }

  await addCustomRepo(session.user.id, parsed.owner, parsed.name);

  return NextResponse.json({
    repo: { owner: parsed.owner, name: parsed.name },
    warning,
  });
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Missing repo id" }, { status: 400 });
  }

  await removeCustomRepo(session.user.id, id);
  return NextResponse.json({ ok: true });
}
