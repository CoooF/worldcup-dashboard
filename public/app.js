/* ============================================================
   2026 世界杯数据看板 - 前端逻辑
   ============================================================ */

// ─── 工具函数 ──────────────────────────────────────────
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

async function api(path) {
  const res = await fetch(path);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || '请求失败');
  return json.data;
}

function toast(msg, type = '') {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast ' + type;
  setTimeout(() => t.classList.add('hidden'), 2400);
}

function esc(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function empty(html, msg = '暂无数据', icon = '📭') {
  $(html).innerHTML = `<div class="empty"><div class="empty-icon">${icon}</div><div>${esc(msg)}</div></div>`;
}

function loading(html, msg = '加载中…') {
  $(html).innerHTML = `<div class="loading">${esc(msg)}</div>`;
}

function showError(container, msg) {
  $(container).innerHTML = `<div class="error-box">⚠ ${esc(msg)}</div>`;
}

// 球队国旗/Logo 缺省图
const TEAM_LOGO_FALLBACK = "data:image/svg+xml," + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" rx="6" fill="#2d333b"/><text x="20" y="26" font-size="16" text-anchor="middle" fill="#9aa5b1">⚽</text></svg>'
);

function teamLogo(url) {
  return url ? esc(url) : TEAM_LOGO_FALLBACK;
}

// 球队中文名 → ISO 国家代码（加载 SVG 国旗，兼容所有设备含 Windows）
const FLAG_CODES = {
  '墨西哥':'mx','韩国':'kr','捷克':'cz','南非':'za','加拿大':'ca','波黑':'ba',
  '卡塔尔':'qa','瑞士':'ch','巴西':'br','摩洛哥':'ma','海地':'ht','苏格兰':'gb-sct',
  '美国':'us','巴拉圭':'py','澳大利亚':'au','土耳其':'tr','德国':'de','库拉索':'cw',
  '科特迪瓦':'ci','厄瓜多尔':'ec','荷兰':'nl','日本':'jp','瑞典':'se','突尼斯':'tn',
  '比利时':'be','埃及':'eg','伊朗':'ir','新西兰':'nz','西班牙':'es','佛得角':'cv',
  '沙特阿拉伯':'sa','乌拉圭':'uy','法国':'fr','塞内加尔':'sn','伊拉克':'iq','挪威':'no',
  '阿根廷':'ar','阿尔及利亚':'dz','奥地利':'at','约旦':'jo','葡萄牙':'pt','刚果民主共和国':'cd',
  '乌兹别克斯坦':'uz','哥伦比亚':'co','英格兰':'gb-eng','克罗地亚':'hr','加纳':'gh','巴拿马':'pa',
};
// 返回 SVG 国旗图片 HTML（flagcdn.com 全球 CDN，所有设备统一显示）
function flag(name) {
  const code = FLAG_CODES[name];
  if (!code) return '🏳️';
  return `<img src="https://flagcdn.com/${code}.svg" alt="${esc(name)}" class="flag-img" loading="lazy" onerror="this.style.display='none'">`;
}

// 日期格式化为友好显示（今天/明天/周X）
function fmtDateLabel(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  const today = new Date(); today.setHours(0,0,0,0);
  const diff = Math.round((d - today) / 86400000);
  const weekday = ['周日','周一','周二','周三','周四','周五','周六'][d.getDay()];
  const md = `${d.getMonth()+1}月${d.getDate()}日`;
  if (diff === 0) return `今天 · ${md} ${weekday}`;
  if (diff === 1) return `明天 · ${md} ${weekday}`;
  if (diff === -1) return `昨天 · ${md} ${weekday}`;
  return `${md} ${weekday}`;
}

// 缓存：球队列表（用于下拉/搜索）
let TEAMS_CACHE = null;

// ─── Tab 切换 ──────────────────────────────────────────
function switchTab(name) {
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
  // 触发对应 Tab 的懒加载
  if (name === 'schedule') loadSchedule();
  else if (name === 'standings') loadStandings();
  else if (name === 'rankings') { /* 由内部 seg 控制 */ }
  else if (name === 'teams') initTeamsTab();
  else if (name === 'odds') loadOdds();
  else if (name === 'match') loadMatchList();
  else if (name === 'calc') initCalcTab();
}

$$('.tab').forEach(t => t.addEventListener('click', () => switchTab(t.dataset.tab)));
$('.brand').addEventListener('click', () => switchTab('schedule'));

// ─── Tab 1: 赛程 ───────────────────────────────────────
let scheduleMode = 'today';

