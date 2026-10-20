import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "node_modules"] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    files: ["src/sim/**/*.ts"],
    rules: {
      "no-restricted-globals": [
        "error",
        "window",
        "document",
        "requestAnimationFrame",
        "performance",
        "localStorage",
      ],
      "no-restricted-properties": [
        "error",
        { object: "Math", property: "random", message: "Use Rng from src/sim/rng.ts" },
      ],
      "no-restricted-imports": ["error", { patterns: ["**/render/**", "**/input/**", "**/ui/**"] }],
    },
  },
);
