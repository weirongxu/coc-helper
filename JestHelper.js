const { JestHelper } = require('./lib/cjs/JestHelper.js');
exports.JestHelper = JestHelper;
exports.jestHelper = new JestHelper(path.join(__dirname, 'tests'));
