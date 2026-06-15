/**
 * 2026 世界杯数据看板 - 后端代理服务器
 * 零依赖（仅 Node 内置模块），封装 skill 的 7 个脚本为 REST API
 *
 * 启动: node server.js   →   http://localhost:3000
 */

const http = require('http');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const url = require('url');

// ─── 配置 ────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
// skill 根目录：优先用项目内 skill-data（部署自包含），开发环境回退到外层 .agents
const SKILL_DIR = fs.existsSync(path.join(__dirname, 'skill-data', 'scripts'))
  ? path.join(__dirname, 'skill-data')
  : path.resolve(__dirname, '../.agents/skills/haizei-worldcup-2026-skill');
const SCRIPTS_DIR = path.join(SKILL_DIR, 'scripts');
const TIMEOUT_MS = 20000;

// ─── MIME 类型 ───────────────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// ─── 调用 skill 脚本的核心方法 ───────────────────────
// calculator.js 依赖 axios（skill 目录无 package.json），通过 NODE_PATH 让子进程能找到本项目的 node_modules
const PROJECT_MODULES = path.join(__dirname, 'node_modules');

function runScript(scriptName, args = []) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(SCRIPTS_DIR, scriptName);
    // cwd 设为 skill 根目录，保证脚本内 data/teams.json、scripts/lib/* 相对路径正确
    const child = execFile('node', [scriptPath, ...args], {
      cwd: SKILL_DIR,
      timeout: TIMEOUT_MS,
      maxBuffer: 5 * 1024 * 1024,
      env: {
        ...process.env,
        LANG: 'zh_CN.UTF-8',
        // 追加本项目的 node_modules 到 NODE_PATH（保留已有值）
        NODE_PATH: [PROJECT_MODULES, process.env.NODE_PATH].filter(Boolean).join(path.delimiter),
      },
    }, (err, stdout, stderr) => {
      if (err && !stdout) {
        // 进程级错误（超时/脚本不存在）
        const msg = err.killed ? `脚本执行超时（${TIMEOUT_MS / 1000}s）` : (stderr || err.message);
        return reject(new Error(msg));
      }
      const out = stdout.toString().trim();
      if (!out) {
        return reject(new Error('脚本无输出'));
      }
      // 尝试解析 JSON；失败则原样返回字符串
      try {
        resolve(JSON.parse(out));
      } catch (e) {
        resolve({ raw: out });
      }
    });
  });
}

// ─── 统一响应工具 ─────────────────────────────────────
function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function sendOk(res, data) { sendJson(res, 200, { ok: true, data }); }
function sendErr(res, message, status = 500) { sendJson(res, status, { ok: false, error: message }); }

// 安全解码 URL 参数（matchId 含 = / + 等字符）
function safeDecode(v) {
  try { return decodeURIComponent(v); } catch { return v; }
}

