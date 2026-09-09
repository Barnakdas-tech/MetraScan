import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "coverage/**", "src/generated/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
    },
    rules: { "@typescript-eslint/no-require-imports": "off", "@typescript-eslint/no-explicit-any": "off", "@typescript-eslint/no-unused-vars": "off", 
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "off",
      "no-console": "off",
    },
  },
  {
    files: ["src/test/**/*.ts"],
    rules: { "@typescript-eslint/no-require-imports": "off", "@typescript-eslint/no-explicit-any": "off", "@typescript-eslint/no-unused-vars": "off", 
      "no-console": "off",
    },
  }
);
