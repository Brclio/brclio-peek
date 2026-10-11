# Peek · by Brclio

把 GitHub 仓库变成可以轻松浏览的文件夹。使用 Finder 风格的界面，在浏览器中预览图片、视频、音频、代码和 Markdown。

## 本地运行

使用 Node.js 22 LTS 的最新补丁版本（至少 22.6）。项目通过 `.node-version` 和 `package.json` 的 `engines` 固定部署构建的 Node.js 主版本。

```sh
npm install
npm run dev
```

打开终端显示的本地地址。生产构建与验证：

```sh
npm test
npm run build
npm run preview
```

## 已实现

- 输入 GitHub 公开仓库链接、`owner/repo` 简写、目录或文件链接。
- 识别默认分支、其他分支、标签和包含斜杠的分支名。
- 图标、列表、分栏、画廊四种视图，目录导航、历史和面包屑。
- 全仓库文件搜索、按名称/大小/类型排序、图片/视频/代码/文档分类。
- 空格快速预览，方向键选择和切换，Enter 打开，Escape 关闭。
- Command/Ctrl 或 Shift 多选、右键菜单、收藏、最近打开。
- 工具栏按钮、右键菜单和 Command/Ctrl + C 复制所选文件或文件夹路径；默认复制完整 GitHub 链接，可切换为从仓库根目录开始的相对路径。多选时每行一个，格式偏好保存在当前浏览器；输入框和选中文字的原生复制不受影响。
- 图片原始尺寸缩放，原生音视频播放，代码语法高亮，Markdown 和 PDF 预览。
- 单文件下载，GitHub 仓库 ZIP 下载入口。
- 窄屏布局、键盘焦点管理、减少动画偏好。

`creative-kit` 是明确标注的本地示例，不对应真实 GitHub 仓库。真实仓库的数据直接读取 GitHub REST API，文本文件使用精确的 blob SHA 读取。

## 边界

- 网页只读浏览，不直接操作 Mac Finder，也不会修改、重命名或删除 GitHub 文件。
- 下载仓库 ZIP 后，可以在 Mac 解压并用 Finder 打开。
- 当前支持公开仓库；无需输入 GitHub Token，私有仓库暂不支持。
- 未认证的 GitHub API 有调用额度，额度耗尽会显示等待提示；超大仓库被 GitHub 截断时会明确提示，不展示为完整仓库。
- 文本预览上限 2 MB；二进制 Office 文件等提供下载，具体媒体格式取决于浏览器支持。Git LFS 文件和子模块不做递归展开。
- GitHub 网络和浏览器下载策略可能影响原始媒体及仓库 ZIP 下载。
- 收藏、最近打开和视图偏好仅保存在当前浏览器的 localStorage。

## 技术与素材

