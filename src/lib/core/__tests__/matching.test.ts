import { describe, it, expect } from "vitest";
import {
  resolveEffectiveRepoSet,
  matchesLabelMapping,
  filterMatchingIssues,
  determineIssueStatus,
  DEFAULT_LABEL_MAPPING,
} from "../matching";
import type { CuratedRepoConfig, GitHubIssue } from "../types";

describe("resolveEffectiveRepoSet", () => {
  const curatedRepos: CuratedRepoConfig[] = [
    {
      owner: "facebook",
      name: "react",
      languages: ["javascript", "typescript"],
      labelMapping: ["good first issue"],
    },
    {
      owner: "rust-lang",
      name: "rust",
      languages: ["rust"],
      labelMapping: ["E-easy", "E-mentor"],
    },
    {
      owner: "python",
      name: "cpython",
      languages: ["python"],
      labelMapping: ["good first issue", "easy"],
    },
  ];

  it("returns curated repos matching user languages", () => {
    const result = resolveEffectiveRepoSet(
      ["javascript"],
      curatedRepos,
      []
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      owner: "facebook",
      name: "react",
      labelMapping: ["good first issue"],
    });
  });

  it("handles case-insensitive language matching", () => {
    const result = resolveEffectiveRepoSet(
      ["JAVASCRIPT", "TypeScript"],
      curatedRepos,
      []
    );

    expect(result).toHaveLength(1);
    expect(result[0].owner).toBe("facebook");
  });

  it("includes custom repos regardless of language", () => {
    const result = resolveEffectiveRepoSet(
      ["javascript"],
      curatedRepos,
      [{ owner: "some-org", name: "some-repo" }]
    );

    expect(result).toHaveLength(2);
    expect(result[1]).toEqual({
      owner: "some-org",
      name: "some-repo",
      labelMapping: DEFAULT_LABEL_MAPPING,
    });
  });

  it("uses curated label mapping for custom repo that exists in curated list", () => {
    const result = resolveEffectiveRepoSet(
      [], // No languages selected
      curatedRepos,
      [{ owner: "rust-lang", name: "rust" }]
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      owner: "rust-lang",
      name: "rust",
      labelMapping: ["E-easy", "E-mentor"],
    });
  });

  it("deduplicates repos that appear in both curated and custom", () => {
    const result = resolveEffectiveRepoSet(
      ["javascript"],
      curatedRepos,
      [{ owner: "facebook", name: "react" }]
    );

    expect(result).toHaveLength(1);
  });

  it("returns empty for no matching languages and no custom repos", () => {
    const result = resolveEffectiveRepoSet(["go"], curatedRepos, []);

    expect(result).toHaveLength(0);
  });
});

describe("matchesLabelMapping", () => {
  const createIssue = (labels: string[]): GitHubIssue => ({
    id: 1,
    number: 1,
    title: "Test",
    url: "https://github.com/test/test/issues/1",
    labels,
    createdAt: new Date(),
    state: "open",
    assignee: null,
  });

  it("matches exact label", () => {
    const issue = createIssue(["good first issue"]);
    expect(matchesLabelMapping(issue, ["good first issue"])).toBe(true);
  });

  it("matches case-insensitively", () => {
    const issue = createIssue(["Good First Issue"]);
    expect(matchesLabelMapping(issue, ["good first issue"])).toBe(true);
  });

  it("matches any label in mapping", () => {
    const issue = createIssue(["help wanted"]);
    expect(matchesLabelMapping(issue, ["good first issue", "help wanted"])).toBe(
      true
    );
  });

  it("returns false when no labels match", () => {
    const issue = createIssue(["bug", "priority"]);
    expect(matchesLabelMapping(issue, ["good first issue"])).toBe(false);
  });
});

describe("filterMatchingIssues", () => {
  const createIssue = (
    id: number,
    state: "open" | "closed",
    labels: string[]
  ): GitHubIssue => ({
    id,
    number: id,
    title: `Issue ${id}`,
    url: `https://github.com/test/test/issues/${id}`,
    labels,
    createdAt: new Date(),
    state,
    assignee: null,
  });

  it("filters to only open issues with matching labels", () => {
    const issues = [
      createIssue(1, "open", ["good first issue"]),
      createIssue(2, "closed", ["good first issue"]),
      createIssue(3, "open", ["bug"]),
      createIssue(4, "open", ["help wanted"]),
    ];

    const result = filterMatchingIssues(issues, ["good first issue", "help wanted"]);

    expect(result).toHaveLength(2);
    expect(result.map((i) => i.id)).toEqual([1, 4]);
  });
});

describe("determineIssueStatus", () => {
  const createIssue = (
    state: "open" | "closed",
    assignee: string | null
  ): GitHubIssue => ({
    id: 1,
    number: 1,
    title: "Test",
    url: "https://github.com/test/test/issues/1",
    labels: [],
    createdAt: new Date(),
    state,
    assignee,
  });

  it("returns closed for closed issues", () => {
    expect(determineIssueStatus(createIssue("closed", null))).toBe("closed");
  });

  it("returns assigned for open issues with assignee", () => {
    expect(determineIssueStatus(createIssue("open", "someone"))).toBe("assigned");
  });

  it("returns open for open issues without assignee", () => {
    expect(determineIssueStatus(createIssue("open", null))).toBe("open");
  });
});
