'use strict';
// Minimal, validated bridge between the app page and the desktop shell (context isolation stays on).
const { contextBridge, ipcRenderer } = require('electron');

// Main-process errors come back as {__error} so the page sees a clean message.
const call = async (name, ...args) => {
  const result = await ipcRenderer.invoke(name, ...args);
  if (result && result.__error) throw new Error(result.__error);
  return result;
};

contextBridge.exposeInMainWorld('cpDesktop', {
  platform: 'desktop',
  os: process.platform,
  system: {
    info: () => call('sys:info'),
    location: () => call('sys:location'),
    apps: () => call('sys:apps'),
    openApp: (name) => call('sys:openapp', String(name)),
  },
  shell: {
    run: (command, options) => call('shell:run', String(command), options && { cwd: options.cwd, timeoutMs: options.timeoutMs }),
    kill: () => call('shell:kill'),
    external: (cwd) => call('shell:external', cwd),
  },
  python: {
    start: (options) => call('py:start', options),
    input: (options) => call('py:input', options),
    stop: () => call('py:stop'),
    status: () => call('py:status'),
    exec: (options) => call('py:exec', options),
    setPath: (path) => call('py:setpath', String(path || '')),
    onEvent: (callback) => {
      const handler = (_event, message) => callback(message);
      ipcRenderer.on('py:event', handler);
      return () => ipcRenderer.removeListener('py:event', handler);
    },
  },
  music: {
    info: () => ipcRenderer.invoke('music:info'),
    choose: () => ipcRenderer.invoke('music:choose'),
    list: () => ipcRenderer.invoke('music:list'),
  },
  maps: {
    list: () => ipcRenderer.invoke('map:list'),
    show: (id, rect) => ipcRenderer.invoke('map:show', id, rect),
    hide: () => ipcRenderer.invoke('map:hide'),
    reload: () => ipcRenderer.invoke('map:reload'),
    external: (id) => ipcRenderer.invoke('map:external', id),
    onStatus: (callback) => {
      const handler = (_event, status) => callback(status);
      ipcRenderer.on('map:status', handler);
      return () => ipcRenderer.removeListener('map:status', handler);
    },
  },
});
