import { useEffect, useMemo, useState } from 'react'
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import Prism from 'prismjs'
import 'prismjs/components/prism-typescript'
import 'prismjs/components/prism-jsx'
import 'prismjs/components/prism-tsx'
import 'prismjs/components/prism-json'
import 'prismjs/components/prism-python'
import 'prismjs/components/prism-bash'
import 'prismjs/components/prism-yaml'
import 'prismjs/components/prism-markdown'
import {
  AlertCircle, Braces, ChevronRight, Download, File, FileArchive,
  FileText, Folder, Image, Music2, Play, RotateCcw, ZoomIn, ZoomOut,
} from 'lucide-react'
import { fetchText, formatBytes, getRawUrl } from '../lib/github'
import type { RepoEntry, Repository } from '../lib/github'
import './FilePreview.css'

interface FilePreviewProps {
  entry: RepoEntry
  repository: Repository
  large?: boolean
  onDownload?: () => void
}

const fileTypes: Record<RepoEntry['kind'], string> = {
  folder: '文件夹', image: '图像', video: '视频', audio: '音频',
  code: '源代码', document: '文档', archive: '压缩文件', other: '文件',
}

function getExtension(name: string) {
  return name.includes('.') ? name.split('.').pop()!.toLowerCase() : ''
}

function getLanguage(name: string) {
  const extension = getExtension(name)
  const languages: Record<string, string> = {
    js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'jsx',
    ts: 'typescript', tsx: 'tsx', json: 'json', css: 'css',
    html: 'markup', htm: 'markup', xml: 'markup', svg: 'markup',
    py: 'python', sh: 'bash', bash: 'bash', zsh: 'bash',
    yaml: 'yaml', yml: 'yaml', md: 'markdown', mdx: 'markdown',
  }
  return languages[extension] || 'plain text'
}

function EntryIcon({ kind, size = 18 }: { kind: RepoEntry['kind']; size?: number }) {
  const icons = {
    folder: Folder, image: Image, video: Play, audio: Music2,
    code: Braces, document: FileText, archive: FileArchive, other: File,
  }
  const Icon = icons[kind]
  return <Icon size={size} strokeWidth={1.7} aria-hidden="true" />
}

function CodePreview({ text, name }: { text: string; name: string }) {
  const language = getLanguage(name)
  const lines = useMemo(() => {
    const grammar = Prism.languages[language]
    const source = text.replace(/\n$/, '')
    if (!grammar) return null
    return Prism.highlight(source, grammar, language).split('\n')
  }, [text, language])

  return (
    <div className="fp-code">
      <div className="fp-code-toolbar">
        <span><Braces size={13} aria-hidden="true" />{language === 'plain text' ? 'TEXT' : language.toUpperCase()}</span>
        <span>{text.split('\n').length} 行</span>
      </div>
      <div className="fp-code-scroll" tabIndex={0} aria-label={`${name} 源代码，可横向滚动`}>
        <pre className="fp-code-pre"><code>{(lines || text.replace(/\n$/, '').split('\n')).map((line, index) => (
          <span className="fp-code-line" key={index}>
            <span className="fp-line-number" aria-hidden="true">{index + 1}</span>
            {lines
              ? <span className="fp-line-content" dangerouslySetInnerHTML={{ __html: line || ' ' }} />
              : <span className="fp-line-content">{line || ' '}</span>}
          </span>
        ))}</code></pre>
      </div>
    </div>
  )
}

