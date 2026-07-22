const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  selectFolder: () => ipcRenderer.invoke('dialog:select-folder'),
  openFolder: (folderPath) => ipcRenderer.invoke('shell:open-folder', folderPath),
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
  saveEmbeddedConfig: (config) => ipcRenderer.invoke('config:save-embedded', config),
  saveFile: (folderPath, fileName, arrayBuffer) => ipcRenderer.invoke('file:save', { folderPath, fileName, arrayBuffer }),
  startFileWrite: (roomId, teacherId, folderPath, fileName) => ipcRenderer.invoke('file:start-write', roomId, teacherId, folderPath, fileName),
  writeFileChunk: (roomId, teacherId, chunk) => ipcRenderer.invoke('file:write-chunk', roomId, teacherId, chunk),
  closeFileWrite: (roomId, teacherId, abort) => ipcRenderer.invoke('file:close-write', roomId, teacherId, abort)
});
