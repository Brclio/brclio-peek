export type FileKind = 'folder' | 'image' | 'video' | 'audio' | 'code' | 'document' | 'archive' | 'other'

export interface RepoEntry {
  path: string
  name: string
  type: 'file' | 'dir'
  size: number
  sha?: string
  url?: string
  kind: FileKind
  content?: string
}

export interface Repository {
  owner: string
  name: string
  branch: string
  description: string
  stars: number
  htmlUrl: string
  entries: RepoEntry[]
  isDemo?: boolean
  initialPath?: string
  initialSelection?: string
  branches?: string[]
}

export interface ParsedGithubUrl {
  owner: string
  name: string
  view: 'tree' | 'blob' | null
  /** A branch can contain slashes; resolve the ref/path boundary against GitHub. */
  refPath: string[]
}

const API = 'https://api.github.com'
const MAX_TEXT_BYTES = 2 * 1024 * 1024
const apiHeaders = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2026-03-10',
}

const extensions: Record<Exclude<FileKind, 'folder' | 'other'>, Set<string>> = {
  image: new Set('avif bmp gif heic heif ico jpeg jpg png svg tif tiff webp'.split(' ')),
  video: new Set('mp4 m4v mov webm ogv avi mkv'.split(' ')),
  audio: new Set('mp3 m4a aac wav ogg oga flac opus aiff'.split(' ')),
  code: new Set('js jsx ts tsx mjs cjs json jsonc css scss sass less html htm vue svelte astro py rb go rs java kt kts swift c h cpp hpp cs sh bash zsh fish sql graphql gql yaml yml toml xml ini conf env dockerfile makefile ipynb lock'.split(' ')),
  document: new Set('md mdx markdown txt rst pdf csv tsv log rtf doc docx xls xlsx ppt pptx pages numbers key'.split(' ')),
  archive: new Set('zip gz tar tgz bz2 xz 7z rar dmg iso'.split(' ')),
}

export function getFileKind(name: string): FileKind {
  const lower = name.toLowerCase()
  if (/^(license|licence|notice|authors|changelog|readme)(\.|$)/.test(lower)) return 'document'
  if (/^(dockerfile|makefile|gemfile|procfile)$/.test(lower) || lower.startsWith('.env') || /^\.(gitignore|gitattributes|editorconfig|npmrc|prettierrc|eslintrc)$/.test(lower)) return 'code'
  const extension = lower.split('.').pop() ?? ''
  for (const [kind, values] of Object.entries(extensions)) {
    if (values.has(extension)) return kind as FileKind
  }
  return 'other'
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), 4)
  const value = bytes / 1024 ** unit
  return `${Number(value.toFixed(unit === 0 ? 0 : 1))} ${['B', 'KB', 'MB', 'GB', 'TB'][unit]}`
}

function decodeSegment(segment: string): string {
  let decoded: string
  try {
    decoded = decodeURIComponent(segment)
  } catch {
    throw new Error('链接包含无法识别的字符编码，请复制完整的 GitHub 链接。')
  }
  if (decoded === '.' || decoded === '..' || /[\\\x00-\x1f\x7f]/.test(decoded)) {
    throw new Error('GitHub 链接包含无效的文件路径。')
  }
  return decoded
}

