export interface ParsedRepo {
  owner: string;
  name: string;
}

export function parseRepoInput(input: string): ParsedRepo | null {
  const trimmed = input.trim();

  // Try full GitHub URL
  const urlMatch = trimmed.match(
    /github\.com\/([^/\s]+)\/([^/\s#?]+)/i
  );
  if (urlMatch) {
    return {
      owner: urlMatch[1],
      name: urlMatch[2].replace(/\.git$/, ""),
    };
  }

  // Try owner/name
  const parts = trimmed.split("/");
  if (parts.length === 2 && parts[0] && parts[1]) {
    return {
      owner: parts[0],
      name: parts[1].replace(/\.git$/, ""),
    };
  }

  return null;
}
