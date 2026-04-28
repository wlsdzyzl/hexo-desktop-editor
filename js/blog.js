// blog.js — blog editor page logic
(() => {
    const { bridge, ipc, highlightMarkdownSource, renderMarkdownPreview, queueMathTypeset, bindColumnResizer, readStoredNumber, writeStoredNumber, clamp } = window.Hexo;
    const path = window.Hexo.path;
    const fs = typeof require !== 'undefined' ? (require('fs') || null) : null;

    let posts = [], selectedId = null, untitledCounter = 1;
    let configData = {}, settingsReady = false, postsDir = '';
    let configFilePath = null;

    // Detect config path
    if (path && typeof __dirname !== 'undefined') configFilePath = path.join(__dirname, 'config.json');
    else if (typeof process !== 'undefined' && process.cwd) configFilePath = path.join(process.cwd(), 'config.json');

    // ── Elements ─────────────────────────────────────────────────

    const E = {
        postList: document.getElementById('postList'),
        titleInput: document.getElementById('postTitleInput'),
        textarea: document.getElementById('markdownInput'),
        highlight: document.getElementById('markdownHighlight'),
        preview: document.getElementById('preview'),
        saveBtn: document.getElementById('saveBtn'),
        deleteBtn: document.getElementById('deleteBtn'),
        openFolderBtn: document.getElementById('openFolderBtn'),
        postPath: document.getElementById('postPath'),
        mainResizer: document.getElementById('mainResizer'),
        editorResizer: document.getElementById('editorResizer'),
        main: document.querySelector('.main'),
        sidebar: document.querySelector('.sidebar'),
        editor: document.querySelector('.editor'),
        markdown: document.querySelector('.markdown'),
        photosBtn: document.getElementById('photosBtn'),
        aboutBtn: document.getElementById('aboutBtn'),
        // Settings
        settingsOverlay: document.getElementById('settingsOverlay'),
        settingsCloseBtn: document.getElementById('settingsCloseBtn'),
        settingsCancelBtn: document.getElementById('settingsCancelBtn'),
        settingsSaveBtn: document.getElementById('settingsSaveBtn'),
        settingsForm: document.getElementById('settingsForm'),
        settingsStatus: document.getElementById('settingsStatus'),
        settingsPath: document.getElementById('settingsPath'),
    };

    // ── Feature buttons ──────────────────────────────────────────

    async function initFeatureButtons() {
        try {
            const config = await readConfig();
            if (config.photoDir) E.photosBtn.hidden = false;
            if (config.aboutDir) E.aboutBtn.hidden = false;
        } catch {}
    }

    // ── Settings ─────────────────────────────────────────────────

    async function openSettings() {
        E.settingsOverlay.hidden = false; settingsReady = false;
        E.settingsSaveBtn.disabled = true;
        E.settingsStatus.className = 'settings-status';
        E.settingsStatus.textContent = '正在读取配置...';
        E.settingsForm.innerHTML = '';
        try {
            configData = await readConfig();
            renderSettingsForm(configData);
            settingsReady = true;
            E.settingsSaveBtn.disabled = false;
            E.settingsStatus.textContent = '修改后点击保存。';
            E.settingsPath.textContent = await resolveConfigPath();
        } catch (err) {
            renderSettingsForm({});
            setSettingsStatus(`读取配置失败：${err.message}`, 'error');
        }
    }

    function closeSettings() { E.settingsOverlay.hidden = true; }

    function renderSettingsForm(config) {
        E.settingsForm.innerHTML = '';
        const keys = Object.keys(config);
        if (!keys.length) { E.settingsForm.innerHTML = '<p class="settings-status">没有可编辑的配置项。</p>'; return; }
        for (const key of keys) {
            const row = document.createElement('div'); row.className = 'settings-row';
            const label = document.createElement('label'); label.textContent = key; label.htmlFor = 'setting-' + key;
            const input = createSettingInput(key, config[key]);
            row.appendChild(label); row.appendChild(input);
            E.settingsForm.appendChild(row);
        }
    }

    function createSettingInput(key, value) {
        const type = Array.isArray(value) ? 'array' : typeof value;
        const input = (type === 'object' && value !== null) ? document.createElement('textarea') : document.createElement('input');
        input.id = 'setting-' + key; input.className = 'settings-input';
        input.dataset.key = key; input.dataset.type = type;
        if (type === 'object' || type === 'array') { input.value = JSON.stringify(value, null, 2); }
        else if (type === 'boolean') { input.type = 'checkbox'; input.checked = value; }
        else { input.type = 'text'; input.value = value == null ? '' : String(value); }
        return input;
    }

    async function saveSettings() {
        if (!settingsReady) { setSettingsStatus('配置还没有成功读取。', 'error'); return; }
        try {
            const nextConfig = collectFormValues();
            await writeConfig(nextConfig);
            configData = nextConfig;
            setSettingsStatus('配置已保存。', 'success');
            closeSettings();
            await initFeatureButtons();
            await loadPostsFromDisk();
        } catch (err) { setSettingsStatus(`保存配置失败：${err.message}`, 'error'); }
    }

    function collectFormValues() {
        const next = { ...configData };
        E.settingsForm.querySelectorAll('.settings-input').forEach(f => {
            const t = f.dataset.type;
            if (t === 'boolean') next[f.dataset.key] = f.checked;
            else if (t === 'number') next[f.dataset.key] = Number(f.value);
            else if (t === 'object' || t === 'array') next[f.dataset.key] = JSON.parse(f.value || (t === 'array' ? '[]' : '{}'));
            else if (t === 'undefined') next[f.dataset.key] = null;
            else next[f.dataset.key] = f.value;
        });
        return next;
    }

    function setSettingsStatus(msg, type) {
        E.settingsStatus.className = type ? 'settings-status ' + type : 'settings-status';
        E.settingsStatus.textContent = msg;
    }

    async function readConfig() {
        if (bridge && bridge.readConfig) return bridge.readConfig();
        if (ipc && ipc.invoke) return ipc.invoke('read-config');
        if (!fs || !configFilePath) throw new Error('无法读取配置');
        return JSON.parse(fs.readFileSync(configFilePath, 'utf8') || '{}');
    }

    async function writeConfig(config) {
        if (bridge && bridge.saveConfig) { await bridge.saveConfig(config); return; }
        if (ipc && ipc.invoke) { await ipc.invoke('save-config', config); return; }
        if (!fs || !configFilePath) throw new Error('无法保存配置');
        fs.writeFileSync(configFilePath, JSON.stringify(config, null, 2) + '\n', 'utf8');
    }

    async function resolveConfigPath() {
        if (bridge && bridge.getConfigPath) return bridge.getConfigPath();
        return configFilePath || 'config.json';
    }

    // ── Posts ────────────────────────────────────────────────────

    async function loadPostsFromDisk(opts = {}) {
        const keepSelection = opts.keepSelection || false;
        try {
            const current = keepSelection ? selectedId : null;
            const result = await listPosts();
            postsDir = result.postsDir || '';
            posts = result.posts.map(p => ({ ...p, id: p.relativePath, content: null, dirty: false, isNew: false }));
            if (!posts.length) { selectedId = null; renderSidebarMsg('没有找到 Markdown 文章'); clearEditor('文章目录为空'); return; }
            const next = (current && posts.some(p => p.id === current)) ? current : posts[0].id;
            await selectPost(next);
        } catch (err) { selectedId = null; posts = []; renderSidebarMsg('读取文章失败'); clearEditor(err.message); alert('读取文章失败：' + (err.message || err)); }
    }

    async function listPosts() {
        if (bridge && bridge.listPosts) return bridge.listPosts();
        if (ipc && ipc.invoke) return ipc.invoke('list-posts');
        throw new Error('无法读取文章');
    }

    async function readPost(relativePath) {
        if (bridge && bridge.readPost) return bridge.readPost(relativePath);
        if (ipc && ipc.invoke) return ipc.invoke('read-post', relativePath);
        throw new Error('无法读取文章');
    }

    async function savePostFile(post) {
        if (bridge && bridge.savePostFile) return bridge.savePostFile(post);
        if (ipc && ipc.invoke) return ipc.invoke('save-post-file', post);
        throw new Error('无法保存文章');
    }

    async function deletePostFile(relativePath) {
        if (bridge && bridge.deletePostFile) return bridge.deletePostFile(relativePath);
        if (ipc && ipc.invoke) return ipc.invoke('delete-post-file', relativePath);
        throw new Error('无法删除文章');
    }

    function findPost(id) { return posts.find(p => p.id === id); }

    function renderSidebar() {
        E.postList.innerHTML = '';
        for (const p of posts) {
            const li = document.createElement('li'); li.className = 'post-list__item';
            li.textContent = p.title + (p.dirty ? ' *' : '');
            li.title = p.fileName || p.title; li.dataset.id = p.id;
            if (p.id === selectedId) li.classList.add('active');
            li.addEventListener('click', () => selectPost(p.id));
            E.postList.appendChild(li);
        }
    }

    function renderSidebarMsg(msg) { E.postList.innerHTML = '<li class="post-list__item">' + msg + '</li>'; }

    async function selectPost(id) {
        const post = findPost(id);
        if (!post) return;
        selectedId = id;
        try {
            if (post.content === null && !post.isNew) {
                const disk = await readPost(post.relativePath);
                Object.assign(post, disk, { id: disk.relativePath, content: disk.content, dirty: false, isNew: false });
                selectedId = post.id;
            }
            E.titleInput.value = post.title;
            E.textarea.value = post.content || '';
            E.postPath.textContent = post.filePath || (post.isNew ? '新文章（尚未保存）' : '');
            updateHighlight();
            updatePreview();
            renderSidebar();
            E.saveBtn.disabled = false;
            E.deleteBtn.disabled = false;
        } catch (err) { alert('读取文章失败：' + (err.message || err)); }
    }

    function clearEditor(msg) {
        E.titleInput.value = ''; E.textarea.value = ''; E.postPath.textContent = '';
        E.highlight.textContent = ''; E.preview.innerHTML = '<p>' + (msg || 'Markdown 预览') + '</p>';
        E.saveBtn.disabled = true; E.deleteBtn.disabled = true;
    }

    function createNew() {
        const title = 'untitled-' + (untitledCounter++);
        const now = new Date();
        const pad = v => String(v).padStart(2, '0');
        const date = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
        const post = { id: 'new-' + Date.now(), title, fileName: title + '.md', relativePath: '', content: '---\ntitle: ' + title + '\ndate: ' + date + '\n---\n\n', dirty: true, isNew: true };
        posts.unshift(post);
        selectedId = post.id;
        E.titleInput.value = post.title;
        E.textarea.value = post.content;
        E.saveBtn.disabled = false;
        E.deleteBtn.disabled = false;
        E.postPath.textContent = '新文章（尚未保存）';
        updateHighlight(); updatePreview(); renderSidebar();
    }

    async function saveCurrent() {
        const post = findPost(selectedId);
        if (!post) return alert('没有选中文章');
        const prev = E.saveBtn.textContent;
        E.saveBtn.disabled = true; E.saveBtn.textContent = '保存中...';
        try {
            post.title = E.titleInput.value.trim() || post.title || 'untitled';
            post.content = E.textarea.value;
            const saved = await savePostFile({ relativePath: post.relativePath, fileName: post.title, content: post.content });
            Object.assign(post, saved, { id: saved.relativePath, content: post.content, dirty: false, isNew: false });
            selectedId = post.id;
            E.titleInput.value = post.title;
            E.postPath.textContent = post.filePath || '';
            posts.sort((a, b) => (b.mtimeMs || 0) - (a.mtimeMs || 0) || String(a.fileName || a.title).localeCompare(String(b.fileName || b.title)));
            renderSidebar();
        } catch (err) { alert('保存文章失败：' + (err.message || err)); }
        finally { E.saveBtn.textContent = prev; E.saveBtn.disabled = false; }
    }

    async function deleteCurrent() {
        const post = findPost(selectedId);
        if (!post) return alert('没有选中文章');
        const idx = posts.findIndex(p => p.id === post.id);
        if (!post.isNew && !window.confirm('确定删除「' + (post.fileName || post.title) + '」吗？此操作无法撤销。')) return;
        const prev = E.deleteBtn.textContent;
        E.deleteBtn.disabled = true; E.deleteBtn.textContent = '删除中...';
        try {
            if (!post.isNew && post.relativePath) await deletePostFile(post.relativePath);
            posts.splice(idx, 1); selectedId = null;
            if (!posts.length) { renderSidebarMsg('没有找到 Markdown 文章'); clearEditor('文章目录为空'); return; }
            await selectPost(posts[Math.min(idx, posts.length - 1)].id);
        } catch (err) { alert('删除文章失败：' + (err.message || err)); }
        finally { E.deleteBtn.textContent = prev; E.deleteBtn.disabled = !findPost(selectedId); }
    }

    function openFolder() {
        if (ipc && ipc.send) { ipc.send('open-folder'); return; }
        alert('open-folder (ipc not available)');
    }

    // ── Editor ───────────────────────────────────────────────────

    function updateHighlight() { E.highlight.innerHTML = highlightMarkdownSource(E.textarea.value || ''); }
    function updatePreview() { E.preview.innerHTML = renderMarkdownPreview(E.textarea.value || ''); queueMathTypeset(E.preview); }

    E.textarea.addEventListener('input', () => {
        const post = findPost(selectedId);
        if (!post) return;
        post.content = E.textarea.value; post.dirty = true;
        updateHighlight(); updatePreview(); renderSidebar();
    });
    E.textarea.addEventListener('scroll', () => { E.highlight.scrollTop = E.textarea.scrollTop; E.highlight.scrollLeft = E.textarea.scrollLeft; });
    E.titleInput.addEventListener('input', () => {
        const post = findPost(selectedId);
        if (!post) return;
        post.title = E.titleInput.value.trim() || 'untitled'; post.dirty = true;
        renderSidebar();
    });

    // ── Event bindings ───────────────────────────────────────────

    document.getElementById('settingsBtn').addEventListener('click', openSettings);
    E.settingsCloseBtn.addEventListener('click', closeSettings);
    E.settingsCancelBtn.addEventListener('click', closeSettings);
    E.settingsOverlay.addEventListener('click', e => { if (e.target === E.settingsOverlay) closeSettings(); });
    E.settingsForm.addEventListener('submit', e => { e.preventDefault(); saveSettings(); });
    document.getElementById('newBtn').addEventListener('click', createNew);
    document.getElementById('saveBtn').addEventListener('click', saveCurrent);
    document.getElementById('deleteBtn').addEventListener('click', deleteCurrent);
    E.openFolderBtn.addEventListener('click', openFolder);

    document.addEventListener('keydown', e => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveCurrent(); }
    });

    // ── Layout ───────────────────────────────────────────────────

    bindColumnResizer({
        handle: E.mainResizer, container: E.main,
        leftPane: E.sidebar, rightPane: document.querySelector('.editor-area'),
        variableTarget: E.main, variableName: '--sidebar-width',
        storageKey: 'hexoDesktop.sidebarWidth', minLeft: 180, minRight: 520,
    });
    bindColumnResizer({
        handle: E.editorResizer, container: E.editor,
        leftPane: E.markdown, rightPane: E.preview,
        variableTarget: E.editor, variableName: '--markdown-width',
        storageKey: 'hexoDesktop.markdownWidth', minLeft: 260, minRight: 280,
    });

    // ── AI Writing ────────────────────────────────────────────────

    const aiHint = document.getElementById('aiHint');
    const aiPopup = document.getElementById('aiPopup');
    const aiInput = document.getElementById('aiInput');
    const aiSendBtn = document.getElementById('aiSendBtn');
    const aiStatus = document.getElementById('aiStatus');
    const editorDiv = document.querySelector('.markdown-editor');

    function enterAiMode() {
        aiHint.hidden = true;
        aiPopup.hidden = false;
        aiInput.value = '';
        aiStatus.hidden = true;
        aiSendBtn.disabled = false;
        // Position popup near the cursor in the textarea
        const ta = E.textarea;
        const rect = ta.getBoundingClientRect();
        const lineHeight = 20; // approximate
        const textBeforeCursor = ta.value.slice(0, ta.selectionStart);
        const lines = textBeforeCursor.split('\n');
        const currentLine = lines[lines.length - 1];
        const charWidth = 8; // approximate monospace char width

        let top = (lines.length - 1) * lineHeight + 12; // line position + padding
        let left = currentLine.length * charWidth + 12;

        // Clamp within editor
        const editorRect = editorDiv.getBoundingClientRect();
        top = Math.min(top, editorRect.height - 80);
        left = Math.max(40, Math.min(left, editorRect.width - 340));

        aiPopup.style.top = top + 'px';
        aiPopup.style.left = left + 'px';

        aiInput.focus();
    }

    function exitAiMode() {
        aiHint.hidden = false;
        aiPopup.hidden = true;
        aiStatus.hidden = true;
        E.textarea.focus();
    }

    async function doAiGenerate() {
        const prompt = aiInput.value.trim();
        if (!prompt) return;

        aiInput.disabled = true;
        aiSendBtn.disabled = true;
        aiStatus.hidden = false;

        try {
            let result;
            if (bridge && bridge.aiGenerate) {
                result = await bridge.aiGenerate(prompt);
            } else if (ipc && ipc.invoke) {
                result = await ipc.invoke('ai-generate', prompt);
            } else {
                throw new Error('当前窗口没有 AI 通道');
            }

            if (!result.success) throw new Error(result.message);

            // Insert at cursor
            const ta = E.textarea;
            const start = ta.selectionStart;
            const end = ta.selectionEnd;
            ta.value = ta.value.slice(0, start) + result.text + ta.value.slice(end);
            ta.selectionStart = ta.selectionEnd = start + result.text.length;
            ta.dispatchEvent(new Event('input'));
        } catch (err) {
            alert('AI 生成失败：' + (err.message || err));
        }

        aiInput.disabled = false;
        aiSendBtn.disabled = false;
        aiStatus.hidden = true;
        exitAiMode();
    }

    aiInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { exitAiMode(); return; }
        if (e.key === 'Enter') { doAiGenerate(); }
    });

    aiSendBtn.addEventListener('click', doAiGenerate);

    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
            e.preventDefault();
            if (aiPopup.hidden) enterAiMode();
            else exitAiMode();
        }
    });

    aiHint.addEventListener('click', enterAiMode);

    // ── Init ─────────────────────────────────────────────────────

    initFeatureButtons();
    renderSidebarMsg('正在读取文章...');
    clearEditor('正在读取 Hexo 文章...');
    loadPostsFromDisk();
})();
