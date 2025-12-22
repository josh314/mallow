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

    '<rootDir>/src/**/*.test.ts',

  ],

  moduleNameMapper: {

    '^@schemas$': '<rootDir>/src/schemas/index.ts',
    '^@types$': '<rootDir>/src/types/index.ts',

  },

};
