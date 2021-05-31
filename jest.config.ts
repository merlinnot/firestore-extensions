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
      branches: 85,
      functions: 85,
      lines: 85,
      statements: 85,
    },
  },
  forceExit: true,
  globals: {
    'ts-jest': {
      diagnostics: false,
      isolatedModules: true,
      tsconfig: 'tsconfig.json',
    },
  },
  logHeapUsage: true,
  preset: 'ts-jest',
  restoreMocks: true,
  roots: ['<rootDir>/__mocks__', '<rootDir>/src'],
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
  testEnvironment: 'node',
  testRunner: 'jest-circus/runner',
};

export default configuration;
