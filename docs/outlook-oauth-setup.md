# Azure 应用注册指引（Outlook OAuth2）

## 1. 创建应用

1. 打开 [Azure Portal](https://portal.azure.com) → 搜索 **App registrations** → **New registration**
2. 填写：
   - Name：随意，如 `iMail`
   - Supported account types：选 **Accounts in any organizational directory and personal Microsoft accounts**
   - Redirect URI：先不填，后面单独配置
3. 点 **Register**

---

## 2. 配置 Redirect URI

1. 左侧菜单 → **Authentication** → **Add a platform** → 选 **Web**
2. 填入以下地址（根据环境添加）：

   **生产环境（VPS）：**
   ```
   https://mail.idays.gq/api/emails/oauth/outlook/callback
   ```

   **本地开发：**
   ```
   http://localhost:3000/api/emails/oauth/outlook/callback
   ```

3. 勾选 **Access tokens** 和 **ID tokens**
4. 点 **Save**

> ⚠️ 路径必须完全一致，包括大小写，结尾不能有 `/`

---

## 3. 创建 Client Secret

1. 左侧菜单 → **Certificates & secrets** → **New client secret**
2. Description 随意，Expires 选 **24 months**
3. 点 **Add**
4. **立即复制 Value**（离开页面后不再显示）

---

## 4. 填入 config.yaml

```yaml
outlook:
  client_id: 你的 Application (client) ID   # Overview 页面可以找到
  client_secret: "刚才复制的 Value"
```

---

## 注意事项

- `client_id` 在应用 **Overview** 页面，字段名是 **Application (client) ID**
- `client_secret` 只在创建时显示一次，务必立即保存
- 添加账号时建议用**无痕模式**，避免浏览器缓存旧的登录状态干扰
