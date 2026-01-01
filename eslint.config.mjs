import globals  from "globals";
import js        from "@eslint/js";
import tseslint  from "typescript-eslint";
import stylistic from '@stylistic/eslint-plugin';

/* ---------- shared snippets ------------------------------------------------ */

const jsFiles = ["**/*.{js,mjs,cjs}"];
const tsFilesServer = [ "src/server/**/*.ts" ];
const tsFilesClient = [ "client/**/*.ts" ];

const testFilesServer = [ "src/server/**/*.{test,spec}.ts" ];
const testFiles = [ ...testFilesServer ];

const tsFiles = [ ...tsFilesServer, ...tsFilesClient, ...testFiles ];

const noUnusedVars = [
  "warn",
  {
    varsIgnorePattern  : "^_",   // allow const _foo = …
    argsIgnorePattern  : "^_",   // allow function ( _evt )
    caughtErrors       : "none",
  },
];

const indent = [
  "warn",
  2,                             // 2 spaces
  { SwitchCase: 1 },             // indent switch cases
];

const semi = [
  "warn",
  "always",
];

/* ---------- config --------------------------------------------------------- */

/** @type {import("eslint").Linter.Config[]} */
export default [
  /* ignore stuff we never lint --------------------------------------------- */
  {
    ignores: ["node_modules/**"],
  },

  /*  JS files --------------------------------------------------------------- */
  {
    files: jsFiles,
    languageOptions: {
      ...js.configs.recommended.languageOptions,
      globals: globals.node,           // Node-built-ins in JS too
    },
    plugins: {
      '@stylistic': stylistic
    },
    rules: {
      ...js.configs.recommended.rules,
      '@stylistic/indent': indent, // stylistic indent
      "no-unused-vars": noUnusedVars,
      semi,
    },
  },


  // TS - parser + TS-specific rules
  // Note that we need to use different `tsconfig.json` files for server and client code

  {
    files: tsFilesServer,
    ignores: testFiles,
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: ["./src/server/tsconfig.json"],
        tsconfigRootDir: import.meta.dirname,
      },
      globals: globals.node,
    },
  },

  {
    files: tsFilesClient,
    ignores: testFiles,
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: ["./src/client/tsconfig.json"],
        tsconfigRootDir: import.meta.dirname,
      },
      globals: globals.node,
    },
  },

  /* --------- TS recommended presets ------------------------------------

     `tseslint.configs.recommendedTypeChecked` returns an array of config objects with no `files` matcher.
     We need to scope these objects to only tsFiles
  */
  ...tseslint.configs.recommendedTypeChecked.map((cfg) => ({
    ...cfg,
    files: tsFiles,
  })),

  // TS - custom rule overrides (step 3)
  {
    files: tsFiles,
    plugins: {
      '@stylistic': stylistic
    },
    rules: {
      // "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": noUnusedVars,
      "@typescript-eslint/no-explicit-any": "off",
      '@stylistic/indent': indent,
      semi,
    },
  },

  {
    files: testFilesServer,
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: ["./src/server/tsconfig.jest.json"],
        tsconfigRootDir: import.meta.dirname,
      },
      globals: globals.node,
    },
    rules: {
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/require-await": "off",
    }
  },


  /*  project-wide tweaks (optional) ---------------------------------------- */
  // put anything here that *really* must apply to every file, after presets
];