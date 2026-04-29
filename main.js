const { app, BrowserWindow, ipcMain, shell, dialog, Menu } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const isPackaged = app.isPackaged;
function getConfigPath() {
    if (isPackaged) return path.join(app.getPath('userData'), 'config.json');
    return path.join(__dirname, 'config.json');
}
const markdownExtensions = new Set(['.md', '.markdown', '.mdown', '.mkd']);
const imageExtensions = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.avif']);

function createWindow() {
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        icon: path.join(__dirname, 'icon.ico'),
        webPreferences: {
            preload: path.join(__dirname, 'js', 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
        },
    });

    win.loadFile('index.html');
}

function readConfigFile() {
    if (!fs.existsSync(getConfigPath())) {
        const defaults = { hexoPath: '', photoDir: '', aboutDir: '', gitRepo: '', sourceBrance: 'main', publicBrance: 'gh-pages', commitMessage: 'Update blog', deepseekAPIKey: '' };
        fs.writeFileSync(getConfigPath(), JSON.stringify(defaults, null, 2) + '\n', 'utf8');
        return defaults;
    }
    const raw = fs.readFileSync(getConfigPath(), 'utf8');
    return JSON.parse(raw || '{}');
}

function writeConfigFile(config) {
    fs.writeFileSync(getConfigPath(), `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

function getPostsDir(config = readConfigFile()) {
    if (!config.hexoPath) {
        return null;
    }

    const hexoPath = path.resolve(config.hexoPath);
    const candidates = [
        path.join(hexoPath, 'source', '_posts'),
        path.join(hexoPath, 'source', 'post'),
        path.join(hexoPath, 'source', 'posts'),
        path.join(hexoPath, '_posts'),
        path.join(hexoPath, 'post'),
        path.join(hexoPath, 'posts'),
    ];

    return candidates.find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) || candidates[0];
}

function getPhotosDir(config = readConfigFile()) {
    if (!config.hexoPath || !config.photoDir) {
        return null;
    }

    return path.join(path.resolve(config.hexoPath), 'source', config.photoDir);
}

function getAboutFilePath(config = readConfigFile()) {
    if (!config.hexoPath || !config.aboutDir) {
        return null;
    }

    return path.join(path.resolve(config.hexoPath), 'source', config.aboutDir, 'index.md');
}

function ensureInsideDir(targetPath, rootDir) {
    const root = path.resolve(rootDir);
    const target = path.resolve(targetPath);
    const relative = path.relative(root, target);

    if (relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error('非法文件路径');
    }

    return target;
}

function normalizePostFileName(fileName, fallbackExtension = '.md') {
    const rawName = String(fileName || '').trim();
    const baseName = rawName || `untitled-${Date.now()}`;
    const sanitized = baseName
        .replace(/[\\/:*?"<>|]/g, '-')
        .replace(/\s+/g, ' ')
        .trim();

    const extension = path.extname(sanitized);
    return extension ? sanitized : `${sanitized}${fallbackExtension}`;
}

function ensureTextFile(filePath, defaultContent = '') {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });

    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, defaultContent, 'utf8');
    }
}

function toPostMeta(filePath, postsDir) {
    const stat = fs.statSync(filePath);
    const fileName = path.basename(filePath);
    const extension = path.extname(fileName);

    return {
        id: path.relative(postsDir, filePath),
        title: path.basename(fileName, extension),
        fileName,
        relativePath: path.relative(postsDir, filePath),
        size: stat.size,
        mtimeMs: stat.mtimeMs,
    };
}

function listPostFiles() {
    const postsDir = getPostsDir();
    if (!postsDir) return { postsDir: '', posts: [] };

    if (!fs.existsSync(postsDir)) {
        return { postsDir, posts: [] };
    }

    const posts = fs.readdirSync(postsDir, { withFileTypes: true })
        .filter(entry => entry.isFile() && markdownExtensions.has(path.extname(entry.name).toLowerCase()))
        .map(entry => toPostMeta(path.join(postsDir, entry.name), postsDir))
        .sort((a, b) => b.mtimeMs - a.mtimeMs || a.fileName.localeCompare(b.fileName));

    return { postsDir, posts };
}

function readPostFile(relativePath) {
    const postsDir = getPostsDir();
    if (!postsDir) throw new Error('config.json 中缺少 hexoPath');
    const filePath = ensureInsideDir(path.join(postsDir, relativePath), postsDir);

    if (!fs.existsSync(filePath)) {
        throw new Error(`文章不存在：${relativePath}`);
    }

    return {
        ...toPostMeta(filePath, postsDir),
        filePath,
        content: fs.readFileSync(filePath, 'utf8'),
    };
}

function savePostFile(post) {
    const postsDir = getPostsDir();
    if (!postsDir) throw new Error('config.json 中缺少 hexoPath');
    fs.mkdirSync(postsDir, { recursive: true });

    const currentRelativePath = post.relativePath || '';
    const currentExtension = path.extname(currentRelativePath) || '.md';
    const fileName = normalizePostFileName(post.fileName || post.title, currentExtension);
    const nextPath = ensureInsideDir(path.join(postsDir, fileName), postsDir);
    const currentPath = currentRelativePath
        ? ensureInsideDir(path.join(postsDir, currentRelativePath), postsDir)
        : null;

    if (currentPath && currentPath !== nextPath && fs.existsSync(nextPath)) {
        throw new Error(`文件已存在：${fileName}`);
    }

    fs.writeFileSync(nextPath, post.content || '', 'utf8');

    if (currentPath && currentPath !== nextPath && fs.existsSync(currentPath)) {
        fs.unlinkSync(currentPath);
    }

    return readPostFile(path.relative(postsDir, nextPath));
}

function deletePostFile(relativePath) {
    const postsDir = getPostsDir();
    if (!postsDir) throw new Error('config.json 中缺少 hexoPath');
    const filePath = ensureInsideDir(path.join(postsDir, relativePath), postsDir);

    if (!markdownExtensions.has(path.extname(filePath).toLowerCase())) {
        throw new Error('只能删除 Markdown 文章文件');
    }

    if (!fs.existsSync(filePath)) {
        throw new Error(`文章不存在：${relativePath}`);
    }

    fs.unlinkSync(filePath);
    return { ok: true, relativePath };
}

function readAboutFile() {
    const filePath = getAboutFilePath();
    if (!filePath) return { content: '' };
    ensureTextFile(filePath, '---\ntitle: About\n---\n\n');
    const stat = fs.statSync(filePath);

    return {
        id: 'about',
        title: 'index',
        fileName: 'index.md',
        relativePath: path.relative(path.dirname(path.dirname(filePath)), filePath),
        filePath,
        size: stat.size,
        mtimeMs: stat.mtimeMs,
        content: fs.readFileSync(filePath, 'utf8'),
    };
}

function saveAboutFile(doc) {
    const filePath = getAboutFilePath();
    if (!filePath) throw new Error('config.json 中未配置 aboutDir');
    ensureTextFile(filePath, '---\ntitle: About\n---\n\n');
    fs.writeFileSync(filePath, doc.content || '', 'utf8');
    return readAboutFile();
}

function toPhotoMeta(filePath, photosDir) {
    const stat = fs.statSync(filePath);
    const relativePath = path.relative(photosDir, filePath);

    return {
        id: relativePath,
        fileName: path.basename(filePath),
        relativePath,
        url: pathToFileURL(filePath).href,
        size: stat.size,
        mtimeMs: stat.mtimeMs,
    };
}

function walkImageFiles(dir, photosDir, out = []) {
    if (!fs.existsSync(dir)) return out;

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            walkImageFiles(fullPath, photosDir, out);
        } else if (entry.isFile() && imageExtensions.has(path.extname(entry.name).toLowerCase())) {
            out.push(toPhotoMeta(fullPath, photosDir));
        }
    }

    return out;
}

function listPhotos() {
    const photosDir = getPhotosDir();
    if (!photosDir) return { photosDir: '', photos: [] };
    fs.mkdirSync(photosDir, { recursive: true });

    const photos = walkImageFiles(photosDir, photosDir)
        .sort((a, b) => b.mtimeMs - a.mtimeMs || a.fileName.localeCompare(b.fileName));

    return { photosDir, photos };
}

function getAvailableFilePath(targetPath) {
    if (!fs.existsSync(targetPath)) return targetPath;

    const dir = path.dirname(targetPath);
    const ext = path.extname(targetPath);
    const base = path.basename(targetPath, ext);

    for (let index = 1; index < 10000; index += 1) {
        const nextPath = path.join(dir, `${base}-${index}${ext}`);
        if (!fs.existsSync(nextPath)) return nextPath;
    }

    throw new Error('无法生成可用文件名');
}

function renamePhotoFile(input) {
    const photosDir = getPhotosDir();
    const currentPath = ensureInsideDir(path.join(photosDir, input.relativePath), photosDir);

    if (!fs.existsSync(currentPath)) {
        throw new Error(`图片不存在：${input.relativePath}`);
    }

    if (!imageExtensions.has(path.extname(currentPath).toLowerCase())) {
        throw new Error('只能重命名图片文件');
    }

    const nextFileName = normalizePostFileName(input.fileName, path.extname(currentPath) || '.jpg');
    const nextPath = ensureInsideDir(path.join(path.dirname(currentPath), nextFileName), photosDir);

    if (currentPath !== nextPath && fs.existsSync(nextPath)) {
        throw new Error(`文件已存在：${nextFileName}`);
    }

    if (currentPath !== nextPath) {
        fs.renameSync(currentPath, nextPath);
    }

    return {
        photo: toPhotoMeta(nextPath, photosDir),
        ...listPhotos(),
    };
}

function deletePhotoFile(relativePath) {
    const photosDir = getPhotosDir();
    const filePath = ensureInsideDir(path.join(photosDir, relativePath), photosDir);

    if (!imageExtensions.has(path.extname(filePath).toLowerCase())) {
        throw new Error('只能删除图片文件');
    }

    if (!fs.existsSync(filePath)) {
        throw new Error(`图片不存在：${relativePath}`);
    }

    fs.unlinkSync(filePath);
    return { ok: true, relativePath };
}

async function uploadPhotos(win) {
    const photosDir = getPhotosDir();
    fs.mkdirSync(photosDir, { recursive: true });

    const result = await dialog.showOpenDialog(win, {
        title: '选择要上传到 photos 的图片',
        properties: ['openFile', 'multiSelections'],
        filters: [
            { name: 'Images', extensions: Array.from(imageExtensions).map(ext => ext.slice(1)) },
        ],
    });

    if (result.canceled || !result.filePaths.length) {
        return { canceled: true, ...listPhotos() };
    }

    const uploaded = [];

    for (const sourcePath of result.filePaths) {
        const ext = path.extname(sourcePath).toLowerCase();
        if (!imageExtensions.has(ext)) continue;

        const fileName = path.basename(sourcePath).replace(/[\\/:*?"<>|]/g, '-');
        const targetPath = getAvailableFilePath(path.join(photosDir, fileName));
        fs.copyFileSync(sourcePath, targetPath);
        uploaded.push(toPhotoMeta(targetPath, photosDir));
    }

    return { canceled: false, uploaded, ...listPhotos() };
}

app.whenReady().then(() => {
    Menu.setApplicationMenu(null);

    ipcMain.handle('get-config-path', () => getConfigPath());
    ipcMain.handle('read-config', () => readConfigFile());
    ipcMain.handle('save-config', (_event, config) => {
        writeConfigFile(config);
        return { ok: true };
    });
    ipcMain.handle('get-posts-dir', () => getPostsDir());
    ipcMain.handle('list-posts', () => listPostFiles());
    ipcMain.handle('read-post', (_event, relativePath) => readPostFile(relativePath));
    ipcMain.handle('save-post-file', (_event, post) => savePostFile(post));
    ipcMain.handle('delete-post-file', (_event, relativePath) => deletePostFile(relativePath));
    ipcMain.handle('read-about-file', () => readAboutFile());
    ipcMain.handle('save-about-file', (_event, doc) => saveAboutFile(doc));
    ipcMain.handle('get-photos-dir', () => getPhotosDir() || '');
    ipcMain.handle('list-photos', () => listPhotos());
    ipcMain.handle('upload-photos', event => uploadPhotos(BrowserWindow.fromWebContents(event.sender)));
    ipcMain.handle('rename-photo-file', (_event, input) => renamePhotoFile(input));
    ipcMain.handle('delete-photo-file', (_event, relativePath) => deletePhotoFile(relativePath));

    ipcMain.handle('ai-generate', async (_event, prompt) => {
        try {
            const config = readConfigFile();
            const apiKey = config['deepseekAPIKey'];
            if (!apiKey) throw new Error('config.json 中缺少 deepseekAPIKey');

            const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model: 'deepseek-chat',
                    messages: [
                        { role: 'system', content: '你是一个中文写作助手。请根据用户的要求生成内容，直接返回正文，不要添加解释或前缀。' },
                        { role: 'user', content: prompt },
                    ],
                    max_tokens: 2048,
                    temperature: 0.7,
                }),
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`API 请求失败 (${response.status}): ${errText}`);
            }

            const data = await response.json();
            const text = data.choices?.[0]?.message?.content || '';
            if (!text) throw new Error('API 返回为空');

            return { success: true, text };
        } catch (err) {
            return { success: false, message: err.message || String(err) };
        }
    });

    ipcMain.on('navigate', (event, page) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (win) win.loadFile(page);
    });

    ipcMain.on('open-folder', () => {
        try {
            const config = readConfigFile();
            const folder = config.hexoPath || __dirname;
            shell.openPath(folder);
        } catch {
            shell.openPath(__dirname);
        }
    });

    ipcMain.on('open-external', (_event, url) => {
        shell.openExternal(url);
    });

    ipcMain.on('save-post', (_event, post) => savePostFile(post));

    function runCommand(command, args, cwd, log) {
        return new Promise((resolve, reject) => {
            const child = spawn(command, args, { cwd, env: { ...process.env }, shell: true });
            child.stdout.on('data', d => log(d.toString()));
            child.stderr.on('data', d => log(d.toString()));
            child.on('close', code => (code === 0 ? resolve() : reject(new Error(`${command} 退出码：${code}`))));
            child.on('error', err => reject(err));
        });
    }

    ipcMain.on('publish-post', async (event) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (!win) return;
        const log = (msg) => win.webContents.send('publish-log', msg);

        let config;
        try {
            config = readConfigFile();
        } catch (err) {
            log(`读取配置失败：${err.message}\n`);
            win.webContents.send('publish-done', { success: false, message: `读取配置失败：${err.message}` });
            return;
        }

        if (!config.hexoPath) {
            log('配置中缺少 hexoPath\n');
            win.webContents.send('publish-done', { success: false, message: '配置中缺少 hexoPath' });
            return;
        }

        const hexoDir = path.resolve(config.hexoPath);
        const publicDir = path.join(hexoDir, 'public');
        const commitMsg = config.commitMessage || `Update blog ${new Date().toISOString()}`;
        const sourceBranch = config.sourceBrance || 'main';
        const publicBranch = config.publicBrance || 'gh-pages';

        async function safe(label, fn) {
            try {
                log(`\n[${label}] 开始...\n`);
                await fn();
                log(`[${label}] 完成\n`);
            } catch (err) {
                log(`[${label}] 失败：${err.message}\n`);
                throw err;
            }
        }

        try {
            log('========== 发布开始 ==========\n');
            log(`Hexo 目录：${hexoDir}\n\n`);

            // 1. hexo generate
            await safe('hexo generate', () => runCommand('npx', ['--yes', 'hexo', 'generate'], hexoDir, log));

            // 2. push source repo
            if (fs.existsSync(path.join(hexoDir, '.git'))) {
                await safe('推送源码', async () => {
                    await runCommand('git', ['add', '-A'], hexoDir, log);
                    await runCommand('git', ['commit', '-m', commitMsg], hexoDir, log).catch(() => log('(无变更或提交跳过)\n'));
                    await runCommand('git', ['push', 'origin', sourceBranch], hexoDir, log);
                });
            } else {
                log('[推送源码] 跳过：hexo 目录不是 git 仓库\n');
            }

            // 3. push public/
            if (!fs.existsSync(publicDir) || !fs.statSync(publicDir).isDirectory()) {
                throw new Error(`public 目录不存在：${publicDir}`);
            }

            await safe('推送静态页面', async () => {
                const publicIsGit = fs.existsSync(path.join(publicDir, '.git'));
                if (publicIsGit) {
                    await runCommand('git', ['add', '-A'], publicDir, log);
                    await runCommand('git', ['commit', '-m', commitMsg], publicDir, log).catch(() => log('(无变更或提交跳过)\n'));
                    await runCommand('git', ['push', 'origin', publicBranch, '--force'], publicDir, log);
                } else if (config.gitRepo) {
                    await runCommand('git', ['init'], publicDir, log);
                    await runCommand('git', ['checkout', '-b', publicBranch], publicDir, log);
                    await runCommand('git', ['remote', 'add', 'origin', config.gitRepo], publicDir, log);
                    await runCommand('git', ['add', '-A'], publicDir, log);
                    await runCommand('git', ['commit', '-m', commitMsg], publicDir, log);
                    await runCommand('git', ['push', '-u', 'origin', publicBranch, '--force'], publicDir, log);
                } else {
                    throw new Error('public 目录不是 git 仓库，请在配置中填写 gitRepo');
                }
            });

            log('\n========== 发布成功 ==========\n');
            win.webContents.send('publish-done', { success: true, message: '发布成功' });
        } catch (err) {
            log(`\n========== 发布失败：${err.message} ==========\n`);
            win.webContents.send('publish-done', { success: false, message: `发布失败：${err.message}` });
        }
    });

    ipcMain.on('open-settings', () => {
        // Settings are handled inside the renderer modal.
    });

    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
