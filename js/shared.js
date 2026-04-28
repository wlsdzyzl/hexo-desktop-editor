// shared.js — common utilities for all pages
(() => {
    const nodeRequire = typeof require !== 'undefined' ? require : null;
    const bridge = window.electronAPI || null;
    const ipc = bridge || safeRequire('electron')?.ipcRenderer || null;
    const path = safeRequire('path');

    // Expose to page scripts
    window.Hexo = {
        bridge,
        ipc,
        path,

        // ── Navigation ──────────────────────────────────────────

        navigateTo(page) {
            if (bridge && bridge.send) {
                bridge.send('navigate', page);
            } else if (ipc && ipc.send) {
                ipc.send('navigate', page);
            } else {
                console.log('navigate:', page);
            }
        },

        openExternal(url) {
            if (bridge && bridge.send) {
                bridge.send('open-external', url);
            } else if (ipc && ipc.send) {
                ipc.send('open-external', url);
            }
        },

        // ── Publish ─────────────────────────────────────────────

        publishSite() {
            const overlay = document.getElementById('publishOverlay');
            const log = document.getElementById('publishLog');
            const status = document.getElementById('publishStatus');
            const closeBtn = document.getElementById('publishCloseBtn');

            if (!overlay) return;

            overlay.hidden = false;
            log.textContent = '';
            status.textContent = '正在发布...';
            status.className = 'publish-status';
            closeBtn.disabled = true;

            function append(text) {
                log.textContent += text;
                log.scrollTop = log.scrollHeight;
            }

            let unsubLog = null, unsubDone = null;
            if (bridge && bridge.on) {
                unsubLog = bridge.on('publish-log', (text) => append(text));
                unsubDone = bridge.on('publish-done', (result) => {
                    if (unsubLog) unsubLog();
                    if (unsubDone) unsubDone();
                    closeBtn.disabled = false;
                    status.textContent = result.message;
                    status.className = 'publish-status ' + (result.success ? 'success' : 'error');
                });
            }

            if (ipc && ipc.send) {
                ipc.send('publish-post');
            } else {
                append('当前窗口没有发布通道。\n');
            }
        },

        // ── Markdown render ─────────────────────────────────────

        highlightMarkdownSource(text) {
            const lines = text.replace(/\r\n?/g, '\n').split('\n');
            let inFence = false;
            return lines.map(line => {
                const fence = line.match(/^\s*(```|~~~)/);
                if (fence) { inFence = !inFence; return `<span class="md-fence">${Hexo.escapeHtml(line)}</span>`; }
                if (inFence) return `<span class="md-code-line">${Hexo.escapeHtml(line) || ' '}</span>`;
                return Hexo.highlightMarkdownLine(line);
            }).join('\n') + '\n';
        },

        highlightMarkdownLine(line) {
            const heading = line.match(/^(#{1,6})(\s+.*)$/);
            if (heading) return `<span class="md-heading"><span class="md-heading-marker">${Hexo.escapeHtml(heading[1])}</span>${Hexo.highlightInlineMarkdown(heading[2])}</span>`;
            const quote = line.match(/^(\s*>)(\s?.*)$/);
            if (quote) return `<span class="md-quote"><span class="md-quote-marker">${Hexo.escapeHtml(quote[1])}</span>${Hexo.highlightInlineMarkdown(quote[2])}</span>`;
            const list = line.match(/^(\s*(?:[-+*]|\d+\.))(\s+.*)$/);
            if (list) return `<span class="md-list-marker">${Hexo.escapeHtml(list[1])}</span>${Hexo.highlightInlineMarkdown(list[2])}`;
            return Hexo.highlightInlineMarkdown(line);
        },

        highlightInlineMarkdown(line) {
            let html = Hexo.escapeHtml(line);
            html = html.replace(/(`+)(.+?)(\1)/g, '<span class="md-code">$1$2$3</span>');
            html = html.replace(/(\*\*|__)(.+?)\1/g, '<span class="md-bold">$1$2$1</span>');
            html = html.replace(/(\*|_)([^*_]+?)\1/g, '<span class="md-emphasis">$1$2$1</span>');
            html = html.replace(/(!?\[[^\]]+\]\([^)]+\))/g, '<span class="md-link">$1</span>');
            html = html.replace(/((?:\$\$?)[^$]+(?:\$\$?)|\\\([^)]+\\\)|\\\[[^\]]+\\\])/g, '<span class="md-code">$1</span>');
            return html || ' ';
        },

        renderMarkdownPreview(text) {
            const lines = text.replace(/\r\n?/g, '\n').split('\n');
            const html = [];
            let paragraph = [], listItems = [];
            let inCode = false, codeLang = '', codeLines = [];

            function flushParagraph() { if (paragraph.length) { html.push(`<p>${Hexo.renderInline(paragraph.join('\n'))}</p>`); paragraph = []; } }
            function flushList() { if (listItems.length) { html.push(`<ul>${listItems.map(i => `<li>${Hexo.renderInline(i)}</li>`).join('')}</ul>`); listItems = []; } }
            function flushCode() { const lc = codeLang ? ` class="language-${Hexo.escapeAttr(codeLang)}"` : ''; html.push(`<pre><code${lc}>${Hexo.escapeHtml(codeLines.join('\n'))}</code></pre>`); codeLines = []; codeLang = ''; }

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i], trimmed = line.trim();
                const fence = line.match(/^\s*(```|~~~)\s*([A-Za-z0-9_-]+)?\s*$/);
                if (fence) {
                    if (inCode) { inCode = false; flushCode(); }
                    else { flushParagraph(); flushList(); inCode = true; codeLang = fence[2] || ''; }
                    continue;
                }
                if (inCode) { codeLines.push(line); continue; }
                if (trimmed.startsWith('$$') || trimmed.startsWith('\\[')) {
                    flushParagraph(); flushList();
                    const block = Hexo.collectDisplayMath(lines, i);
                    html.push(Hexo.renderDisplayMath(block.content));
                    i = block.endIndex;
                    continue;
                }
                if (!trimmed) { flushParagraph(); flushList(); continue; }
                const heading = line.match(/^(#{1,6})\s+(.+)$/);
                if (heading) { flushParagraph(); flushList(); html.push(`<h${heading[1].length}>${Hexo.renderInline(heading[2])}</h${heading[1].length}>`); continue; }
                const quote = line.match(/^\s*>\s?(.*)$/);
                if (quote) { flushParagraph(); flushList(); html.push(`<blockquote>${Hexo.renderInline(quote[1])}</blockquote>`); continue; }
                const ul = line.match(/^\s*[-+*]\s+(.+)$/);
                if (ul) { flushParagraph(); listItems.push(ul[1]); continue; }
                flushList(); paragraph.push(line);
            }
            if (inCode) flushCode();
            flushParagraph(); flushList();
            return html.join('\n') || '<p>Markdown 预览</p>';
        },

        renderInline(text) {
            const math = [];
            const stash = latex => { const t = `@@MATH_${math.length}@@`; math.push(`<span class="math math-inline">\\(${Hexo.escapeHtml(latex)}\\)</span>`); return t; };
            let s = text.replace(/\\\(([\s\S]+?)\\\)/g, (_, l) => stash(l));
            s = s.replace(/(^|[^\\])\$([^\n$]+?)\$/g, (_, p, l) => `${p}${stash(l)}`);
            let h = Hexo.escapeHtml(s);
            h = h.replace(/`([^`]+)`/g, '<code>$1</code>');
            h = h.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
            h = h.replace(/__([^_]+)__/g, '<strong>$1</strong>');
            h = h.replace(/\*([^*]+)\*/g, '<em>$1</em>');
            h = h.replace(/_([^_]+)_/g, '<em>$1</em>');
            h = h.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2">');
            h = h.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
            h = h.replace(/@@MATH_(\d+)@@/g, (_, i) => math[Number(i)] || '');
            h = h.replace(/\n/g, '<br>');
            return h;
        },

        collectDisplayMath(lines, start) {
            const first = lines[start], trimmed = first.trim();
            const isDollar = trimmed.startsWith('$$');
            const open = isDollar ? '$$' : '\\[', close = isDollar ? '$$' : '\\]';
            const content = [];
            let cur = first.slice(first.indexOf(open) + open.length);
            if (cur.includes(close)) { content.push(cur.slice(0, cur.indexOf(close))); return { content: content.join('\n').trim(), endIndex: start }; }
            if (cur.trim()) content.push(cur);
            for (let i = start + 1; i < lines.length; i++) {
                cur = lines[i];
                if (cur.includes(close)) { content.push(cur.slice(0, cur.indexOf(close))); return { content: content.join('\n').trim(), endIndex: i }; }
                content.push(cur);
            }
            return { content: content.join('\n').trim(), endIndex: lines.length - 1 };
        },

        renderDisplayMath(latex) { return `<div class="math math-display">\\[${Hexo.escapeHtml(latex)}\\]</div>`; },

        escapeHtml(text) { return String(text).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;'); },
        escapeAttr(text) { return String(text).replace(/[^A-Za-z0-9_-]/g,''); },

        // ── MathJax ──────────────────────────────────────────────

        queueMathTypeset(el) {
            clearTimeout(el._mathTimer);
            el._mathTimer = setTimeout(() => {
                if (window.MathJax && window.MathJax.typesetPromise) {
                    window.MathJax.typesetPromise([el]).catch(() => {});
                }
            }, 80);
        },

        // ── Layout utilities ─────────────────────────────────────

        clamp(v, min, max) { return Math.min(Math.max(v, min), max); },

        readStoredNumber(key) {
            try { const v = Number(localStorage.getItem(key)); return Number.isFinite(v) && v > 0 ? v : null; } catch { return null; }
        },
        writeStoredNumber(key, v) {
            try { localStorage.setItem(key, String(Math.round(v))); } catch {}
        },

        bindColumnResizer(opts) {
            const { handle, container, leftPane, rightPane, variableTarget, variableName, storageKey, minLeft, minRight } = opts;
            if (!handle || !container || !leftPane || !rightPane || !variableTarget) return;
            handle.addEventListener('pointerdown', e => {
                e.preventDefault();
                const startX = e.clientX;
                const startW = leftPane.getBoundingClientRect().width;
                const hw = handle.getBoundingClientRect().width;
                const tw = container.getBoundingClientRect().width - hw;
                handle.classList.add('is-dragging');
                document.body.classList.add('is-resizing');
                handle.setPointerCapture?.(e.pointerId);
                function move(me) {
                    const d = me.clientX - startX;
                    variableTarget.style.setProperty(variableName, `${Hexo.clamp(startW + d, minLeft, Math.max(minLeft, tw - minRight))}px`);
                }
                function end() {
                    Hexo.writeStoredNumber(storageKey, leftPane.getBoundingClientRect().width);
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
        },
    };

    function safeRequire(name) {
        if (!nodeRequire) return null;
        try { return nodeRequire(name); } catch { return null; }
    }

    // ── Init shared features ─────────────────────────────────────

    document.addEventListener('DOMContentLoaded', () => {
        // Author links
        document.addEventListener('click', e => {
            const link = e.target.closest('.js-author-link');
            if (!link) return;
            e.preventDefault();
            Hexo.openExternal('https://wlsdzyzl.github.io/');
        });

        // Publish close button
        const closeBtn = document.getElementById('publishCloseBtn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                document.getElementById('publishOverlay').hidden = true;
            });
        }

        // Toolbar navigation buttons
        document.querySelectorAll('[data-navigate]').forEach(btn => {
            btn.addEventListener('click', () => {
                Hexo.navigateTo(btn.dataset.navigate);
            });
        });

        // Publish button
        const pubBtn = document.getElementById('publishBtn');
        if (pubBtn) {
            pubBtn.addEventListener('click', () => Hexo.publishSite());
        }

        // Escape to close overlays
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape') {
                const pubOverlay = document.getElementById('publishOverlay');
                if (pubOverlay && !pubOverlay.hidden) {
                    pubOverlay.hidden = true;
                    return;
                }
                const settingsEl = document.getElementById('settingsOverlay');
                if (settingsEl && !settingsEl.hidden) {
                    settingsEl.hidden = true;
                }
            }
        });
    });
})();