export function FilePreview({ entry, repository, large = false, onDownload }: FilePreviewProps) {
  const [textState, setTextState] = useState<{ key: string; text?: string; error?: string }>({ key: '' })
  const [retry, setRetry] = useState(0)
  const [zoomed, setZoomed] = useState(false)
  const [mediaError, setMediaError] = useState(false)
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null)
  const extension = getExtension(entry.name)
  const rawUrl = entry.type === 'file' ? getRawUrl(repository, entry) : ''
  const textKey = `${repository.owner}/${repository.name}/${repository.branch}/${entry.path}`
  const isMarkdown = ['md', 'markdown', 'mdx'].includes(extension) || /^readme$/i.test(entry.name)
  const isPdf = extension === 'pdf'
  const isText = entry.kind === 'code' || (entry.kind === 'document' && (
    ['md', 'markdown', 'mdx', 'txt', 'rst', 'csv', 'tsv', 'log'].includes(extension)
    || /^(license|licence|notice|authors|changelog|readme)(\.|$)/i.test(entry.name)
  ))
  const text = entry.content ?? (textState.key === textKey ? textState.text : undefined)
  const error = textState.key === textKey ? textState.error : undefined
  const directChildren = useMemo(() => {
    if (entry.type !== 'dir') return []
    const prefix = entry.path ? `${entry.path}/` : ''
    return repository.entries.filter((item) => item.path.startsWith(prefix)
      && item.path !== entry.path && !item.path.slice(prefix.length).includes('/'))
  }, [entry, repository.entries])

  useEffect(() => {
    setZoomed(false)
    setMediaError(false)
    setImageSize(null)
  }, [textKey])

  useEffect(() => {
    if (!isText || entry.content !== undefined) return
    const controller = new AbortController()
    setTextState({ key: textKey })
    fetchText(entry, controller.signal).then((content) => {
      if (!controller.signal.aborted) setTextState({ key: textKey, text: content })
    }).catch((reason: unknown) => {
      if (!controller.signal.aborted) setTextState({
        key: textKey,
        error: reason instanceof Error ? reason.message : '暂时无法读取这个文件，请重试。',
      })
    })
    return () => controller.abort()
  }, [entry, repository, textKey, isText, retry])

  function resolveMarkdownUrl(value: string, isImage: boolean) {
    const safe = defaultUrlTransform(value)
    if (!safe || /^(https?:|mailto:|#)/i.test(safe)) return safe
    try {
      const base = isImage ? rawUrl : `${repository.htmlUrl}/blob/${encodeURIComponent(repository.branch)}/${entry.path}`
      return new URL(safe, base).href
    } catch {
      return ''
    }
  }

  let preview
  if (entry.type === 'dir') {
    preview = (
      <div className="fp-folder-preview">
        <div className="fp-folder-shape" aria-hidden="true"><span /></div>
        <span className="fp-folder-count">{directChildren.length} 个项目</span>
        {large && directChildren.length > 0 && (
          <div className="fp-folder-contents">
            {directChildren.slice(0, 8).map((child) => (
              <div className="fp-folder-item" key={child.path}>
                <span className={`fp-child-icon fp-child-icon--${child.kind}`}><EntryIcon kind={child.kind} size={17} /></span>
                <span>{child.name}</span><span>{child.type === 'dir' ? '文件夹' : formatBytes(child.size)}</span>
              </div>
            ))}
            {directChildren.length > 8 && <span className="fp-folder-more">另有 {directChildren.length - 8} 个项目</span>}
          </div>
        )}
      </div>
    )
  } else if (mediaError) {
    preview = <div className="fp-placeholder"><AlertCircle size={35} /><p>无法加载预览</p><span>浏览器可能不支持此文件格式，或原始文件暂时不可用。</span></div>
  } else if (entry.kind === 'image') {
    preview = (
      <div className="fp-image-frame">
        <div className={`fp-image-preview${zoomed ? ' fp-image-preview--zoomed' : ''}`}>
          <img
            key={rawUrl}
            className="fp-image"
            src={rawUrl}
            alt={entry.name}
            onError={() => setMediaError(true)}
            onLoad={(event) => setImageSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
          />
        </div>
        {large && <button className="fp-zoom" type="button" onClick={() => setZoomed(!zoomed)} aria-label={zoomed ? '缩小至适应窗口' : '放大至原始尺寸'} aria-pressed={zoomed}>
          {zoomed ? <ZoomOut size={17} /> : <ZoomIn size={17} />}<span>{zoomed ? '适应窗口' : '原始尺寸'}</span>
        </button>}
      </div>
    )
  } else if (entry.kind === 'video') {
    preview = <div className="fp-video-preview"><video key={rawUrl} src={rawUrl} controls playsInline preload="metadata" onError={() => setMediaError(true)} aria-label={`播放 ${entry.name}`} /></div>
  } else if (entry.kind === 'audio') {
    preview = <div className="fp-audio-preview"><div className="fp-audio-art"><Music2 size={48} strokeWidth={1.3} /></div><span className="fp-audio-label">A LITTLE SOUND</span><audio key={rawUrl} src={rawUrl} controls preload="metadata" onError={() => setMediaError(true)} aria-label={`播放 ${entry.name}`} /></div>
  } else if (isPdf) {
    preview = <div className="fp-pdf-preview"><iframe src={rawUrl} title={`${entry.name} PDF 预览`} referrerPolicy="no-referrer" /><a href={rawUrl} target="_blank" rel="noreferrer">在新窗口打开 PDF <ChevronRight size={13} /></a></div>
  } else if (isText) {
    if (error) {
      preview = <div className="fp-placeholder fp-error" role="status"><AlertCircle size={30} /><p>文件读取失败</p><span>{error}</span><button className="fp-retry" type="button" onClick={() => setRetry(retry + 1)}><RotateCcw size={14} />重新加载</button></div>
    } else if (text === undefined) {
      preview = <div className="fp-loading" role="status"><div className="fp-loading-lines" aria-hidden="true"><i /><i /><i /><i /><i /></div><span>正在读取文件…</span></div>
    } else if (isMarkdown) {
      preview = <div className="fp-markdown"><ReactMarkdown urlTransform={(value, key) => resolveMarkdownUrl(value, key === 'src')} components={{
        a: ({ children, ...props }) => <a {...props} target="_blank" rel="noreferrer">{children}</a>,
        img: ({ ...props }) => <img {...props} loading="lazy" />,
      }}>{text}</ReactMarkdown></div>
    } else {
      preview = <CodePreview text={text} name={entry.name} />
    }
  } else {
    preview = <div className="fp-placeholder"><div className={`fp-document-icon fp-document-icon--${entry.kind}`}><EntryIcon kind={entry.kind} size={46} /><span>{extension ? extension.toUpperCase() : 'FILE'}</span></div><p>此文件可下载后查看</p><span>使用 Mac 上的应用打开这个文件。</span></div>
  }

  return (
    <section className={`fp-preview${large ? ' fp-large' : ''} fp-kind-${entry.kind}`} aria-label={`${entry.name} 预览`}>
      {large && <div className="fp-large-heading"><span className={`fp-heading-icon fp-heading-icon--${entry.kind}`}><EntryIcon kind={entry.kind} /></span><div><strong>{entry.name}</strong><span>{fileTypes[entry.kind]}{entry.type === 'file' ? ` · ${formatBytes(entry.size)}` : ''}</span></div></div>}
      <div className="fp-content">{preview}</div>
      {!large && <div className="fp-info">
        <div className="fp-title"><h3 title={entry.name}>{entry.name}</h3><p>{fileTypes[entry.kind]}{extension && entry.type !== 'dir' ? ` · ${extension.toUpperCase()}` : ''}</p></div>
        <dl className="fp-properties">
          <div><dt>大小</dt><dd>{entry.type === 'dir' ? `${directChildren.length} 个项目` : formatBytes(entry.size)}</dd></div>
          {imageSize && <div><dt>尺寸</dt><dd>{imageSize.width} × {imageSize.height}</dd></div>}
          <div><dt>所在位置</dt><dd title={entry.path.slice(0, Math.max(0, entry.path.lastIndexOf('/'))) || repository.name}>{entry.path.includes('/') ? entry.path.slice(0, entry.path.lastIndexOf('/')) : repository.name}</dd></div>
          <div><dt>分支</dt><dd>{repository.branch}</dd></div>
        </dl>
        {onDownload && entry.type === 'file' && <button type="button" className="fp-download" onClick={onDownload}><Download size={15} />下载文件</button>}
      </div>}
      {large && <div className="fp-footer"><span title={entry.path}>{entry.path}</span><span>{imageSize ? `${imageSize.width} × ${imageSize.height}` : entry.type === 'dir' ? `${directChildren.length} 个项目` : formatBytes(entry.size)}</span></div>}
    </section>
  )
}

export default FilePreview
