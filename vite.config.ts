import { configDefaults, defineConfig } from "vitest/config";
export default defineConfig({
  base: "./",
  // Agent worktrees live under .claude/worktrees; keep their copies out of this checkout's runs.
  test: { exclude: [...configDefaults.exclude, ".claude/**"] },
});
