import { productionConfigProblems } from "@/lib/config";

/**
 * Runs once at server start. A misconfigured production deploy should die
 * loudly here rather than quietly mis-handle money later.
 */
export async function register() {
  const problems = productionConfigProblems();
  if (problems.length === 0) return;

  const lines = problems.map((p) => `  - ${p.key}: ${p.problem}`).join("\n");
  // eslint-disable-next-line no-console
  console.error(`\nRefusing to start: production configuration is incomplete.\n${lines}\n`);
  throw new Error(`Invalid production configuration (${problems.length} problem(s)). See log above.`);
}
