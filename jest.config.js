module.exports = {
  globals: {
    __TEST__: true,
  },
  preset: 'ts-jest',
  testEnvironment: 'node',
  globalSetup: `${__dirname}/tests/jest-setup.js`,
  testPathIgnorePatterns: ['/node_modules/', '/tests'],
  modulePathIgnorePatterns: ['/tests'],
  moduleNameMapper: {
    '^coc\\.nvim(.*)': `${__dirname}/tests/coc.nvim/lib$1`,
  },
  verbose: true,
};
