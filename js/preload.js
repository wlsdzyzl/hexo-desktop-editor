const { contextBridge, ipcRenderer } = require('electron');

const onChannels = new Set([
    'publish-log',
    'publish-done',
]);

const electronAPI = {
    isReady: true,
    getConfigPath: () => ipcRenderer.invoke('get-config-path'),
    readConfig: () => ipcRenderer.invoke('read-config'),
    saveConfig: config => ipcRenderer.invoke('save-config', config),
    getHexoRemote: () => ipcRenderer.invoke('get-hexo-remote'),
    getPostsDir: () => ipcRenderer.invoke('get-posts-dir'),
    listPosts: () => ipcRenderer.invoke('list-posts'),
    readPost: relativePath => ipcRenderer.invoke('read-post', relativePath),
    savePostFile: post => ipcRenderer.invoke('save-post-file', post),
    deletePostFile: relativePath => ipcRenderer.invoke('delete-post-file', relativePath),
    aiGenerate: prompt => ipcRenderer.invoke('ai-generate', prompt),
    readAboutFile: () => ipcRenderer.invoke('read-about-file'),
    saveAboutFile: doc => ipcRenderer.invoke('save-about-file', doc),
    getPhotosDir: () => ipcRenderer.invoke('get-photos-dir'),
    listPhotos: () => ipcRenderer.invoke('list-photos'),
    uploadPhotos: () => ipcRenderer.invoke('upload-photos'),
    renamePhotoFile: input => ipcRenderer.invoke('rename-photo-file', input),
    deletePhotoFile: relativePath => ipcRenderer.invoke('delete-photo-file', relativePath),
    navigate: page => ipcRenderer.send('navigate', page),
    openFolder: () => ipcRenderer.send('open-folder'),
    publishPost: () => ipcRenderer.send('publish-post'),
    openExternal: url => ipcRenderer.send('open-external', url),
    on: (channel, callback) => {
        if (!onChannels.has(channel)) {
            throw new Error(`Unsupported IPC on channel: ${channel}`);
        }
        const listener = (_event, data) => callback(data);
        ipcRenderer.on(channel, listener);
        return () => ipcRenderer.removeListener(channel, listener);
    },
};

if (process.contextIsolated) {
    contextBridge.exposeInMainWorld('electronAPI', electronAPI);
} else {
    window.electronAPI = electronAPI;
}
