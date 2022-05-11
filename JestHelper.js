/* eslint-disable @typescript-eslint/no-var-requires */
const { JestHelper } = require('./lib/cjs/jest/JestHelper.js');
const path = require('path');
exports.JestHelper = JestHelper;
exports.jestHelper = new JestHelper(path.join(__dirname, 'tests'));
