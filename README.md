## 简介
Genshred 是一款大语言模型驱动的分级阅读互联网插件，用于辅助用户阅读外语网页或提高外语阅读能力。


## 快速开始

在使用 Genshred 前，需要先启动后端服务器 Parabasis ([项目地址]())

### 1. 启动后端服务器

```bash
# 创建并激活Python虚拟环境
python -m venv ENV_DIR
source ENV_DIR/bin/activate  # Linux/Mac
# 或
ENV_DIR\Scripts\activate  # Windows

# 安装依赖
pip install -r requirements.txt

# 启动服务器
python parabasis.py
```
注意配置API Key:

**Linux/macOS (Bash/Zsh)**:
````bash
export LLM_API_KEY='your-siliconflow-api-key-here'
````

**Windows (Command Prompt)**:
````batch
set LLM_API_KEY=your-siliconflow-api-key-here
````

**Windows (PowerShell)**:
````powershell
$env:LLM_API_KEY='your-siliconflow-api-key-here'
````

### 2. 启动前端开发环境

```bash
# 安装依赖并启动开发服务器
pnpm install
pnpm dev
```

### 3. 加载浏览器插件

1. 打开 Chrome/Edge 浏览器
2. 进入扩展程序页面 (chrome://extensions 或 edge://extensions)
3. 开启"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择 `build/chrome-mv3-dev` 文件夹

完成以上步骤后，即可在浏览器工具栏看到 Genshred 图标。

## Todo List

### 前端
- 网页处理逻辑优化，适配更多场景
    - DOM 优化（Immersive Translation deepwiki）√
    - 更便捷的prompt优化√
    - 自定义提示词准确度优化
    - 针对长网页的懒加载（待改进）
- 端口选择与切换
    - 目前是写死的 localhost
- 本地缓存功能实装
    - clear cache 按钮目前未实装 
- AI 对话窗口
    - 可加载的课程包或与课程网页互动的 AI
- 用户系统
    - 注册页面等

### 后端
- 数据库结构优化
    - 数据脱敏
- 报错处理，rebouncing(?)
- 访问频次、次数上限
- 更好的用户系统

### 未来发展
- 多语言支持（多语言处理逻辑，设置项，Spacy 模型）
- 自定义 LLM 接口





This is a [Plasmo extension](https://docs.plasmo.com/) project bootstrapped with [`plasmo init`](https://www.npmjs.com/package/plasmo).

## Getting Started

First, run the development server:

```bash
pnpm dev
# or
npm run dev
```

Open your browser and load the appropriate development build. For example, if you are developing for the chrome browser, using manifest v3, use: `build/chrome-mv3-dev`.

You can start editing the popup by modifying `popup.tsx`. It should auto-update as you make changes. To add an options page, simply add a `options.tsx` file to the root of the project, with a react component default exported. Likewise to add a content page, add a `content.ts` file to the root of the project, importing some module and do some logic, then reload the extension on your browser.

For further guidance, [visit our Documentation](https://docs.plasmo.com/)

## Making production build

Run the following:

```bash
pnpm build
# or
npm run build
```

This should create a production bundle for your extension, ready to be zipped and published to the stores.

## Submit to the webstores

The easiest way to deploy your Plasmo extension is to use the built-in [bpp](https://bpp.browser.market) GitHub action. Prior to using this action however, make sure to build your extension and upload the first version to the store to establish the basic credentials. Then, simply follow [this setup instruction](https://docs.plasmo.com/framework/workflows/submit) and you should be on your way for automated submission!
