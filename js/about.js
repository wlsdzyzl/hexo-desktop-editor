// about.js — about page editor logic
(() => {
    const { bridge, ipc, highlightMarkdownSource, renderMarkdownPreview, queueMathTypeset, bindColumnResizer, readStoredNumber, writeStoredNumber } = window.Hexo;

    const textarea = document.getElementById('aboutTextarea');
    const highlight = document.getElementById('aboutHighlight');
    const preview = document.getElementById('aboutPreview');
    const pathDisplay = document.getElementById('aboutPath');
    const saveBtn = document.getElementById('aboutSaveBtn');
    const resizer = document.getElementById('aboutResizer');

    // ── Settings dialog ──────────────────────────────────────────

    let configData = {}, settingsReady = false;
    const settingsOverlay = document.getElementById('settingsOverlay');
    const settingsForm = document.getElementById('settingsForm');
    const settingsPathEl = document.getElementById('settingsPath');
    const settingsStatus = document.getElementById('settingsStatus');
    const settingsSaveBtn = document.getElementById('settingsSaveBtn');

    document.getElementById('settingsBtn').addEventListener('click', openSettings);
    document.getElementById('settingsCloseBtn').addEventListener('click', closeSettings);
    document.getElementById('settingsCancelBtn').addEventListener('click', closeSettings);
    settingsOverlay.addEventListener('click', e => { if (e.target === settingsOverlay) closeSettings(); });
    settingsForm.addEventListener('submit', e => { e.preventDefault(); saveSettings(); });

    async function openSettings() {
        settingsOverlay.hidden = false; settingsReady = false;
        settingsSaveBtn.disabled = true;
        settingsStatus.className = 'settings-status';
        settingsStatus.textContent = '正在读取配置...';
        settingsForm.innerHTML = '';

        try {
            configData = await readConfig();
            renderSettingsForm(configData);
            settingsReady = true;
            settingsSaveBtn.disabled = false;
            settingsStatus.textContent = '修改后点击保存。';
            settingsPathEl.textContent = await resolveConfigPath();
        } catch (err) {
            renderSettingsForm({});
            settingsStatus.textContent = `读取配置失败：${err.message}`;
            settingsStatus.className = 'settings-status error';
        }
    }

    function closeSettings() { settingsOverlay.hidden = true; }

    function renderSettingsForm(config) {
        settingsForm.innerHTML = '';
        const keys = Object.keys(config);
        if (!keys.length) { settingsForm.innerHTML = '<p class="settings-status">没有可编辑的配置项。</p>'; return; }
        for (const key of keys) {
            const row = document.createElement('div'); row.className = 'settings-row';
            const label = document.createElement('label'); label.textContent = key; label.htmlFor = 'setting-' + key;
            const input = createSettingInput(key, config[key]);
            row.appendChild(label); row.appendChild(input);
            settingsForm.appendChild(row);
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
        if (!settingsReady) { settingsStatus.textContent = '配置还没有成功读取。'; settingsStatus.className = 'settings-status error'; return; }
        try {
            const nextConfig = collectFormValues();
            await writeConfig(nextConfig);
            configData = nextConfig;
            settingsStatus.textContent = '配置已保存。'; settingsStatus.className = 'settings-status success';
            closeSettings();
            window.Hexo.navigateTo('index.html');
        } catch (err) {
            settingsStatus.textContent = `保存配置失败：${err.message}`;
            settingsStatus.className = 'settings-status error';
        }
    }

    function collectFormValues() {
        const next = { ...configData };
        settingsForm.querySelectorAll('.settings-input').forEach(f => {
            const t = f.dataset.type;
            if (t === 'boolean') next[f.dataset.key] = f.checked;
            else if (t === 'number') next[f.dataset.key] = Number(f.value);
            else if (t === 'object' || t === 'array') next[f.dataset.key] = JSON.parse(f.value || (t === 'array' ? '[]' : '{}'));
            else if (t === 'undefined') next[f.dataset.key] = null;
            else next[f.dataset.key] = f.value;
        });
        return next;
    }

    async function readConfig() {
        if (bridge && bridge.readConfig) return bridge.readConfig();
        if (ipc && ipc.invoke) return ipc.invoke('read-config');
        throw new Error('无法读取配置');
    }

    async function writeConfig(config) {
        if (bridge && bridge.saveConfig) { await bridge.saveConfig(config); return; }
        if (ipc && ipc.invoke) { await ipc.invoke('save-config', config); return; }
        throw new Error('无法保存配置');
    }

    async function resolveConfigPath() {
        if (bridge && bridge.getConfigPath) return bridge.getConfigPath();
        return 'config.json';
    }

    // ── About editor ─────────────────────────────────────────────

    async function loadAbout() {
        try {
            let doc;
            if (bridge && bridge.readAboutFile) doc = await bridge.readAboutFile();
            else if (ipc && ipc.invoke) doc = await ipc.invoke('read-about-file');
            else throw new Error('无法读取关于页面');
            if (!doc.filePath) {
                pathDisplay.textContent = '请在设置中配置 hexoPath 和 aboutDir';
                textarea.value = '';
            } else {
                textarea.value = doc.content || '';
                pathDisplay.textContent = doc.filePath;
            }
            updateHighlight();
            updatePreview();
        } catch (err) { alert(`读取关于页面失败：${err.message}`); }
    }

    async function saveAbout() {
        if (!textarea.value) { alert('关于页面内容为空'); return; }
        const prev = saveBtn.textContent;
        saveBtn.disabled = true; saveBtn.textContent = '保存中...';
        try {
            if (bridge && bridge.saveAboutFile) await bridge.saveAboutFile({ content: textarea.value });
            else if (ipc && ipc.invoke) await ipc.invoke('save-about-file', { content: textarea.value });
            else throw new Error('无法保存关于页面');
            saveBtn.textContent = '已保存';
            setTimeout(() => { saveBtn.textContent = '保存'; }, 1500);
        } catch (err) {
            alert(`保存关于页面失败：${err.message}`);
            saveBtn.textContent = prev;
        } finally { saveBtn.disabled = false; }
    }

    function updateHighlight() { highlight.innerHTML = highlightMarkdownSource(textarea.value || ''); }
    function updatePreview() { preview.innerHTML = renderMarkdownPreview(textarea.value || ''); queueMathTypeset(preview); }

    textarea.addEventListener('input', () => { updateHighlight(); updatePreview(); });
    textarea.addEventListener('scroll', () => { highlight.scrollTop = textarea.scrollTop; highlight.scrollLeft = textarea.scrollLeft; });
    saveBtn.addEventListener('click', saveAbout);

    document.addEventListener('keydown', e => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveAbout(); }
    });

    // Resizer
    const editorEl = document.querySelector('.about-editor');
    const markdownEl = document.querySelector('.about-markdown');
    bindColumnResizer({
        handle: resizer, container: editorEl,
        leftPane: markdownEl, rightPane: preview,
        variableTarget: editorEl, variableName: '--about-markdown-width',
        storageKey: 'hexoDesktop.aboutMarkdownWidth',
        minLeft: 260, minRight: 280,
    });

    // Init
    initFeatureButtons();
    loadAbout();

    async function initFeatureButtons() {
        try {
            const config = await readConfig();
            if (config.photoDir) {
                const btn = document.getElementById('photosBtn');
                if (btn) btn.hidden = false;
            }
        } catch {}
    }
})();
