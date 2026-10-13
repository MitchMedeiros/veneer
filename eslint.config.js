import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["node_modules", "tools/samples", ".claude/types", ".claude-plugin/types"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    files: ["tools/**/*.mjs"],
    languageOptions: { globals: { URL: "readonly", console: "readonly", fetch: "readonly", process: "readonly" } },
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
);
