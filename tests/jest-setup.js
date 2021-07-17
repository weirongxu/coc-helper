const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const pathLib = require('path');
const rimraf = require('rimraf');

process.on('uncaughtException', function (err) {
  const msg = 'Uncaught exception: ' + err.stack;
  // eslint-disable-next-line no-console
  console.error(msg);
});

function execCli(name, args, options) {
  const streams = spawn(name, args, { shell: true, ...options });

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

module.exports = async () => {
  const testsDir = __dirname;
  const cocDir = pathLib.join(testsDir, 'coc.nvim');

  // clone
  if (!fs.existsSync(cocDir)) {
    await execCli(
      'git',
      [
        'clone',
        '-b',
        'master',
        '--depth',
        '1',
        'https://github.com/neoclide/coc.nvim.git',
      ],
      {
        cwd: testsDir,
      },
    );
  }
  await execCli('yarn', ['install', '--frozen-lockfile'], {
    cwd: cocDir,
  });
  const libDir = pathLib.join(cocDir, 'lib');
  rimraf.sync(libDir);
  await execCli('yarn', ['run', 'tsc', '--skipLibCheck', '--noEmit', 'false'], {
    cwd: cocDir,
  });
  if (fs.existsSync(pathLib.join(libDir, 'src'))) {
    rimraf.sync(libDir + '.back');
    fs.renameSync(
      pathLib.join(cocDir, 'lib'),
      pathLib.join(cocDir, 'lib.back'),
    );
    fs.renameSync(
      pathLib.join(cocDir, 'lib.back/src'),
      pathLib.join(cocDir, 'lib'),
    );
  }

  process.env.NODE_ENV = 'test';
  process.env.COC_DATA_HOME = pathLib.join(testsDir, 'coc-data-home');
  process.env.COC_VIMCONFIG = testsDir;
  process.env.TMPDIR = os.tmpdir();
};
