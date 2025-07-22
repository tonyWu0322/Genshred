#!/usr/bin/env node

/**
 * Genshred Impact 发布脚本
 * 用于快速设置和发布浏览器扩展
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🚀 Genshred Impact 发布助手');
console.log('========================\n');

// 检查必要文件
function checkFiles() {
  console.log('📋 检查项目文件...');
  
  const requiredFiles = [
    'package.json',
    'manifest.json',
    '.github/workflows/submit.yml'
  ];
  
  for (const file of requiredFiles) {
    if (!fs.existsSync(file)) {
      console.error(`❌ 缺少必要文件: ${file}`);
      return false;
    }
  }
  
  console.log('✅ 项目文件检查完成\n');
  return true;
}

// 更新版本号
function updateVersion() {
  console.log('📦 更新版本号...');
  
  const packagePath = path.join(process.cwd(), 'package.json');
  const package = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  
  const currentVersion = package.version;
  console.log(`当前版本: ${currentVersion}`);
  
  // 简单的版本号递增
  const versionParts = currentVersion.split('.');
  versionParts[2] = (parseInt(versionParts[2]) + 1).toString();
  const newVersion = versionParts.join('.');
  
  package.version = newVersion;
  fs.writeFileSync(packagePath, JSON.stringify(package, null, 2));
  
  console.log(`✅ 版本号已更新为: ${newVersion}\n`);
  return newVersion;
}

// 构建扩展
function buildExtension() {
  console.log('🔨 构建扩展...');
  
  try {
    execSync('pnpm build', { stdio: 'inherit' });
    console.log('✅ 扩展构建完成\n');
    return true;
  } catch (error) {
    console.error('❌ 构建失败:', error.message);
    return false;
  }
}

// 打包扩展
function packageExtension() {
  console.log('📦 打包扩展...');
  
  try {
    execSync('pnpm package', { stdio: 'inherit' });
    console.log('✅ 扩展打包完成\n');
    return true;
  } catch (error) {
    console.error('❌ 打包失败:', error.message);
    return false;
  }
}

// 检查 keys.json
function checkKeys() {
  console.log('🔑 检查发布凭据...');
  
  const keysPath = path.join(process.cwd(), 'keys.json');
  
  if (!fs.existsSync(keysPath)) {
    console.log('⚠️  未找到 keys.json 文件');
    console.log('请按照 PUBLISH_GUIDE.md 中的说明配置发布凭据\n');
    return false;
  }
  
  try {
    const keys = JSON.parse(fs.readFileSync(keysPath, 'utf8'));
    
    if (!keys.chrome && !keys.edge) {
      console.log('⚠️  keys.json 中缺少浏览器商店配置');
      console.log('请添加 Chrome 或 Edge 的发布凭据\n');
      return false;
    }
    
    console.log('✅ 发布凭据检查完成\n');
    return true;
  } catch (error) {
    console.error('❌ keys.json 格式错误:', error.message);
    return false;
  }
}

// 显示发布说明
function showPublishInstructions() {
  console.log('📝 发布说明:');
  console.log('1. 确保已配置 GitHub Secrets (SUBMIT_KEYS)');
  console.log('2. 提交代码到 GitHub');
  console.log('3. 访问 GitHub Actions 页面');
  console.log('4. 手动触发 "Submit to Web Store" 工作流');
  console.log('5. 等待发布完成\n');
  
  console.log('🔗 相关链接:');
  console.log('- GitHub Actions: https://github.com/YOUR_USERNAME/YOUR_REPO/actions');
  console.log('- Chrome Web Store: https://chrome.google.com/webstore/devconsole/');
  console.log('- Edge Add-ons: https://partner.microsoft.com/dashboard');
  console.log('- 发布指南: PUBLISH_GUIDE.md\n');
}

// 主函数
function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log('使用方法:');
    console.log('  node scripts/publish.js [选项]');
    console.log('');
    console.log('选项:');
    console.log('  --check     只检查项目配置');
    console.log('  --build     构建并打包扩展');
    console.log('  --version   更新版本号');
    console.log('  --help      显示帮助信息');
    return;
  }
  
  if (args.includes('--check')) {
    checkFiles();
    checkKeys();
    return;
  }
  
  if (args.includes('--version')) {
    updateVersion();
    return;
  }
  
  if (args.includes('--build')) {
    if (!checkFiles()) return;
    if (!buildExtension()) return;
    if (!packageExtension()) return;
    console.log('🎉 构建和打包完成！');
    return;
  }
  
  // 完整流程
  if (!checkFiles()) return;
  if (!checkKeys()) return;
  
  const newVersion = updateVersion();
  
  if (!buildExtension()) return;
  if (!packageExtension()) return;
  
  console.log('🎉 准备完成！');
  console.log(`📦 扩展已构建并打包，版本: ${newVersion}`);
  
  showPublishInstructions();
}

// 运行脚本
if (require.main === module) {
  main();
}

module.exports = {
  checkFiles,
  updateVersion,
  buildExtension,
  packageExtension,
  checkKeys
}; 