React 19、TypeScript、Vite、Lucide、Prism、react-markdown。界面由 [Brclio Design System](https://github.com/Brclio/brclio-design-system) 的 App 模板改编，遵循其 CC BY-NC-SA 4.0 署名要求。示例 SVG 为本项目绘制，示例视频使用 [MDN CC0 flower.webm](https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.webm)。

GitHub API 参考：[Git trees](https://docs.github.com/en/rest/git/trees#get-a-tree)、[Git blobs](https://docs.github.com/en/rest/git/blobs#get-a-blob)。

## 部署

项目构建为纯静态网站，同一份代码支持 Vercel、Cloudflare Workers 和 Cloudflare Pages。无需数据库、服务端函数或环境变量；GitHub API 和媒体请求由浏览器直接发起。以下配置用于独立部署，`.openai/hosting.json` 仅供原有 Sites 托管使用。

### Vercel

在 Vercel 选择 **Add New → Project**，导入本项目的 GitHub 仓库，Root Directory 选择仓库根目录。根目录的 `vercel.json` 已配置以下内容：

| 设置 | 值 |
| --- | --- |
| Framework Preset | Vite |
| Install Command | `npm ci` |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Node.js Version | 22.x |

点击 Deploy 后，后续 Git 推送由 Vercel 自动构建部署。配置中的 SPA rewrite 会让页面导航回到 `index.html`。

也可从本地部署，先登录，再选择目标账号和项目：

```sh
npm ci
npx vercel@63.1.2 login
npx vercel@63.1.2          # 预览部署，首次运行会关联或创建项目
npx vercel@63.1.2 --prod   # 发布到所关联项目的生产环境
```

官方说明：[Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite)。

### Cloudflare Workers（静态资源）

根目录的 `wrangler.jsonc` 使用 Workers Static Assets 托管 `dist`，无需编写 Worker 脚本。`single-page-application` 设置为未匹配静态文件的页面导航提供首页回退；`previews` 配置供分支预览使用。

本地发布：

```sh
npm ci
npx wrangler login
npm run deploy:cloudflare
```

部署命令会先构建，再上传静态资源。默认 Worker 名称为 `brclio-peek`；如需其他名称，修改 `wrangler.jsonc` 的 `name`。账号下已有同名 Worker 时，发布会更新该 Worker；在多账号场景先确认 Wrangler 使用的目标账号。登录和账号信息保存在工具本地状态中，不提交到仓库。

也可在 Cloudflare 控制台的 **Workers & Pages → Create application → 导入 Git 仓库** 中选择 Workers，使用：

| 设置 | 值 |
| --- | --- |
| Root Directory | 仓库根目录 |
| Build Command | `npm run build` |
| Deploy Command | `npx wrangler deploy` |
| Preview / Non-production Deploy Command | `npx wrangler preview` |
| Node.js Version | 由 `.node-version` 选择 22 |

Worker 项目名称应与 `wrangler.jsonc` 的 `name` 一致。控制台连接 Git 后可自动部署；手动发布和 Git 自动发布选择一种管理方式即可。

仅在本地检查和预览，不上传：

```sh
npm run check:cloudflare    # 构建并执行 Wrangler dry run
npm run preview:cloudflare  # 构建并用 Workers 本地运行时预览
```

官方说明：[Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/)、[SPA routing](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/)。

### Cloudflare Pages

若选择 Pages，在 Cloudflare 控制台创建 Pages 项目并连接 Git 仓库，选择 **React (Vite)**，构建命令填 `npm run build`，输出目录填 `dist`，Root Directory 为仓库根目录。Node.js 使用 `.node-version` 中的 22；也可在构建设置里指定 `NODE_VERSION=22`。

Pages 的纯静态 SPA 默认会回退到根目录的 `index.html`，因此这里不额外添加顶层 `404.html` 或覆盖静态资源的通配 rewrite。

命令行部署直接指定 Pages 的静态目录和项目名称：

```sh
npm ci
npx wrangler login
npx wrangler pages project create brclio-peek --production-branch main
npm run deploy:pages
```

创建项目只需执行一次，已有项目则跳过。使用其他 Pages 项目名称时，同步修改 `package.json` 中 `deploy:pages` 的 `--project-name`；`npm run preview:pages` 可在本地预览。根目录的 `wrangler.jsonc` 专用于 Workers，没有 `pages_build_output_dir`，Pages 会提示并忽略它，使用命令行指定的 `dist`。Pages 的 Git integration 项目和 Direct Upload 项目是两种创建方式，按所需发布方式选择。

官方说明：[Vite on Pages](https://developers.cloudflare.com/pages/framework-guides/deploy-a-vite3-project/)、[Pages SPA serving](https://developers.cloudflare.com/pages/configuration/serving-pages/)、[Pages Wrangler configuration](https://developers.cloudflare.com/pages/functions/wrangler-configuration/)。

部署后使用 HTTPS 地址访问，才能正常使用浏览器剪贴板 API。收藏、最近打开和复制格式偏好保存在当前站点域名下，切换托管域名时会使用独立的浏览器存储。
