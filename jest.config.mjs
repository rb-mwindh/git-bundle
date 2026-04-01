/** @type {import('jest').Config} */
export default {
  testEnvironment: 'node',
  testMatch: ["**/*.spec.ts", "**/*.test.ts"],

  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: 'tsconfig.spec.json',
      useESM: true,
    }],
  },

  moduleNameMapper: {
    "^(\\.{1,2}\.*)\\.js$": "$1",
  },

  extensionsToTreatAsEsm: ['.ts'],
}

