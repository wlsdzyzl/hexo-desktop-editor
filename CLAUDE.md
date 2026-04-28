# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

Hexo Desktop 是一个基于 Electron 的桌面应用，用于管理本地 Hexo 博客。提供 Markdown 编辑器（含实时预览）、相册管理器和可配置的设置——所有操作直接作用于 Hexo 项目的本地文件系统。项目没有构建步骤，所有 JS 以普通脚本方式由 HTML 加载。

## 常用命令

- **启动应用**：`npm start`（执行 `electron .`）
- **发布（独立 CLI）**：`node publish.js /path/to/hexo [--public-remote <url>] [--public-branch <branch>] [--source-branch <branch>] [--commit-message <msg>]`
  - 先执行 `npx hexo generate` 生成静态站点，然后将源码仓库和 `public/` 目录分别提交并推送到对应的 git 远程仓库。

没有配置测试框架、代码检查工具或打包工具。

## 架构

### 进程模型

应用遵循标准的 Electron 多进程架构：

- **主进程**（`main.js`）：创建 BrowserWindow，注册所有 IPC 处理器，执行所有文件系统 I/O（文章的读写、照片管理、配置读写）。不运行任何 Hexo 逻辑——仅读写磁盘文件。
- **预加载脚本**（`preload.js`）：通过 `contextBridge` 暴露白名单 API `window.electronAPI`。IPC 通道分为 `send`（单向触发：`open-folder`、`save-post`、`publish-post`、`open-settings`）和 `invoke`（请求-响应，用于文件系统操作）。`send` 和 `invoke` 方法强制检查白名单，防止渲染进程调用任意 IPC 通道。
- **渲染进程**（`renderer.js`，在 `index.html` 中加载）：单文件原生 JS 应用（无框架）。管理所有 UI 状态：文章列表、带语法高亮的 Markdown 编辑器（透明 textarea + pre 叠层方案）、Markdown 转 HTML 预览、MathJax 数学公式渲染、设置表单、相册浮层、可拖拽分割面板。

### 数据流

1. 渲染进程通过 `bridge`（preload API）请求数据，或回退到 `ipc`（直接 ipcRenderer），或在非沙箱环境下回退到 `fs`。preload/bridge 是主要的预期路径。
2. 主进程根据 `config.json` → `hexoPath` 读写本地 Hexo 项目目录。
3. 文章存放在 `{hexoPath}/source/_posts/`（也会依次尝试 `source/post/`、`source/posts/`、`_posts/`、`post/`、`posts/`）。
4. 照片存放在 `{hexoPath}/source/photos/`。
5. 关于页面为 `{hexoPath}/source/about/index.md`。

### 核心文件

| 文件 | 职责 |
|------|------|
| `main.js` | Electron 主进程——窗口创建、IPC 处理器、所有文件系统操作 |
| `preload.js` | 上下文桥接——白名单 IPC 通道并暴露给渲染进程 |
| `index.html` | 完整 UI 布局及内嵌 CSS（工具栏、侧边栏、编辑器、设置弹窗、相册浮层） |
| `renderer.js` | 全部前端逻辑——文章增删改查、Markdown 语法高亮、预览渲染、MathJax、设置、相册、面板拖拽调整 |
| `publish.js` | 独立 Node 脚本——执行 `hexo generate`，git 提交并推送源码和 `public/` 目录 |
| `config.json` | 用户可编辑的配置文件（hexoPath、gitRepo、分支、API 密钥等）。已提交到仓库，包含敏感信息。 |

### 渲染进程关键模式

- 文章存储在 `posts[]` 数组中。每篇文章包含 `id`（相对路径）、`content`（从磁盘惰性加载）、`dirty` 标记和 `isNew` 标记。
- `selectPost(id)` 在首次访问时惰性加载内容（`post.content === null`）。
- `saveCurrent()` 调用 `savePostFile`，如果标题变更可能导致文件重命名。主进程原子性地处理"写入新文件 + 删除旧文件"的逻辑。
- Markdown 编辑器使用透明 textarea 覆盖 pre 元素的方式实现：`<textarea>` 设置 `color: transparent` 但保留 `caret-color: #111`，后方 `<pre>` 显示语法高亮内容。滚动位置实时同步。
- `renderMarkdownPreview()` 是手写的 Markdown→HTML 渲染器（支持标题、代码块、引用、列表、行内格式、图片、链接、块级/行内数学公式）。MathJax 3 通过 CDN 加载，用于 LaTeX 公式渲染。

### 安全注意事项

- `config.json` 已提交到仓库，其中包含明文 API 密钥（`deepseekAPIKey`）。不要再向此文件添加更多敏感信息。
- 渲染进程有一个 `safeRequire()` 回退函数，会尝试 `require('fs')` 和 `require('electron')`——这仅在 `nodeIntegration: true` 时可用，而生产配置中为 `nodeIntegration: false`、`contextIsolation: true`。该回退仅为开发便利而存在。
- `ensureInsideDir()` 对所有接受用户输入相对路径的文件系统操作提供了路径穿越保护。
