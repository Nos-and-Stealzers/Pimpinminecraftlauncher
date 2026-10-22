const { parentPort, workerData } = require('node:worker_threads');
const { createArchive } = require('./world-backup-archive');

(async () => {
  const archive = createArchive(workerData.limits);
  const { operation, args } = workerData;
  if (!['snapshot', 'stage'].includes(operation)) throw new Error('Unknown backup operation.');
  return archive[operation](...args);
})().then(
  (result) => parentPort.postMessage({ result }),
  (error) => parentPort.postMessage({ error: { message: error.message, code: error.code } }),
).finally(() => parentPort.close());
