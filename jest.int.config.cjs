/** @type {import( 'jest' ).Config} */
module.exports = {

  testEnvironment: 'node',
  clearMocks: true,

  preset: 'ts-jest',

  transform: {

    '^.+\\.ts$': [ 'ts-jest' , {

      tsconfig: '<rootDir>/src/server/tsconfig.jest.json',

    } ],

  },

  testMatch: [
    "**/*.int.test.ts",
  ],

  globalSetup: "<rootDir>/jest-global-setup-db-test.ts",
  globalTeardown: "<rootDir>/jest-global-teardown-db-test.ts",

  // Integration tests can be slower on cold Docker.
  testTimeout: 30_000,

};
