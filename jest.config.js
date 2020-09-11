module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  globalSetup: './tests/jest-setup.js',
  testPathIgnorePatterns: ['/node_modules/', '/tests'],
};
