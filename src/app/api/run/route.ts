import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { runPipeline } from "@/lib/core/pipeline";
import { buildPipelineDeps } from "@/lib/pipeline-factory";

export const maxDuration = 60;

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runPipeline(
    session.user.id,
    "manual",
    buildPipelineDeps()
  );

  if (!result.success) {
    return NextResponse.json(result, { status: 409 });
  }

  return NextResponse.json(result);
}
