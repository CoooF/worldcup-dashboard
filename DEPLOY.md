# 🚀 部署指南

2026 世界杯数据看板 - 三种免费部署方案。

> 项目已**自包含**（`skill-data/` 内含全部数据脚本），部署时不依赖 skill 安装路径。

---

## 方案一：裸机 VPS 部署（推荐，最稳定）

适用：阿里云/腾讯云/AWS/RackNest 等任意 Linux 服务器。**无冷启动，性能最好。**

### 1. 推送到 GitHub
```bash
cd worldcup-2026-dashboard
# 在 GitHub 新建空仓库后：
git remote add origin https://github.com/<你的用户名>/worldcup-dashboard.git
git push -u origin main
```
> 如果当前分支是 master，先 `git branch -M main`

### 2. 在服务器上拉取并部署
```bash
# SSH 登录服务器后：
git clone https://github.com/<你的用户名>/worldcup-dashboard.git
cd worldcup-dashboard

# 安装 Node.js 20（如未安装）
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 一键部署（自动安装依赖 + PM2 启动）
bash deploy.sh
```

### 3. 配置 Nginx 反向代理（可选，用于域名 + HTTPS）
```bash
sudo apt install -y nginx certbot python3-certbot-nginx
sudo cp deploy/nginx.conf /etc/nginx/sites-available/worldcup
# 编辑配置，把 your-domain.com 改成你的域名
sudo vim /etc/nginx/sites-available/worldcup
sudo ln -s /etc/nginx/sites-available/worldcup /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# 申请免费 HTTPS 证书
sudo certbot --nginx -d your-domain.com
```

### 免费 VPS 推荐
| 平台 | 免费额度 | 备注 |
|------|---------|------|
| Oracle Cloud | 永久免费 ARM 4核24G | 最香，但注册需信用卡 |
| Google Cloud | $300/90天试用 | e2-micro 永久免费 |
| AWS | 12个月免费 t2.micro | 到期后收费 |
| RackNest | 年付 $10-20 | 非 free tier，但便宜稳定 |

---

## 方案二：Docker 部署

适用：已装 Docker 的服务器，或支持 Docker 的 PaaS。

### 本地构建镜像
```bash
cd worldcup-2026-dashboard
docker build -t worldcup-dashboard .

# 运行
docker run -d --name wc -p 3000:3000 --restart unless-stopped worldcup-dashboard

# 验证
curl http://localhost:3000/api/health
```

### Docker Compose（推荐）
创建 `docker-compose.yml`：
```yaml
version: '3'
services:
  worldcup:
    build: .
    ports:
      - "3000:3000"
    environment:
      - PORT=3000
    restart: unless-stopped
```
然后 `docker compose up -d`。

---

## 方案三：Render 免费部署（PaaS，无需服务器）

适用：不想管服务器，想用 Git 一键部署。

### 步骤
1. 代码推到 GitHub
2. 注册 [render.com](https://render.com)（GitHub 登录）
3. **New + → Web Service** → 选择你的 GitHub 仓库
4. 配置：
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Instance Type**: Free
5. **Create Web Service** → 等待部署完成

部署后获得地址：`https://worldcup-dashboard.onrender.com`

> ⚠️ Render 免费版限制：
> - 15 分钟无访问会休眠，再次访问需等 30-60 秒冷启动
> - 每月 750 小时免费时长
> - 适合演示/个人使用，不适合高频访问

---

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | 3000 | 服务端口（PaaS 会自动注入） |
| `NODE_ENV` | - | 设为 production 提升性能 |

---

## 部署后验证

访问以下地址确认部署成功：
- `/` — 首页（赛程）
- `/api/health` — 健康检查（确认 skill-data 加载正常）

如果 `/api/health` 返回 `skillFound: false`，说明 `skill-data/` 目录缺失，检查 Git 仓库是否完整。

---

## 常见问题

**Q: 体彩赔率接口报错？**
A: skill 的 `calculator.js` 依赖 axios，`npm install` 会自动安装。若用 Docker，Dockerfile 已处理。

**Q: 数据抓取慢/超时？**
A: 百度体育/体彩有反爬，延迟正常。后端已设 20s 超时，`server.js` 的 `TIMEOUT_MS` 可调。

**Q: 如何更新数据脚本？**
A: 替换 `skill-data/` 目录内容后重启服务即可（`pm2 restart worldcup-dashboard` 或 `docker restart wc`）。

**Q: 部署在国内服务器，百度体育/体彩访问慢？**
A: 国内服务器访问反而更快（数据源都在国内）。境外服务器可能有延迟。
