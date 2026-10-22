// World archives are rooted at level.dat, never nested inside the live save.
const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { Worker } = require('node:worker_threads');
const { component, checked } = require('./world-backup-archive');

const LIMITS = Object.freeze({ entries: 100000, file: 256 * 1024 ** 2, total: 2 * 1024 ** 3, archive: 2 * 1024 ** 3, ratio: 2000 });

// Keep compression and inflation off the Electron main event loop. The maintenance
// lock stays in the parent until the worker has fully exited.
function archiveJob(operation, args, limits) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(require.resolve('./world-backup-worker'), {
      workerData: { operation, args, limits },
    });
    let response;
    let failure;
    worker.once('message', (message) => { response = message; });
    worker.once('error', (error) => { failure = error; });
    worker.once('exit', (code) => {
      if (failure) return reject(failure);
      if (code !== 0 || !response) return reject(new Error(`Backup worker exited before completing (code ${code}).`));
      if (response.error) return reject(Object.assign(new Error(response.error.message), { code: response.error.code }));
      resolve(response.result);
    });
  });
}

function createService({ instances = require('./instances'), limits = LIMITS } = {}) {
  const { safeJoin } = require('./store');
  const active = new Set();
  async function locations(id, world, make = false) {
    component(id);
    component(world);
    await instances.get(id);
    const dir = instances.dirOf(id);
    await checked(dir);
    const save = safeJoin(dir, 'saves', world);
    const folder = safeJoin(dir, 'pimpin-backups', world);
    await checked(save);
    await checked(folder, true);
    if (make) {
      await fs.mkdir(folder, { recursive: true });
      await checked(folder);
    }
    return { dir, save, folder };
  }

  async function stopped(id, task) {
    if (active.has(id)) throw new Error('A world backup operation is already in progress.');
    active.add(id);
    try {
      if (typeof instances.withStopped !== 'function') throw new Error('World backups require the instance maintenance guard.');
      return await instances.withStopped(id, task);
    } finally { active.delete(id); }
  }

  function archiveFile(folder, name) {
    component(name);
    if (!name.endsWith('.zip')) throw new Error('Unknown world backup.');
    return safeJoin(folder, name);
  }

  async function record(folder, name) {
    const stat = await checked(archiveFile(folder, name));
    if (!stat.isFile()) throw new Error('Unknown world backup.');
    return { name, size: stat.size, created: stat.mtimeMs, safety: name.startsWith('safety-') };
  }

  async function list(id, world) {
    const { folder } = await locations(id, world);
    let names;
    try { names = await fs.readdir(folder); } catch (err) {
      if (err.code === 'ENOENT') return [];
      throw err;
    }
    const records = [];
    for (const name of names) if (name.endsWith('.zip')) records.push(await record(folder, name));
    return records.sort((a, b) => b.created - a.created);
  }

  function snapshot(save, folder, safety = false) {
    return archiveJob('snapshot', [save, folder, safety], limits);
  }

  async function create(id, world) {
    return stopped(id, async () => {
      const { save, folder } = await locations(id, world, true);
      return snapshot(save, folder);
    });
  }

  async function restore(id, world, name) {
    return stopped(id, async () => {
      const { save, folder } = await locations(id, world, true);
      const file = archiveFile(folder, name);
      const stat = await checked(file);
      if (!stat.isFile() || stat.size > limits.archive) throw new Error('Invalid backup archive size.');
      const stage = await fs.mkdtemp(path.join(folder, '.restore-'));
      const recoveryPath = safeJoin(folder, `.previous-${randomUUID()}`);
      let moved = false;
      let safetyBackup;
      try {
        await archiveJob('stage', [file, stage], limits);
        safetyBackup = await snapshot(save, folder, true);
        await checked(save);
        await checked(folder);
        await fs.rename(save, recoveryPath);
        moved = true;
        try { await fs.rename(stage, save); } catch (err) {
          try {
            await fs.rename(recoveryPath, save);
            moved = false;
          } catch (rollback) {
            throw new Error(`Restore failed and rollback was blocked. Original save: ${recoveryPath}. Safety backup: ${safetyBackup.name}. ${rollback.message}`);
          }
          throw err;
        }
        // Keep the untouched original too: survives crashes and unexpected disk errors.
        return { safetyBackup, recoveryPath };
      } catch (err) {
        if (safetyBackup) err.message += ` Safety backup: ${safetyBackup.name}.${moved ? ` Original save retained at ${recoveryPath}.` : ''}`;
        throw err;
      } finally {
        await fs.rm(stage, { recursive: true, force: true }).catch(() => {});
      }
    });
  }

  async function deleteBackup(id, world, name) {
    return stopped(id, async () => {
      const { folder } = await locations(id, world);
      const file = archiveFile(folder, name);
      await record(folder, name);
      await fs.unlink(file);
      return list(id, world);
    });
  }

  // Destination must come from the main-process save dialog, never renderer IPC.
  // Exclusive copy deliberately refuses overwrite, links, and live instance paths.
  async function exportBackup(id, world, name, destination) {
    return stopped(id, async () => {
      const { dir, folder } = await locations(id, world);
      await record(folder, name);
      if (typeof destination !== 'string' || !path.isAbsolute(destination)) throw new Error('Choose an export destination.');
      const relative = path.relative(path.resolve(dir), path.resolve(destination));
      if (!relative || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))) {
        throw new Error('Export outside the instance folder.');
      }
      await checked(path.dirname(destination));
      await fs.copyFile(archiveFile(folder, name), destination, constants.COPYFILE_EXCL);
      return { exported: true };
    });
  }

  return { create, list, restore, deleteBackup, exportBackup };
}

let defaultService;
module.exports = { createService, LIMITS };
for (const method of ['create', 'list', 'restore', 'deleteBackup', 'exportBackup']) {
  module.exports[method] = (...args) => (defaultService ||= createService())[method](...args);
}
