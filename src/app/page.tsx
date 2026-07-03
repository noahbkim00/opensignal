import { redirect } from "next/navigation";
import { auth, signIn } from "@/lib/auth";
import { APP_NAME } from "@/lib/constants";

export default async function Home() {
  const session = await auth();
  if (session?.user?.id) {
    redirect("/dashboard");
  }

  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <div className="w-full max-w-md rounded-xl border border-black/10 dark:border-white/15 p-8 text-center">
        <h1 className="text-2xl font-semibold">{APP_NAME}</h1>
        <p className="mt-3 text-sm text-black/60 dark:text-white/60">
          Sign in with Google to configure your languages and repositories.
          Matching beginner-friendly issues are written to a Google Sheet in
          your own Drive.
        </p>

        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/dashboard" });
          }}
          className="mt-6"
        >
          <button
            type="submit"
            className="w-full rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/80 dark:bg-white dark:text-black dark:hover:bg-white/90"
          >
            Sign in with Google
          </button>
        </form>
      </div>
    </main>
  );
}
