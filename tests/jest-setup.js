const fs = require('fs');
const { spawn } = require('child_process');
const pathLib = require('path');
const appRootPath = require('app-root-path');

const fsp = fs.promises;

process.on('uncaughtException', function (err) {
  let msg = 'Uncaught exception: ' + err.stack;
  console.error(msg);
});

function execCli(name, args, options) {
  const streams = spawn(name, args, options);

  let output = '';
  streams.stdout.on('data', (data) => {
    output += data.toString();
  });
  return new Promise((resolve, reject) => {
    streams.stdout.on('error', (error) => {
      reject(error);
    });
    streams.stdout.on('end', () => {
      resolve(output);
    });
  });
}

async function copySchema(cocDir, dataDir) {
  const schemaPath = pathLib.join(dataDir, 'schema.json');
  if (!fs.existsSync(schemaPath)) {
    await fsp.mkdir(dataDir, { recursive: true });

    await fsp.copyFile(pathLib.join(cocDir, 'data/schema.json'), schemaPath);
  }
}

module.exports = async () => {
  const testsDir = __dirname;
  const cocDir = pathLib.join(testsDir, 'coc.nvim');

  // clone
  if (!fs.existsSync(cocDir)) {
    await execCli(
      'git',
      ['clone', '--depth', '1', 'https://github.com/neoclide/coc.nvim.git'],
      {
        cwd: testsDir,
      },
    );
    await execCli('yarn', ['install'], {
      cwd: cocDir,
    });
  }

  await copySchema(
    cocDir,
    pathLib.join(appRootPath.path, 'node_modules/coc.nvim/data'),
  );

  process.env.NODE_ENV = 'test';
  process.env.COC_DATA_HOME = testsDir;
};