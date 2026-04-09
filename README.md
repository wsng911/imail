# iMail

一个自托管的多账号邮件客户端，支持 Gmail、QQ 邮箱、Outlook / Hotmail / Live。

by mrlees

---

## 功能

- 统一收件箱，多账号聚合
- 支持 Gmail / QQ（IMAP）、Outlook / Hotmail / Live（OAuth2）
- 邮件列表：左滑删除、长按多选、批量操作
- 邮件详情：HTML 正文渲染、回复、星标、已读/未读
- 写信：发件人选择、密送、正文
- 设置：字体大小、主题（浅色/深色）
- 数据迁移：账号导出/导入
- 登录保护（用户名 + 密码）
- Docker 部署，数据持久化

---

## 快速部署

### 方式一：Docker Hub（推荐）

```bash
# 1. 创建目录
mkdir -p /home/iMail/data && cd /home/iMail

# 2. 创建 config.yaml（密码必须加引号，否则纯数字会被解析为整数导致登录失败）
cat > config.yaml << 'EOF'
app:
  username: admin
  password: "yourpassword"

server:
  port: 3000
  data_dir: /app/data

outlook:
  client_id: ""
  client_secret: ""
EOF

# 3. 创建 docker-compose.yml（注意路径拼写和缩进）
cat > docker-compose.yml << 'EOF'
services:
  imall:
    image: wsng911/imail:latest
    container_name: iMail
    restart: unless-stopped
    ports:
      - "30000:3000"
    volumes:
      - /home/iMail/data:/app/data
      - /home/iMail/config.yaml:/app/config.yaml:ro
    environment:
      - DATA_DIR=/app/data
EOF

# 4. 启动
docker compose up -d
```

访问 `http://your-server-ip:30000`

> ⚠️ 注意事项：
> - `config.yaml` 中密码必须加引号（如 `"890214"`），否则纯数字密码会被 yaml 解析为整数导致无法登录
> - `config.yaml` 挂载前必须先在宿主机创建该文件，否则 Docker 会自动创建同名**目录**导致启动报错
> - 路径拼写要一致，`volumes` 中宿主机路径和实际目录必须完全匹配

---

### 方式二：源码构建

```bash
git clone https://github.com/wsng911/imail.git iMail && cd iMail
```

### 2. 配置

```bash
cp config.example.yaml config.yaml
```

编辑 `config.yaml`：

```yaml
app:
  username: admin       # 登录账号
  password: yourpassword

server:
  port: 3000
  data_dir: ./data

# Outlook OAuth2（可以自行到azure搭建）
outlook:
  client_id: <your-azure-client-id>
  client_secret: <your-azure-client-secret>

```

### 3. 启动

```bash
docker compose up -d --build
```

访问 `http://your-server-ip`

---

## 添加邮箱账号

| 类型 | 所需凭证 |
|------|---------|
| Gmail | 16 位应用专用密码（需开启两步验证）|
| QQ 邮箱 | QQ 邮箱授权码（在 QQ 邮箱设置中生成）|
| Outlook / Hotmail / Live | OAuth2 授权（使用配置内或者在 Azure 注册应用 ） |

### Outlook OAuth2 配置

1. 前往 [Azure Portal](https://portal.azure.com) → App Registrations → New registration
2. 平台选 Web，回调地址填 http://localhost:3000/callback
3. 生成 Client Secret
4. 将 `client_id` 和 `client_secret` 填入 `config.yaml`

---

## 数据迁移

### 需要备份的文件

| 文件/目录 | 内容 | 是否必须 |
|-----------|------|---------|
| `data/imall.db` | 账号、邮件缓存、设置 | ✅ 必须 |
| `data/msal_*.json` | Outlook OAuth2 token | Outlook 账号必须 |

> `data/sessions/` 是登录 session，不需要迁移（重新登录即可）

### 导出账号（不含邮件缓存）

在设置页 → 数据迁移 → 填写导出路径 → 点击导出

或命令行：
```bash
sh export.sh /path/to/accounts_export.db
```

### 迁移到新服务器

```bash
# 1. 导出账号数据
sh export.sh ./accounts_export.db

# 2. 复制到新服务器
scp accounts_export.db user@new-server:~/iMail/data/accounts.db
scp data/msal_*.json   user@new-server:~/iMail/data/   # Outlook 账号需要

# 3. 启动，accounts.db 自动导入后改名为 accounts.db.imported
docker compose up -d --build
```

---

## 目录结构

```
iMail/
├── frontend/          # React + TypeScript + Tailwind
├── backend/           # Node.js + Express + SQLite
├── data/              # 持久化数据（挂载到宿主机）
│   └── imall.db       # 账号、邮件缓存、设置
├── config.yaml        # 配置文件
├── docker-compose.yml
└── export.sh          # 账号导出脚本
```

---

## 本地开发

```bash
# 后端
cd backend && npm install && npm run dev

# 前端（新终端）
cd frontend && npm install && npm run dev
```

前端访问 `http://localhost:5173`，API 自动代理到 `localhost:3000`。
