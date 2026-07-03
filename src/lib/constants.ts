export const APP_NAME = "OpenSignal";

export const LANGUAGES = [
  "javascript",
  "typescript",
  "python",
  "rust",
  "go",
  "java",
  "kotlin",
  "c++",
  "ruby",
  "php",
  "swift",
] as const;

export type Language = (typeof LANGUAGES)[number];

export const LANGUAGE_LABELS: Record<string, string> = {
  javascript: "JavaScript",
  typescript: "TypeScript",
  python: "Python",
  rust: "Rust",
  go: "Go",
  java: "Java",
  kotlin: "Kotlin",
  "c++": "C++",
  ruby: "Ruby",
  php: "PHP",
  swift: "Swift",
};
