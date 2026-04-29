#!/usr/bin/env node
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * publish.js
 *
 * 用法:
 *   node publish.js /path/to/hexo \
 *     [--public-remote <git-url>] \
 *     [--public-branch <branch>] \
 *     [--source-branch <branch>] \
 *     [--commit-message <message>]
 *
 * 功能:
 * - 在指定的 hexo 站点目录运行 hexo generate（使用 npx hexo generate）
 * - 将源代码变更提交并 push 到源仓库（当前分支或 --source-branch 指定）
 * - 将 public/ 目录作为静态站点仓库提交并 push 到指定的远程仓库/分支
 *
 * 说明:
 * - 如果 public/ 已经是一个 git 仓库，则会直接提交并 push（默认分支可由 --public-branch 指定）
 * - 如果 public/ 不是一个 git 仓库，则需要提供 --public-remote 创建并推送到该远程
 */


function usageAndExit() {
    console.log('Usage: node publish.js /path/to/hexo [--public-remote <git-url>] [--public-branch <branch>] [--source-branch <branch>] [--commit-message <message>]');
    process.exit(1);
}

function parseArgs(argv) {
    const out = {
        hexoDir: null,
        publicRemote: null,
        publicBranch: 'gh-pages',
        sourceBranch: 'main',
        commitMessage: null,
    };

    const args = argv.slice(2);
    if (args.length === 0) usageAndExit();

    // first non-flag is hexoDir
    let i = 0;
    if (args[0] && !args[0].startsWith('--')) {
        out.hexoDir = args[0];
        i = 1;
    } else {
        usageAndExit();
    }

    while (i < args.length) {
        const a = args[i];
        if (a === '--public-remote') {
            out.publicRemote = args[i + 1];
            i += 2;
        } else if (a === '--public-branch') {
            out.publicBranch = args[i + 1];
            i += 2;
        } else if (a === '--source-branch') {
            out.sourceBranch = args[i + 1];
            i += 2;
        } else if (a === '--commit-message') {
            out.commitMessage = args[i + 1];
            i += 2;
        } else {
            // ignore unknown
            i++;
        }
    }

    return out;
}

function run(cmd, opts = {}) {
    const { cwd } = opts;
    return new Promise((resolve, reject) => {
        const p = exec(cmd, { cwd, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
            if (err) {
                const e = new Error(`Command failed: ${cmd}\n${stderr || err.message}`);
                e.stdout = stdout;
                e.stderr = stderr;
                return reject(e);
            }
            resolve({ stdout, stderr });
        });
        p.stdout && p.stdout.pipe(process.stdout);
        p.stderr && p.stderr.pipe(process.stderr);
    });
}

async function ensureDirExists(dir) {
    if (!fs.existsSync(dir)) {
        throw new Error(`目录不存在: ${dir}`);
    }
    const stat = fs.statSync(dir);
    if (!stat.isDirectory()) throw new Error(`不是目录: ${dir}`);
}

async function detectCurrentBranch(cwd) {
    try {
        const { stdout } = await run('git rev-parse --abbrev-ref HEAD', { cwd });
        return stdout.trim();
    } catch {
        return null;
    }
}

async function hasGitChanges(cwd) {
    const { stdout } = await run('git status --porcelain', { cwd });
    return stdout.trim().length > 0;
}

