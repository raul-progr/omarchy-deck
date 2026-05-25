const { exec } = require('child_process');

function execCommand(cmd, opts = {}) {
  return new Promise((resolve, reject) => {
    exec(cmd, { maxBuffer: 10 * 1024 * 1024, ...opts }, (err, stdout, stderr) => {
      if (err) {
        console.error('[shellService] Command failed:', cmd, err && err.message ? err.message : err);
        if (stderr) console.error('[shellService] stderr:', stderr.trim());
        return reject({ error: err, stdout: stdout || '', stderr: stderr || '' });
      }
      if (stdout) console.log('[shellService] stdout:', stdout.trim());
      return resolve({ stdout: stdout || '', stderr: stderr || '' });
    });
  });
}

module.exports = {
  execCommand,
};
