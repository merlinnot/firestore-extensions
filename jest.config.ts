/* cspell:ignore lcov */
/* eslint-disable import/no-default-export */

import type { Config } from '@jest/types';

const configuration: Config.InitialOptions = {
  cacheDirectory: '<rootDir>/.cache/jest',
  coveragePathIgnorePatterns: ['/node_modules/', '/test/'],
  coverageProvider: 'v8',
  coverageReporters: ['lcov', 'text', 'text-summary'],
  coverageThreshold: {
    global: {
      branches: 75,
      functions: 75,
      lines: 75,
      statements: 75,
    },
  },
  forceExit: true,
  logHeapUsage: true,
  restoreMocks: true,
  roots: ['<rootDir>/__mocks__', '<rootDir>/src'],
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
  testEnvironment: 'node',
};

export default configuration;
