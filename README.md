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

outlook: #VPS部署参考下面的Azure 应用注册（Outlook OAuth2）不使用outlook则无所谓
  client_id: <your-azure-client-id>
  client_secret: <your-azure-client-secret>
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
> - `config.yaml` 中密码必须加引号（如 `"123456"`），否则纯数字密码会被 yaml 解析为整数导致无法登录
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
| Outlook / Hotmail / Live | OAuth2 授权（需在 Azure 注册应用）|

---

## Azure 应用注册（Outlook OAuth2）

使用 Outlook / Hotmail / Live 账号前，必须先在 Azure Portal 注册应用。

### 1. 创建应用

1. 打开 [Azure Portal](https://portal.azure.com) → 搜索 **App registrations** → **New registration**
2. 填写：
   - Name：随意，如 `iMail`
   - Supported account types：**必须选** `Accounts in any organizational directory and personal Microsoft accounts`
     > ⚠️ 如果选错此项，个人 Hotmail/Outlook/Live 账号将无法授权
   - Redirect URI：暂时不填
3. 点 **Register**

### 2. 配置 Redirect URI

1. 左侧菜单 → **Authentication** → **Add a platform** → 选 **Web**
2. 根据部署环境填入回调地址：

   **生产环境（VPS）：**
   ```
   https://你的域名/api/emails/oauth/outlook/callback
   ```
   **本地开发：**
   ```
   http://localhost:3000/api/emails/oauth/outlook/callback
   ```

3. 勾选 **Access tokens** 和 **ID tokens**
4. 点 **Save**

> ⚠️ 注意事项：
> - 路径必须完全一致，包括大小写，结尾**不能有** `/`
> - 路径是 `/api/emails/oauth/outlook/callback`，不是 `/api/oauth/callback`
> - 本地和生产可以同时添加多条，互不影响
> - 添加账号时建议用**无痕模式**，避免浏览器缓存旧登录状态干扰

### 3. 配置 API 权限

1. 左侧菜单 → **API permissions** → **Add a permission** → **Microsoft Graph**
2. 选 **Delegated permissions**，搜索并勾选以下权限：

   | 权限 | 用途 |
   |------|------|
   | `Mail.Read` | 读取邮件 |
   | `Mail.ReadWrite` | 标记已读/未读、删除 |
   | `Mail.Send` | 发送邮件 |
   | `offline_access` | 刷新 token（保持登录）|

3. 点 **Add permissions**
4. 点 **Grant admin consent**（如果有管理员权限）；个人账号授权时会在登录页自动同意

### 4. 创建 Client Secret

1. 左侧菜单 → **Certificates & secrets** → **New client secret**
2. Description 随意，Expires 选 **24 months**
3. 点 **Add**
4. **立即复制 Value**（离开页面后永久不再显示）

### 5. 获取 Client ID

在应用 **Overview** 页面，复制 **Application (client) ID**

### 6. 填入 config.yaml

```yaml
outlook:
  client_id: "你的 Application (client) ID"
  client_secret: "你的 Client Secret Value"
```

> ⚠️ secret 中如含特殊字符（如 `~`），必须用引号包裹

---

## OAuth 中转服务（多用户/多域名部署）

如果你想让所有用户共用同一个 Azure 应用（无需每人自己注册），可以部署一个 OAuth 中转服务。

### 原理

```
用户浏览器 → Azure → https://relay.yourdomain.com/oauth/callback
                              ↓ 转发 code
                     用户自己的 iMail 实例
```

### 部署中转服务

```bash
# 在你的 VPS 上
mkdir oauth-relay && cd oauth-relay

cat > docker-compose.yml << 'EOF'
services:
  relay:
    image: wsng911/imail-relay:latest
    restart: unless-stopped
    ports:
      - "3100:3100"
EOF

docker compose up -d
```

Nginx 配置：
```nginx
server {
    listen 443 ssl;
    server_name relay.yourdomain.com;

    ssl_certificate     /etc/ssl/certs/yourdomain.crt;
    ssl_certificate_key /etc/ssl/private/yourdomain.key;

    location / {
        proxy_pass http://127.0.0.1:3100;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Azure 配置

回调地址只需注册一个：
```
https://relay.yourdomain.com/oauth/callback
```

### iMail 用户配置

在 `config.yaml` 中加入：
```yaml
outlook:
  client_id: "your-client-id"
  client_secret: "your-client-secret"
  relay_url: "https://relay.yourdomain.com/oauth/callback"
```

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

## Nginx 反向代理

```nginx
server {
    listen 80;
    server_name mail.yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name mail.yourdomain.com;

    ssl_certificate     /etc/ssl/certs/yourdomain.crt;
    ssl_certificate_key /etc/ssl/private/yourdomain.key;

    # 增大上传限制（导入账号包）
    client_max_body_size 20m;

    location / {
        proxy_pass         http://127.0.0.1:30000;
        proxy_http_version 1.1;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }
}
```

> 使用 Let's Encrypt 免费证书：
> ```bash
> certbot --nginx -d mail.yourdomain.com
> ```

---

## 更新日志

### v4.10
- 附件功能：IMAP/Outlook 同步时存储附件，右栏展示附件列表并支持下载
- 邮件正文存储原始 HTML，图片正常显示
- Gmail 文件夹名修正为中文路径（已发邮件/草稿/垃圾邮件/已删除邮件）
- Outlook 同步所有文件夹（收件箱/已发送/草稿/垃圾/已删除）
- 修复 IMAP 同步 count 未定义导致同步失败
- 右栏 header 左侧整个区域点击返回，删除按钮移至最左侧
- 浏览器刷新后自动恢复右栏（不跳回中栏）
- 后端启动时自动标记 30 天以上未读邮件为已读，修复漏标问题
- ComposePanel 正文区域布局修复，文本可正常显示

### v4.3.0
- 右栏左侧点击返回，右上角刷新按钮不触发跳回中栏
- 删除按钮移至右栏操作区最左侧

### v4.2
- 搜索功能（主题、发件人实时过滤）
- 全选图标三态切换（空框/横线/打钩）
- 取消最后一个勾选自动退出多选模式，移除取消按钮
- 手机返回键多级返回（详情→列表→关闭抽屉/设置）
- 暗色主题刷新后不再重置（localStorage 持久化）
- 同步时自动标记超过一个月的邮件为已读

### v3.0
- 未读/星标虚拟文件夹
- 中栏标题正确显示当前文件夹名
- Outlook 授权强制弹出账号选择器，修复多账号错乱
- OAuth 取消授权不再崩溃，前端显示错误提示
- 左栏选中账号后保持文件夹视图
- 手机端返回后恢复滚动位置