async function gitCommitAndPush(cwd, remote = 'origin', branch = null, message = null, initIfMissing = false) {
    // detect git repo
    const isGit = fs.existsSync(path.join(cwd, '.git'));
    if (!isGit && !initIfMissing) throw new Error(`目录不是 git 仓库: ${cwd}`);

    if (!isGit && initIfMissing) {
        await run('git init', { cwd });
        if (branch) {
            // create and switch to branch
            await run(`git checkout -b ${branch}`, { cwd });
        }
        if (remote) {
            await run(`git remote add origin ${remote}`, { cwd });
        }
    } else {
        // ensure branch
        if (branch) {
            const current = await detectCurrentBranch(cwd);
            if (current !== branch) {
                // try to switch or create
                try {
                    await run(`git checkout ${branch}`, { cwd });
                } catch {
                    await run(`git checkout -b ${branch}`, { cwd });
                }
            }
        }
        // ensure remote exists when a remote param is provided and .git exists but remote missing
        if (remote) {
            try {
                await run(`git remote get-url ${remote}`, { cwd });
            } catch {
                // add remote if missing
                await run(`git remote add ${remote} ${remote}`, { cwd }).catch(() => {});
            }
        }
    }

    // add all files
    await run('git add -A', { cwd });

    // commit if there are changes
    if (await hasGitChanges(cwd)) {
        const finalMsg = message || `Publish: ${new Date().toISOString()}`;
        await run(`git commit -m "${finalMsg.replace(/"/g, '\\"')}"`, { cwd });
        // push
        const pushBranch = branch || (await detectCurrentBranch(cwd)) || 'master';
        const pushRemote = remote || 'origin';
        // force push for static site updates can be optional; here we push normally
        await run(`git push ${pushRemote} ${pushBranch} --follow-tags`, { cwd });
        console.log(`[git] pushed ${cwd} -> ${pushRemote}/${pushBranch}`);
    } else {
        console.log('[git] no changes to commit in', cwd);
    }
}

async function main() {
    try {
        const opts = parseArgs(process.argv);
        const hexoDir = path.resolve(opts.hexoDir);
        await ensureDirExists(hexoDir);

        console.log('Hexo directory:', hexoDir);

        // Check public-remote early so we fail fast before hexo generate
        const publicDir = path.join(hexoDir, 'public');
        const publicIsGit = fs.existsSync(path.join(publicDir, '.git'));
        if (!publicIsGit && !opts.publicRemote) {
            throw new Error('请通过 --public-remote 提供远程仓库地址');
        }

        console.log('Generating site with hexo (using npx)...');

        // Run hexo generate using npx to ensure local or global installation works
        // We set NODE_ENV=production to ensure production mode if needed
        await run('npx --yes hexo generate', { cwd: hexoDir });

        console.log('Hexo generate completed.');

        // Commit and push source repository
        const sourceBranch = opts.sourceBranch || (await detectCurrentBranch(hexoDir)) || 'master';
        const sourceMsg = opts.commitMessage || `Source: update on ${new Date().toISOString()}`;
        try {
            console.log('Committing and pushing source repository...');
            await gitCommitAndPush(hexoDir, 'origin', sourceBranch, sourceMsg, false);
        } catch (err) {
            console.error('Warning: failed to push source repo:', err.message);
        }

        // Handle public directory
        if (!fs.existsSync(publicDir) || !fs.statSync(publicDir).isDirectory()) {
            throw new Error(`public 目录不存在: ${publicDir}`);
        }

        console.log('Preparing to push generated files in public/ ...');

        if (publicIsGit) {
            console.log('public/ already a git repo. Will commit & push.');
            const publicMsg = opts.commitMessage || `Site: update on ${new Date().toISOString()}`;
            try {
                await gitCommitAndPush(publicDir, 'origin', opts.publicBranch, publicMsg, false);
                // Force push public branch to overwrite remote history
                await run(`git push origin ${opts.publicBranch} --force`, { cwd: publicDir });
                console.log('public/ force pushed to branch', opts.publicBranch);
            } catch (err) {
                console.error('Error pushing public repo:', err.message);
                throw err;
            }
        } else {
            if (!opts.publicRemote) {
                throw new Error('public 目录不是 git 仓库；请通过 --public-remote 提供远程仓库地址以初始化并推送。');
            }
            // create a temporary clone: initialize, add remote, set branch, commit, and push (force)
            console.log('Initializing git in public/, adding remote and pushing...');

            // init, set branch, add remote, commit, push - force to overwrite history (common for static site deploy)
            await gitCommitAndPush(publicDir, opts.publicRemote, opts.publicBranch, opts.commitMessage || `Site: publish ${new Date().toISOString()}`, true);

            // When pushing newly initialized repo, often want to force push to ensure remote branch replaced
            try {
                await run(`git push -u origin ${opts.publicBranch} --force`, { cwd: publicDir });
                console.log('public/ pushed (force) to', opts.publicRemote, 'branch', opts.publicBranch);
            } catch (err) {
                console.error('Failed to force push public/:', err.message);
                throw err;
            }
        }

        console.log('Publish process completed successfully.');
    } catch (err) {
        console.error('Publish failed:', err.message || err);
        process.exit(1);
    }
}

if (require.main === module) main();