import "../load-env";
import { db } from "../index";
import { curatedRepos } from "../schema";

const DEFAULT_LABELS = ["good first issue", "help wanted"];

const CURATED_REPOS = [
  // JavaScript / TypeScript
  { owner: "facebook", name: "react", languages: ["javascript", "typescript"], labels: DEFAULT_LABELS },
  { owner: "vuejs", name: "vue", languages: ["javascript", "typescript"], labels: DEFAULT_LABELS },
  { owner: "sveltejs", name: "svelte", languages: ["javascript", "typescript"], labels: DEFAULT_LABELS },
  { owner: "vercel", name: "next.js", languages: ["javascript", "typescript"], labels: DEFAULT_LABELS },
  { owner: "expressjs", name: "express", languages: ["javascript"], labels: DEFAULT_LABELS },
  { owner: "nestjs", name: "nest", languages: ["typescript"], labels: DEFAULT_LABELS },
  { owner: "prisma", name: "prisma", languages: ["typescript"], labels: DEFAULT_LABELS },
  { owner: "trpc", name: "trpc", languages: ["typescript"], labels: DEFAULT_LABELS },
  { owner: "tanstack", name: "query", languages: ["typescript"], labels: DEFAULT_LABELS },
  { owner: "jestjs", name: "jest", languages: ["javascript", "typescript"], labels: DEFAULT_LABELS },

  // Python
  { owner: "python", name: "cpython", languages: ["python"], labels: ["good first issue", "easy"] },
  { owner: "django", name: "django", languages: ["python"], labels: ["easy pickings"] },
  { owner: "pallets", name: "flask", languages: ["python"], labels: DEFAULT_LABELS },
  { owner: "fastapi", name: "fastapi", languages: ["python"], labels: DEFAULT_LABELS },
  { owner: "pandas-dev", name: "pandas", languages: ["python"], labels: ["good first issue"] },
  { owner: "scikit-learn", name: "scikit-learn", languages: ["python"], labels: ["good first issue", "Easy"] },
  { owner: "pytorch", name: "pytorch", languages: ["python", "c++"], labels: ["good first issue"] },
  { owner: "huggingface", name: "transformers", languages: ["python"], labels: ["good first issue"] },

  // Rust
  { owner: "rust-lang", name: "rust", languages: ["rust"], labels: ["E-easy", "E-mentor"] },
  { owner: "rust-lang", name: "rustlings", languages: ["rust"], labels: DEFAULT_LABELS },
  { owner: "tokio-rs", name: "tokio", languages: ["rust"], labels: ["E-easy", "good first issue"] },
  { owner: "denoland", name: "deno", languages: ["rust", "typescript"], labels: DEFAULT_LABELS },
  { owner: "tauri-apps", name: "tauri", languages: ["rust", "typescript"], labels: DEFAULT_LABELS },

  // Go
  { owner: "golang", name: "go", languages: ["go"], labels: ["good first issue", "help wanted"] },
  { owner: "kubernetes", name: "kubernetes", languages: ["go"], labels: ["good first issue", "help wanted"] },
  { owner: "docker", name: "compose", languages: ["go"], labels: DEFAULT_LABELS },
  { owner: "gin-gonic", name: "gin", languages: ["go"], labels: DEFAULT_LABELS },
  { owner: "gohugoio", name: "hugo", languages: ["go"], labels: DEFAULT_LABELS },

  // Java / Kotlin
  { owner: "spring-projects", name: "spring-boot", languages: ["java"], labels: ["status: ideal-for-contribution"] },
  { owner: "apache", name: "kafka", languages: ["java"], labels: ["newbie"] },
  { owner: "elastic", name: "elasticsearch", languages: ["java"], labels: ["good first issue"] },
  { owner: "JetBrains", name: "kotlin", languages: ["kotlin"], labels: ["good first issue"] },

  // C / C++
  { owner: "godotengine", name: "godot", languages: ["c++"], labels: ["good first issue"] },
  { owner: "opencv", name: "opencv", languages: ["c++", "python"], labels: ["good first issue"] },
  { owner: "llvm", name: "llvm-project", languages: ["c++"], labels: ["good first issue"] },

  // Ruby
  { owner: "rails", name: "rails", languages: ["ruby"], labels: ["good first issue"] },
  { owner: "jekyll", name: "jekyll", languages: ["ruby"], labels: DEFAULT_LABELS },

  // PHP
  { owner: "laravel", name: "framework", languages: ["php"], labels: DEFAULT_LABELS },
  { owner: "symfony", name: "symfony", languages: ["php"], labels: ["good first issue"] },

  // Swift
  { owner: "apple", name: "swift", languages: ["swift"], labels: ["good first issue", "StarterBug"] },
  { owner: "vapor", name: "vapor", languages: ["swift"], labels: DEFAULT_LABELS },

  // Misc / DevOps
  { owner: "hashicorp", name: "terraform", languages: ["go"], labels: ["good first issue"] },
  { owner: "ansible", name: "ansible", languages: ["python"], labels: ["easyfix"] },
  { owner: "grafana", name: "grafana", languages: ["go", "typescript"], labels: ["good first issue"] },
  { owner: "prometheus", name: "prometheus", languages: ["go"], labels: DEFAULT_LABELS },
];

export async function seedCuratedRepos() {
  console.log("Seeding curated repos...");

  for (const repo of CURATED_REPOS) {
    await db
      .insert(curatedRepos)
      .values({
        owner: repo.owner,
        name: repo.name,
        languages: repo.languages,
        labelMapping: repo.labels,
      })
      .onConflictDoUpdate({
        target: [curatedRepos.owner, curatedRepos.name],
        set: {
          languages: repo.languages,
          labelMapping: repo.labels,
        },
      });
  }

  console.log(`Seeded ${CURATED_REPOS.length} curated repos.`);
}

if (require.main === module) {
  seedCuratedRepos()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Seed failed:", err);
      process.exit(1);
    });
}
