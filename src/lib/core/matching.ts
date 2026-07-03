import type {
  CuratedRepoConfig,
  RepoIdentifier,
  RepoWithLabels,
  GitHubIssue,
} from "./types";

export const DEFAULT_LABEL_MAPPING = ["good first issue", "help wanted"];

export function resolveEffectiveRepoSet(
  selectedLanguages: string[],
  curatedRepos: CuratedRepoConfig[],
  customRepos: RepoIdentifier[]
): RepoWithLabels[] {
  const result: RepoWithLabels[] = [];
  const seenRepos = new Set<string>();

  const normalizedLanguages = new Set(
    selectedLanguages.map((l) => l.toLowerCase())
  );

  // Add curated repos that match user's language selection
  for (const curated of curatedRepos) {
    const repoKey = `${curated.owner}/${curated.name}`.toLowerCase();

    const hasMatchingLanguage = curated.languages.some((lang) =>
      normalizedLanguages.has(lang.toLowerCase())
    );

    if (hasMatchingLanguage) {
      result.push({
        owner: curated.owner,
        name: curated.name,
        labelMapping: curated.labelMapping,
      });
      seenRepos.add(repoKey);
    }
  }

  // Add custom repos (bypass language filter)
  for (const custom of customRepos) {
    const repoKey = `${custom.owner}/${custom.name}`.toLowerCase();

    if (seenRepos.has(repoKey)) {
      continue; // Already included via curated
    }

    // Check if there's a curated entry for this custom repo (use its labels)
    const curatedEntry = curatedRepos.find(
      (c) =>
        c.owner.toLowerCase() === custom.owner.toLowerCase() &&
        c.name.toLowerCase() === custom.name.toLowerCase()
    );

    result.push({
      owner: custom.owner,
      name: custom.name,
      labelMapping: curatedEntry?.labelMapping ?? DEFAULT_LABEL_MAPPING,
    });
    seenRepos.add(repoKey);
  }

  return result;
}

export function matchesLabelMapping(
  issue: GitHubIssue,
  labelMapping: string[]
): boolean {
  const normalizedMapping = new Set(labelMapping.map((l) => l.toLowerCase()));

  return issue.labels.some((label) =>
    normalizedMapping.has(label.toLowerCase())
  );
}

export function filterMatchingIssues(
  issues: GitHubIssue[],
  labelMapping: string[]
): GitHubIssue[] {
  return issues.filter(
    (issue) => issue.state === "open" && matchesLabelMapping(issue, labelMapping)
  );
}

export function determineIssueStatus(issue: GitHubIssue): "open" | "closed" | "assigned" {
  if (issue.state === "closed") {
    return "closed";
  }
  if (issue.assignee) {
    return "assigned";
  }
  return "open";
}
