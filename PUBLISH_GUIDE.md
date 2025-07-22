# Genshred Impact 浏览器扩展发布指南

## 概述

本指南将帮助你完成 Genshred Impact 浏览器扩展到各个应用商店的发布流程。

## 支持的浏览器商店

- Chrome Web Store
- Microsoft Edge Add-ons
- Firefox Add-ons (需要额外配置)

## 发布前准备

### 1. 获取 Chrome Web Store 凭据

#### 步骤 1: 创建 Chrome 开发者账户
1. 访问 [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole/)
2. 支付一次性 $5 注册费
3. 完成开发者账户设置

#### 步骤 2: 获取 OAuth 凭据
1. 访问 [Google Cloud Console](https://console.cloud.google.com/)
2. 创建新项目或选择现有项目
3. 启用 Chrome Web Store API
4. 创建 OAuth 2.0 凭据：
   - 应用类型：Web 应用
   - 重定向 URI：`https://developers.chrome.com/webstore/oauth2callback`
5. 记录 `client_id` 和 `client_secret`

#### 步骤 3: 获取 Refresh Token
1. 访问：`https://accounts.google.com/o/oauth2/auth?client_id=YOUR_CLIENT_ID&response_type=code&scope=https://www.googleapis.com/auth/chromewebstore&redirect_uri=https://developers.chrome.com/webstore/oauth2callback`
2. 授权访问
3. 获取授权码
4. 使用授权码获取 refresh token：
   ```bash
   curl -X POST https://accounts.google.com/o/oauth2/token \
     -d "client_id=YOUR_CLIENT_ID" \
     -d "client_secret=YOUR_CLIENT_SECRET" \
     -d "code=AUTHORIZATION_CODE" \
     -d "grant_type=authorization_code" \
     -d "redirect_uri=https://developers.chrome.com/webstore/oauth2callback"
   ```

#### 步骤 4: 获取扩展 ID
1. 在 Chrome Web Store Developer Dashboard 中创建新项目
2. 上传扩展包（可以是测试版本）
3. 记录生成的扩展 ID

### 2. 获取 Microsoft Edge Add-ons 凭据

#### 步骤 1: 创建 Microsoft 开发者账户
1. 访问 [Microsoft Partner Center](https://partner.microsoft.com/dashboard)
2. 注册开发者账户（需要支付 $19 年费）
3. 完成账户验证

#### 步骤 2: 创建应用
1. 在 Partner Center 中创建新应用
2. 选择 "Microsoft Edge Add-ons" 产品类型
3. 记录 `product_id`

#### 步骤 3: 获取 Azure AD 凭据
1. 访问 [Azure Portal](https://portal.azure.com/)
2. 创建新的应用注册
3. 记录 `client_id` 和 `client_secret`
4. 配置重定向 URI

### 3. 配置 keys.json

根据获取的凭据，更新 `keys.json` 文件：

```json
{
  "$schema": "https://raw.githubusercontent.com/PlasmoHQ/bpp/v3/keys.schema.json",
  "chrome": {
    "clientId": "你的Chrome客户端ID",
    "refreshToken": "你的Chrome刷新令牌",
    "extId": "你的Chrome扩展ID",
    "clientSecret": "你的Chrome客户端密钥"
  },
  "edge": {
    "clientId": "你的Edge客户端ID",
    "clientSecret": "你的Edge客户端密钥",
    "productId": "你的Edge产品ID",
    "accessTokenUrl": "https://login.microsoftonline.com/你的租户ID/oauth2/v2.0/token"
  }
}
```

## GitHub Actions 配置

### 1. 设置仓库密钥

1. 访问你的 GitHub 仓库
2. 进入 Settings > Secrets and variables > Actions
3. 创建新的仓库密钥：
   - 名称：`SUBMIT_KEYS`
   - 值：完整的 `keys.json` 内容

### 2. 触发发布

1. 进入 Actions 标签页
2. 选择 "Submit to Web Store" 工作流
3. 点击 "Run workflow" 按钮
4. 选择要发布的分支
5. 点击 "Run workflow" 开始发布

## 发布流程

### 自动发布步骤

1. **构建扩展**：GitHub Actions 会自动构建扩展包
2. **打包扩展**：生成适用于各商店的扩展包
3. **提交到商店**：自动提交到配置的浏览器扩展商店
4. **发布状态**：在 Actions 页面查看发布状态

### 手动发布（备选方案）

如果自动发布失败，可以手动发布：

#### Chrome Web Store
1. 访问 [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole/)
2. 上传 `build/chrome-mv3-prod.zip`
3. 填写扩展信息
4. 提交审核

#### Microsoft Edge Add-ons
1. 访问 [Microsoft Partner Center](https://partner.microsoft.com/dashboard)
2. 上传扩展包
3. 填写应用信息
4. 提交审核

## 常见问题

### Q: 发布失败怎么办？
A: 检查以下项目：
- 凭据是否正确
- 扩展包是否有效
- 商店政策是否合规

### Q: 如何更新扩展？
A: 
1. 更新 `package.json` 中的版本号
2. 提交代码到 GitHub
3. 手动触发 GitHub Actions 工作流

### Q: 如何查看发布状态？
A: 
- GitHub Actions 页面查看构建状态
- 各商店的开发者控制台查看审核状态

## 安全注意事项

1. **不要提交 keys.json**：该文件已添加到 .gitignore
2. **使用环境变量**：敏感信息通过 GitHub Secrets 管理
3. **定期轮换凭据**：定期更新 OAuth 凭据
4. **最小权限原则**：只授予必要的 API 权限

## 联系支持

如果在发布过程中遇到问题：

- Chrome Web Store: [Chrome Web Store 支持](https://support.google.com/chrome_webstore/)
- Microsoft Edge: [Edge Add-ons 支持](https://docs.microsoft.com/en-us/microsoft-edge/extensions-chromium/)
- GitHub Actions: [GitHub Actions 文档](https://docs.github.com/en/actions)

## 版本管理

### 版本号规范
- 主版本号.次版本号.修订号 (例如: 1.0.0)
- 每次发布前更新版本号
- 遵循语义化版本控制

### 发布标签
建议为每个发布版本创建 Git 标签：
```bash
git tag v1.0.0
git push origin v1.0.0
``` 