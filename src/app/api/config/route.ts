import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getConfig, setLanguages } from "@/lib/queries";
import { LANGUAGES } from "@/lib/constants";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const selectedLanguages = await getConfig(session.user.id);
  return NextResponse.json({ selectedLanguages });
}

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const languages = body?.languages;

  if (!Array.isArray(languages)) {
    return NextResponse.json(
      { error: "languages must be an array" },
      { status: 400 }
    );
  }

  const valid = languages.filter(
    (l): l is string =>
      typeof l === "string" && (LANGUAGES as readonly string[]).includes(l)
  );

  await setLanguages(session.user.id, valid);
  return NextResponse.json({ selectedLanguages: valid });
}
