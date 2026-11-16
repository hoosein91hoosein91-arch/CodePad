'use strict';
// Minimal, validated bridge between the app page and the desktop shell (context isolation stays on).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cpDesktop', {
  platform: 'desktop',
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
