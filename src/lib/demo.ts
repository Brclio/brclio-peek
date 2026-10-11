import type { Repository, RepoEntry } from './github'
import { getFileKind } from './github'

const folder = (path: string): RepoEntry => ({ path, name: path.split('/').pop()!, type: 'dir', size: 0, kind: 'folder' })
const file = (path: string, size: number, url?: string, content?: string): RepoEntry => ({
  path, name: path.split('/').pop()!, type: 'file', size, kind: getFileKind(path.split('/').pop()!), url, content,
})

const readme = `# Creative Kit

为下一次灵感，留一点空间。

一个轻盈的创意项目起点，收集风景图像、影像片段与实用组件。用熟悉的 Finder 操作，在浏览器里发现每个文件。

## 开始探索

- **assets/images** · 四幅风景，从阿尔卑斯山到沙漠。
- **assets/videos** · 一段花朵的慢镜头，适合测试视频预览。
- **src/components** · 简洁的 React 组件，按下空格即可查看代码。
- **docs** · 设计规范与项目笔记。

## 本地运行

\`\`\`bash
npm install
npm run dev
\`\`\`

## 使用方式

双击打开文件夹，单击查看信息；按 **空格** 快速预览，按 **Esc** 关闭。你也可以试试列表、分栏和画廊视图。

---

这是 Brclio Peek 的本地示例仓库，用于体验界面，并非真实 GitHub 仓库。图像为本地演示插画，示例视频来自 MDN。粘贴任意公开 GitHub 仓库链接，开始浏览你的项目。
`

export const demoRepository: Repository = {
  owner: 'brclio',
  name: 'creative-kit',
  branch: 'main',
  description: '给创意一个轻盈的起点。图像、影像与代码，在这里相遇。',
  stars: 128,
  htmlUrl: 'https://github.com/brclio/creative-kit',
  isDemo: true,
  branches: ['main'],
  entries: [
    folder('assets'),
    folder('assets/images'),
    folder('assets/videos'),
    folder('src'),
    folder('src/components'),
    folder('src/styles'),
    folder('docs'),
    folder('public'),
    file('cover.svg', 18400, '/demo/alpine.svg'),
    file('preview.webm', 554058, 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.webm'),
    file('README.md', new TextEncoder().encode(readme).byteLength, undefined, readme),
    file('package.json', 352, undefined, JSON.stringify({ name: 'creative-kit', version: '1.0.0', private: true, type: 'module', scripts: { dev: 'vite', build: 'tsc && vite build', preview: 'vite preview' }, dependencies: { react: '^19.0.0', 'react-dom': '^19.0.0' }, devDependencies: { vite: '^6.0.0', typescript: '^5.7.0' } }, null, 2)),
    file('vite.config.ts', 172, undefined, "import { defineConfig } from 'vite'\nimport react from '@vitejs/plugin-react'\n\nexport default defineConfig({\n  plugins: [react()],\n  server: { port: 5173 },\n})\n"),
    file('LICENSE', 1056, undefined, 'MIT License\n\nCopyright (c) 2026 Creative Kit\n\nPermission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files, to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software.\n\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED.\n'),
    file('assets/images/alpine.svg', 18400, '/demo/alpine.svg'),
    file('assets/images/coast.svg', 15600, '/demo/coast.svg'),
    file('assets/images/studio.svg', 12700, '/demo/studio.svg'),
    file('assets/images/desert.svg', 16800, '/demo/desert.svg'),
    file('assets/videos/flower.webm', 554058, 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.webm'),
    file('src/App.tsx', 542, undefined, "import { Gallery } from './components/Gallery'\nimport './styles/global.css'\n\nconst images = ['alpine', 'coast', 'studio', 'desert']\n\nexport default function App() {\n  return (\n    <main className=\"creative-kit\">\n      <h1>为下一次灵感，留一点空间。</h1>\n      <p>A little collection of places, moments, and ideas.</p>\n      <Gallery images={images} />\n    </main>\n  )\n}\n"),
    file('src/main.tsx', 221, undefined, "import { StrictMode } from 'react'\nimport { createRoot } from 'react-dom/client'\nimport App from './App'\n\ncreateRoot(document.getElementById('root')!).render(\n  <StrictMode><App /></StrictMode>,\n)\n"),
    file('src/components/Gallery.tsx', 413, undefined, "interface GalleryProps {\n  images: string[]\n}\n\nexport function Gallery({ images }: GalleryProps) {\n  return (\n    <div className=\"gallery\">\n      {images.map((name) => (\n        <figure key={name}>\n          <img src={`/images/${name}.svg`} alt={name} loading=\"lazy\" />\n          <figcaption>{name}</figcaption>\n        </figure>\n      ))}\n    </div>\n  )\n}\n"),
    file('src/components/Button.tsx', 226, undefined, "import type { ButtonHTMLAttributes } from 'react'\n\nexport function Button(props: ButtonHTMLAttributes<HTMLButtonElement>) {\n  return <button className=\"button\" {...props} />\n}\n"),
    file('src/styles/global.css', 302, undefined, ":root {\n  font-family: Inter, system-ui, sans-serif;\n  color: #282723;\n  background: #f7f7f2;\n}\n\n.gallery {\n  display: grid;\n  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));\n  gap: 24px;\n}\n\n.gallery img { width: 100%; border-radius: 12px; }\n"),
    file('docs/design.md', 355, undefined, '# 设计笔记\n\n## 色彩\n\n纸白 `#F7F7F2`、墨黑 `#282723`、森林绿 `#466B55`。\n\n## 排版\n\n让标题清楚，让内容呼吸。正文保持舒适的行高，界面使用熟悉的图标与清晰的反馈。\n\n## 原则\n\n- 内容优先。\n- 交互尽可能自然。\n- 每一个细节，都服务于探索。\n'),
    file('docs/getting-started.md', 268, undefined, '# 从这里开始\n\n1. 安装 Node.js。\n2. 运行 `npm install` 安装依赖。\n3. 运行 `npm run dev` 启动项目。\n4. 打开终端中的本地地址。\n\n在 `assets` 中替换自己的素材，然后在 `src` 中自由创作。\n'),
    file('public/favicon.svg', 12700, '/demo/studio.svg'),
    file('.gitignore', 44, undefined, 'node_modules\ndist\n.DS_Store\n.env.local\n'),
  ],
}
