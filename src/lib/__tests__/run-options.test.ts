import { describe, expect, it } from "vitest";
import { parseRunOptions } from "../run-options";

describe("parseRunOptions", () => {
  it("returns defaults for an empty body", () => {
    const result = parseRunOptions(null);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.options).toEqual({});
    }
  });

  it("normalizes supported run parameters", () => {
    const result = parseRunOptions({
      languages: ["TypeScript", "invalid"],
      repos: ["vercel/next.js", "https://github.com/facebook/react"],
      maxIssues: 10,
      dryRun: true,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.options).toEqual({
        languages: ["typescript"],
        repos: [
          { owner: "vercel", name: "next.js" },
          { owner: "facebook", name: "react" },
        ],
        maxIssues: 10,
        dryRun: true,
      });
      expect(result.warnings).toEqual([
        "Ignored unsupported language: invalid",
      ]);
    }
  });

  it("rejects invalid repo values", () => {
    const result = parseRunOptions({ repos: ["not-a-repo"] });

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "Invalid repo value: not-a-repo. Use owner/name or a GitHub URL.",
    });
  });

  it("rejects maxIssues outside the supported range", () => {
    const result = parseRunOptions({ maxIssues: 0 });

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "maxIssues must be an integer between 1 and 100.",
    });
  });
});
