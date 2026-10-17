import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Agent worktrees are full repo copies; never collect their tests from this checkout.
    exclude: [...configDefaults.exclude, ".claude/worktrees/**"],
  },
});
