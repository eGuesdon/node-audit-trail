// eslint.config.cjs — Flat config pour ESLint v9+
const js = require("@eslint/js");
const tsParser = require("@typescript-eslint/parser");
const tsPlugin = require("@typescript-eslint/eslint-plugin");
const importPlugin = require("eslint-plugin-import");
const globals = require("globals");

module.exports = [
  // Ignore globaux
  { ignores: ["dist", "node_modules"] },

  { languageOptions: { globals: globals.node } },

  // Règles JS de base (ESLint)
  js.configs.recommended,

  // Bloc TypeScript
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: "module",
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      import: importPlugin,
    },
    // On part des règles recommandées TS, puis on ajoute les tiennes
    rules: {
      ...(tsPlugin.configs.recommended?.rules ?? {}),
      "@typescript-eslint/consistent-type-imports": "warn",
      "import/order": ["warn", { "newlines-between": "always" }],
    },
    settings: {
      "import/resolver": {
        typescript: {}, // support des imports TS
      },
    },
  },
  {
    files: ["**/*.test.ts", "**/*.spec.ts"],
    languageOptions: {
      globals: {
        ...globals.vitest,
        ...globals.node,
      },
    },
  },
];
