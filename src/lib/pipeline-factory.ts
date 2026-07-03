import type { PipelineDeps } from "./core/pipeline";
import type { GitHubClient } from "./core/interfaces";
import { GitHubClientImpl } from "./adapters/github";
import { GoogleSheetProviderImpl } from "./adapters/sheets";
import { RepositoriesImpl } from "./adapters/repositories";

export function buildPipelineDeps(sharedGitHub?: GitHubClient): PipelineDeps {
  return {
    github: sharedGitHub ?? new GitHubClientImpl(),
    sheets: new GoogleSheetProviderImpl(),
    repos: new RepositoriesImpl(),
  };
}
