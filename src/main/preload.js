// Bridges the sandboxed UI to the backend. Only the RPC call and a fixed set of
// event channels are exposed.
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const EVENTS = [
  'window:state',
  'game:state',
  'game:log',
  'game:progress',
  'task:progress',
  'content:plan',
  'content:progress',
  'server:state',
  'server:log',
  'server:progress',
  'server:players',
  'instances:changed',
  'toast',
  'update:state',
  'notifications:changed',
  'remote:log', // Remote servers
  'remote:status',
];

contextBridge.exposeInMainWorld('pimpin', {
  async call(channel, ...args) {
    const res = await ipcRenderer.invoke('rpc', channel, args);
    if (!res.ok) throw new Error(res.error);
    return res.data;
  },
  /** Real path of a file dropped onto the window (for importing into folders). */
  pathForFile(file) {
    return webUtils.getPathForFile(file);
  },
  on(event, cb) {
    if (!EVENTS.includes(event)) throw new Error(`Unknown event ${event}`);
    const listener = (_e, payload) => cb(payload);
    ipcRenderer.on(event, listener);
    return () => ipcRenderer.removeListener(event, listener);
  },
});
