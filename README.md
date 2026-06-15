# ⚽ 2026 美加墨世界杯 · 数据看板

基于 [haizei-worldcup-2026-skill](../.agents/skills/haizei-worldcup-2026-skill/) 搭建的前端数据看板。
零依赖（仅 Node 内置模块），无需 `npm install`。

## 🚀 快速启动

### 方式一：双击启动（macOS）
双击 `start.command`，自动启动服务并打开浏览器。

### 方式二：命令行
```bash
cd worldcup-2026-dashboard
node server.js
```
然后访问 **http://localhost:3000**

> 自定义端口：`PORT=4000 node server.js`

## 📦 目录结构
```
worldcup-2026-dashboard/
├── server.js          # Node 后端（封装 skill 脚本为 REST API）
├── public/
│   ├── index.html     # 页面骨架（深色主题，6 个 Tab）
│   ├── style.css      # 样式
│   └── app.js         # 前端逻辑
├── start.command      # macOS 一键启动
└── README.md
```

## 🎯 功能模块

| Tab | 功能 | 数据源 |
|-----|------|--------|
| 📅 赛程 | 今日/明日/按日期/按组赛程，比赛卡片 | 百度体育 |
| 🔍 比赛详情 | AI预测/技术统计/赔率盘口/阵容 | 百度体育 |
| 🏆 积分榜 | 12 组积分榜，晋级/淘汰状态 | 百度体育 |
| 📊 排名 | FIFA排名 / 球员榜（30+维度） | 百度体育 |
| ⚽ 球队/球员 | 球队资料/阵容/历史，球员能力雷达图/荣誉/转会 | 百度体育 |
| 🎰 竞彩赔率 | 胜平负/让球/比分/总进球/混合过关 | 中国体彩 sporttery.cn |
| 🧮 计算器 | 单关/过关奖金计算 + 隐含概率/返还率分析 + 购买建议 | 中国体彩 sporttery.cn |

## 🧮 竞彩计算器使用说明

计算器 Tab 提供**交互式赔率计算**和**购买建议**：

### 操作流程
1. 点击「🔄 加载世界杯可投注赛事」拉取当前可投注的世界杯比赛
2. 在每场比赛的赔率按钮中选择一个选项（主胜/平/客胜）
   - 选 1 场 = **单关**
   - 选 2+ 场 = **过关（串关）**
3. 调整本金，实时查看奖金计算

### 计算指标
- **组合总赔率**：各场赔率连乘（如 1.67×1.43×7.65 = 18.27）
- **全中奖金**：本金 × 总赔率
- **理论全中概率**：各场隐含概率连乘
- **隐含概率**：1/赔率，反映赔率隐含的胜率
- **返还率**：1/Σ隐含概率，反映体彩抽水（通常 ~88%）
- **真实概率**：去抽水后的概率估计

### 购买建议分级
| 级别 | 含义 |
|------|------|
| 🟢 推荐 | 赔率合理区间（1.4-2.2），胜率与回报平衡；或单关/2-3串适中 |
| 🟡 谨慎 | 低赔强队（<1.4）收益有限；或平局高 variance；或 4-5 串偏高难 |
| 🔴 高风险 | 冷门高赔（>3.5）命中率低；或 6+ 串极低概率 |

> ⚠️ **免责声明**：所有建议仅基于赔率的数学分析，**不构成任何投注建议**。竞彩有风险，请理性参与，量力而行。未成年人不得参与。

## 🔌 API 端点

所有 API 返回统一格式 `{ ok: boolean, data?, error? }`：

- `GET /api/health` — 健康检查
- `GET /api/teams/list|info|hosts|group/:g|find/:name` — 球队静态配置
- `GET /api/schedule/today|tomorrow|dates|date/:d|group/:g|team/:name` — 赛程
- `GET /api/match/:matchId/:tab` — 比赛详情（info/analysis/lineup/live/stats/odds）
- `GET /api/team/:idOrName/:tab` — 球队详情（lookup/info/schedule/lineup/history/stats）
- `GET /api/player/:playerId/:tab` — 球员详情（info/news/stats/schedule）
- `GET /api/rankings/standings|fifa/:n?|players/:cat|categories|knockout` — 排名
- `GET /api/odds/:play?team=&date=` — 体彩竞彩赔率（summary/had/hhad/crs/ttg/hafu）

## 🛠 技术栈
- **后端**：Node.js 内置模块（http / child_process / fs / path），零依赖
- **前端**：原生 HTML + CSS + JS（fetch / ES6），无构建步骤
- **可视化**：原生 Canvas 绘制球员能力雷达图

## 📌 注意事项
- 数据从百度体育/体彩实时抓取，进行中比赛比分延迟约 1-2 分钟
- 比赛时间均为北京时间（UTC+8）
- 球队/球员名仅支持中文
- 体彩 matchId 与百度体育 matchId 不通用，由后端各端点独立处理
- 竞彩赔率仅展示可投注赛事，不含投注功能，请理性观赛

## 🔍 故障排查

**端口被占用**：`PORT=3001 node server.js`

**数据加载失败**：先访问 `/api/health` 检查 skill 目录是否找到

**球员榜为空**：除射手榜外，其他分类待赛事进行后丰富
