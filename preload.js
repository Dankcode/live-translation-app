const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // 在此处暴露主进程 API 给渲染进程
  send: (channel, data) => ipcRenderer.send(channel, data),
  on: (channel, callback) => ipcRenderer.on(channel, (event, ...args) => callback(...args)),
  invoke: (channel, data) => ipcRenderer.invoke(channel, data),
});
