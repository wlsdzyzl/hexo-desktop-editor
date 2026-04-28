// photos.js — photo gallery page logic
(() => {
    const { bridge, ipc, escapeHtml } = window.Hexo;

    let photos = [], photosDir = '';

    const photoGrid = document.getElementById('photoGrid');
    const photoPath = document.getElementById('photoPath');
    const photoStatus = document.getElementById('photoStatus');
    const uploadBtn = document.getElementById('photoUploadBtn');
    const refreshBtn = document.getElementById('photoRefreshBtn');

    // ── Settings dialog ──────────────────────────────────────────

    let configData = {}, settingsReady = false;
    const settingsOverlay = document.getElementById('settingsOverlay');
    const settingsForm = document.getElementById('settingsForm');
    const settingsPath = document.getElementById('settingsPath');
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
            settingsPath.textContent = await resolveConfigPath();
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

    // ── Photo gallery ────────────────────────────────────────────

    async function loadPhotos() {
        try {
            const result = await listPhotosFromDisk();
            photosDir = result.photosDir || '';
            photos = result.photos || [];
            if (!photosDir) {
                photoPath.textContent = '请在设置中配置 hexoPath 和 photoDir';
                photoStatus.textContent = '';
                renderPhotoGrid();
                return;
            }
            photoPath.textContent = photosDir;
            renderPhotoGrid();
        } catch (err) {
            photoStatus.textContent = `加载失败：${err.message}`;
        }
    }

    async function listPhotosFromDisk() {
        if (bridge && bridge.listPhotos) return bridge.listPhotos();
        if (ipc && ipc.invoke) return ipc.invoke('list-photos');
        throw new Error('无法读取照片');
    }

    function renderPhotoGrid() {
        photoGrid.innerHTML = '';
        if (!photos.length) {
            photoGrid.innerHTML = '<div class="photo-empty">暂无照片</div>';
            photoStatus.textContent = '';
            return;
        }
        photoStatus.textContent = `共 ${photos.length} 张图片`;

        for (const photo of photos) {
            const card = document.createElement('div'); card.className = 'photo-card';
            const img = document.createElement('img'); img.src = photo.url; img.alt = photo.fileName;

            const footer = document.createElement('div'); footer.className = 'photo-card-footer';
            footer.style.cssText = 'display:flex;align-items:center;gap:6px;padding:6px 8px;background:#fff;border-top:1px solid #edf0f3;';

            // Wrapper cell keeps layout stable when switching between name/input
            const cell = document.createElement('div');
            cell.style.cssText = 'flex:1;min-width:0;height:22px;display:flex;align-items:center;';

            const name = document.createElement('span'); name.className = 'photo-name';
            name.textContent = photo.fileName; name.title = '点击重命名';
            name.style.cssText = 'overflow:hidden;font-size:12px;color:#2563eb;text-overflow:ellipsis;white-space:nowrap;cursor:pointer;';
            name.onclick = function () { startInlineRename(cell, photo); };

            cell.appendChild(name);
            footer.appendChild(cell);

            const delBtn = document.createElement('span'); delBtn.className = 'photo-delete-btn';
            delBtn.textContent = '❌'; delBtn.title = '删除';
            delBtn.style.cssText = 'flex-shrink:0;font-size:14px;cursor:pointer;opacity:0.6;';
            delBtn.onmouseenter = () => delBtn.style.opacity = '1';
            delBtn.onmouseleave = () => delBtn.style.opacity = '0.6';
            delBtn.onclick = function (e) { e.stopPropagation(); deletePhoto(photo.relativePath, photo.fileName); };

            footer.appendChild(delBtn);
            card.appendChild(img); card.appendChild(footer);
            photoGrid.appendChild(card);
        }
    }

    function startInlineRename(cell, photo) {
        if (cell.querySelector('.photo-rename-input')) return;
        const dotIndex = photo.fileName.lastIndexOf('.');
        const ext = dotIndex > 0 ? photo.fileName.slice(dotIndex) : '';
        const baseName = dotIndex > 0 ? photo.fileName.slice(0, dotIndex) : photo.fileName;
        cell.innerHTML = '';

        const input = document.createElement('input'); input.className = 'photo-rename-input';
        input.value = baseName; input.select();
        input.style.cssText = 'width:100%;height:100%;padding:0 4px;font-size:12px;border:1px solid #4c8dff;border-radius:3px;outline:none;';
        cell.appendChild(input);

        // Replace the parent footer's last child (delBtn) with save/cancel + del
        const footer = cell.parentNode;
        const delBtn = footer.lastChild;
        delBtn.hidden = true;

        const actions = document.createElement('div');
        actions.style.cssText = 'display:flex;align-items:center;gap:4px;flex-shrink:0;';

        const saveBtn = document.createElement('span'); saveBtn.textContent = '✓';
        saveBtn.title = '保存';
        saveBtn.style.cssText = 'width:22px;height:22px;font-size:14px;line-height:22px;text-align:center;color:#047857;cursor:pointer;';
        saveBtn.onclick = async function () {
            const newBase = input.value.trim();
            if (!newBase || newBase === baseName) { await loadPhotos(); return; }
            await doRename(photo.relativePath, newBase + ext);
        };

        const cancelBtn = document.createElement('span'); cancelBtn.textContent = '✕';
        cancelBtn.title = '取消';
        cancelBtn.style.cssText = 'width:22px;height:22px;font-size:14px;line-height:22px;text-align:center;color:#9ca3af;cursor:pointer;';
        cancelBtn.onclick = () => loadPhotos();

        input.addEventListener('keydown', e => {
            if (e.key === 'Enter') saveBtn.click();
            if (e.key === 'Escape') cancelBtn.click();
        });

        actions.appendChild(saveBtn);
        actions.appendChild(cancelBtn);
        actions.appendChild(delBtn);
        footer.appendChild(actions);
    }

    async function doRename(relativePath, newFileName) {
        try {
            if (bridge && bridge.renamePhotoFile) await bridge.renamePhotoFile({ relativePath, fileName: newFileName });
            else if (ipc && ipc.invoke) await ipc.invoke('rename-photo-file', { relativePath, fileName: newFileName });
            else throw new Error('无重命名通道');
            await loadPhotos();
            photoStatus.textContent = `已重命名为 ${newFileName}`;
        } catch (err) { alert(`重命名失败：${err.message}`); await loadPhotos(); }
    }

    async function deletePhoto(relativePath, fileName) {
        if (!window.confirm(`确定删除「${fileName}」吗？此操作无法撤销。`)) return;
        try {
            if (bridge && bridge.deletePhotoFile) await bridge.deletePhotoFile(relativePath);
            else if (ipc && ipc.invoke) await ipc.invoke('delete-photo-file', relativePath);
            else throw new Error('无删除通道');
            await loadPhotos();
            photoStatus.textContent = `已删除 ${fileName}`;
        } catch (err) { alert(`删除失败：${err.message}`); }
    }

    async function uploadPhotos() {
        uploadBtn.disabled = true;
        const prev = uploadBtn.textContent;
        uploadBtn.textContent = '正在上传...';
        try {
            let result;
            if (bridge && bridge.uploadPhotos) result = await bridge.uploadPhotos();
            else if (ipc && ipc.invoke) result = await ipc.invoke('upload-photos');
            else throw new Error('无上传通道');
            if (result.canceled) { photoStatus.textContent = '已取消上传。'; return; }
            photosDir = result.photosDir || photosDir;
            photos = result.photos || [];
            renderPhotoGrid();
            if (result.uploaded && result.uploaded.length) photoStatus.textContent = `成功上传 ${result.uploaded.length} 张图片。`;
        } catch (err) { photoStatus.textContent = `上传失败：${err.message}`; }
        finally { uploadBtn.disabled = false; uploadBtn.textContent = prev; }
    }

    uploadBtn.addEventListener('click', uploadPhotos);
    refreshBtn.addEventListener('click', loadPhotos);

    // Init
    initFeatureButtons();
    loadPhotos();

    async function initFeatureButtons() {
        try {
            const config = await readConfig();
            if (config.aboutDir) {
                const btn = document.getElementById('aboutBtn');
                if (btn) btn.hidden = false;
            }
        } catch {}
    }
})();
