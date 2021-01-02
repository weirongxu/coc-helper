module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  globalSetup: './tests/jest-setup.js',
  testPathIgnorePatterns: ['/node_modules/', '/tests'],
  modulePathIgnorePatterns: ['/tests'],
  moduleNameMapper: {
    '^coc\\.nvim$': __dirname + '/tests/coc.nvim/',
  },
  verbose: true,
};