$$('#schedule-seg .seg-btn').forEach(b => {
  b.addEventListener('click', () => {
    $$('#schedule-seg .seg-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    scheduleMode = b.dataset.mode;
    $('#schedule-date').classList.toggle('hidden', scheduleMode !== 'date');
    $('#schedule-group').classList.toggle('hidden', scheduleMode !== 'group');
  });
});

// 初始化小组下拉
async function initGroupSelect() {
  if (!$('#schedule-group').options.length > 1) {
    for (const g of ['A','B','C','D','E','F','G','H','I','J','K','L']) {
      const opt = document.createElement('option');
      opt.value = g; opt.textContent = g + ' 组';
      $('#schedule-group').appendChild(opt);
    }
  }
}
initGroupSelect();

$('#schedule-load').addEventListener('click', loadSchedule);

async function loadSchedule() {
  const wrap = '#schedule-list';
  loading(wrap);
  try {
    let path;
    if (scheduleMode === 'today') path = '/api/schedule/today';
    else if (scheduleMode === 'tomorrow') path = '/api/schedule/tomorrow';
    else if (scheduleMode === 'date') {
      const d = $('#schedule-date').value;
      if (!d) { toast('请选择日期', 'err'); $(wrap).innerHTML = ''; return; }
      path = `/api/schedule/date/${d}`;
    } else if (scheduleMode === 'group') {
      const g = $('#schedule-group').value;
      if (!g) { toast('请选择小组', 'err'); $(wrap).innerHTML = ''; return; }
      path = `/api/schedule/group/${g}`;
    }

    const data = await api(path);
    const list = Array.isArray(data) ? data : (data.matches || data.list || []);
    if (!list.length) { empty(wrap, '该筛选条件下暂无赛程'); return; }

    // 排序：按开赛时间
    list.sort((a, b) => (a.startTimeStamp || '').localeCompare(b.startTimeStamp || ''));

    // 按日期分组渲染
    const groups = {};
    list.forEach(m => {
      const k = m.date || '未知日期';
      (groups[k] = groups[k] || []).push(m);
    });
    const dates = Object.keys(groups).sort();
    let html = '';
    dates.forEach((dt, i) => {
      html += `<div class="date-group"><div class="date-group-head"><span class="date-group-label">📅 ${esc(fmtDateLabel(dt))}</span><span class="date-group-count">${groups[dt].length} 场</span></div><div class="match-grid">${groups[dt].map(m => renderMatchCard(m)).join('')}</div></div>`;
    });
    $(wrap).innerHTML = html;

    // 点击卡片 → 打开比赛详情
    $$('#schedule-list .match-card').forEach(c => {
      c.addEventListener('click', () => openMatchModal(c.dataset.matchId, c.dataset.home, c.dataset.away));
    });
  } catch (e) {
    showError(wrap, e.message);
  }
}

function renderMatchCard(m) {
  const status = m.statusId === '1' || m.status === '进行中' ? 'live'
    : m.statusId === '2' || m.status === '已结束' ? 'finished' : 'upcoming';
  const statusText = m.statusText || m.status || '';
  const score = m.scoreLine || `${m.homeScore || 0}-${m.awayScore || 0}`;
  const scoreDisplay = (m.statusId === '0' || m.status === '未开赛') ? `<span class="vs">VS</span>` : esc(score);
  const stageShort = (m.stage || '').replace('小组赛', '').trim() || m.stage || '';

  return `
    <div class="match-card status-${status}" data-match-id="${esc(m.matchId)}" data-home="${esc(m.homeTeam)}" data-away="${esc(m.awayTeam)}">
      <div class="match-meta">
        <span class="match-stage">${esc(stageShort)}</span>
        <span class="match-status ${status}">${status === 'live' ? '🔴 ' : ''}${esc(statusText)}</span>
      </div>
      <div class="match-teams">
        <div class="team-cell">
          <span class="team-flag">${flag(m.homeTeam)}</span>
          <span class="team-name">${esc(m.homeTeam)}</span>
        </div>
        <div class="match-score">${scoreDisplay}</div>
        <div class="team-cell">
          <span class="team-flag">${flag(m.awayTeam)}</span>
          <span class="team-name">${esc(m.awayTeam)}</span>
        </div>
      </div>
      <div class="match-footer">
        <span>🕐 ${esc(m.time || '')}</span>
        ${m.hot ? `<span class="hot">🔥 ${esc(m.hot)}</span>` : ''}
      </div>
    </div>`;
}

// ─── Tab 2 & 弹层：比赛详情 ────────────────────────────
// 比赛详情 Tab：加载近期比赛列表，点击在右侧展开详情
let MATCH_LIST_CACHE = null;
async function loadMatchList() {
  const wrap = '#match-list';
  if (MATCH_LIST_CACHE) { renderMatchList(); return; }
  loading(wrap, '加载近期比赛…');
  try {
    // 合并今日+明日+后日赛程（覆盖更多可查比赛）
    const [today, tomorrow, dayAfter] = await Promise.all([
      api('/api/schedule/today').catch(() => []),
      api('/api/schedule/tomorrow').catch(() => []),
      api('/api/schedule/date/' + getDateOffset(2)).catch(() => []),
    ]);
    let list = [...today, ...tomorrow, ...dayAfter];
    // 去重（按 matchId）
    const seen = new Set();
    list = list.filter(m => { if (seen.has(m.matchId)) return false; seen.add(m.matchId); return true; });
    list.sort((a, b) => (a.startTimeStamp || '').localeCompare(b.startTimeStamp || ''));
    MATCH_LIST_CACHE = list;
    if (!MATCH_LIST_CACHE.length) {
      empty(wrap, '近期暂无比赛', '📭');
      return;
    }
    renderMatchList();
    // 默认展开第一场未结束的（更可能体彩在售）
    const firstUpcoming = MATCH_LIST_CACHE.find(m => m.status !== '已结束') || MATCH_LIST_CACHE[0];
    loadMatchDetail(firstUpcoming.matchId, '#match-detail', { home: firstUpcoming.homeTeam, away: firstUpcoming.awayTeam });
  } catch (e) {
    showError(wrap, e.message);
  }
}

// 获取 N 天后的日期 YYYY-MM-DD
function getDateOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function renderMatchList() {
  const wrap = '#match-list';
  if (!MATCH_LIST_CACHE || !MATCH_LIST_CACHE.length) {
    $(wrap).innerHTML = '<div class="calc-empty">暂无比赛</div>';
    return;
  }
  $(wrap).innerHTML = MATCH_LIST_CACHE.map(m => renderMatchCard(m)).join('');
  $$('#match-list .match-card').forEach(c => {
    c.addEventListener('click', () => {
      // 高亮选中
      $$('#match-list .match-card').forEach(x => x.classList.remove('selected-match'));
      c.classList.add('selected-match');
      loadMatchDetail(c.dataset.matchId, '#match-detail', { home: c.dataset.home, away: c.dataset.away });
    });
  });
}

$('#match-load').addEventListener('click', () => {
  const id = $('#match-id-input').value.trim();
  if (!id) { toast('请输入 matchId', 'err'); return; }
  switchTab('match');
  loadMatchDetail(id, '#match-detail');
});

async function openMatchModal(matchId, home, away) {
  $('#modal-body').innerHTML = '<div class="loading">加载比赛详情…</div>';
  $('#match-modal').classList.remove('hidden');
  await loadMatchDetail(matchId, '#modal-body', { home, away });
}

$('#modal-close').addEventListener('click', () => $('#match-modal').classList.add('hidden'));
$('.modal-mask', $('#match-modal'))?.addEventListener('click', () => $('#match-modal').classList.add('hidden'));

async function loadMatchDetail(matchId, container, hints = {}) {
  loading(container);
  try {
    const [info, analysisRes, statsRes] = await Promise.allSettled([
      api(`/api/match/${encodeURIComponent(matchId)}/info`),
      api(`/api/match/${encodeURIComponent(matchId)}/analysis`),
      api(`/api/match/${encodeURIComponent(matchId)}/stats`),
    ]);

    let html = '';
    if (info.status === 'fulfilled') html += renderMatchHeader(info.value, hints);
    else html += `<div class="card"><div class="error-box">基本信息加载失败：${esc(info.reason.message)}</div></div>`;

    if (analysisRes.status === 'fulfilled') html += renderAnalysis(analysisRes.value, info.value);
    if (statsRes.status === 'fulfilled') html += renderMatchStats(statsRes.value);

    // 体彩竞彩赔率（按主客队名查找，仅在体彩在售时显示）
    const homeName = info.status === 'fulfilled' ? (info.value.homeTeam || {}).name : hints.home;
    const awayName = info.status === 'fulfilled' ? (info.value.awayTeam || {}).name : hints.away;
    if (homeName && awayName) {
      try {
        const sportteryMatch = await api(`/api/odds/byTeams/${encodeURIComponent(homeName)}/${encodeURIComponent(awayName)}`);
        if (sportteryMatch) html += renderSportteryOdds(sportteryMatch);
      } catch (e) { /* 体彩无此场，不显示赔率 */ }
    }

    if (!html) html = '<div class="empty"><div class="empty-icon">⚠</div>无数据</div>';
    $(container).innerHTML = html;
  } catch (e) {
    showError(container, e.message);
  }
}

function renderMatchHeader(info, hints) {
  const h = info.homeTeam || {};
  const a = info.awayTeam || {};
  const homeName = h.name || hints.home || '主队';
  const awayName = a.name || hints.away || '客队';
  const score = info.vs || '';
  return `
    <div class="match-header">
      <div class="stage-label">${esc(info.matchDesc || info.matchStage || '')}</div>
      <div class="teams-row">
        <div class="big-team">
          ${h.logo ? `<img src="${esc(h.logo)}" alt="" />` : ''}
          <div class="nm">${esc(homeName)}</div>
          <div class="rk">${esc(h.rank || '')}</div>
        </div>
        <div class="big-score">${score ? esc(score) : 'VS'}</div>
        <div class="big-team">
          ${a.logo ? `<img src="${esc(a.logo)}" alt="" />` : ''}
          <div class="nm">${esc(awayName)}</div>
          <div class="rk">${esc(a.rank || '')}</div>
        </div>
      </div>
      <div class="match-time-info">
        ${esc(info.dateFormat || info.time || '')} · ${esc(info.matchStatusText || info.status || '')}
        ${info.winner ? `· 🏆 ${esc(info.winner)} 胜` : ''}
      </div>
    </div>`;
}

function renderAnalysis(analysis, info) {
  const h = (info && info.homeTeam) || {};
  const a = (info && info.awayTeam) || {};
  const homeName = h.name || '主队';
  const awayName = a.name || '客队';

  let html = '<div class="card"><div class="card-title"><span class="ico">🤖</span> AI 预测分析</div>';

  // 胜率预测
  const p = analysis.prediction || {};
  if (p.homeWinRate || p.awayWinRate) {
    const homeRate = parseFloat(p.homeWinRate) || 0;
    const awayRate = parseFloat(p.awayWinRate) || 0;
    const drawRate = Math.max(0, 100 - homeRate - awayRate);
    html += `
      <div class="prediction-box">
        <div class="pred-side home">
          <div class="pred-team">${esc(homeName)}</div>
          <div class="pred-pct">${esc(p.homeWinRate || '0%')}</div>
        </div>
        <div class="pred-side"><div class="pred-team">平局</div><div class="pred-pct" style="color:var(--text-dim)">${drawRate.toFixed(0)}%</div></div>
        <div class="pred-side away">
          <div class="pred-team">${esc(awayName)}</div>
          <div class="pred-pct">${esc(p.awayWinRate || '0%')}</div>
        </div>
      </div>
      <div class="pred-bar">
        <div style="width:${homeRate}%;background:var(--primary)"></div>
        <div style="width:${drawRate}%;background:var(--text-muted)"></div>
        <div style="width:${awayRate}%;background:var(--blue)"></div>
      </div>`;
    if (p.similarOddsHistory) {
      html += `<div class="hint" style="margin-top:8px">📊 相似赔率历史：主胜 ${esc(p.similarOddsHistory.homeWin || '-')} · 平 ${esc(p.similarOddsHistory.draw || '-')} · 客胜 ${esc(p.similarOddsHistory.awayWin || '-')}（样本 ${esc(p.sampleSize || '-')}）</div>`;
    }
  }

  // 网友投票
  const g = analysis.guess;
  if (g && g.options && g.options.length) {
    html += `<h4 style="margin:16px 0 8px;font-size:13px;color:var(--text-dim)">🗳 网友投票（共 ${esc(g.total || 0)} 票）</h4>`;
    html += '<div style="display:flex;flex-direction:column;gap:8px">';
    g.options.forEach(opt => {
      const pct = parseFloat(opt.percentage) || 0;
      html += `
        <div>
          <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px">
            <span>${esc(opt.name)}</span><span style="font-family:var(--mono)">${esc(opt.percentage)} (${esc(opt.count)})</span>
          </div>
          <div style="height:6px;background:var(--card-2);border-radius:3px;overflow:hidden">
            <div style="height:100%;width:${pct}%;background:${opt.name === '平局' ? 'var(--text-muted)' : 'var(--gold)'}"></div>
          </div>
        </div>`;
    });
    html += '</div>';
  }

  // 情报
  if (Array.isArray(analysis.intelligence) && analysis.intelligence.length) {
    html += `<h4 style="margin:16px 0 8px;font-size:13px;color:var(--text-dim)">📰 赛事情报</h4>`;
    analysis.intelligence.forEach(ig => {
      html += `<div style="margin-bottom:10px"><div style="font-weight:600;font-size:13px;margin-bottom:4px">${esc(ig.title || '')}</div>`;
      if (Array.isArray(ig.homeTeamPoints)) {
        html += `<div style="font-size:12px;color:var(--primary)">✓ ${esc(homeName)}：${ig.homeTeamPoints.join('；')}</div>`;
      }
      if (Array.isArray(ig.awayTeamPoints)) {
        html += `<div style="font-size:12px;color:var(--blue)">✓ ${esc(awayName)}：${ig.awayTeamPoints.join('；')}</div>`;
      }
      html += '</div>';
    });
  }

  // 历史交锋
  if (Array.isArray(analysis.records) && analysis.records.length) {
    html += `<h4 style="margin:16px 0 8px;font-size:13px;color:var(--text-dim)">📜 历史交锋</h4>`;
    analysis.records.forEach(r => {
      html += `<div style="font-size:12px;color:var(--text-dim);margin-bottom:6px">${esc(r.title || '')}: ${Array.isArray(r.probability) ? r.probability.join(' / ') : ''}</div>`;
    });
  }

  html += '</div>';
  return html;
}

function renderMatchStats(stats) {
  if (!stats || !Array.isArray(stats.items) || !stats.items.length) return '';
  let html = `<div class="card"><div class="card-title"><span class="ico">📈</span> 技术统计 · ${esc(stats.homeTeam || '')} vs ${esc(stats.awayTeam || '')}</div>`;
  stats.items.forEach(it => {
    const home = parseFloat(it.home) || 0;
    const away = parseFloat(it.away) || 0;
    // 控球率直接用值；否则按比例
    let homePct, awayPct;
    if (it.name.includes('率')) {
      homePct = home; awayPct = away;
    } else {
      const total = home + away || 1;
      homePct = (home / total) * 100;
      awayPct = (away / total) * 100;
    }
    html += `
      <div style="margin-bottom:12px">
        <div class="stat-item-label">${esc(it.name)}</div>
        <div class="stat-bar">
          <div class="bar-home" style="width:${homePct}%">${homePct >= 15 ? home : ''}</div>
          <div class="bar-away" style="width:${awayPct}%">${awayPct >= 15 ? away : ''}</div>
        </div>
      </div>`;
  });
  html += '</div>';
  return html;
}

// 体彩竞彩赔率展示（胜平负/让球/比分/总进球/混关）
function renderSportteryOdds(m) {
  const pools = m.pools || [];
  if (!pools.length) return '';
  let html = `<div class="card"><div class="card-title"><span class="ico">🎟️</span> 体彩竞彩赔率 <span class="tag-warn" style="margin-left:auto">官方 · sporttery.cn</span></div>`;

  // 胜平负 + 让球（并排）
  const had = pools.find(p => p.poolCode === 'had');
  const hhad = pools.find(p => p.poolCode === 'hhad');
  if (had || hhad) {
    html += '<div class="odds-dual">';
    if (had) html += renderHadBlock(had, m, '胜平负', false);
    if (hhad) html += renderHadBlock(hhad, m, '让球胜平负', true);
    html += '</div>';
  }

  // 比分
  const crs = pools.find(p => p.poolCode === 'crs');
  if (crs && crs.scores) {
    const keys = Object.keys(crs.scores);
    html += `<h4 class="odds-sub-title">🎯 比分赔率（${keys.length} 种）</h4>`;
    html += '<div class="odds-grid-crs">';
    keys.sort((a, b) => {
      const pa = a.split(':'), pb = b.split(':');
      if (pa.length !== 2) return 0;
      return (parseInt(pa[0]) - parseInt(pb[0])) || (parseInt(pa[1]) - parseInt(pb[1]));
    }).forEach(k => {
      html += `<div class="crs-cell"><div class="sc">${esc(k)}</div><div class="od">${esc(crs.scores[k])}</div></div>`;
    });
    html += '</div>';
  }

  // 总进球
  const ttg = pools.find(p => p.poolCode === 'ttg');
  if (ttg && ttg.goals) {
    const order = ['0','1','2','3','4','5','6','7+'];
    const keys = Object.keys(ttg.goals).sort((a, b) => order.indexOf(a) - order.indexOf(b));
    html += `<h4 class="odds-sub-title">⚽ 总进球</h4>`;
    html += '<div class="ttg-bar">';
    keys.forEach(k => {
      html += `<div class="ttg-item"><div class="g">${esc(k)}</div><div class="o">${esc(ttg.goals[k])}</div></div>`;
    });
    html += '</div>';
  }

  // 混合过关
  const hafu = pools.find(p => p.poolCode === 'hafu');
  if (hafu && hafu.options) {
    const labels = ['胜胜','胜平','胜负','平胜','平平','平负','负胜','负平','负负'];
    html += `<h4 class="odds-sub-title">🔀 混合过关（半场/全场）</h4>`;
    html += '<div class="odds-grid-crs">';
    labels.forEach(l => {
      html += `<div class="crs-cell"><div class="sc">${l}</div><div class="od">${esc(hafu.options[l] || '-')}</div></div>`;
    });
    html += '</div>';
  }

  html += '</div>';
  return html;
}

// 胜平负/让球 单块
function renderHadBlock(pool, m, title, isHhad) {
  const gl = isHhad && pool.goalLine !== '' && pool.goalLine != null ? `（主队让 ${esc(pool.goalLine)}）` : '';
  const single = pool.single == 1 ? '<span class="tag-warn">单关</span>' : '';
  return `<div class="odds-block">
    <div class="odds-block-title">${esc(title)}${gl} ${single}</div>
    <div class="odds-options">
      <div class="odds-opt"><div class="label">${esc(m.homeTeam)}</div><div class="val">${esc(pool.homeWin || '-')}</div></div>
      <div class="odds-opt"><div class="label">平局</div><div class="val">${esc(pool.draw || '-')}</div></div>
      <div class="odds-opt"><div class="label">${esc(m.awayTeam)}</div><div class="val">${esc(pool.awayWin || '-')}</div></div>
    </div>
  </div>`;
}

// ─── Tab 3: 积分榜 ─────────────────────────────────────
async function loadStandings() {
  const wrap = '#standings-list';
  if ($(wrap).children.length) return; // 已加载
  loading(wrap);
  try {
    const data = await api('/api/rankings/standings');
    const groups = data.groups || [];
    if (!groups.length) { empty(wrap, '暂无积分榜数据'); return; }

    $(wrap).innerHTML = groups.map((g, idx) => renderStandingsGroup(g, idx)).join('');
  } catch (e) {
    showError(wrap, e.message);
  }
}

function renderStandingsGroup(g, idx) {
  const groupName = String.fromCharCode(65 + idx); // A, B, ...
  const list = g.list || [];
  const rows = list.map(t => {
    const cls = t.isQualified ? 'qualified' : (t.isRelegated ? 'relegated' : '');
    return `
      <tr class="${cls}">
        <td class="team-td">
          <div class="standings-team-cell">
            ${t.teamLogo ? `<img src="${esc(t.teamLogo)}" alt="" />` : ''}
            <span>${esc(t.teamName)}</span>
          </div>
        </td>
        <td>${esc(t.played || '-')}</td>
        <td>${esc(t.winDrawLoss || '-')}</td>
        <td>${esc(t.goals || '-')}</td>
        <td class="points">${esc(t.points || '-')}</td>
      </tr>`;
  }).join('');

  return `
    <div class="standings-group">
      <h3><span class="group-badge">${groupName}</span> 第 ${idx + 1} 组</h3>
      <table class="standings-table">
        <thead><tr>
          <th class="team-th">球队</th><th>场次</th><th>胜/平/负</th><th>进/失</th><th>积分</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

// ─── Tab 4: 排名 ───────────────────────────────────────
$$('#rankings-seg .seg-btn').forEach(b => {
  b.addEventListener('click', () => {
    $$('#rankings-seg .seg-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    const mode = b.dataset.mode;
    $('#rankings-fifa-panel').classList.toggle('hidden', mode !== 'fifa');
    $('#rankings-players-panel').classList.toggle('hidden', mode !== 'players');
    if (mode === 'fifa') loadFifa();
    else loadPlayerCatAndList();
  });
});

$('#fifa-load').addEventListener('click', loadFifa);
async function loadFifa() {
  const n = $('#fifa-n').value || 30;
  loading('#fifa-table');
  try {
    const data = await api(`/api/rankings/fifa/${n}`);
    const list = data.rankings || [];
    if (!list.length) { empty('#fifa-table', '暂无 FIFA 排名', '🌍'); return; }
    $('#fifa-table').innerHTML = `
      <div class="hint" style="margin-bottom:10px">${esc(data.text || '')}</div>
      <table class="data-table">
        <thead><tr><th>排名</th><th>球队</th><th class="num">积分</th><th class="center">变化</th></tr></thead>
        <tbody>
          ${list.map(t => {
            const ch = parseInt(t.positionChanged) || 0;
            const chCls = ch > 0 ? 'change-up' : (ch < 0 ? 'change-down' : 'change-flat');
            const chSym = ch > 0 ? '▲' : (ch < 0 ? '▼' : '–');
            const rk = parseInt(t.rank) || 0;
            const rkCls = rk === 1 ? 'r1' : rk === 2 ? 'r2' : rk === 3 ? 'r3' : 'rn';
            return `<tr>
              <td><span class="rank-badge ${rkCls}">${esc(t.rank)}</span></td>
              <td><div class="team-row-cell">${t.logo ? `<img src="${esc(t.logo)}" alt="" />` : ''}<span>${esc(t.teamName)}</span></div></td>
              <td class="num">${esc(t.points)}</td>
              <td class="center ${chCls}">${chSym} ${ch !== 0 ? Math.abs(ch) : ''}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;
  } catch (e) {
    showError('#fifa-table', e.message);
  }
}

async function loadPlayerCatAndList() {
  // 加载分类
  if (!$('#player-cat').options.length) {
    try {
      const cats = await api('/api/rankings/categories');
      cats.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c; opt.textContent = c;
        $('#player-cat').appendChild(opt);
      });
    } catch (e) { /* ignore */ }
  }
  loadPlayers();
}
$('#player-load').addEventListener('click', loadPlayers);

async function loadPlayers() {
  const cat = $('#player-cat').value || '进球';
  const n = $('#player-n').value || 20;
  loading('#players-table');
  try {
    const data = await api(`/api/rankings/players/${encodeURIComponent(cat)}?limit=${n}`);
    const list = data.players || [];
    if (!list.length) { empty('#players-table', `暂无「${cat}」榜数据（赛事进行中后丰富）`, '⚽'); return; }
    $('#players-table').innerHTML = `
      <div class="hint" style="margin-bottom:10px">${esc(data.statsName || cat)} · 共 ${list.length} 人</div>
      <table class="data-table">
        <thead><tr><th>排名</th><th>球员</th><th>球队</th><th>位置</th><th class="num">${esc(cat)}</th></tr></thead>
        <tbody>
          ${list.map(p => {
            const rk = parseInt(p.rank) || 0;
            const rkCls = rk === 1 ? 'r1' : rk === 2 ? 'r2' : rk === 3 ? 'r3' : 'rn';
            return `<tr>
              <td><span class="rank-badge ${rkCls}">${esc(p.rank)}</span></td>
              <td><a href="#" data-pid="${esc(p.playerId)}" class="player-link">${esc(p.playerName)}</a></td>
              <td>${esc(p.team || '-')}</td>
              <td>${esc(p.position || '-')}</td>
              <td class="num">${esc(p.score || p.penaltyValue || '-')}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;
    // 球员链接
    $$('#players-table .player-link').forEach(a => {
      a.addEventListener('click', (e) => { e.preventDefault(); openPlayerModal(a.dataset.pid); });
    });
  } catch (e) {
    showError('#players-table', e.message);
  }
}

// ─── Tab 5: 球队/球员 ──────────────────────────────────
let currentTeamTab = 'info';
async function initTeamsTab() {
  // 加载球队列表
  if (!TEAMS_CACHE) {
    try {
      TEAMS_CACHE = await api('/api/teams/list');
      const sel = $('#team-select');
      sel.innerHTML = '<option value="">选择球队…</option>';
      TEAMS_CACHE.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.teamName;
        opt.textContent = `${t.group}组 · ${t.teamName}${t.isHost ? ' 🏠' : ''}`;
        sel.appendChild(opt);
      });
    } catch (e) {
      $('#team-detail').innerHTML = `<div class="error-box">球队列表加载失败：${esc(e.message)}</div>`;
    }
  }
}

$('#team-select').addEventListener('change', () => loadTeamDetail($('#team-select').value, currentTeamTab));
$$('#team-tabs .seg-btn').forEach(b => {
  b.addEventListener('click', () => {
    $$('#team-tabs .seg-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    currentTeamTab = b.dataset.tab;
    const team = $('#team-select').value;
    if (team) loadTeamDetail(team, currentTeamTab);
  });
});

async function loadTeamDetail(teamName, tab) {
  if (!teamName) { $('#team-detail').innerHTML = '<div class="empty"><div class="empty-icon">👆</div>请从上方选择球队</div>'; return; }
  loading('#team-detail');
  try {
    if (tab === 'info') {
      const data = await api(`/api/team/${encodeURIComponent(teamName)}/info`);
      $('#team-detail').innerHTML = renderTeamInfo(data);
    } else if (tab === 'lineup') {
      const data = await api(`/api/team/${encodeURIComponent(teamName)}/lineup`);
      $('#team-detail').innerHTML = renderTeamLineup(data);
      bindPlayerLinks('#team-detail');
    } else if (tab === 'history') {
      const data = await api(`/api/team/${encodeURIComponent(teamName)}/history`);
      $('#team-detail').innerHTML = renderTeamHistory(data);
    }
  } catch (e) {
    showError('#team-detail', e.message);
  }
}

function renderTeamInfo(data) {
  const base = (data.baseInfo && data.baseInfo.items) || [];
  const honors = (data.honor && data.honor.awards) || [];

  let html = '<div class="card"><div class="card-title"><span class="ico">📋</span> 球队资料</div>';
  html += '<div class="info-list">';
  base.forEach(it => {
    html += `<div class="info-item"><div class="k">${esc(it.name)}</div><div class="v">${esc(it.content)}</div></div>`;
  });
  html += '</div></div>';

  if (honors.length) {
    html += '<div class="card"><div class="card-title"><span class="ico">🏆</span> 荣誉墙</div><div class="honor-grid">';
    honors.forEach(h => {
      const yrs = Array.isArray(h.years) ? h.years.join(' · ') : '';
      html += `<div class="honor-item"><div class="title">🏅 ${esc(h.title)}</div><div class="years">${esc(yrs)}</div></div>`;
    });
    html += '</div></div>';
  }
  return html;
}

function renderTeamLineup(data) {
  let html = '<div class="card"><div class="card-title"><span class="ico">👥</span> 球队阵容</div>';

  // 教练组
  const coaches = data.coaching || data.coaches || [];
  if (coaches.length) {
    html += '<h4 style="font-size:13px;color:var(--text-dim);margin-bottom:10px">👔 教练组</h4><div class="info-list" style="margin-bottom:18px">';
    coaches.forEach(c => {
      html += `<div class="info-item"><div class="k">${esc(c.subTitle || c.role || '')}</div><div class="v">${esc(c.name)}</div></div>`;
    });
    html += '</div>';
  }

  // 球员
  const groups = data.players || data.playerGroups || [];
  if (groups.length) {
    html += '<div class="lineup-grid">';
    groups.forEach(pg => {
      const title = pg.position || pg.title || '';
      const players = pg.players || [];
      html += `<div class="lineup-side"><h4>${esc(title)} <span class="formation-tag">${players.length}人</span></h4>`;
      players.forEach(p => {
        html += `<div class="player-row" data-pid="${esc(p.playerId || '')}">
          <span class="player-num">${esc(p.number || '-')}</span>
          <span>${esc(p.name)}</span>
          <span class="player-pos">${esc(p.court || p.position || '')} ${p.club ? '· ' + esc(p.club) : ''} ${p.value ? '· ' + esc(p.value) : ''}</span>
        </div>`;
      });
      html += '</div>';
    });
    html += '</div>';
  } else {
    html += '<div class="empty"><div class="empty-icon">📭</div>阵容数据暂未公布</div>';
  }
  html += '</div>';
  return html;
}

function bindPlayerLinks(container) {
  $$(container + ' .player-row[data-pid]').forEach(r => {
    if (r.dataset.pid) {
      r.addEventListener('click', () => openPlayerModal(r.dataset.pid));
    }
  });
}

function renderTeamHistory(data) {
  const records = data.records || [];
  if (!records.length) return '<div class="card"><div class="empty"><div class="empty-icon">📭</div>暂无历史成绩</div></div>';
  let html = '<div class="card"><div class="card-title"><span class="ico">📚</span> 历届世界杯成绩</div><div class="timeline">';
  records.forEach(r => {
    html += `<div class="timeline-item">
      <div class="season">${esc(r.season)}</div>
      <div class="desc">${esc(r.description || '')}</div>
    </div>`;
  });
  html += '</div></div>';
  return html;
}

// ─── 球员详情弹层 ──────────────────────────────────────
// 当前打开的球员（供对比按钮使用）
let CURRENT_PLAYER = null;
async function openPlayerModal(playerId) {
  if (!playerId) return;
  CURRENT_PLAYER = { id: playerId, name: '' };
  $('#player-body').innerHTML = '<div class="loading">加载球员详情…</div>';
  $('#player-modal').classList.remove('hidden');
  try {
    const data = await api(`/api/player/${encodeURIComponent(playerId)}/info`);
    CURRENT_PLAYER.name = (data.wiki && data.wiki.nickName) || '球员';
    $('#player-body').innerHTML = renderPlayerInfo(data, playerId);
    // 绘制雷达图
    if (data.ability && data.ability.radarDims) {
      setTimeout(() => drawRadar(data.ability), 50);
    }
  } catch (e) {
    $('#player-body').innerHTML = `<div class="error-box">球员详情加载失败：${esc(e.message)}</div>`;
  }
}
// 球员对比按钮（事件委托，因为按钮在动态生成的弹层里）
$('#player-body').addEventListener('click', (e) => {
  const btn = e.target.closest('#player-compare-add');
  if (btn && CURRENT_PLAYER) {
    addToCompare('player', CURRENT_PLAYER.id, CURRENT_PLAYER.name);
  }
});
$('#player-close').addEventListener('click', () => $('#player-modal').classList.add('hidden'));

function renderPlayerInfo(data, playerId) {
  const cmpBtn = playerId ? `<button class="btn" id="player-compare-add" style="margin-bottom:14px">⊕ 加入对比</button>` : '';
  const wiki = data.wiki || {};
  const ability = data.ability || {};
  const honors = data.honor || data.honorRecords || [];
  const transfer = data.transfer || {};

  let html = cmpBtn + '<div class="card"><div class="card-title"><span class="ico">⚽</span> 球员资料</div>';
  if (wiki.nickName || wiki.num) {
    html += `<div style="font-size:22px;font-weight:800;margin-bottom:4px">${esc(wiki.nickName || wiki.name || '球员')} ${wiki.num ? '#' + esc(wiki.num) : ''}</div>`;
  }
  const detail = wiki.detail || {};
  html += '<div class="info-list" style="margin-top:12px">';
  const kv = [
    ['位置', detail.position], ['年龄', detail.age], ['身高', wiki.height],
    ['体重', wiki.weight], ['惯用脚', detail.heavyFoot], ['国籍', detail.national],
  ];
  kv.forEach(([k, v]) => { if (v) html += `<div class="info-item"><div class="k">${k}</div><div class="v">${esc(v)}</div></div>`; });
  html += '</div></div>';

  // 能力雷达
  if (ability.radarDims && ability.radarDims.length) {
    html += `<div class="card"><div class="card-title"><span class="ico">🎯</span> 能力评分 ${ability.overall ? `<span style="color:${esc(ability.overallColor || 'var(--gold)')};font-family:var(--mono);font-size:18px;margin-left:auto">${esc(ability.overall)}</span>` : ''}</div>
      <div class="radar-wrap"><canvas id="radar-canvas" width="320" height="320"></canvas></div></div>`;
  }

  // 荣誉
  if (honors.length) {
    html += '<div class="card"><div class="card-title"><span class="ico">🏆</span> 荣誉</div><div class="honor-grid">';
    honors.slice(0, 12).forEach(h => {
      const title = typeof h === 'string' ? h : (h.title || h.name || '');
      const years = h.years ? (Array.isArray(h.years) ? h.years.join(' · ') : h.years) : '';
      html += `<div class="honor-item"><div class="title">🏅 ${esc(title)}</div>${years ? `<div class="years">${esc(years)}</div>` : ''}</div>`;
    });
    html += '</div></div>';
  }

  // 转会记录
  if (transfer.list && transfer.list.length) {
    html += `<div class="card"><div class="card-title"><span class="ico">💸</span> 转会历史（身价单位：${esc(transfer.unit || '')}）</div>
      <table class="data-table"><thead><tr><th>日期</th><th>转出</th><th>转入</th><th class="num">身价</th></tr></thead><tbody>`;
    transfer.list.forEach(t => {
      html += `<tr><td>${esc(t.date || '')}</td><td>${esc(t.outTeam || '-')}</td><td>${esc(t.team || '-')}</td><td class="num">${esc(t.price || '-')}</td></tr>`;
    });
    html += '</tbody></table></div>';
  }

  return html;
}

// 雷达图绘制
function drawRadar(ability) {
  const canvas = $('#radar-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const cx = W / 2, cy = H / 2;
  const R = Math.min(W, H) / 2 - 40;
  const dims = ability.radarDims || [];
  const n = dims.length;
  if (n < 3) return;

  ctx.clearRect(0, 0, W, H);

  // 网格
  ctx.strokeStyle = '#2d333b';
  ctx.lineWidth = 1;
  for (let level = 1; level <= 5; level++) {
    const r = (R / 5) * level;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const ang = -Math.PI / 2 + (Math.PI * 2 * i) / n;
      const x = cx + Math.cos(ang) * r;
      const y = cy + Math.sin(ang) * r;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
  }
  // 轴线
  for (let i = 0; i < n; i++) {
    const ang = -Math.PI / 2 + (Math.PI * 2 * i) / n;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(ang) * R, cy + Math.sin(ang) * R);
    ctx.stroke();
  }

  // 数据多边形
  ctx.fillStyle = 'rgba(59, 167, 118, 0.25)';
  ctx.strokeStyle = '#3ba776';
  ctx.lineWidth = 2;
  ctx.beginPath();
  dims.forEach((d, i) => {
    const val = parseFloat(d.value) || 0;
    const r = (Math.min(val, 100) / 100) * R;
    const ang = -Math.PI / 2 + (Math.PI * 2 * i) / n;
    const x = cx + Math.cos(ang) * r;
    const y = cy + Math.sin(ang) * r;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // 标签
  ctx.fillStyle = '#9aa5b1';
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  dims.forEach((d, i) => {
    const ang = -Math.PI / 2 + (Math.PI * 2 * i) / n;
    const x = cx + Math.cos(ang) * (R + 22);
    const y = cy + Math.sin(ang) * (R + 22);
    ctx.fillText(d.name, x, y);
    ctx.fillStyle = '#e6edf3';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText(d.value, x, y + 14);
    ctx.fillStyle = '#9aa5b1';
    ctx.font = '12px sans-serif';
  });
}

// ─── Tab 6: 竞彩赔率 ───────────────────────────────────
let oddsPlay = 'summary';
$$('#odds-seg .seg-btn').forEach(b => {
  b.addEventListener('click', () => {
    $$('#odds-seg .seg-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    oddsPlay = b.dataset.play;
  });
});
$('#odds-load').addEventListener('click', loadOdds);

async function loadOdds() {
  const wrap = '#odds-list';
  loading(wrap);
  try {
    const params = new URLSearchParams();
    const team = $('#odds-team').value.trim();
    const date = $('#odds-date').value;
    if (team) params.set('team', team);
    if (date) params.set('date', date);
    const qs = params.toString() ? ('?' + params.toString()) : '';

    const data = await api(`/api/odds/${oddsPlay}${qs}`);
    $(wrap).innerHTML = renderOdds(data, oddsPlay);
  } catch (e) {
    showError(wrap, e.message);
  }
}

function renderOdds(data, play) {
  // --json 模式返回 {lastUpdateTime, matches: [...]}；兜底 raw 文本
  const updateTime = data.lastUpdateTime || '';
  let list = Array.isArray(data) ? data : (data.matches || data.list || []);
  if (!list.length && data.raw) {
    return `<div class="card"><pre style="white-space:pre-wrap;font-size:12px;color:var(--text-dim)">${esc(data.raw)}</pre></div>`;
  }
  if (!list.length) return '<div class="empty"><div class="empty-icon">🎰</div>暂无可投注的世界杯赛事</div>';

  let html = updateTime ? `<div class="hint" style="margin-bottom:12px">🕒 赔率更新时间：${esc(updateTime)} · 共 ${list.length} 场可投注</div>` : '';
  html += list.map(m => renderOddsMatch(m, play)).join('');
  return html;
}

function renderOddsMatch(m, play) {
  let body = '';
  const home = m.homeTeam || m.home || '';
  const away = m.awayTeam || m.away || '';
  const pools = m.pools || [];

  // 头部：单关标记取所有 pool 的 single 字段
  const anySingle = pools.some(p => p.single == 1 || p.single === true);

  let head = `
    <div class="odds-head">
      <div>
        <div class="odds-teams">${esc(home)} ${m.homeRank ? `<span class="hint">${esc(m.homeRank)}</span>` : ''} <span style="color:var(--text-muted)">vs</span> ${esc(away)} ${m.awayRank ? `<span class="hint">${esc(m.awayRank)}</span>` : ''}</div>
        <div class="odds-meta">${esc(m.date || '')} ${esc(m.time || '')} ${m.league ? '· ' + esc(m.league) : ''}<span class="num-badge">${esc(m.matchNum || m.matchId || '')}</span></div>
      </div>
      ${anySingle ? '<span class="tag-warn">支持单关</span>' : ''}
    </div>`;

  if (play === 'summary') {
    // 概览：遍历该场所有玩法，各取关键赔率展示
    if (!pools.length) {
      body = '<div class="hint">该场暂无玩法数据</div>';
    } else {
      body = '<div class="info-list">';
      pools.forEach(p => {
        const summary = poolSummary(p);
        body += `<div class="info-item"><div class="k">${esc(p.name || p.poolCode)}</div><div class="v" style="font-size:12px;font-family:var(--mono)">${esc(summary)}</div></div>`;
      });
      body += '</div>';
    }
  } else {
    // 指定玩法：从 pools 中找匹配的
    const pool = pools.find(p => p.poolCode === play);
    if (!pool) {
      body = `<div class="hint">该场不支持「${esc(playName(play))}」玩法</div>`;
    } else if (play === 'had' || play === 'hhad') {
      body = renderHad(pool, m);
    } else if (play === 'crs') {
      body = renderCrs(pool);
    } else if (play === 'ttg') {
      body = renderTtg(pool);
    } else if (play === 'hafu') {
      body = renderHafu(pool);
    }
  }

  return `<div class="odds-card">${head}${body}</div>`;
}

function playName(code) {
  return { had: '胜平负', hhad: '让球胜平负', crs: '比分', ttg: '总进球', hafu: '混合过关', hilo: '大小球' }[code] || code;
}

function poolSummary(p) {
  if (p.homeWin) return `主${p.homeWin} / 平${p.draw || '-'} / 客${p.awayWin || '-'}`;
  if (p.scores) return `${Object.keys(p.scores).length} 种比分`;
  if (p.goals) return `${Object.keys(p.goals).length} 档总进球`;
  if (p.options) return `${Object.keys(p.options).length} 种组合`;
  return '-';
}

function trendHTML(t) {
  // 体彩 trend: "1"=升, "-1"=降, "0"=不变
  if (t === '1' || t === 1) return '<span class="change-up">↑</span>';
  if (t === '-1' || t === -1) return '<span class="change-down">↓</span>';
  return '<span class="change-flat">–</span>';
}

function renderHad(pool, m) {
  const gl = pool.goalLine && pool.goalLine !== '' ? `让球 ${esc(pool.goalLine)}` : '';
  const singleTag = (pool.single == 1 || pool.single === true) ? 'single' : '';
  return `
    ${gl ? `<div class="hint" style="margin-bottom:8px;color:var(--gold)">⚽ ${gl}</div>` : ''}
    <div class="odds-options">
      <div class="odds-opt ${singleTag}">
        <div class="label">${esc(m.homeTeam || '主胜')}</div>
        <div class="val">${esc(pool.homeWin || '-')}</div>
        <div class="trend">${trendHTML(pool.homeTrend)}</div>
      </div>
      <div class="odds-opt">
        <div class="label">平</div>
        <div class="val">${esc(pool.draw || '-')}</div>
        <div class="trend">${trendHTML(pool.drawTrend)}</div>
      </div>
      <div class="odds-opt ${singleTag}">
        <div class="label">${esc(m.awayTeam || '客胜')}</div>
        <div class="val">${esc(pool.awayWin || '-')}</div>
        <div class="trend">${trendHTML(pool.awayTrend)}</div>
      </div>
    </div>`;
}

function renderCrs(pool) {
  const scores = pool.scores || {};
  const keys = Object.keys(scores);
  if (!keys.length) return '<div class="hint">无比分赔率数据</div>';
  // 按主队进球数分组排序
  keys.sort((a, b) => {
    const pa = a.split(':'), pb = b.split(':');
    if (pa.length !== 2) return 0;
    return (parseInt(pa[0]) - parseInt(pb[0])) || (parseInt(pa[1]) - parseInt(pb[1]));
  });
  return `<div class="hint" style="margin-bottom:8px">${keys.length} 种比分赔率</div>
    <div class="odds-grid-crs">
      ${keys.map(k => `<div class="crs-cell"><div class="sc">${esc(k)}</div><div class="od">${esc(scores[k])}</div></div>`).join('')}
    </div>`;
}

function renderTtg(pool) {
  const goals = pool.goals || {};
  const order = ['0', '1', '2', '3', '4', '5', '6', '7+'];
  const keys = Object.keys(goals).sort((a, b) => order.indexOf(a) - order.indexOf(b));
  if (!keys.length) return '<div class="hint">无总进球数据</div>';
  return `<div class="hint" style="margin-bottom:8px">总进球数赔率</div>
    <div class="ttg-bar">
      ${keys.map(k => `<div class="ttg-item"><div class="g">${esc(k)}</div><div class="o">${esc(goals[k])}</div></div>`).join('')}
    </div>`;
}

function renderHafu(pool) {
  // options: {胜胜, 胜平, ...} 半场结果+全场结果
  const opts = pool.options || {};
  const labels = ['胜胜', '胜平', '胜负', '平胜', '平平', '平负', '负胜', '负平', '负负'];
  if (!Object.keys(opts).length) return '<div class="hint">无混合过关数据</div>';
  return `<div class="hint" style="margin-bottom:8px">半场 / 全场 9 种组合（前=半场结果，后=全场结果）</div>
    <div class="odds-grid-crs">
      ${labels.map(l => `<div class="crs-cell"><div class="sc">${l}</div><div class="od">${esc(opts[l] || '-')}</div></div>`).join('')}
    </div>`;
}

// ─── 刷新按钮 ──────────────────────────────────────────
$('#refreshBtn').addEventListener('click', () => {
  const active = $('.tab.active')[0]?.dataset.tab;
  // 清空缓存重载
  $('#standings-list').innerHTML = '';
  TEAMS_CACHE = null;
  resetCalc();
  if (active) switchTab(active);
  toast('已刷新', 'ok');
});

// ─── ESC 关闭弹层 ──────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    $('#match-modal').classList.add('hidden');
    $('#player-modal').classList.add('hidden');
  }
});

// ============================================================
// 竞彩计算器 & 购买建议
// ============================================================

// 选择的投注项（数组，每项: {key, match, poolCode, option, odds, label}）
// key = matchId|poolCode|option，支持同一场选不同玩法
let CALC_SELECTIONS = [];
// 已加载的比赛列表缓存
let CALC_MATCHES = null;
// 每场比赛当前展开的玩法 tab: { matchId: poolCode }
let CALC_PLAY_TAB = {};
// 当前展开的比赛 matchId（手风琴，单展开）
let CALC_EXPANDED = null;
// 日期筛选状态
let CALC_DATE_FILTER = 'all';
// 折叠的日期分组 Set
let CALC_COLLAPSED_DATES = new Set();

// 玩法定义（顺序即标签顺序）
const CALC_PLAYS = [
  { code: 'had',  name: '胜平负' },
  { code: 'hhad', name: '让球' },
  { code: 'ttg',  name: '总进球' },
  { code: 'crs',  name: '比分' },
  { code: 'hafu', name: '混关' },
];

$('#calc-load-matches').addEventListener('click', () => { CALC_MATCHES = null; CALC_SELECTIONS = []; CALC_PLAY_TAB = {}; CALC_EXPANDED = null; CALC_DATE_FILTER = 'all'; CALC_COLLAPSED_DATES = new Set(); initCalcTab(); });
// 日期筛选容器事件委托
$('#calc-date-filter').addEventListener('click', (e) => {
  const btn = e.target.closest('.seg-btn');
  if (!btn) return;
  $$('#calc-date-filter .seg-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  CALC_DATE_FILTER = btn.dataset.date;
  renderCalcMatches();
});
$('#calc-stake').addEventListener('input', renderCalcResult);

async function initCalcTab() {
  const wrap = '#calc-matches';
  if (CALC_MATCHES) { renderCalcMatches(); renderCalcResult(); renderAdvice(); return; }
  loading(wrap, '加载世界杯可投注赛事…');
  $('#calc-advice').innerHTML = renderAdviceIntro();
  try {
    // 拉取全部玩法（每场比赛含 had/hhad/crs/ttg/hafu）
    const data = await api('/api/odds/all');
    CALC_MATCHES = data.matches || [];
    if (!CALC_MATCHES.length) { empty(wrap, '暂无可投注的世界杯赛事', '🎰'); return; }
    // 默认每场展开第一个可用玩法
    CALC_MATCHES.forEach(m => {
      const codes = (m.pools || []).map(p => p.poolCode);
      CALC_PLAY_TAB[m.matchId] = CALC_PLAYS.find(p => codes.includes(p.code))?.code || 'had';
    });
    // 生成日期筛选按钮
    const dates = [...new Set(CALC_MATCHES.map(m => m.date))].sort();
    const filterWrap = $('#calc-date-filter');
    // 保留"全部"按钮，清掉其余
    filterWrap.innerHTML = '<button class="seg-btn active" data-date="all">全部</button>';
    dates.forEach(dt => {
      const md = dt.slice(5).replace('-', '/');
      const b = document.createElement('button');
      b.className = 'seg-btn'; b.dataset.date = dt; b.textContent = md;
      filterWrap.appendChild(b);
    });
    renderCalcMatches();
    renderAdviceIntro();
    renderCalcResult();
  } catch (e) {
    showError(wrap, e.message);
  }
}

function renderCalcMatches() {
  const wrap = '#calc-matches';
  if (!CALC_MATCHES || !CALC_MATCHES.length) {
    $(wrap).innerHTML = '<div class="calc-empty" style="padding:30px;text-align:center;color:var(--text-muted)">点击「刷新赛事」加载</div>';
    return;
  }
  // 按日期分组
  const groups = {};
  CALC_MATCHES.forEach(m => {
    if (CALC_DATE_FILTER !== 'all' && m.date !== CALC_DATE_FILTER) return;
    const k = m.date || '未知';
    (groups[k] = groups[k] || []).push(m);
  });
  const dates = Object.keys(groups).sort();
  if (!dates.length) { $(wrap).innerHTML = '<div class="calc-empty" style="padding:30px;text-align:center;color:var(--text-muted)">该日期无比赛</div>'; return; }

  let html = '';
  dates.forEach(dt => {
    const collapsed = CALC_COLLAPSED_DATES.has(dt) ? 'collapsed' : '';
    html += `<div class="calc-date-group ${collapsed}" data-date="${esc(dt)}">`;
    html += `<div class="calc-date-head" data-date="${esc(dt)}"><span class="calc-date-arrow">▼</span>📅 ${esc(fmtDateLabel(dt))} <span class="calc-date-count">${groups[dt].length} 场</span></div>`;
    html += '<div class="calc-date-body">';
    groups[dt].forEach(m => { html += renderMatchCompact(m); });
    html += '</div></div>';
  });
  $(wrap).innerHTML = html;
  bindCalcEvents();
}

// 紧凑比赛行（折叠态）+ 展开态
function renderMatchCompact(m) {
  const mk = m.matchId;
  const pools = m.pools || [];
  const availableCodes = pools.map(p => p.poolCode);
  const isExpanded = String(CALC_EXPANDED) === String(mk);
  const hasPick = CALC_SELECTIONS.some(s => String(s.match.matchId) === String(mk));

  // 玩法小圆点（显示哪些玩法可选/已选）
  const poolDots = CALC_PLAYS.filter(p => availableCodes.includes(p.code)).map(p => {
    const picked = CALC_SELECTIONS.some(s => String(s.match.matchId) === String(mk) && s.poolCode === p.code);
    return `<span class="mc-pool-dot ${picked ? 'has' : ''}" title="${esc(p.name)}">${esc(p.name[0])}</span>`;
  }).join('');

  // 紧凑行
  let html = `<div class="calc-match-compact ${isExpanded ? 'expanded' : ''} ${hasPick ? 'has-pick' : ''}" data-mk="${mk}">
    <span class="mc-flag">${flag(m.homeTeam)}</span>
    <span class="mc-teams">${esc(m.homeTeam)} <span class="vs">vs</span> ${esc(m.awayTeam || '')}</span>
    <span class="mc-time">${esc((m.time || '').slice(0,5))}</span>
    <span class="mc-pools">${poolDots}</span>
    <span class="mc-arrow">▶</span>
  </div>`;

  // 展开态：完整对阵 + 玩法标签 + 选项
  if (isExpanded) {
    const activePlay = CALC_PLAY_TAB[mk] || availableCodes[0] || 'had';
    const activePool = pools.find(p => p.poolCode === activePlay);
    const tabsHtml = CALC_PLAYS.filter(p => availableCodes.includes(p.code)).map(p => {
      const picked = CALC_SELECTIONS.some(s => String(s.match.matchId) === String(mk) && s.poolCode === p.code);
      return `<button class="calc-play-tab ${p.code === activePlay ? 'active' : ''} ${picked ? 'has-pick' : ''}" data-mk="${mk}" data-play="${p.code}">${p.name}</button>`;
    }).join('');
    const optionsHtml = activePool ? renderPlayOptions(mk, activePool, m) : '<div class="hint" style="padding:10px">该玩法暂无数据</div>';
    html += `<div class="calc-match-expand" data-mk="${mk}">
      <div class="calc-vs">
        <div class="calc-vs-team"><span class="team-flag-lg">${flag(m.homeTeam)}</span><span class="calc-vs-name">${esc(m.homeTeam)}</span></div>
        <div class="calc-vs-time">${esc((m.time || '').slice(0,5))}</div>
        <div class="calc-vs-team"><span class="team-flag-lg">${flag(m.awayTeam)}</span><span class="calc-vs-name">${esc(m.awayTeam || '')}</span></div>
      </div>
      <div class="calc-play-tabs">${tabsHtml}</div>
      <div class="calc-options">${optionsHtml}</div>
    </div>`;
  }
  return html;
}

// 统一绑定计算器内事件（紧凑行展开/折叠 + 玩法切换 + 选项选择）
function bindCalcEvents() {
  // 日期分组折叠
  $$('#calc-matches .calc-date-head').forEach(h => {
    h.addEventListener('click', () => {
      const dt = h.dataset.date;
      if (CALC_COLLAPSED_DATES.has(dt)) CALC_COLLAPSED_DATES.delete(dt);
      else CALC_COLLAPSED_DATES.add(dt);
      h.closest('.calc-date-group').classList.toggle('collapsed');
    });
  });
  // 紧凑行点击 → 手风琴展开/折叠
  $$('#calc-matches .calc-match-compact').forEach(row => {
    row.addEventListener('click', () => {
      const mk = row.dataset.mk;
      CALC_EXPANDED = (String(CALC_EXPANDED) === String(mk)) ? null : mk;
      renderCalcMatches();
    });
  });
  // 玩法切换
  $$('#calc-matches .calc-play-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      e.stopPropagation();
      CALC_PLAY_TAB[tab.dataset.mk] = tab.dataset.play;
      renderCalcMatches();
    });
  });
  // 选项选择
  $$('#calc-matches .calc-odds-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleCalcSelection(btn);
    });
  });
}

// 根据玩法定义选项网格
function renderPlayOptions(mk, pool, m) {
  const code = pool.poolCode;
  if (code === 'had' || code === 'hhad') {
    const gl = (code === 'hhad' && pool.goalLine !== '' && pool.goalLine != null) ? pool.goalLine : '';
    const glNote = gl ? `<div class="hint" style="grid-column:1/-1;font-size:11px;color:var(--gold);margin-bottom:2px">⚽ 主队让球 ${esc(gl)}</div>` : '';
    // 选项 label 统一用 主胜/平局/客胜，副标题显示球队名
    return `<div class="calc-options grid3" style="padding:0">${glNote}
      ${calcOddsBtn(mk, code, '主胜', pool.homeWin, pool.homeTrend, false, m.homeTeam)}
      ${calcOddsBtn(mk, code, '平局', pool.draw, pool.drawTrend)}
      ${calcOddsBtn(mk, code, '客胜', pool.awayWin, pool.awayTrend, false, m.awayTeam)}
    </div>`;
  }
  if (code === 'ttg') {
    const goals = pool.goals || {};
    const order = ['0','1','2','3','4','5','6','7+'];
    const keys = Object.keys(goals).sort((a,b) => order.indexOf(a) - order.indexOf(b));
    return `<div class="calc-options grid8" style="padding:0">
      ${keys.map(k => calcOddsBtn(mk, code, k + '球', goals[k], '0')).join('')}
    </div>`;
  }
  if (code === 'crs') {
    const scores = pool.scores || {};
    const keys = Object.keys(scores).sort((a,b) => {
      const pa = a.split(':'), pb = b.split(':');
      if (pa.length !== 2) return 0;
      return (parseInt(pa[0])-parseInt(pb[0])) || (parseInt(pa[1])-parseInt(pb[1]));
    });
    return `<div class="calc-options gridCrs" style="padding:0">
      ${keys.map(k => calcOddsBtn(mk, code, k, scores[k], '0', true)).join('')}
    </div>`;
  }
  if (code === 'hafu') {
    const opts = pool.options || {};
    const labels = ['胜胜','胜平','胜负','平胜','平平','平负','负胜','负平','负负'];
    return `<div class="calc-options grid9" style="padding:0">
      ${labels.map(l => calcOddsBtn(mk, code, l, opts[l] || '0', '0')).join('')}
    </div>`;
  }
  return '<div class="hint">未知玩法</div>';
}

function calcOddsBtn(matchKey, poolCode, label, odds, trend, compact, sub) {
  const o = parseFloat(odds) || 0;
  const prob = o > 0 ? (100 / o).toFixed(0) : '-';
  const selKey = `${matchKey}|${poolCode}|${label}`;
  const selected = CALC_SELECTIONS.some(s => s.key === selKey);
  const cls = selected ? 'selected' : '';
  const tr = calcTrend(trend);
  const probHtml = compact ? '' : `<span class="opt-prob">隐含 ${prob}%</span>`;
  const subHtml = sub ? `<span class="opt-sub">${esc(sub)}</span>` : '';
  return `<button class="calc-odds-btn ${cls}" data-mk="${matchKey}" data-pool="${poolCode}" data-option="${esc(label)}" data-odds="${odds}">
    <span class="opt-label">${esc(label)} ${tr}</span>
    ${subHtml}
    <span class="opt-val">${esc(odds)}</span>
    ${probHtml}
  </button>`;
}

function calcTrend(t) {
  if (t === '1' || t === 1) return '<span class="change-up" style="font-size:9px">↑</span>';
  if (t === '-1' || t === -1) return '<span class="change-down" style="font-size:9px">↓</span>';
  return '';
}

// 切换选择（同一场可选不同玩法，但同一玩法同一选项为单选切换）
function toggleCalcSelection(btn) {
  const mk = btn.dataset.mk;
  const poolCode = btn.dataset.pool;
  const option = btn.dataset.option;
  const odds = parseFloat(btn.dataset.odds) || 0;
  const m = CALC_MATCHES.find(x => String(x.matchId) === mk);
  if (!m) return;

  const key = `${mk}|${poolCode}|${option}`;
  const idx = CALC_SELECTIONS.findIndex(s => s.key === key);

  if (idx >= 0) {
    // 已选 → 取消
    CALC_SELECTIONS.splice(idx, 1);
  } else {
    // 同一玩法内切换（同 poolCode 同 option 唯一，这里允许同一场不同玩法并存）
    CALC_SELECTIONS.push({ key, match: m, poolCode, option, odds, label: option });
  }
  renderCalcMatches();
  renderCalcResult();
  renderAdvice();
}

// ─── 计算逻辑 ──────────────────────────────────────────
function renderCalcResult() {
  const sel = CALC_SELECTIONS;
  const n = sel.length;
  $('#calc-bet-count').textContent = `已选 ${n} 注`;

  const wrap = '#calc-result';
  if (n === 0) {
    $(wrap).innerHTML = '<div class="calc-empty">👆 从左侧比赛选择选项，不同比赛可串关</div>';
    return;
  }

  const stake = parseFloat($('#calc-stake').value) || 0;
  // 按比赛分组
  const byMatch = {};
  sel.forEach(s => {
    const mk = s.match.matchId;
    (byMatch[mk] = byMatch[mk] || []).push(s);
  });
  const matchIds = Object.keys(byMatch);
  const matchCount = matchIds.length;

  // 明细行
  const rows = sel.map(s => `
    <div class="calc-result-row">
      <span class="k">${esc(s.match.homeTeam)} vs ${esc(s.match.awayTeam)} <span class="hint">[${esc(playName(s.poolCode))}]</span> → <b style="color:var(--text)">${esc(s.label)}</b></span>
      <span class="v">@ ${esc(s.odds.toFixed(2))}</span>
    </div>`).join('');

  let mode, totalOdds, payout, profit, impliedPct, extraInfo = '';

  if (matchCount === 1) {
    // 只涉及 1 场比赛 → 全部是独立单关（同场不能串）
    mode = `${n} 注独立单关`;
    // 单关：每注分别算，本金分摊到每注
    const perStake = stake;  // 每注都按本金算（各自独立）
    let totalPayout = 0;
    sel.forEach(s => { totalPayout += perStake * s.odds; });
    payout = totalPayout;
    profit = payout - stake * n;
    totalOdds = sel.reduce((a, s) => a + s.odds, 0);  // 单关合计赔率（相加，非相乘）
    // 全中概率 = 任一中（用最高单注概率展示更直观）
    impliedPct = Math.max(...sel.map(s => s.odds > 0 ? 100/s.odds : 0)).toFixed(1);
    extraInfo = `<div class="calc-result-row"><span class="k" style="color:var(--gold)">⚠ 同场比赛不能串关，每注为独立单关</span></div>`;
  } else {
    // 涉及多场比赛 → 过关（每场取一注串）
    // 若某场有多注，提示需每场只保留一注才能过关
    const multiPickMatch = matchIds.find(mk => byMatch[mk].length > 1);
    if (multiPickMatch) {
      extraInfo = `<div class="calc-result-row"><span class="k" style="color:var(--gold)">⚠ 「${esc(byMatch[multiPickMatch][0].match.homeTeam)}」选了多注，过关时每场仅取 1 注。建议同场只选 1 个。</span></div>`;
    }
    // 过关：每场取第一注（或所有注都算独立过关组合，这里简化为每场首注串联）
    // 更合理：展示"每场取1注的标准过关"
    const onePerMatch = matchIds.map(mk => byMatch[mk][0]);  // 每场取首注
    mode = `${matchCount} 串 1 过关`;
    totalOdds = onePerMatch.reduce((a, s) => a * s.odds, 1);
    let impliedProb = 1;
    onePerMatch.forEach(s => { if (s.odds > 0) impliedProb *= (1 / s.odds); });
    impliedPct = (impliedProb * 100).toFixed(2);
    payout = stake * totalOdds;
    profit = payout - stake;
  }

  $(wrap).innerHTML = `
    <div class="calc-result-box">
      ${rows}
      <div class="calc-result-row">
        <span class="k">玩法模式</span>
        <span class="v">${mode}</span>
      </div>
      ${extraInfo}
      <div class="calc-result-row">
        <span class="k">${matchCount === 1 ? '单关合计赔率' : '组合总赔率'}</span>
        <span class="v" style="color:var(--gold)">${totalOdds.toFixed(2)}</span>
      </div>
      <div class="calc-result-row">
        <span class="k">${matchCount === 1 ? '最高单注概率' : '全中概率'}</span>
        <span class="v">${impliedPct}%</span>
      </div>
      <div class="calc-result-row">
        <span class="k">本金${matchCount === 1 ? `（${n}注×¥${stake}）` : ''}</span>
        <span class="v">¥ ${(matchCount === 1 ? stake * n : stake).toFixed(2)}</span>
      </div>
      <div class="calc-result-total">
        <span class="total-label">${matchCount === 1 ? '全中合计奖金' : '全中奖金'}</span>
        <span>
          <span class="total-val">¥ ${payout.toFixed(2)}</span>
          <span class="profit ${profit >= 0 ? 'up' : 'down'}">${profit >= 0 ? '+' : ''}${profit.toFixed(2)}</span>
        </span>
      </div>
    </div>`;
}

// ─── 购买建议 ──────────────────────────────────────────
function renderAdviceIntro() {
  $('#calc-advice').innerHTML = `
    <div class="disclaimer-bar"><span class="ico">⚠</span><span>以下建议基于赔率隐含概率的数学分析，<b>不构成任何投注建议</b>。竞彩有风险，请理性参与，量力而行。</span></div>
    <div class="calc-empty">选择比赛后，这里会基于赔率显示价值分析与风险提示</div>`;
}

function renderAdvice() {
  const sel = CALC_SELECTIONS;
  const n = sel.length;
  if (n === 0) { renderAdviceIntro(); return; }

  let html = '<div class="disclaimer-bar"><span class="ico">⚠</span><span>以下建议基于赔率隐含概率的数学分析，<b>不构成任何投注建议</b>。竞彩有风险，请理性参与，量力而行。</span></div>';

  // 1. 每场选择的隐含概率分析 + 该场返还率
  sel.forEach(s => {
    html += renderMatchAdvice(s);
  });

  // 2. 组合整体建议
  html += renderComboAdvice(sel);

  $('#calc-advice').innerHTML = html;
}

function renderMatchAdvice(s) {
  const m = s.match;
  const pool = (m.pools || []).find(p => p.poolCode === s.poolCode);
  if (!pool) return '';

  // 根据玩法提取 [label, odds] 选项列表
  const optsList = getPoolOptions(pool);
  if (!optsList.length) return '';

  // 返还率 = 1 / Σ(1/odds)
  const sumInv = optsList.reduce((acc, [, o]) => acc + (o > 0 ? 1/o : 0), 0);
  const rtp = sumInv > 0 ? (1 / sumInv) : 0;
  const rtpPct = (rtp * 100).toFixed(1);

  // 本选项的真实概率（去抽水后）
  const myOdds = s.odds;
  const myFairProb = sumInv > 0 ? ((myOdds > 0 ? 1/myOdds : 0) / sumInv) : 0;

  // 最低赔率选项（最被看好）
  const sorted = [...optsList].sort((a, b) => a[1] - b[1]);
  const fav = sorted[0];
  const isFav = fav && fav[0] === s.option;

  // 建议分级（通用规则，适用于所有玩法）
  let level, badge, title, body;
  const playLabel = playName(s.poolCode);

  if (myOdds > 0 && myOdds < 1.4) {
    level = 'caution'; badge = 'yellow';
    title = `[${esc(playLabel)}] ${esc(s.option)} @ ${myOdds.toFixed(2)} · 低赔热门`;
    body = `该选项被高度看好（真实概率 ${(myFairProb*100).toFixed(0)}%），但赔率偏低，¥100 仅赢 ¥${((myOdds-1)*100).toFixed(0)}，单关收益有限。适合作为过关稳胆。`;
  } else if (isFav && myOdds >= 1.4 && myOdds <= 2.5) {
    level = 'recommend'; badge = 'green';
    title = `[${esc(playLabel)}] ${esc(s.option)} @ ${myOdds.toFixed(2)} · 合理看好`;
    body = `本选项是${esc(playLabel)}玩法中赔率最低的热门（真实概率 ${(myFairProb*100).toFixed(0)}%），胜率与回报相对平衡，较稳妥。`;
  } else if (myOdds > 6) {
    level = 'risk'; badge = 'red';
    title = `[${esc(playLabel)}] ${esc(s.option)} @ ${myOdds.toFixed(2)} · 冷门高赔`;
    body = `该选项真实概率仅 ${(myFairProb*100).toFixed(0)}%，属于冷门。回报高但命中率低，不建议单关，可少量博冷。`;
  } else if (myOdds >= 2.5 && myOdds <= 6) {
    level = 'recommend'; badge = 'green';
    title = `[${esc(playLabel)}] ${esc(s.option)} @ ${myOdds.toFixed(2)} · 价值区间`;
    body = `赔率处于 2.5-6.0 的价值区间，真实概率 ${(myFairProb*100).toFixed(0)}%。胜率与回报较平衡，若判断该结果确有可能，是性价比不错的选择。`;
  } else {
    level = 'caution'; badge = 'yellow';
    title = `[${esc(playLabel)}] ${esc(s.option)} @ ${myOdds.toFixed(2)}`;
    body = `真实概率 ${(myFairProb*100).toFixed(0)}%，返还率 ${rtpPct}%。`;
  }

  // 隐含概率对比条（显示该玩法所有选项，高亮选中项）
  const bars = optsList.map(([lab, o]) => {
    const p = o > 0 ? (1/o/sumInv*100) : 0;
    const hl = lab === s.option;
    const color = hl ? 'var(--primary)' : 'var(--border-light)';
    return `<div style="display:flex;align-items:center;gap:6px;font-size:10px;margin-top:2px">
      <span style="width:54px;color:var(--text-muted);${hl ? 'color:var(--primary);font-weight:600' : ''}">${esc(lab)}</span>
      <div class="prob-bar-mini" style="flex:1"><div style="width:${p}%;background:${color}"></div></div>
      <span style="width:32px;text-align:right;font-family:var(--mono);color:${hl ? 'var(--primary)' : 'var(--text-muted)'}">${p.toFixed(0)}%</span>
    </div>`;
  }).join('');

  return `<div class="advice-item ${level}">
    <div class="advice-head">
      <span class="advice-title">${title}</span>
      <span class="badge ${badge}">${level === 'recommend' ? '推荐' : level === 'caution' ? '谨慎' : '高风险'}</span>
    </div>
    <div class="advice-body">${body}</div>
    ${bars}
    <div class="advice-metrics">
      <span>返还率: <b style="color:var(--text)">${rtpPct}%</b></span>
      <span>真实概率: <b style="color:var(--text)">${(myFairProb*100).toFixed(1)}%</b></span>
    </div>
  </div>`;
}

// 从 pool 提取 [label, odds] 列表（适配各玩法）
function getPoolOptions(pool) {
  const code = pool.poolCode;
  if (code === 'had' || code === 'hhad') {
    return [
      ['主胜', parseFloat(pool.homeWin) || 0],
      ['平局', parseFloat(pool.draw) || 0],
      ['客胜', parseFloat(pool.awayWin) || 0],
    ].filter(x => x[1] > 0);
  }
  if (code === 'ttg') {
    const order = ['0','1','2','3','4','5','6','7+'];
    return Object.entries(pool.goals || {})
      .map(([k, v]) => [k + '球', parseFloat(v) || 0])
      .filter(x => x[1] > 0)
      .sort((a, b) => order.indexOf(a[0].replace('球','')) - order.indexOf(b[0].replace('球','')));
  }
  if (code === 'crs') {
    return Object.entries(pool.scores || {})
      .map(([k, v]) => [k, parseFloat(v) || 0])
      .filter(x => x[1] > 0);
  }
  if (code === 'hafu') {
    const labels = ['胜胜','胜平','胜负','平胜','平平','平负','负胜','负平','负负'];
    return labels.map(l => [l, parseFloat((pool.options || {})[l]) || 0]).filter(x => x[1] > 0);
  }
  return [];
}

function renderComboAdvice(sel) {
  const n = sel.length;
  const stake = parseFloat($('#calc-stake').value) || 0;
  // 按比赛分组
  const byMatch = {};
  sel.forEach(s => { const mk = s.match.matchId; (byMatch[mk] = byMatch[mk] || []).push(s); });
  const matchCount = Object.keys(byMatch).length;

  let level, badge, title, body, totalOdds, impliedPct;

  if (matchCount === 1) {
    // 同场多注 → 独立单关
    totalOdds = sel.reduce((a, s) => a + s.odds, 0);
    const bestProb = Math.max(...sel.map(s => s.odds > 0 ? 100/s.odds : 0));
    level = 'caution'; badge = 'yellow';
    title = `${n} 注独立单关（同场）`;
    body = `同一场比赛的多个选项<b>不能串关</b>（互斥结果），每注都是独立单关，分别结算。共 ${n} 注，每注 ¥${stake}，全中合计 ¥${(stake * totalOdds).toFixed(2)}。单注最高命中率 ${bestProb.toFixed(0)}%。`;
    impliedPct = bestProb.toFixed(1);
  } else {
    // 多场过关（每场首注）
    const onePerMatch = Object.keys(byMatch).map(mk => byMatch[mk][0]);
    totalOdds = onePerMatch.reduce((a, s) => a * s.odds, 1);
    let impliedProb = 1;
    onePerMatch.forEach(s => { if (s.odds > 0) impliedProb *= (1 / s.odds); });
    impliedPct = (impliedProb * 100).toFixed(2);

    if (matchCount === 2) {
      level = 'recommend'; badge = 'green';
      title = `${matchCount} 串过关 · 适中`;
      body = `2 串是性价比最高的过关组合，总赔率 ${totalOdds.toFixed(2)}，全中概率 ${impliedPct}%。¥${stake} 全中赢 ¥${(stake*totalOdds).toFixed(2)}。`;
    } else if (matchCount <= 4) {
      level = 'recommend'; badge = 'green';
      title = `${matchCount} 串过关 · 适中`;
      body = `过关总赔率 ${totalOdds.toFixed(2)}，全中概率约 ${impliedPct}%（约 1/${Math.round(1/impliedProb)}）。3-4 串回报放大但风险上升。¥${stake} 全中赢 ¥${(stake*totalOdds).toFixed(2)}。`;
    } else if (matchCount <= 6) {
      level = 'caution'; badge = 'yellow';
      title = `${matchCount} 串过关 · 偏高难`;
      body = `全中概率仅 ${impliedPct}%（约 1/${Math.round(1/impliedProb)}）。总赔率 ${totalOdds.toFixed(2)} 诱人，但任意一场错则全输。建议降低本金。`;
    } else {
      level = 'risk'; badge = 'red';
      title = `${matchCount} 串过关 · 极高风险`;
      body = `${matchCount} 场全中概率仅 ${impliedPct}%，理论 1/${Math.round(1/impliedProb)}。总赔率 ${totalOdds.toFixed(2)} 极高但命中率极低，不建议大额。`;
    }
  }

  return `<div class="advice-item ${level}">
    <div class="advice-head">
      <span class="advice-title">${title}</span>
      <span class="badge ${badge}">${level === 'recommend' ? '推荐' : level === 'caution' ? '谨慎' : '高风险'}</span>
    </div>
    <div class="advice-body">${body}</div>
    <div class="advice-metrics">
      <span>总赔率: <b style="color:var(--gold)">${totalOdds.toFixed(2)}</b></span>
      <span>命中率: <b style="color:var(--text)">${impliedPct}%</b></span>
      <span>潜在奖金: <b style="color:var(--gold)">¥${(stake * totalOdds).toFixed(2)}</b></span>
    </div>
  </div>`;
}
// 初始化时清空选择（刷新按钮触发）
function resetCalc() {
  CALC_SELECTIONS = {};
  CALC_MATCHES = null;
}

// ============================================================
// 球队/球员对比功能（仿淘宝商品对比）
// ============================================================

// 对比状态：COMPARE_TYPE 区分球队/球员，COMPARE_ITEMS 最多 2 项
let COMPARE_TYPE = null;   // 'team' | 'player'
let COMPARE_ITEMS = [];    // [{ id, name, data }]

// ─── 加入对比（预加载数据）────────────────────────────
async function addToCompare(type, id, name) {
  // 类型切换：如果换了类型，清空已有
  if (COMPARE_TYPE && COMPARE_TYPE !== type) {
    COMPARE_ITEMS = [];
  }
  COMPARE_TYPE = type;
  // 已存在则忽略
  if (COMPARE_ITEMS.some(it => String(it.id) === String(id))) {
    toast('已在对比栏中', '');
    renderCompareBar();
    return;
  }
  // 满了替换最早的一个
  if (COMPARE_ITEMS.length >= 2) {
    COMPARE_ITEMS.shift();
  }
  const slot = { id, name, data: null };
  COMPARE_ITEMS.push(slot);
  renderCompareBar();
  toast(`已加入对比 (${COMPARE_ITEMS.length}/2)`, 'ok');
  // 预加载数据
  try {
    if (type === 'team') {
      const [info, history] = await Promise.all([
        api(`/api/team/${encodeURIComponent(name)}/info`),
        api(`/api/team/${encodeURIComponent(name)}/history`).catch(() => null),
      ]);
      slot.data = { info, history };
    } else {
      slot.data = await api(`/api/player/${encodeURIComponent(id)}/info`);
    }
  } catch (e) {
    slot.data = { error: e.message };
  }
  renderCompareBar();
}

// ─── 对比栏渲染 ────────────────────────────────────────
function renderCompareBar() {
  const bar = $('#compare-bar');
  if (!COMPARE_ITEMS.length) {
    bar.classList.remove('show');
    setTimeout(() => bar.classList.add('hidden'), 300);
    return;
  }
  bar.classList.remove('hidden');
  requestAnimationFrame(() => bar.classList.add('show'));

  $('#compare-count').textContent = `${COMPARE_ITEMS.length}/2`;
  const slotsHtml = COMPARE_ITEMS.map((it, i) => {
    const flagHtml = COMPARE_TYPE === 'team' ? flag(it.name) : (it.data && it.data.wiki && it.data.wiki.detail ? flag(it.data.wiki.detail.national) : '');
    return `<div class="compare-slot">
      ${flagHtml}
      <span class="slot-name">${esc(it.name)}</span>
      <button class="slot-remove" data-idx="${i}">✕</button>
    </div>`;
  }).join('');
  // 补空槽
  for (let i = COMPARE_ITEMS.length; i < 2; i++) {
    slotsHtml && (slotsHtml += '<div class="compare-slot empty">+</div>');
  }
  $('#compare-slots').innerHTML = slotsHtml;
  $('#compare-start').disabled = COMPARE_ITEMS.length < 2;

  // 绑定删除
  $$('#compare-slots .slot-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      COMPARE_ITEMS.splice(parseInt(btn.dataset.idx), 1);
      if (!COMPARE_ITEMS.length) COMPARE_TYPE = null;
      renderCompareBar();
    });
  });
}

// ─── 开始对比：渲染对比页 ──────────────────────────────
$('#compare-start').addEventListener('click', () => {
  if (COMPARE_ITEMS.length < 2) return;
  openCompareModal();
});
$('#compare-clear').addEventListener('click', () => {
  COMPARE_ITEMS = []; COMPARE_TYPE = null;
  renderCompareBar();
});
$('#compare-close').addEventListener('click', () => $('#compare-modal').classList.add('hidden'));
$('#compare-swap').addEventListener('click', () => {
  if (COMPARE_ITEMS.length === 2) {
    [COMPARE_ITEMS[0], COMPARE_ITEMS[1]] = [COMPARE_ITEMS[1], COMPARE_ITEMS[0]];
    openCompareModal();
  }
});

function openCompareModal() {
  const [a, b] = COMPARE_ITEMS;
  $('#compare-body').innerHTML = COMPARE_TYPE === 'team' ? renderTeamCompare(a, b) : renderPlayerCompare(a, b);
  $('#compare-modal').classList.remove('hidden');
  // 绘制球员双雷达
  if (COMPARE_TYPE === 'player' && a.data && b.data && a.data.ability && b.data.ability) {
    setTimeout(() => drawRadarCompare(a.data.ability, b.data.ability), 50);
  }
}

// ─── 胜者高亮工具 ──────────────────────────────────────
// rule: 'high' 大者胜 | 'low' 小者胜 | null 不比
function winnerClass(valA, valB, rule) {
  if (valA == null || valB == null || !rule) return ['', ''];
  const a = parseFloat(valA), b = parseFloat(valB);
  if (isNaN(a) || isNaN(b)) return ['', ''];
  if (a === b) return ['', ''];
  if (rule === 'high') return a > b ? ['winner', ''] : ['', 'winner'];
  if (rule === 'low') return a < b ? ['winner', ''] : ['', 'winner'];
  return ['', ''];
}

// 从球队 info 提取数值字段
function parseTeamInfo(data) {
  const items = (data.info && data.info.baseInfo && data.info.baseInfo.items) || [];
  const get = (key) => {
    const it = items.find(x => x.name && x.name.includes(key));
    return it ? it.content : null;
  };
  const honors = (data.info && data.info.honor && data.info.honor.awards) || [];
  const history = (data.history && data.history.records) || [];
  // 统计世界杯冠军次数
  const champCount = history.filter(r => (r.description || '').includes('冠军') && !(r.description||'').includes('不敌')).length;
  return {
    fifaRank: get('排名') || get('FIFA'),
    value: get('身价'),
    avgAge: get('年龄'),
    founded: get('成立'),
    coach: get('教练') || get('主帅'),
    fifaRankNum: extractNum(get('排名') || get('FIFA')),
    valueNum: extractMoney(get('身价')),
    avgAgeNum: extractNum(get('年龄')),
    honors,
    history,
    champCount,
  };
}
function extractNum(s) { if (!s) return null; const m = String(s).match(/\d+(\.\d+)?/); return m ? parseFloat(m[0]) : null; }
function extractMoney(s) {
  if (!s) return null;
  const str = String(s);
  const num = parseFloat(str.match(/[\d.]+/)?.[0]);
  if (isNaN(num)) return null;
  if (str.includes('亿')) return num * 10000;
  if (str.includes('万')) return num;
  return num;
}

// ─── 球队对比渲染 ──────────────────────────────────────
function renderTeamCompare(a, b) {
  const pa = parseTeamInfo(a.data || {});
  const pb = parseTeamInfo(b.data || {});

  const headA = `<div class="compare-col-head"><div class="ch-name">${flag(a.name)} ${esc(a.name)}</div></div>`;
  const headB = `<div class="compare-col-head"><div class="ch-name">${flag(b.name)} ${esc(b.name)}</div></div>`;

  // 分组行生成器：label + 两值 + 胜者规则
  const section = (title) => `<div class="compare-section-title">${esc(title)}</div>`;
  const row = (label, valA, valB, rule) => {
    const [wA, wB] = winnerClass(valA, valB, rule);
    return `<div class="compare-row">
      <div class="cr-label">${esc(label)}</div>
      <div class="cr-cell ${wA}"><div class="cr-val">${fmtVal(valA)}</div></div>
      <div class="cr-cell ${wB}"><div class="cr-val">${fmtVal(valB)}</div></div>
    </div>`;
  };

  return `<div class="compare-grid">${headA}${headB}
    ${section('🏆 实力指标')}
    ${row('FIFA 世界排名', pa.fifaRank, pb.fifaRank, 'low')}
    ${row('球队总身价', pa.value, pb.value, 'high')}
    ${row('球队平均年龄', pa.avgAge, pb.avgAge, null)}
    ${section('📋 基本信息')}
    ${row('成立年份', pa.founded, pb.founded, null)}
    ${row('现任主教练', pa.coach, pb.coach, null)}
    ${section('🏅 荣誉与历史')}
    ${row('荣誉总数', pa.honors.length + ' 项', pb.honors.length + ' 项', 'high')}
    ${row('世界杯参赛', pa.history.length + ' 届', pb.history.length + ' 届', 'high')}
    ${row('世界杯夺冠', pa.champCount + ' 次', pb.champCount + ' 次', 'high')}
  </div>`;
}

function fmtVal(v) {
  if (v == null || v === '') return '<span class="cr-na">-</span>';
  return esc(String(v));
}

// ─── 球员对比渲染 ──────────────────────────────────────
function renderPlayerCompare(a, b) {
  const da = a.data || {}, db = b.data || {};
  const wa = da.wiki || {}, wb = db.wiki || {};
  const da2 = wa.detail || {}, db2 = wb.detail || {};
  const aa = da.ability || {}, ab = db.ability || {};

  // 身价：detail.socialStatus + socialStatusUnit
  const valA = da2.socialStatus ? `${da2.socialStatus}${da2.socialStatusUnit || ''}` : null;
  const valB = db2.socialStatus ? `${db2.socialStatus}${db2.socialStatusUnit || ''}` : null;
  const valANum = da2.socialStatus ? parseFloat(da2.socialStatus) : null;
  const valBNum = db2.socialStatus ? parseFloat(db2.socialStatus) : null;

  // 荣誉：用 honorRecords 的 totalWins 求和，或 honor 的 seasons 数
  const honorSum = (d) => {
    const hr = d.honorRecords || [];
    if (hr.length) return hr.reduce((s, h) => s + (parseInt(h.totalWins) || (h.seasons ? h.seasons.length : 1)), 0);
    const h = d.honor || [];
    return h.reduce((s, x) => s + (x.seasons ? x.seasons.length : 1), 0);
  };
  const honA = honorSum(da), honB = honorSum(db);

  const headA = `<div class="compare-col-head">
    <div class="ch-name">${da2.national ? flag(da2.national) : ''} ${esc(wa.nickName || a.name)} ${wa.num ? '#' + esc(wa.num) : ''}</div>
    <div class="ch-sub">${esc(da2.position || '')}</div>
  </div>`;
  const headB = `<div class="compare-col-head">
    <div class="ch-name">${db2.national ? flag(db2.national) : ''} ${esc(wb.nickName || b.name)} ${wb.num ? '#' + esc(wb.num) : ''}</div>
    <div class="ch-sub">${esc(db2.position || '')}</div>
  </div>`;

  const section = (title) => `<div class="compare-section-title">${esc(title)}</div>`;
  const row = (label, valA, valB, rule) => {
    const [wA, wB] = winnerClass(valA, valB, rule);
    return `<div class="compare-row">
      <div class="cr-label">${esc(label)}</div>
      <div class="cr-cell ${wA}"><div class="cr-val">${fmtVal(valA)}</div></div>
      <div class="cr-cell ${wB}"><div class="cr-val">${fmtVal(valB)}</div></div>
    </div>`;
  };

  // 雷达图各区数值对比行
  const radarRows = () => {
    const dimsA = aa.radarDims || [], dimsB = ab.radarDims || [];
    if (!dimsA.length) return '';
    let html = section('🎯 六维能力');
    dimsA.forEach((d, i) => {
      const dB = dimsB[i] || {};
      html += row(d.name, d.value, dB.value || '-', 'high');
    });
    return html;
  };

  // 雷达图区
  const radarHtml = aa.radarDims && ab.radarDims && aa.radarDims.length && ab.radarDims.length ? `
    <div class="compare-radar-section">
      <div class="compare-radar-legend">
        <div class="leg"><span class="leg-dot" style="background:var(--primary)"></span>${esc(wa.nickName || a.name)}</div>
        <div class="leg"><span class="leg-dot" style="background:var(--blue)"></span>${esc(wb.nickName || b.name)}</div>
      </div>
      <div class="compare-radar-wrap"><canvas id="radar-compare" width="380" height="380"></canvas></div>
    </div>` : '';

  return `<div class="compare-grid">${headA}${headB}
    ${section('👤 基本信息')}
    ${row('场上位置', da2.position, db2.position, null)}
    ${row('年龄', da2.age + ' 岁', db2.age + ' 岁', 'low')}
    ${row('身高', wa.height, wb.height, null)}
    ${row('体重', wa.weight, wb.weight, null)}
    ${row('惯用脚', da2.heavyFoot, db2.heavyFoot, null)}
    ${section('💰 价值')}
    ${row('当前身价', valA, valB, 'high')}
    ${row('合同到期', da2.expiryDate, db2.expiryDate, null)}
    ${section('⭐ 综合能力')}
    ${row('综合评分', aa.overall, ab.overall, 'high')}
    ${radarRows()}
    ${radarHtml}
    ${section('🏅 荣誉')}
    ${row('荣誉总数', honA + ' 次', honB + ' 次', 'high')}
  </div>`;
}

// ─── 双雷达图绘制 ──────────────────────────────────────
function drawRadarCompare(abilityA, abilityB) {
  const canvas = $('#radar-compare');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const cx = W / 2, cy = H / 2;
  const R = Math.min(W, H) / 2 - 50;
  const dimsA = abilityA.radarDims || [];
  const dimsB = abilityB.radarDims || [];
  const n = Math.max(dimsA.length, dimsB.length);
  if (n < 3) return;

  ctx.clearRect(0, 0, W, H);
  // 网格
  ctx.strokeStyle = '#243029'; ctx.lineWidth = 1;
  for (let level = 1; level <= 5; level++) {
    const r = (R / 5) * level;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const ang = -Math.PI / 2 + (Math.PI * 2 * i) / n;
      const x = cx + Math.cos(ang) * r, y = cy + Math.sin(ang) * r;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath(); ctx.stroke();
  }
  // 轴线
  for (let i = 0; i < n; i++) {
    const ang = -Math.PI / 2 + (Math.PI * 2 * i) / n;
    ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(ang) * R, cy + Math.sin(ang) * R);
    ctx.stroke();
  }
  // 画多边形
  const drawPoly = (dims, fillColor, strokeColor) => {
    ctx.fillStyle = fillColor; ctx.strokeStyle = strokeColor; ctx.lineWidth = 2;
    ctx.beginPath();
    dims.forEach((d, i) => {
      const val = parseFloat(d.value) || 0;
      const r = (Math.min(val, 100) / 100) * R;
      const ang = -Math.PI / 2 + (Math.PI * 2 * i) / n;
      const x = cx + Math.cos(ang) * r, y = cy + Math.sin(ang) * r;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.closePath(); ctx.fill(); ctx.stroke();
  };
  drawPoly(dimsA, 'rgba(45, 212, 167, 0.2)', '#2dd4a7');
  drawPoly(dimsB, 'rgba(59, 158, 255, 0.2)', '#3b9eff');
  // 标签
  ctx.fillStyle = '#8fa89a'; ctx.font = '12px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  dimsA.forEach((d, i) => {
    const ang = -Math.PI / 2 + (Math.PI * 2 * i) / n;
    const x = cx + Math.cos(ang) * (R + 26), y = cy + Math.sin(ang) * (R + 26);
    ctx.fillText(d.name, x, y);
  });
}

// ─── 球队对比按钮 ──────────────────────────────────────
$('#team-compare-btn').addEventListener('click', () => {
  const team = $('#team-select').value;
  if (!team) { toast('请先选择球队', 'err'); return; }
  addToCompare('team', team, team);
});

// ─── 启动：加载首页 ────────────────────────────────────
loadSchedule();
