import { ChevronDown, Copy } from 'lucide-react'
import type { CopyPathFormat } from '../lib/copy-path'

interface CopyPathControlProps {
  format: CopyPathFormat
  onFormatChange: (format: CopyPathFormat) => void
  onCopy: () => void
  selectedCount: number
}

export function CopyPathControl({ format, onFormatChange, onCopy, selectedCount }: CopyPathControlProps) {
  const description = format === 'url' ? '完整 GitHub 链接' : '相对路径（从仓库根目录开始）'

  return (
    <div className="copy-path-control" role="group" aria-label="复制路径工具">
      <button
        className="copy-path-button"
        aria-label={selectedCount > 1 ? '复制所选路径' : '复制路径'}
        title={`${description} · Ctrl / ⌘ C${selectedCount ? ` · ${selectedCount} 个项目` : ' · 请先选择文件或文件夹'}`}
        disabled={selectedCount === 0}
        onClick={onCopy}
      >
        <Copy size={14} /><span>复制路径</span><kbd>⌘ C</kbd>
      </button>
      <label className="copy-format-select" title={`复制路径格式：${description}`}>
        <select aria-label="复制路径格式" value={format} onChange={event => onFormatChange(event.target.value as CopyPathFormat)}>
          <option value="url">完整链接</option>
          <option value="relative">相对路径</option>
        </select>
        <ChevronDown size={10} aria-hidden="true" />
      </label>
    </div>
  )
}
