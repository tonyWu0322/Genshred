# 🚀 Genshred Impact 快速发布指南

## 5分钟快速发布

### 第一步：获取发布凭据

#### Chrome Web Store (推荐)
1. 访问 [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole/)
2. 支付 $5 注册费
3. 创建新项目，获取扩展 ID
4. 在 [Google Cloud Console](https://console.cloud.google.com/) 创建 OAuth 凭据

#### Microsoft Edge Add-ons
1. 访问 [Microsoft Partner Center](https://partner.microsoft.com/dashboard)
2. 支付 $19 年费注册
3. 创建应用，获取产品 ID
4. 在 Azure Portal 创建应用注册

### 第二步：配置凭据

编辑 `keys.json` 文件：

```json
{
  "$schema": "https://raw.githubusercontent.com/PlasmoHQ/bpp/v3/keys.schema.json",
  "chrome": {
    "clientId": "你的Chrome客户端ID",
    "refreshToken": "你的Chrome刷新令牌", 
    "extId": "你的Chrome扩展ID",
    "clientSecret": "你的Chrome客户端密钥"
  }
}
```

### 第三步：设置 GitHub Secrets

1. 访问你的 GitHub 仓库
2. 进入 Settings > Secrets and variables > Actions
3. 创建新密钥：
   - 名称：`SUBMIT_KEYS`
   - 值：完整的 `keys.json` 内容

### 第四步：发布扩展

```bash
# 检查配置
pnpm publish:check

# 准备发布（更新版本、构建、打包）
pnpm publish:prepare

# 或者分步执行
pnpm publish:version  # 更新版本号
pnpm publish:build    # 构建和打包
```

### 第五步：触发 GitHub Actions

1. 提交代码到 GitHub
2. 访问 Actions 页面
3. 手动触发 "Submit to Web Store" 工作流
4. 等待发布完成

## 常用命令

```bash
# 开发
pnpm dev

# 构建
pnpm build

# 打包
pnpm package

# 发布相关
pnpm publish:check      # 检查配置
pnpm publish:version    # 更新版本号
pnpm publish:build      # 构建和打包
pnpm publish:prepare    # 完整发布准备
```

## 故障排除

### 发布失败？
- 检查 `keys.json` 格式是否正确
- 确认 GitHub Secrets 已设置
- 查看 Actions 日志获取详细错误信息

### 构建失败？
- 确保所有依赖已安装：`pnpm install`
- 检查 TypeScript 错误：`pnpm build`
- 查看控制台错误信息

### 凭据问题？
- 确认 OAuth 凭据有效
- 检查 API 权限设置
- 重新生成 refresh token

## 获取帮助

- 📖 详细指南：`PUBLISH_GUIDE.md`
- 🐛 问题反馈：GitHub Issues
- 📧 技术支持：联系项目维护者

## 下一步

发布成功后，你可以：
- 监控扩展下载量
- 收集用户反馈
- 定期更新功能
- 优化用户体验

祝你的扩展发布成功！🎉 