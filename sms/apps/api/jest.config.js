/**
 * Jest setup for the API workspace.
 *
 * Runner: ts-jest (rather than @swc/jest) — the codebase already compiles
 * with plain tsc, ts-jest reuses the same tsconfig semantics
 * (experimentalDecorators/emitDecoratorMetadata) with zero extra native
 * deps, and the suite is small enough that transpile speed is a non-issue.
 * Specs live next to sources as `*.spec.ts` and are excluded from the
 * production build via tsconfig.build.json's `**\/*spec.ts` exclude.
 */
/** @type {import("jest").Config} */
module.exports = {
  testEnvironment: "node",
  rootDir: "src",
  testMatch: ["**/*.spec.ts"],
  transform: {
    "^.+\\.ts$": ["ts-jest", { tsconfig: "<rootDir>/../tsconfig.json" }],
  },
  moduleFileExtensions: ["ts", "js", "json"],
  moduleNameMapper: {
    // Workspace package ships raw TS (`main: src/index.ts`); map it to the
    // source so ts-jest transforms it like any other file.
    "^@sms/shared-types$": "<rootDir>/../../../packages/shared-types/src/index.ts",
  },
  // Nest decorators emit Reflect.metadata calls at class-definition time,
  // so the polyfill must load before any service module is imported.
  setupFiles: ["reflect-metadata"],
  clearMocks: true,
};
