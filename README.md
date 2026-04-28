# Hexo Desktop Editor

![](image.png)

基于 Electron 的本地 Hexo 博客桌面管理工具。提供 Markdown 编辑器（实时预览 + AI 写作）、相册管理器、关于页面编辑和一键发布功能，所有操作直接作用于本地 Hexo 项目文件系统。

## 功能

- **博客编辑** — Markdown 编辑器（语法高亮 + 实时预览），支持 MathJax 数学公式
- **AI 写作** — 集成 DeepSeek，`Ctrl+I` 唤起，自动生成内容插入光标位置
- **相册管理** — 上传、重命名、删除图片，支持中文文件名
- **关于页面** — 独立的 Markdown 编辑 + 预览，编辑 `source/about/index.md`
- **一键发布** — 执行 `hexo generate` + Git 提交推送，实时显示日志
- **可配置** — 图形化设置界面，修改即时生效

## 环境要求

你需要已经有一个自己的hexo博客。

## 安装

windows可以直接下载安装程序安装。

如果想从源码开始，可以：
```bash
git clone
cd hexo-desktop-editor
npm install
npm start
```

## 配置

编辑 `config.json`：

```json
{
  "hexoPath": "E:/project/my-blog",
  "photoDir": "photos",
  "aboutDir": "about",
  "gitRepo": "git@github.com:username/username.github.io.git",
  "sourceBrance": "main",
  "publicBrance": "gh-pages",
  "commitMessage": "Update blog",
  "deepseekAPIKey": "sk-xxxxxxxxxxxxx"
}
```

| 字段 | 说明 | 必填 |
|------|------|------|
| `hexoPath` | Hexo 博客项目本地路径 | ✅ |
| `photoDir` | 相册目录（相对于 `source/`），不填则隐藏相册按钮 | ❌ |
| `aboutDir` | 关于目录（相对于 `source/`），不填则隐藏关于按钮 | ❌ |
| `gitRepo` | GitHub Pages 仓库地址 | 发布时需要 |
| `sourceBrance` | 源码分支名 | ❌ |
| `publicBrance` | 静态页面分支名 | ❌ |
| `commitMessage` | 发布提交信息 | ❌ |
| `deepseekAPIKey` | DeepSeek API 密钥，不填则无法使用 AI 功能 | ❌ |

## 启动

```bash
npm start
```

## 使用指南

### 博客编辑

- 左侧文章列表 → 点击切换文章
- 中间 Markdown 编辑器 → 右侧实时预览
- `Ctrl+S` 保存，支持标题变更自动重命名

### AI 写作

- 编辑器右下角可见"按 Ctrl+I 进入 AI 写作"
- `Ctrl+I` → 在光标附近弹出输入框
- 输入写作要求 → `Enter` 或点击 ⬆ 发送
- 生成内容自动插入光标位置

### 相册

- 顶栏点击"相册" → 上传 / 刷新图片
- 点击文件名 → 内联重命名
- 点击 ❌ → 二次确认后删除

### 关于页面

- 顶栏点击"关于" → Markdown 编辑器打开 `source/about/index.md`
- 编辑 + 实时预览 → 点击"保存"

### 发布

- 顶栏点击绿色"发布"按钮
- 自动执行 `hexo generate` → Git 提交源码 → 强制推送静态页面
- 终端风格黑色窗口实时显示日志

### 设置

- 修改配置后点击"保存" → 自动返回首页刷新

## 项目结构

```
hexo-desktop/
├── css/
│   └── shared.css          # 共享样式
├── js/
│   ├── shared.js           # 共享逻辑（导航、发布、Markdown 渲染）
│   ├── blog.js             # 博客编辑页
│   ├── photos.js           # 相册页
│   ├── about.js            # 关于页
│   └── publish.js          # 发布脚本（独立 CLI）
├── index.html              # 博客编辑页
├── photos.html             # 相册页
├── about.html              # 关于页
├── main.js                 # Electron 主进程
├── preload.js              # 上下文桥接
├── config.json             # 用户配置
└── package.json
```

## 技术栈

- Electron（多进程架构，`contextIsolation: true`）
- 原生 JS（无框架），透明 textarea + pre 叠层语法高亮
- 手写 Markdown → HTML 渲染器
- MathJax 3（LaTeX 数学公式）
- DeepSeek Chat API（AI 写作）

## 许可

MIT
