const { contextBridge, ipcRenderer } = require('electron');

const sendChannels = new Set([
    'navigate',
    'open-folder',
    'save-post',
    'publish-post',
    'open-settings',
    'open-external',
]);

const invokeChannels = new Set([
    'get-config-path',
    'read-config',
    'save-config',
    'get-posts-dir',
    'list-posts',
    'read-post',
    'save-post-file',
    'delete-post-file',
    'ai-generate',
    'read-about-file',
    'save-about-file',
    'get-photos-dir',
    'list-photos',
    'upload-photos',
    'rename-photo-file',
    'delete-photo-file',
]);

const onChannels = new Set([
    'publish-log',
    'publish-done',
]);

const electronAPI = {
    isReady: true,
    getConfigPath: () => ipcRenderer.invoke('get-config-path'),
    readConfig: () => ipcRenderer.invoke('read-config'),
    saveConfig: config => ipcRenderer.invoke('save-config', config),
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
    send: (channel, payload) => {
        if (sendChannels.has(channel)) {
            ipcRenderer.send(channel, payload);
        }
    },
    invoke: (channel, payload) => {
        if (!invokeChannels.has(channel)) {
            return Promise.reject(new Error(`Unsupported IPC channel: ${channel}`));
        }

        return ipcRenderer.invoke(channel, payload);
    },
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
