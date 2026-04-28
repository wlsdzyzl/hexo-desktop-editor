(() => {
    const nodeRequire = typeof require !== 'undefined' ? require : null;
    const bridge = window.electronAPI || null;
    const ipc = bridge || safeRequire('electron')?.ipcRenderer || null;
    const fs = safeRequire('fs');
    const path = safeRequire('path');
    const configFilePath = getConfigFilePath();
    let configDisplayPath = configFilePath;

    let posts = [];
    let selectedId = null;
    let untitledCounter = 1;
    let mathTypesetTimer = null;
    let configData = {};
    let settingsReady = false;
    let postsDir = '';
    let photos = [];
    let photosDir = '';

    const elements = {};

    function init() {
        cacheElements();
        updateConfigBridgeStatus();
        initResizableLayout();
        bindEvents();
        initFeatureButtons();
        renderSidebarMessage('正在读取文章...');
        clearEditor('正在读取 Hexo 文章...');
        loadPostsFromDisk();
        watchMathJaxLoad();
    }

    function cacheElements() {
        elements.publishBtn = document.getElementById('publishBtn');
        elements.settingsBtn = document.getElementById('settingsBtn');
        elements.newBtn = document.getElementById('newBtn');
        elements.postList = document.getElementById('postList');
        elements.titleInput = document.getElementById('postTitleInput');
        elements.textarea = document.getElementById('markdownInput');
        elements.highlight = document.getElementById('markdownHighlight');
        elements.preview = document.getElementById('preview');
        elements.saveBtn = document.getElementById('saveBtn');
        elements.deleteBtn = document.getElementById('deleteBtn');
        elements.openFolderBtn = document.getElementById('openFolderBtn');
        elements.settingsOverlay = document.getElementById('settingsOverlay');
        elements.settingsCloseBtn = document.getElementById('settingsCloseBtn');
        elements.settingsCancelBtn = document.getElementById('settingsCancelBtn');
        elements.settingsSaveBtn = document.getElementById('settingsSaveBtn');
        elements.settingsForm = document.getElementById('settingsForm');
        elements.settingsStatus = document.getElementById('settingsStatus');
        elements.settingsPath = document.getElementById('settingsPath');
        elements.main = document.querySelector('.main');
        elements.sidebar = document.querySelector('.sidebar');
        elements.postPath = document.getElementById('postPath');
        elements.editorArea = document.querySelector('.editor-area');
        elements.editor = document.querySelector('.editor');
        elements.markdown = document.querySelector('.markdown');
        elements.mainResizer = document.getElementById('mainResizer');
        elements.editorResizer = document.getElementById('editorResizer');
        elements.photosBtn = document.getElementById('photosBtn');
        elements.photoOverlay = document.getElementById('photoOverlay');
        elements.photoUploadBtn = document.getElementById('photoUploadBtn');
        elements.photoRefreshBtn = document.getElementById('photoRefreshBtn');
        elements.photoPath = document.getElementById('photoPath');
        elements.photoStatus = document.getElementById('photoStatus');
        elements.photoGrid = document.getElementById('photoGrid');
        elements.aboutBtn = document.getElementById('aboutBtn');
        elements.aboutOverlay = document.getElementById('aboutOverlay');
        elements.aboutSaveBtn = document.getElementById('aboutSaveBtn');
        elements.aboutTextarea = document.getElementById('aboutTextarea');
        elements.aboutHighlight = document.getElementById('aboutHighlight');
        elements.aboutPreview = document.getElementById('aboutPreview');
        elements.aboutResizer = document.getElementById('aboutResizer');
        elements.aboutPath = document.getElementById('aboutPath');
        elements.publishOverlay = document.getElementById('publishOverlay');
        elements.publishCloseBtn = document.getElementById('publishCloseBtn');
        elements.publishLog = document.getElementById('publishLog');
        elements.publishStatus = document.getElementById('publishStatus');
        elements.authorLink = document.getElementById('authorLink');
    }

    function bindEvents() {
        elements.settingsBtn.addEventListener('click', openSettings);
        elements.newBtn.addEventListener('click', createNew);
        elements.saveBtn.addEventListener('click', saveCurrent);
        elements.deleteBtn.addEventListener('click', deleteCurrent);
        elements.openFolderBtn.addEventListener('click', openFolder);
        elements.settingsCloseBtn.addEventListener('click', closeSettings);
        elements.settingsCancelBtn.addEventListener('click', closeSettings);

        elements.settingsOverlay.addEventListener('click', event => {
            if (event.target === elements.settingsOverlay) closeSettings();
        });

        elements.settingsForm.addEventListener('submit', event => {
            event.preventDefault();
            saveSettings();
        });

        document.addEventListener('keydown', event => {
            if (event.key === 'Escape') {
                if (!elements.aboutOverlay.hidden) {
                    closeAbout();
                    return;
                }
                if (!elements.publishOverlay.hidden) {
                    closePublishOverlay();
                    return;
                }
                if (!elements.photoOverlay.hidden) {
                    closePhotos();
                    return;
                }
                if (!elements.settingsOverlay.hidden) {
                    closeSettings();
                }
            }

            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
                event.preventDefault();
                saveCurrent();
            }
        });

        elements.textarea.addEventListener('input', () => {
            const post = findPost(selectedId);
            if (!post) return;

            post.content = elements.textarea.value;
            post.dirty = true;
            updateEditorHighlight();
            updatePreview();
            renderSidebar();
        });

        elements.textarea.addEventListener('scroll', syncEditorHighlightScroll);

        elements.titleInput.addEventListener('input', () => {
            const post = findPost(selectedId);
            if (!post) return;

            post.title = elements.titleInput.value.trim() || 'untitled';
            post.dirty = true;
            renderSidebar();
        });

        elements.photosBtn.addEventListener('click', () => {
            closeAbout();
            closePublishOverlay();
            openPhotos();
        });
        elements.aboutBtn.addEventListener('click', () => {
            closePhotos();
            closePublishOverlay();
            openAbout();
        });
        elements.publishBtn.addEventListener('click', () => {
            closePhotos();
            closeAbout();
            publishCurrent();
        });

        elements.photoUploadBtn.addEventListener('click', uploadPhotos);
        elements.photoRefreshBtn.addEventListener('click', loadPhotos);

        elements.publishCloseBtn.addEventListener('click', closePublishOverlay);

        // 作者链接（所有页面）
        document.addEventListener('click', (event) => {
            const link = event.target.closest('.js-author-link');
            if (!link) return;
            event.preventDefault();
            const url = 'https://wlsdzyzl.github.io/';
            if (bridge && bridge.send) {
                bridge.send('open-external', url);
            } else if (ipc && ipc.send) {
                ipc.send('open-external', url);
            }
        });

        elements.aboutSaveBtn.addEventListener('click', saveAbout);

        elements.aboutTextarea.addEventListener('input', () => {
            updateAboutHighlight();
            updateAboutPreview();
        });

        elements.aboutTextarea.addEventListener('scroll', () => {
            elements.aboutHighlight.scrollTop = elements.aboutTextarea.scrollTop;
            elements.aboutHighlight.scrollLeft = elements.aboutTextarea.scrollLeft;
        });
    }

    function initResizableLayout() {
        restoreResizableLayout();

        bindColumnResizer({
            handle: elements.mainResizer,
            container: elements.main,
            leftPane: elements.sidebar,
            rightPane: elements.editorArea,
            variableTarget: elements.main,
            variableName: '--sidebar-width',
            storageKey: 'hexoDesktop.sidebarWidth',
            minLeft: 180,
            minRight: 520,
        });

        bindColumnResizer({
            handle: elements.editorResizer,
            container: elements.editor,
            leftPane: elements.markdown,
            rightPane: elements.preview,
            variableTarget: elements.editor,
            variableName: '--markdown-width',
            storageKey: 'hexoDesktop.markdownWidth',
            minLeft: 260,
            minRight: 280,
        });

        bindColumnResizer({
            handle: elements.aboutResizer,
            container: elements.aboutOverlay.querySelector('.about-editor'),
            leftPane: elements.aboutOverlay.querySelector('.about-markdown'),
            rightPane: elements.aboutPreview,
            variableTarget: elements.aboutOverlay.querySelector('.about-editor'),
            variableName: '--about-markdown-width',
            storageKey: 'hexoDesktop.aboutMarkdownWidth',
            minLeft: 260,
            minRight: 280,
        });

        window.addEventListener('resize', clampResizableLayout);
    }

    function restoreResizableLayout() {
        const sidebarWidth = readStoredNumber('hexoDesktop.sidebarWidth');
        const markdownWidth = readStoredNumber('hexoDesktop.markdownWidth');

        if (sidebarWidth) {
            elements.main.style.setProperty('--sidebar-width', `${sidebarWidth}px`);
        }

        if (markdownWidth) {
            elements.editor.style.setProperty('--markdown-width', `${markdownWidth}px`);
        }

        requestAnimationFrame(clampResizableLayout);
    }

    function bindColumnResizer(options) {
        const { handle, container, leftPane, rightPane, variableTarget, variableName, storageKey, minLeft, minRight } = options;

        if (!handle || !container || !leftPane || !rightPane || !variableTarget) return;

        handle.addEventListener('pointerdown', event => {
            event.preventDefault();

            const startX = event.clientX;
            const startLeftWidth = leftPane.getBoundingClientRect().width;
            const handleWidth = handle.getBoundingClientRect().width;
            const totalWidth = container.getBoundingClientRect().width - handleWidth;

            handle.classList.add('is-dragging');
            document.body.classList.add('is-resizing');
            handle.setPointerCapture?.(event.pointerId);

            function move(moveEvent) {
                const delta = moveEvent.clientX - startX;
                const nextWidth = clamp(startLeftWidth + delta, minLeft, Math.max(minLeft, totalWidth - minRight));

                variableTarget.style.setProperty(variableName, `${nextWidth}px`);
            }

            function end() {
                const finalWidth = leftPane.getBoundingClientRect().width;

                writeStoredNumber(storageKey, finalWidth);
                handle.classList.remove('is-dragging');
                document.body.classList.remove('is-resizing');
                window.removeEventListener('pointermove', move);
                window.removeEventListener('pointerup', end);
                window.removeEventListener('pointercancel', end);
            }

            window.addEventListener('pointermove', move);
            window.addEventListener('pointerup', end);
            window.addEventListener('pointercancel', end);
        });
    }

    function clampResizableLayout() {
        clampColumnWidth({
            handle: elements.mainResizer,
            container: elements.main,
            leftPane: elements.sidebar,
            variableTarget: elements.main,
            variableName: '--sidebar-width',
            storageKey: 'hexoDesktop.sidebarWidth',
            minLeft: 180,
            minRight: 520,
        });

        clampColumnWidth({
            handle: elements.editorResizer,
            container: elements.editor,
            leftPane: elements.markdown,
            variableTarget: elements.editor,
            variableName: '--markdown-width',
            storageKey: 'hexoDesktop.markdownWidth',
            minLeft: 260,
            minRight: 280,
        });
    }

    function clampColumnWidth(options) {
        const { handle, container, leftPane, variableTarget, variableName, storageKey, minLeft, minRight } = options;

        if (!handle || !container || !leftPane || !variableTarget) return;

        const handleWidth = handle.getBoundingClientRect().width;
        const totalWidth = container.getBoundingClientRect().width - handleWidth;
        const maxLeft = Math.max(minLeft, totalWidth - minRight);
        const nextWidth = clamp(leftPane.getBoundingClientRect().width, minLeft, maxLeft);

        variableTarget.style.setProperty(variableName, `${nextWidth}px`);
        writeStoredNumber(storageKey, nextWidth);
    }

    function clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    }

    function readStoredNumber(key) {
        try {
            const value = Number(window.localStorage.getItem(key));
            return Number.isFinite(value) && value > 0 ? value : null;
        } catch {
            return null;
        }
    }

    function writeStoredNumber(key, value) {
        try {
            window.localStorage.setItem(key, String(Math.round(value)));
        } catch {
            // Ignore storage failures; resizing still works for the current session.
        }
    }

    async function loadPostsFromDisk(options = {}) {
        const { keepSelection = false } = options;

        try {
            const currentSelection = keepSelection ? selectedId : null;
            const result = await listPosts();
            postsDir = result.postsDir || '';
            posts = result.posts.map(post => ({
                ...post,
                id: post.relativePath,
                content: null,
                dirty: false,
                isNew: false,
            }));

            if (!posts.length) {
                selectedId = null;
                renderSidebarMessage('没有找到 Markdown 文章');
                clearEditor(`文章目录为空：${postsDir || '未找到文章目录'}`);
                return;
            }

            const nextSelection = currentSelection && posts.some(post => post.id === currentSelection)
                ? currentSelection
                : posts[0].id;

            await selectPost(nextSelection);
        } catch (error) {
            selectedId = null;
            posts = [];
            renderSidebarMessage('读取文章失败');
            clearEditor(error.message || String(error));
            alert(`读取文章失败：${error.message || error}`);
        }
    }

    async function listPosts() {
        if (bridge && bridge.listPosts) {
            return bridge.listPosts();
        }

        if (ipc && ipc.invoke) {
            return ipc.invoke('list-posts');
        }

        throw new Error('当前窗口没有文章读写通道，请通过 npm start 启动 Electron 应用。');
    }

    async function readPost(relativePath) {
        if (bridge && bridge.readPost) {
            return bridge.readPost(relativePath);
        }

        if (ipc && ipc.invoke) {
            return ipc.invoke('read-post', relativePath);
        }

        throw new Error('当前窗口没有文章读取通道。');
    }

    async function savePostFile(post) {
        if (bridge && bridge.savePostFile) {
            return bridge.savePostFile(post);
        }

        if (ipc && ipc.invoke) {
            return ipc.invoke('save-post-file', post);
        }

        throw new Error('当前窗口没有文章保存通道。');
    }

    async function deletePostFile(relativePath) {
        if (bridge && bridge.deletePostFile) {
            return bridge.deletePostFile(relativePath);
        }

        if (ipc && ipc.invoke) {
            return ipc.invoke('delete-post-file', relativePath);
        }

        throw new Error('当前窗口没有文章删除通道。');
    }

    function findPost(id) {
        return posts.find(post => post.id === id);
    }

    function renderSidebar() {
        elements.postList.innerHTML = '';

        for (const post of posts) {
            const item = document.createElement('li');
            item.className = 'post-list__item';
            item.textContent = `${post.title}${post.dirty ? ' *' : ''}`;
            item.title = post.fileName || post.title;
            item.dataset.id = post.id;

            if (post.id === selectedId) {
                item.classList.add('active');
            }

            item.addEventListener('click', () => selectPost(post.id));
            elements.postList.appendChild(item);
        }
    }

    function renderSidebarMessage(message) {
        elements.postList.innerHTML = '';
        const item = document.createElement('li');
        item.className = 'post-list__item';
        item.textContent = message;
        elements.postList.appendChild(item);
    }

    async function selectPost(id) {
        const post = findPost(id);
        if (!post) return;

        selectedId = id;

        try {
            if (post.content === null && !post.isNew) {
                const diskPost = await readPost(post.relativePath);
                Object.assign(post, diskPost, {
                    id: diskPost.relativePath,
                    content: diskPost.content,
                    dirty: false,
                    isNew: false,
                });
                selectedId = post.id;
            }

            elements.titleInput.value = post.title;
            elements.textarea.value = post.content || '';
            elements.postPath.textContent = post.filePath || (post.isNew ? '新文章（尚未保存）' : '');
            updateEditorHighlight();
            updatePreview();
            renderSidebar();
        } catch (error) {
            alert(`读取文章失败：${error.message || error}`);
        }
    }

    function clearEditor(message = '') {
        elements.titleInput.value = '';
        elements.textarea.value = '';
        elements.postPath.textContent = '';
        elements.highlight.textContent = '';
        elements.preview.innerHTML = `<p>${escapeHtml(message || 'Markdown 预览')}</p>`;
        elements.saveBtn.disabled = true;
        elements.deleteBtn.disabled = true;
    }

    function enableEditor() {
        elements.saveBtn.disabled = false;
        elements.deleteBtn.disabled = false;
    }

    function createNew() {
        const title = `untitled-${untitledCounter++}`;
        const post = {
            id: `new-${Date.now()}`,
            title,
            fileName: `${title}.md`,
            relativePath: '',
            content: createDefaultPostContent(title),
            dirty: true,
            isNew: true,
        };

        posts.unshift(post);
        selectedId = post.id;
        elements.titleInput.value = post.title;
        elements.textarea.value = post.content;
        enableEditor();
        updateEditorHighlight();
        updatePreview();
        renderSidebar();
    }

    function createDefaultPostContent(title) {
        const now = new Date();
        const pad = value => String(value).padStart(2, '0');
        const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

        return `---\ntitle: ${title}\ndate: ${date}\n---\n\n`;
    }

    function sortPostsByModifiedTime() {
        posts.sort((a, b) => {
            const timeDiff = (b.mtimeMs || 0) - (a.mtimeMs || 0);
            return timeDiff || String(a.fileName || a.title).localeCompare(String(b.fileName || b.title));
        });
    }

    async function saveCurrent() {
        const post = findPost(selectedId);
        if (!post) return alert('没有选中文章');

        const previousText = elements.saveBtn.textContent;
        elements.saveBtn.disabled = true;
        elements.saveBtn.textContent = '保存中...';

        try {
            post.title = elements.titleInput.value.trim() || post.title || 'untitled';
            post.content = elements.textarea.value;

            const savedPost = await savePostFile({
                relativePath: post.relativePath,
                fileName: post.title,
                content: post.content,
            });

            Object.assign(post, savedPost, {
                id: savedPost.relativePath,
                content: post.content,
                dirty: false,
                isNew: false,
            });

            selectedId = post.id;
            elements.titleInput.value = post.title;
            elements.postPath.textContent = post.filePath || '';
            sortPostsByModifiedTime();
            renderSidebar();
        } catch (error) {
            alert(`保存文章失败：${error.message || error}`);
        } finally {
            elements.saveBtn.textContent = previousText;
            elements.saveBtn.disabled = false;
        }
    }

    async function deleteCurrent() {
        const post = findPost(selectedId);
        if (!post) return alert('没有选中文章');

        const index = posts.findIndex(item => item.id === post.id);
        const displayName = post.fileName || post.title;

        if (!post.isNew && !window.confirm(`确定删除「${displayName}」吗？此操作无法撤销。`)) {
            return;
        }

        const previousText = elements.deleteBtn.textContent;
        elements.deleteBtn.disabled = true;
        elements.deleteBtn.textContent = '删除中...';

        try {
            if (!post.isNew && post.relativePath) {
                await deletePostFile(post.relativePath);
            }

            posts.splice(index, 1);
            selectedId = null;

            if (!posts.length) {
                renderSidebarMessage('没有找到 Markdown 文章');
                clearEditor(`文章目录为空：${postsDir || '未找到文章目录'}`);
                return;
            }

            const nextPost = posts[Math.min(index, posts.length - 1)];
            await selectPost(nextPost.id);
        } catch (error) {
            alert(`删除文章失败：${error.message || error}`);
        } finally {
            elements.deleteBtn.textContent = previousText;
            elements.deleteBtn.disabled = !findPost(selectedId);
        }
    }

    function publishCurrent() {
        const post = findPost(selectedId);
        if (!post) return alert('没有选中文章');

        if (!post.isNew && post.dirty) {
            alert('请先保存当前文章再发布。');
            return;
        }

        openPublishOverlay();
        startPublish();
    }

    function openPublishOverlay() {
        elements.publishOverlay.hidden = false;
        setActivePage('publish');
        elements.publishLog.textContent = '';
        elements.publishStatus.textContent = '正在发布...';
        elements.publishStatus.className = 'publish-status';
        elements.publishCloseBtn.disabled = true;
    }

    function closePublishOverlay() {
        elements.publishOverlay.hidden = true;
        setActivePage(null);
    }

    function startPublish() {
        const log = elements.publishLog;

        function append(text) {
            log.textContent += text;
            log.scrollTop = log.scrollHeight;
        }

        // 监听日志
        let unsubLog = null;
        let unsubDone = null;

        if (bridge && bridge.on) {
            unsubLog = bridge.on('publish-log', (text) => {
                append(text);
            });
            unsubDone = bridge.on('publish-done', (result) => {
                if (unsubLog) unsubLog();
                if (unsubDone) unsubDone();
                elements.publishCloseBtn.disabled = false;
                if (result.success) {
                    elements.publishStatus.textContent = result.message;
                    elements.publishStatus.className = 'publish-status success';
                } else {
                    elements.publishStatus.textContent = result.message;
                    elements.publishStatus.className = 'publish-status error';
                }
            });
        }

        // 触发发布
        if (ipc && ipc.send) {
            ipc.send('publish-post');
        } else {
            append('当前窗口没有发布通道，请通过 npm start 启动应用。\n');
        }
    }

    async function openSettings() {
        elements.settingsOverlay.hidden = false;
        settingsReady = false;
        elements.settingsSaveBtn.disabled = true;
        elements.settingsStatus.className = 'settings-status';
        elements.settingsStatus.textContent = '正在读取配置...';
        elements.settingsForm.innerHTML = '';

        const bridgeText = bridge && bridge.isReady ? 'preload 已连接' : 'preload 未连接';
        elements.settingsPath.textContent = `配置文件：${await resolveConfigDisplayPath()}（${bridgeText}）`;

        try {
            configData = await readConfig();
            renderSettingsForm(configData);
            settingsReady = true;
            elements.settingsSaveBtn.disabled = false;
            elements.settingsStatus.textContent = '修改后点击保存。';
        } catch (error) {
            renderSettingsForm({});
            setSettingsStatus(`读取配置失败：${error.message || error}`, 'error');
        }
    }

    async function initFeatureButtons() {
        try {
            const config = await readConfig();
            if (config.photoDir) {
                elements.photosBtn.hidden = false;
                document.querySelectorAll('.js-feature-btn[data-action="photos"]').forEach(b => b.hidden = false);
            }
            if (config.aboutDir) {
                elements.aboutBtn.hidden = false;
                document.querySelectorAll('.js-feature-btn[data-action="about"]').forEach(b => b.hidden = false);
            }
        } catch {
            // 配置读取失败，保持按钮隐藏
        }
    }

    function updateConfigBridgeStatus() {
        if (!elements.settingsPath) return;
        elements.settingsPath.dataset.bridge = bridge && bridge.isReady ? 'ready' : 'missing';
    }

    function closeSettings() {
        elements.settingsOverlay.hidden = true;
    }

    function renderSettingsForm(config) {
        const keys = Object.keys(config);
        elements.settingsForm.innerHTML = '';

        if (!keys.length) {
            const empty = document.createElement('p');
            empty.className = 'settings-status';
            empty.textContent = '没有可编辑的配置项。';
            elements.settingsForm.appendChild(empty);
            return;
        }

        for (const key of keys) {
            const value = config[key];
            const row = document.createElement('div');
            row.className = 'settings-row';

            const label = document.createElement('label');
            label.textContent = key;
            label.htmlFor = `setting-${key}`;

            const input = createSettingInput(key, value);
            row.appendChild(label);
            row.appendChild(input);
            elements.settingsForm.appendChild(row);
        }
    }

    function createSettingInput(key, value) {
        const type = Array.isArray(value) ? 'array' : typeof value;
        const input = type === 'object' && value !== null
            ? document.createElement('textarea')
            : document.createElement('input');

        input.id = `setting-${key}`;
        input.className = 'settings-input';
        input.dataset.key = key;
        input.dataset.type = type;

        if (type === 'object' || type === 'array') {
            input.value = JSON.stringify(value, null, 2);
        } else if (type === 'boolean') {
            input.type = 'checkbox';
            input.checked = value;
        } else {
            input.type = 'text';
            input.value = value == null ? '' : String(value);
        }

        return input;
    }

    async function saveSettings() {
        if (!settingsReady) {
            setSettingsStatus('配置还没有成功读取，暂时不能保存。', 'error');
            return;
        }

        try {
            const nextConfig = collectSettingsFormValues();
            await writeConfig(nextConfig);
            configData = nextConfig;
            setSettingsStatus('配置已保存。', 'success');

            closeSettings();
            await initFeatureButtons();
            await loadPostsFromDisk();
        } catch (error) {
            setSettingsStatus(`保存配置失败：${error.message || error}`, 'error');
        }
    }

    function collectSettingsFormValues() {
        const nextConfig = { ...configData };
        const fields = elements.settingsForm.querySelectorAll('.settings-input');

        for (const field of fields) {
            const key = field.dataset.key;
            const type = field.dataset.type;
            nextConfig[key] = parseSettingValue(field, type);
        }

        return nextConfig;
    }

    function parseSettingValue(field, type) {
        if (type === 'boolean') return field.checked;
        if (type === 'number') {
            const value = Number(field.value);
            if (Number.isNaN(value)) {
                throw new Error(`${field.dataset.key} 必须是数字`);
            }
            return value;
        }
        if (type === 'object' || type === 'array') {
            return JSON.parse(field.value || (type === 'array' ? '[]' : '{}'));
        }
        if (type === 'undefined') return null;
        return field.value;
    }

    async function readConfig() {
        if (bridge && bridge.readConfig) {
            return bridge.readConfig();
        }

        if (ipc && ipc.invoke) {
            return ipc.invoke('read-config');
        }

        if (!fs || !configFilePath) {
            throw new Error('当前窗口没有配置读写通道，请用 npm start 启动应用。');
        }

        const raw = fs.readFileSync(configFilePath, 'utf8');
        return JSON.parse(raw || '{}');
    }

    async function writeConfig(config) {
        if (bridge && bridge.saveConfig) {
            await bridge.saveConfig(config);
            return;
        }

        if (ipc && ipc.invoke) {
            await ipc.invoke('save-config', config);
            return;
        }

        if (!fs || !configFilePath) {
            throw new Error('当前窗口没有配置读写通道，请用 npm start 启动应用。');
        }

        fs.writeFileSync(configFilePath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
    }

    function setSettingsStatus(message, type = '') {
        elements.settingsStatus.className = type ? `settings-status ${type}` : 'settings-status';
        elements.settingsStatus.textContent = message;
    }

    function openFolder() {
        if (ipc && ipc.send) {
            ipc.send('open-folder');
            return;
        }

        alert('open-folder (ipc not available)');
    }

    function updateEditorHighlight() {
        const text = elements.textarea.value || '';
        elements.highlight.innerHTML = highlightMarkdownSource(text);
        syncEditorHighlightScroll();
        enableEditor();
    }

    function syncEditorHighlightScroll() {
        elements.highlight.scrollTop = elements.textarea.scrollTop;
        elements.highlight.scrollLeft = elements.textarea.scrollLeft;
    }

    function highlightMarkdownSource(text) {
        const lines = text.replace(/\r\n?/g, '\n').split('\n');
        let inFence = false;

        const highlighted = lines.map(line => {
            const fence = line.match(/^\s*(```|~~~)/);

            if (fence) {
                inFence = !inFence;
                return `<span class="md-fence">${escapeHtml(line)}</span>`;
            }

            if (inFence) {
                return `<span class="md-code-line">${escapeHtml(line) || ' '}</span>`;
            }

            return highlightMarkdownLine(line);
        });

        return highlighted.join('\n') + '\n';
    }

    function highlightMarkdownLine(line) {
        const heading = line.match(/^(#{1,6})(\s+.*)$/);
        if (heading) {
            return `<span class="md-heading"><span class="md-heading-marker">${escapeHtml(heading[1])}</span>${highlightInlineMarkdown(heading[2])}</span>`;
        }

        const quote = line.match(/^(\s*>)(\s?.*)$/);
        if (quote) {
            return `<span class="md-quote"><span class="md-quote-marker">${escapeHtml(quote[1])}</span>${highlightInlineMarkdown(quote[2])}</span>`;
        }

        const list = line.match(/^(\s*(?:[-+*]|\d+\.))(\s+.*)$/);
        if (list) {
            return `<span class="md-list-marker">${escapeHtml(list[1])}</span>${highlightInlineMarkdown(list[2])}`;
        }

        return highlightInlineMarkdown(line);
    }

    function highlightInlineMarkdown(line) {
        let html = escapeHtml(line);

        html = html.replace(/(`+)(.+?)(\1)/g, '<span class="md-code">$1$2$3</span>');
        html = html.replace(/(\*\*|__)(.+?)\1/g, '<span class="md-bold">$1$2$1</span>');
        html = html.replace(/(\*|_)([^*_]+?)\1/g, '<span class="md-emphasis">$1$2$1</span>');
        html = html.replace(/(!?\[[^\]]+\]\([^)]+\))/g, '<span class="md-link">$1</span>');
        html = html.replace(/((?:\$\$?)[^$]+(?:\$\$?)|\\\([^)]+\\\)|\\\[[^\]]+\\\])/g, '<span class="md-code">$1</span>');

        return html || ' ';
    }

    function updatePreview() {
        const post = findPost(selectedId);
        const text = post ? post.content : elements.textarea.value;

        elements.preview.innerHTML = renderMarkdownPreview(text || '');
        queueMathTypeset();
    }

    function renderMarkdownPreview(text) {
        const lines = text.replace(/\r\n?/g, '\n').split('\n');
        const html = [];
        let paragraph = [];
        let listItems = [];
        let inCode = false;
        let codeLang = '';
        let codeLines = [];

        function flushParagraph() {
            if (!paragraph.length) return;
            html.push(`<p>${renderInline(paragraph.join('\n'))}</p>`);
            paragraph = [];
        }

        function flushList() {
            if (!listItems.length) return;
            html.push(`<ul>${listItems.map(item => `<li>${renderInline(item)}</li>`).join('')}</ul>`);
            listItems = [];
        }

        function flushCode() {
            const langClass = codeLang ? ` class="language-${escapeAttribute(codeLang)}"` : '';
            html.push(`<pre><code${langClass}>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
            codeLines = [];
            codeLang = '';
        }

        for (let index = 0; index < lines.length; index += 1) {
            const line = lines[index];
            const trimmed = line.trim();
            const fence = line.match(/^\s*(```|~~~)\s*([A-Za-z0-9_-]+)?\s*$/);

            if (fence) {
                if (inCode) {
                    inCode = false;
                    flushCode();
                } else {
                    flushParagraph();
                    flushList();
                    inCode = true;
                    codeLang = fence[2] || '';
                }
                continue;
            }

            if (inCode) {
                codeLines.push(line);
                continue;
            }

            if (trimmed.startsWith('$$') || trimmed.startsWith('\\[')) {
                flushParagraph();
                flushList();
                const block = collectDisplayMath(lines, index);
                html.push(renderDisplayMath(block.content));
                index = block.endIndex;
                continue;
            }

            if (!trimmed) {
                flushParagraph();
                flushList();
                continue;
            }

            const heading = line.match(/^(#{1,6})\s+(.+)$/);
            if (heading) {
                flushParagraph();
                flushList();
                const level = heading[1].length;
                html.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
                continue;
            }

            const quote = line.match(/^\s*>\s?(.*)$/);
            if (quote) {
                flushParagraph();
                flushList();
                html.push(`<blockquote>${renderInline(quote[1])}</blockquote>`);
                continue;
            }

            const unorderedList = line.match(/^\s*[-+*]\s+(.+)$/);
            if (unorderedList) {
                flushParagraph();
                listItems.push(unorderedList[1]);
                continue;
            }

            flushList();
            paragraph.push(line);
        }

        if (inCode) flushCode();
        flushParagraph();
        flushList();

        return html.join('\n') || '<p>Markdown 预览</p>';
    }

    function collectDisplayMath(lines, startIndex) {
        const firstLine = lines[startIndex];
        const trimmed = firstLine.trim();
        const isDollar = trimmed.startsWith('$$');
        const open = isDollar ? '$$' : '\\[';
        const close = isDollar ? '$$' : '\\]';
        const content = [];

        let current = firstLine.slice(firstLine.indexOf(open) + open.length);

        if (current.includes(close)) {
            content.push(current.slice(0, current.indexOf(close)));
            return { content: content.join('\n').trim(), endIndex: startIndex };
        }

        if (current.trim()) {
            content.push(current);
        }

        for (let index = startIndex + 1; index < lines.length; index += 1) {
            current = lines[index];

            if (current.includes(close)) {
                content.push(current.slice(0, current.indexOf(close)));
                return { content: content.join('\n').trim(), endIndex: index };
            }

            content.push(current);
        }

        return { content: content.join('\n').trim(), endIndex: lines.length - 1 };
    }

    function renderInline(text) {
        const math = [];
        const stashMath = latex => {
            const token = `@@MATH_${math.length}@@`;
            math.push(`<span class="math math-inline">\\(${escapeHtml(latex)}\\)</span>`);
            return token;
        };

        let source = text.replace(/\\\(([\s\S]+?)\\\)/g, (_match, latex) => stashMath(latex));
        source = source.replace(/(^|[^\\])\$([^\n$]+?)\$/g, (_match, prefix, latex) => `${prefix}${stashMath(latex)}`);

        let html = escapeHtml(source);
        html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
        html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');
        html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
        html = html.replace(/_([^_]+)_/g, '<em>$1</em>');
        html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2">');
        html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
        html = html.replace(/@@MATH_(\d+)@@/g, (_match, index) => math[Number(index)] || '');
        html = html.replace(/\n/g, '<br>');

        return html;
    }

    function renderDisplayMath(latex) {
        return `<div class="math math-display">\\[${escapeHtml(latex)}\\]</div>`;
    }

    function queueMathTypeset() {
        clearTimeout(mathTypesetTimer);
        mathTypesetTimer = setTimeout(typesetMath, 80);
    }

    function typesetMath() {
        if (window.MathJax && window.MathJax.typesetPromise) {
            document.documentElement.classList.remove('mathjax-unavailable');
            if (window.MathJax.typesetClear) {
                window.MathJax.typesetClear([elements.preview]);
            }
            window.MathJax.typesetPromise([elements.preview]).catch(error => {
                console.error('MathJax render failed:', error);
            });
            return;
        }

        document.documentElement.classList.add('mathjax-unavailable');
    }

    function watchMathJaxLoad() {
        const script = document.getElementById('MathJax-script');
        if (!script) return;

        script.addEventListener('load', queueMathTypeset);
        script.addEventListener('error', () => {
            document.documentElement.classList.add('mathjax-unavailable');
            console.warn('MathJax failed to load. LaTeX source will remain visible.');
        });
    }

    function escapeHtml(text) {
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function escapeAttribute(text) {
        return String(text).replace(/[^A-Za-z0-9_-]/g, '');
    }

    // ── Photo gallery ────────────────────────────────────────────────

    async function openPhotos() {
        elements.photoOverlay.hidden = false;
        setActivePage('photos');
        await loadPhotos();
    }

    function closePhotos() {
        elements.photoOverlay.hidden = true;
        setActivePage(null);
    }

    async function loadPhotos() {
        try {
            const result = await listPhotosFromDisk();
            photosDir = result.photosDir || '';
            photos = result.photos || [];
            elements.photoPath.textContent = photosDir || '未找到照片目录';
            renderPhotoGrid();
        } catch (error) {
            elements.photoStatus.textContent = `加载失败：${error.message || error}`;
        }
    }

    async function listPhotosFromDisk() {
        if (bridge && bridge.listPhotos) {
            return bridge.listPhotos();
        }
        if (ipc && ipc.invoke) {
            return ipc.invoke('list-photos');
        }
        throw new Error('当前窗口没有照片读取通道，请通过 npm start 启动应用。');
    }

    function renderPhotoGrid() {
        elements.photoGrid.innerHTML = '';

        if (!photos.length) {
            elements.photoGrid.innerHTML = '<div class="photo-empty">暂无照片</div>';
            elements.photoStatus.textContent = '';
            return;
        }

        elements.photoStatus.textContent = `共 ${photos.length} 张图片`;

        for (const photo of photos) {
            const card = document.createElement('div');
            card.className = 'photo-card';

            const img = document.createElement('img');
            img.src = photo.url;
            img.alt = photo.fileName;

            const footer = document.createElement('div');
            footer.className = 'photo-card-footer';
            footer.style.cssText = 'display:flex;align-items:center;gap:6px;padding:6px 8px;background:#fff;border-top:1px solid #edf0f3;';

            // 文件名（可点击重命名）
            const name = document.createElement('span');
            name.className = 'photo-name';
            name.textContent = photo.fileName;
            name.title = '点击重命名';
            name.style.cssText = 'flex:1;min-width:0;overflow:hidden;font-size:12px;color:#2563eb;text-overflow:ellipsis;white-space:nowrap;cursor:pointer;';
            name.onclick = function () {
                startInlineRename(footer, photo);
            };

            // 删除按钮
            const deleteBtn = document.createElement('span');
            deleteBtn.className = 'photo-delete-btn';
            deleteBtn.textContent = '❌';
            deleteBtn.title = '删除';
            deleteBtn.style.cssText = 'flex-shrink:0;font-size:14px;cursor:pointer;opacity:0.6;';
            deleteBtn.onmouseenter = function () { deleteBtn.style.opacity = '1'; };
            deleteBtn.onmouseleave = function () { deleteBtn.style.opacity = '0.6'; };
            deleteBtn.onclick = function (event) {
                event.stopPropagation();
                deletePhoto(photo.relativePath, photo.fileName);
            };

            footer.appendChild(name);
            footer.appendChild(deleteBtn);
            card.appendChild(img);
            card.appendChild(footer);
            elements.photoGrid.appendChild(card);
        }
    }

    // ── 内联重命名 ────────────────────────────────────────────────

    function startInlineRename(footer, photo) {
        // 防止重复进入编辑状态
        if (footer.querySelector('.photo-rename-input')) return;

        const dotIndex = photo.fileName.lastIndexOf('.');
        const ext = dotIndex > 0 ? photo.fileName.slice(dotIndex) : '';
        const baseName = dotIndex > 0 ? photo.fileName.slice(0, dotIndex) : photo.fileName;

        // 清空 footer
        footer.innerHTML = '';

        // 输入框
        const input = document.createElement('input');
        input.className = 'photo-rename-input';
        input.value = baseName;
        input.style.cssText = 'flex:1;min-width:0;padding:2px 6px;font-size:12px;border:1px solid #4c8dff;border-radius:3px;outline:none;';
        input.select();

        // 保存按钮
        const saveBtn = document.createElement('button');
        saveBtn.textContent = '保存';
        saveBtn.style.cssText = 'flex-shrink:0;padding:2px 8px;font-size:12px;color:#fff;cursor:pointer;background:#2563eb;border:none;border-radius:3px;';
        saveBtn.onclick = async function () {
            const newBase = input.value.trim();
            if (!newBase || newBase === baseName) {
                // 没改，直接恢复
                await loadPhotos();
                return;
            }
            const newFileName = newBase + ext;
            await doRenamePhoto(photo.relativePath, newFileName);
        };

        // 取消按钮
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = '取消';
        cancelBtn.style.cssText = 'flex-shrink:0;padding:2px 8px;font-size:12px;color:#374151;cursor:pointer;background:#f3f4f6;border:1px solid #d1d5db;border-radius:3px;';
        cancelBtn.onclick = function () { loadPhotos(); };

        // 回车保存
        input.addEventListener('keydown', function (event) {
            if (event.key === 'Enter') saveBtn.click();
            if (event.key === 'Escape') cancelBtn.click();
        });

        footer.appendChild(input);
        footer.appendChild(saveBtn);
        footer.appendChild(cancelBtn);
    }

    async function doRenamePhoto(relativePath, newFileName) {
        try {
            if (bridge && bridge.renamePhotoFile) {
                await bridge.renamePhotoFile({ relativePath, fileName: newFileName });
            } else if (ipc && ipc.invoke) {
                await ipc.invoke('rename-photo-file', { relativePath, fileName: newFileName });
            } else {
                throw new Error('当前窗口没有重命名通道。');
            }
            await loadPhotos();
            elements.photoStatus.textContent = `已重命名为 ${newFileName}`;
        } catch (error) {
            alert(`重命名失败：${error.message || error}`);
            await loadPhotos();
        }
    }

    async function uploadPhotos() {
        const previousText = elements.photoUploadBtn.textContent;
        elements.photoUploadBtn.disabled = true;
        elements.photoUploadBtn.textContent = '正在上传...';

        try {
            let result;
            if (bridge && bridge.uploadPhotos) {
                result = await bridge.uploadPhotos();
            } else if (ipc && ipc.invoke) {
                result = await ipc.invoke('upload-photos');
            } else {
                throw new Error('当前窗口没有上传通道。');
            }

            if (result.canceled) {
                elements.photoStatus.textContent = '已取消上传。';
                return;
            }

            photosDir = result.photosDir || photosDir;
            photos = result.photos || [];
            renderPhotoGrid();

            if (result.uploaded && result.uploaded.length) {
                elements.photoStatus.textContent = `成功上传 ${result.uploaded.length} 张图片。`;
            }
        } catch (error) {
            elements.photoStatus.textContent = `上传失败：${error.message || error}`;
        } finally {
            elements.photoUploadBtn.textContent = previousText;
            elements.photoUploadBtn.disabled = false;
        }
    }

    async function deletePhoto(relativePath, fileName) {
        if (!window.confirm(`确定删除「${fileName}」吗？此操作无法撤销。`)) return;

        try {
            if (bridge && bridge.deletePhotoFile) {
                await bridge.deletePhotoFile(relativePath);
            } else if (ipc && ipc.invoke) {
                await ipc.invoke('delete-photo-file', relativePath);
            } else {
                throw new Error('当前窗口没有删除通道。');
            }

            await loadPhotos();
            elements.photoStatus.textContent = `已删除 ${fileName}`;
        } catch (error) {
            alert(`删除失败：${error.message || error}`);
        }
    }

    // ── 关于页面 ──────────────────────────────────────────────────

    async function openAbout() {
        elements.aboutOverlay.hidden = false;
        setActivePage('about');
        await loadAboutFromDisk();
    }

    function closeAbout() {
        elements.aboutOverlay.hidden = true;
        setActivePage(null);
    }

    function setActivePage(page) {
        [elements.photosBtn, elements.aboutBtn, elements.publishBtn].forEach(b => {
            b.classList.remove('toolbar-btn--active');
        });
        if (page === 'photos') {
            elements.photosBtn.classList.add('toolbar-btn--active');
        } else if (page === 'about') {
            elements.aboutBtn.classList.add('toolbar-btn--active');
        } else if (page === 'publish') {
            elements.publishBtn.classList.add('toolbar-btn--active');
        }
    }

    async function loadAboutFromDisk() {
        try {
            let aboutDoc;
            if (bridge && bridge.readAboutFile) {
                aboutDoc = await bridge.readAboutFile();
            } else if (ipc && ipc.invoke) {
                aboutDoc = await ipc.invoke('read-about-file');
            } else {
                throw new Error('当前窗口没有关于页面读取通道。');
            }

            elements.aboutTextarea.value = aboutDoc.content || '';
            updateAboutHighlight();
            updateAboutPreview();
            elements.aboutPath.textContent = aboutDoc.filePath || '';
        } catch (error) {
            alert(`读取关于页面失败：${error.message || error}`);
        }
    }

    async function saveAbout() {
        if (!elements.aboutTextarea.value) {
            alert('关于页面内容为空');
            return;
        }

        const previousText = elements.aboutSaveBtn.textContent;
        elements.aboutSaveBtn.disabled = true;
        elements.aboutSaveBtn.textContent = '保存中...';

        try {
            if (bridge && bridge.saveAboutFile) {
                await bridge.saveAboutFile({ content: elements.aboutTextarea.value });
            } else if (ipc && ipc.invoke) {
                await ipc.invoke('save-about-file', { content: elements.aboutTextarea.value });
            } else {
                throw new Error('当前窗口没有关于页面保存通道。');
            }

            elements.aboutSaveBtn.textContent = '已保存';
            setTimeout(() => { elements.aboutSaveBtn.textContent = '保存'; }, 1500);
        } catch (error) {
            alert(`保存关于页面失败：${error.message || error}`);
        } finally {
            elements.aboutSaveBtn.disabled = false;
            elements.aboutSaveBtn.textContent = previousText === '保存中...' ? '保存' : previousText;
        }
    }

    function updateAboutHighlight() {
        const text = elements.aboutTextarea.value || '';
        elements.aboutHighlight.innerHTML = highlightMarkdownSource(text);
    }

    function updateAboutPreview() {
        const text = elements.aboutTextarea.value || '';
        elements.aboutPreview.innerHTML = renderMarkdownPreview(text);
        queueMathTypesetForAbout();
    }

    function queueMathTypesetForAbout() {
        clearTimeout(elements._aboutMathTimer);
        elements._aboutMathTimer = setTimeout(() => {
            if (window.MathJax && window.MathJax.typesetPromise) {
                window.MathJax.typesetPromise([elements.aboutPreview]).catch(() => {});
            }
        }, 80);
    }

    async function resolveConfigDisplayPath() {
        if (configDisplayPath) return configDisplayPath;

        if (bridge && bridge.getConfigPath) {
            try {
                configDisplayPath = await bridge.getConfigPath();
            } catch {
                configDisplayPath = null;
            }
        }

        return configDisplayPath || 'config.json';
    }

    function getConfigFilePath() {
        if (!path) return null;

        if (typeof __dirname !== 'undefined') {
            return path.join(__dirname, 'config.json');
        }

        if (typeof process !== 'undefined' && process.cwd) {
            return path.join(process.cwd(), 'config.json');
        }

        return null;
    }

    function safeRequire(moduleName) {
        if (!nodeRequire) return null;

        try {
            return nodeRequire(moduleName);
        } catch {
            return null;
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
