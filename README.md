# Peek · by Brclio

把 GitHub 仓库变成可以轻松浏览的文件夹。使用 Finder 风格的界面，在浏览器中预览图片、视频、音频、代码和 Markdown。

## 本地运行

需要 Node.js 22.6 或更新版本。

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
- Command/Ctrl 或 Shift 多选、右键菜单、收藏、复制路径、最近打开。
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