export function parseGithubUrl(input: string): ParsedGithubUrl {
  let value = input.trim()
  if (!value) throw new Error('先粘贴一个 GitHub 仓库链接。')
  if (/^[\w.-]+\/[\w.-]+\/?$/.test(value)) value = `https://github.com/${value}`
  else if (/^(www\.)?github\.com\//i.test(value)) value = `https://${value}`

  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('请输入有效的 GitHub 链接，例如 https://github.com/owner/repo。')
  }
  if (!['https:', 'http:'].includes(url.protocol) || !['github.com', 'www.github.com'].includes(url.hostname.toLowerCase()) || url.port || url.username || url.password) {
    throw new Error('目前支持 github.com 上的公开仓库，请使用 GitHub 仓库链接。')
  }

  // Inspect the original pathname before URL normalizes dot segments away.
  const originalPath = value.replace(/^[a-z]+:\/\/[^/]+/i, '').split(/[?#]/, 1)[0]
  const parts = originalPath.split('/').filter(Boolean).flatMap((part) => decodeSegment(part).split('/'))
  if (parts.some((part) => !part || part === '.' || part === '..')) throw new Error('GitHub 链接包含无效的文件路径。')
  const [owner, rawName, view, ...refPath] = parts
  const name = rawName?.replace(/\.git$/i, '')
  if (!owner || !name || !/^[a-z\d][a-z\d-]{0,38}$/i.test(owner) || !/^[\w.-]{1,100}$/.test(name) || name === '.' || name === '..') {
    throw new Error('链接需要包含仓库所有者和仓库名，例如 github.com/owner/repo。')
  }
  if (view && view !== 'tree' && view !== 'blob') {
    throw new Error('请粘贴仓库首页、文件夹或文件链接，暂不支持 Issues 和 Pull Requests 页面。')
  }
  if (view && refPath.length === 0) throw new Error('这个链接缺少分支名称，请重新复制 GitHub 地址。')
  return { owner, name, view: view === 'tree' || view === 'blob' ? view : null, refPath }
}

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/')
}

export function getRawUrl(repo: Repository, entry: RepoEntry): string {
  return entry.url ?? `https://raw.githubusercontent.com/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/${encodeURIComponent(repo.branch)}/${encodePath(entry.path)}`
}

export function getGithubUrl(repo: Repository, entry: RepoEntry): string {
  return `${repo.htmlUrl}/${entry.type === 'dir' ? 'tree' : 'blob'}/${encodeURIComponent(repo.branch)}/${encodePath(entry.path)}`
}

export function getArchiveUrl(repo: Repository): string {
  return `${repo.htmlUrl}/archive/${encodeURIComponent(repo.branch)}.zip`
}

function isAbort(error: unknown, signal?: AbortSignal): boolean {
  return Boolean(signal?.aborted) || (error instanceof Error && error.name === 'AbortError')
}

async function githubJson<T>(path: string, signal?: AbortSignal, missingMessage?: string): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API}${path}`, { headers: apiHeaders, signal })
  } catch (error) {
    if (isAbort(error, signal)) throw error
    throw new Error('暂时无法连接 GitHub。请检查网络连接后重试。')
  }
  if (!response.ok) {
    let message = ''
    try {
      const body = await response.json() as { message?: string }
      message = body.message ?? ''
    } catch { /* Status and headers still provide a useful error. */ }
    if (response.status === 429 || (response.status === 403 && (response.headers.get('x-ratelimit-remaining') === '0' || /rate limit|abuse|secondary rate/i.test(message)))) {
      const reset = Number(response.headers.get('x-ratelimit-reset'))
      const minutes = reset > Date.now() / 1000 ? Math.ceil((reset * 1000 - Date.now()) / 60000) : 0
      throw new Error(`GitHub 的匿名访问额度暂时用完了${minutes > 0 ? `，约 ${minutes} 分钟后恢复` : ''}。请稍后再试，或先浏览示例仓库。`)
    }
    if (response.status === 404) throw new Error(missingMessage ?? '没有找到这个公开仓库。请检查链接；私有仓库暂不支持。')
    if (response.status === 409) throw new Error('这个仓库还没有可浏览的文件，请选择一个已有提交的公开仓库。')
    if (response.status === 403) throw new Error('GitHub 拒绝了这次访问。请确认仓库公开，并稍后重试。')
    throw new Error(`GitHub 暂时无法返回仓库内容（${response.status}），请稍后重试。`)
  }
  try {
    return await response.json() as T
  } catch (error) {
    if (isAbort(error, signal)) throw error
    throw new Error('GitHub 返回了无法读取的数据，请稍后重试。')
  }
}

interface GithubBranch { name: string; commit: { sha: string } }
interface GithubRef { ref: string; object: { sha: string; type?: string } }
interface GithubTreeEntry { path: string; type: 'blob' | 'tree' | 'commit'; size?: number; sha: string }
interface GithubTree { truncated: boolean; tree: GithubTreeEntry[] }

/** Public, anonymous GitHub API only. No access token is requested or stored. */
export async function loadRepository(input: string, signal?: AbortSignal): Promise<Repository> {
  const parsed = parseGithubUrl(input)
  const base = `/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.name)}`
  const metadata = await githubJson<{
    name: string; owner: { login: string }; default_branch: string; description: string | null; stargazers_count: number; html_url: string
  }>(base, signal)
  const branches = await githubJson<GithubBranch[]>(`${base}/branches?per_page=100`, signal)
  let branch = metadata.default_branch
  let ref = branches.find((item) => item.name === branch)?.commit.sha ?? branch
  let targetPath = ''

  if (parsed.view) {
    const firstSegment = encodeURIComponent(parsed.refPath[0])
    // Matching refs lets us find slash-containing branches beyond the first 100 branches.
    // https://docs.github.com/en/rest/git/refs#list-matching-references
    const [heads, tags] = await Promise.all([
      githubJson<GithubRef[]>(`${base}/git/matching-refs/heads/${firstSegment}`, signal),
      githubJson<GithubRef[]>(`${base}/git/matching-refs/tags/${firstSegment}`, signal),
    ])
    const candidates = [
      ...heads.map((item) => ({ name: item.ref.replace(/^refs\/heads\//, ''), sha: item.object.sha, type: item.object.type ?? 'commit' })),
      ...tags.map((item) => ({ name: item.ref.replace(/^refs\/tags\//, ''), sha: item.object.sha, type: item.object.type ?? 'commit' })),
      ...branches.map((item) => ({ name: item.name, sha: item.commit.sha, type: 'commit' })),
    ].sort((a, b) => b.name.length - a.name.length)
    const path = parsed.refPath.join('/')
    const candidate = candidates.find((item) => path === item.name || path.startsWith(`${item.name}/`))
    if (candidate) {
      branch = candidate.name
      ref = candidate.sha
      targetPath = path.slice(candidate.name.length).replace(/^\//, '')
      let objectType = candidate.type
      for (let depth = 0; objectType === 'tag' && depth < 5; depth++) {
        const tag = await githubJson<{ object: { sha: string; type: string } }>(`${base}/git/tags/${encodeURIComponent(ref)}`, signal)
        ref = tag.object.sha
        objectType = tag.object.type
      }
      if (objectType === 'tag') throw new Error('这个标签嵌套层数过多，请粘贴仓库或分支链接。')
    } else if (/^[a-f\d]{7,40}$/i.test(parsed.refPath[0])) {
      branch = parsed.refPath[0]
      ref = branch
      targetPath = parsed.refPath.slice(1).join('/')
    } else {
      throw new Error('没有找到链接中的分支或标签，请检查名称，或粘贴仓库首页链接。')
    }
  }

  const tree = await githubJson<GithubTree>(`${base}/git/trees/${encodeURIComponent(ref)}?recursive=1`, signal, '没有找到这个分支的文件，请检查链接后重试。')
  // GitHub caps recursive results at 100,000 entries / 7 MB. Never show a partial tree as complete.
  // https://docs.github.com/en/rest/git/trees#get-a-tree
  if (tree.truncated) throw new Error('这个仓库的文件树太大，GitHub 返回了不完整的目录。当前版本暂不支持完整浏览此仓库，请选择较小的仓库。')
  if (!Array.isArray(tree.tree)) throw new Error('GitHub 返回的目录格式异常，请稍后重试。')

  const repo: Repository = {
    owner: metadata.owner.login,
    name: metadata.name,
    branch,
    description: metadata.description ?? '',
    stars: metadata.stargazers_count,
    htmlUrl: metadata.html_url,
    entries: [],
    branches: [...new Set([metadata.default_branch, ...branches.map((item) => item.name), branch])].filter(Boolean),
  }
  repo.entries = tree.tree.map((item) => {
    const isDirectory = item.type === 'tree'
    const entry: RepoEntry = {
      path: item.path,
      name: item.path.split('/').pop() ?? item.path,
      type: isDirectory ? 'dir' : 'file',
      size: item.size ?? 0,
      sha: item.sha,
      kind: isDirectory ? 'folder' : getFileKind(item.path.split('/').pop() ?? item.path),
    }
    if (!isDirectory && item.type === 'blob') entry.url = getRawUrl(repo, entry)
    return entry
  })
  if (targetPath) {
    const target = repo.entries.find((entry) => entry.path === targetPath)
    if (!target) throw new Error('这个分支中没有找到链接指向的文件或文件夹，请检查地址后重试。')
    if (target.type === 'dir') repo.initialPath = target.path
    else {
      repo.initialPath = target.path.split('/').slice(0, -1).join('/')
      repo.initialSelection = target.path
    }
  }
  return repo
}

export async function fetchText(entry: RepoEntry, signal?: AbortSignal): Promise<string> {
  if (entry.size > MAX_TEXT_BYTES) throw new Error('这个文件超过 2 MB，暂不支持文本预览。你可以下载或在 GitHub 中打开。')
  if (entry.content !== undefined) {
    if (new TextEncoder().encode(entry.content).byteLength > MAX_TEXT_BYTES) throw new Error('这个文件超过 2 MB，暂不支持文本预览。')
    return entry.content
  }
  if (!entry.url) throw new Error('这个文件暂无可读取的预览地址。')
  try {
    let textUrl = entry.url
    let headers: HeadersInit | undefined
    const source = new URL(entry.url, globalThis.location?.origin ?? 'https://localhost')
    if (source.hostname === 'raw.githubusercontent.com' && entry.sha) {
      const [owner, name] = source.pathname.split('/').filter(Boolean)
      if (owner && name) {
        // Read the exact blob from the API; the raw CDN can be blocked independently.
        // https://docs.github.com/en/rest/git/blobs#get-a-blob
        textUrl = `${API}/repos/${owner}/${name}/git/blobs/${encodeURIComponent(entry.sha)}`
        headers = { ...apiHeaders, Accept: 'application/vnd.github.raw+json' }
      }
    }
    const response = await fetch(textUrl, { signal, headers })
    if (response.status === 429 || (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0')) throw new Error('GitHub 的匿名访问额度暂时用完了。请稍后再试，或先浏览示例仓库。')
    if (!response.ok) throw new Error(response.status === 404 ? '这个文件暂时无法读取，可能已被移动或删除。' : `文件读取失败（${response.status}），请重试。`)
    if (Number(response.headers.get('content-length')) > MAX_TEXT_BYTES) {
      await response.body?.cancel()
      throw new Error('这个文件超过 2 MB，暂不支持文本预览。')
    }
    const reader = response.body?.getReader()
    const chunks: Uint8Array[] = []
    let length = 0
    if (reader) {
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          length += value.byteLength
          if (length > MAX_TEXT_BYTES) {
            await reader.cancel()
            throw new Error('这个文件超过 2 MB，暂不支持文本预览。')
          }
          chunks.push(value)
        }
      } finally {
        reader.releaseLock()
      }
    } else {
      const value = new Uint8Array(await response.arrayBuffer())
      length = value.byteLength
      if (length > MAX_TEXT_BYTES) throw new Error('这个文件超过 2 MB，暂不支持文本预览。')
      chunks.push(value)
    }
    const bytes = new Uint8Array(length)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    if (bytes.subarray(0, 4096).includes(0)) throw new Error('这个文件包含二进制内容，暂不支持文本预览。')
    return new TextDecoder().decode(bytes)
  } catch (error) {
    if (isAbort(error, signal)) throw error
    if (error instanceof TypeError) throw new Error('文件加载失败，请检查网络后重试。')
    throw error
  }
}
