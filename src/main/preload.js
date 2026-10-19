// Bridges the sandboxed UI to the backend. Only the RPC call and a fixed set of
// event channels are exposed.
const { contextBridge, ipcRenderer } = require('electron');

const EVENTS = [
  'window:state',
  'game:state',
  'game:log',
  'game:progress',
  'task:progress',
  'server:state',
  'server:log',
  'server:progress',
  'instances:changed',
  'toast',
];

contextBridge.exposeInMainWorld('pimpin', {
  async call(channel, ...args) {
    const res = await ipcRenderer.invoke('rpc', channel, args);
    if (!res.ok) throw new Error(res.error);
    return res.data;
  },
  on(event, cb) {
    if (!EVENTS.includes(event)) throw new Error(`Unknown event ${event}`);
    const listener = (_e, payload) => cb(payload);
    ipcRenderer.on(event, listener);
    return () => ipcRenderer.removeListener(event, listener);
  },
});
