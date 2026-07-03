import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { runPipeline } from "@/lib/core/pipeline";
import { buildPipelineDeps } from "@/lib/pipeline-factory";
import { parseRunOptions } from "@/lib/run-options";

export const maxDuration = 60;

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const bodyText = await request.text();
  let body: unknown = null;
  if (bodyText.trim()) {
    try {
      body = JSON.parse(bodyText);
    } catch {
      return NextResponse.json(
        { error: "Request body must be valid JSON." },
        { status: 400 }
      );
    }
  }

  const parsed = parseRunOptions(body);
  if (!parsed.ok) {
    return NextResponse.json(
      { error: parsed.error },
      { status: parsed.status }
    );
  }

  const result = await runPipeline(
    session.user.id,
    "manual",
    buildPipelineDeps(),
    parsed.options
  );
  const response = parsed.warnings.length
    ? { ...result, warnings: [...(result.warnings ?? []), ...parsed.warnings] }
    : result;

  if (!response.success) {
    return NextResponse.json(response, { status: 409 });
  }

  return NextResponse.json(response);
}