// ─── API 路由 ─────────────────────────────────────────
// 返回 handler 函数或 null
function routeApi(pathname, query) {
  let m;
  // 球队静态配置
  if (pathname === '/api/teams/list')         return () => runScript('worldcup-teams.js', ['list']);
  if (pathname === '/api/teams/info')         return () => runScript('worldcup-teams.js', ['info']);
  if (pathname === '/api/teams/hosts')        return () => runScript('worldcup-teams.js', ['hosts']);
  if (m = pathname.match(/^\/api\/teams\/group\/([A-L])$/))
    return () => runScript('worldcup-teams.js', ['group', m[1]]);
  if (m = pathname.match(/^\/api\/teams\/pot\/([1-4])$/))
    return () => runScript('worldcup-teams.js', ['pot', m[1]]);
  if (m = pathname.match(/^\/api\/teams\/find\/(.+)$/))
    return () => runScript('worldcup-teams.js', ['find', safeDecode(m[1])]);

  // 赛程
  if (pathname === '/api/schedule/today')     return () => runScript('worldcup-schedule.js', ['today']);
  if (pathname === '/api/schedule/tomorrow')  return () => runScript('worldcup-schedule.js', ['tomorrow']);
  if (pathname === '/api/schedule/dates')     return () => runScript('worldcup-schedule.js', ['dates']);
  if (pathname === '/api/schedule/stats')     return () => runScript('worldcup-schedule.js', ['stats']);
  if (m = pathname.match(/^\/api\/schedule\/date\/(\d{4}-\d{2}-\d{2})$/))
    return () => runScript('worldcup-schedule.js', ['date', m[1]]);
  if (m = pathname.match(/^\/api\/schedule\/group\/([A-L])$/))
    return () => runScript('worldcup-schedule.js', ['group', m[1]]);
  if (m = pathname.match(/^\/api\/schedule\/team\/(.+)$/))
    return () => runScript('worldcup-schedule.js', ['team', safeDecode(m[1])]);
  if (m = pathname.match(/^\/api\/schedule\/stage\/(.+)$/))
    return () => runScript('worldcup-schedule.js', ['stage', safeDecode(m[1])]);

  // 比赛详情
  if (m = pathname.match(/^\/api\/match\/([^/]+)\/(info|analysis|lineup|live|stats|odds)$/)) {
    const matchId = safeDecode(m[1]);
    const tab = m[2];
    return () => runScript('worldcup-match.js', [tab, matchId]);
  }

  // 球队详情
  if (m = pathname.match(/^\/api\/team\/([^/]+)\/(lookup|info|schedule|lineup|history|stats)$/)) {
    return () => runScript('worldcup-team.js', [m[2], safeDecode(m[1])]);
  }

  // 球员详情
  if (m = pathname.match(/^\/api\/player\/([^/]+)\/(info|news|stats|schedule)$/)) {
    return () => runScript('worldcup-player.js', [m[2], safeDecode(m[1])]);
  }

  // 排名
  if (pathname === '/api/rankings/categories') return () => runScript('worldcup-rankings.js', ['categories']);
  if (pathname === '/api/rankings/standings')  return () => runScript('worldcup-rankings.js', ['standings']);
  if (pathname === '/api/rankings/knockout')   return () => runScript('worldcup-rankings.js', ['knockout']);
  if (m = pathname.match(/^\/api\/rankings\/fifa\/?(\d*)$/)) {
    const args = ['fifa'];
    if (m[1]) args.push(m[1]);
    return () => runScript('worldcup-rankings.js', args);
  }
  if (m = pathname.match(/^\/api\/rankings\/players\/(.+)$/)) {
    const args = ['players', safeDecode(m[1])];
    if (query.limit) args.push(query.limit);
    return () => runScript('worldcup-rankings.js', args);
  }

  // 体彩竞彩赔率
  if (pathname === '/api/odds/all') {
    // 计算器专用：拉取全部玩法（每场比赛含 had/hhad/crs/ttg/hafu 全部 pool）
    const args = ['--wc', '--json'];
    if (query.team) args.push('--team', query.team);
    if (query.date) args.push('--date', query.date);
    return () => runScript('worldcup-calculator.js', args);
  }
  // 按主客队名查找体彩赛事（比赛详情专用）：/api/odds/byTeams/德国/库拉索
  if (m = pathname.match(/^\/api\/odds\/byTeams\/([^/]+)\/([^/]+)$/)) {
    const home = safeDecode(m[1]), away = safeDecode(m[2]);
    return async () => {
      const data = await runScript('worldcup-calculator.js', ['--wc', '--json']);
      const matches = (data && data.matches) || [];
      // 精确匹配主客队名
      const found = matches.find(x => x.homeTeam === home && x.awayTeam === away)
        || matches.find(x => x.homeTeam.includes(home) || x.awayTeam.includes(away));
      return found || null;
    };
  }
  if (m = pathname.match(/^\/api\/odds\/(summary|had|hhad|crs|ttg|hafu|hilo)$/)) {
    const args = [m[1], '--wc', '--json'];
    if (query.team) args.push('--team', query.team);
    if (query.date) args.push('--date', query.date);
    return () => runScript('worldcup-calculator.js', args);
  }
  // 赔率历史
  if (m = pathname.match(/^\/api\/odds\/history\/([^/]+)\/(had|hhad|crs|ttg|hafu|hilo)$/)) {
    return () => runScript('worldcup-calculator.js', ['history', safeDecode(m[1]), m[2]]);
  }

  return null;
}

// ─── 静态文件服务 ─────────────────────────────────────
function serveStatic(req, res, pathname) {
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
  // 防目录穿越
  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendErr(res, 'Forbidden', 403);
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        // SPA fallback：未命中的非资源请求都返回 index.html
        if (!/\.\w+$/.test(pathname)) {
          fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (e2, d2) => {
            if (e2) return sendErr(res, 'Not Found', 404);
            res.writeHead(200, { 'Content-Type': MIME['.html'] });
            res.end(d2);
          });
          return;
        }
        return sendErr(res, 'Not Found', 404);
      }
      return sendErr(res, err.message, 500);
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      // 开发环境：禁用缓存，避免改文件后浏览器用旧版本
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    });
    res.end(data);
  });
}

// ─── 启动 HTTP 服务 ───────────────────────────────────
const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;
  const query = parsed.query || {};

  // 健康检查
  if (pathname === '/api/health') {
    const skillExists = fs.existsSync(SCRIPTS_DIR);
    return sendOk(res, {
      uptime: process.uptime(),
      skillDir: SKILL_DIR,
      skillFound: skillExists,
      node: process.version,
    });
  }

  // API 路由
  if (pathname.startsWith('/api/')) {
    const handler = routeApi(pathname, query);
    if (!handler) return sendErr(res, `未知 API: ${pathname}`, 404);
    try {
      const data = await handler();
      return sendOk(res, data);
    } catch (e) {
      console.error(`[API ERROR] ${pathname}:`, e.message);
      return sendErr(res, e.message);
    }
  }

  // 静态资源
  return serveStatic(req, res, pathname);
});

server.listen(PORT, () => {
  console.log('');
  console.log('  ⚽  2026 世界杯数据看板已启动');
  console.log('  ────────────────────────────────────');
  console.log(`  🌐  访问地址:  http://localhost:${PORT}`);
  console.log(`  📂  skill 目录: ${SKILL_DIR}`);
  console.log(`  🟢  Node ${process.version}  |  按 Ctrl+C 停止`);
  console.log('');
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`\n❌ 端口 ${PORT} 被占用，请关闭占用程序或使用 PORT=3001 node server.js\n`);
  } else {
    console.error('\n❌ 启动失败:', e.message, '\n');
  }
  process.exit(1);
});
