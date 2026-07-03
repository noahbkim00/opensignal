import { LANGUAGES } from "./constants";
import { parseRepoInput } from "./repo-utils";
import type { RunOptions } from "./core/pipeline";

type ParseRunOptionsResult =
  | { ok: true; options: RunOptions; warnings: string[] }
  | { ok: false; status: number; error: string };

const MAX_ISSUES_LIMIT = 100;

export function parseRunOptions(body: unknown): ParseRunOptionsResult {
  if (body === null || body === undefined) {
    return { ok: true, options: {}, warnings: [] };
  }

  if (typeof body !== "object" || Array.isArray(body)) {
    return {
      ok: false,
      status: 400,
      error: "Request body must be a JSON object.",
    };
  }

  const input = body as Record<string, unknown>;
  const options: RunOptions = {};
  const warnings: string[] = [];

  if ("languages" in input) {
    if (!Array.isArray(input.languages)) {
      return {
        ok: false,
        status: 400,
        error: "languages must be an array.",
      };
    }

    options.languages = [];
    for (const value of input.languages) {
      if (typeof value !== "string") {
        return {
          ok: false,
          status: 400,
          error: "languages must contain only strings.",
        };
      }

      const language = value.toLowerCase();
      if ((LANGUAGES as readonly string[]).includes(language)) {
        options.languages.push(language);
      } else {
        warnings.push(`Ignored unsupported language: ${value}`);
      }
    }
  }

  if ("repos" in input) {
    if (!Array.isArray(input.repos)) {
      return {
        ok: false,
        status: 400,
        error: "repos must be an array.",
      };
    }

    options.repos = [];
    for (const value of input.repos) {
      if (typeof value !== "string") {
        return {
          ok: false,
          status: 400,
          error: "repos must contain only strings.",
        };
      }

      const parsed = parseRepoInput(value);
      if (!parsed) {
        return {
          ok: false,
          status: 400,
          error: `Invalid repo value: ${value}. Use owner/name or a GitHub URL.`,
        };
      }
      options.repos.push(parsed);
    }
  }

  if ("maxIssues" in input) {
    if (
      typeof input.maxIssues !== "number" ||
      !Number.isInteger(input.maxIssues) ||
      input.maxIssues < 1 ||
      input.maxIssues > MAX_ISSUES_LIMIT
    ) {
      return {
        ok: false,
        status: 400,
        error: `maxIssues must be an integer between 1 and ${MAX_ISSUES_LIMIT}.`,
      };
    }
    options.maxIssues = input.maxIssues;
  }

  if ("dryRun" in input) {
    if (typeof input.dryRun !== "boolean") {
      return {
        ok: false,
        status: 400,
        error: "dryRun must be a boolean.",
      };
    }
    options.dryRun = input.dryRun;
  }

  return { ok: true, options, warnings };
}
