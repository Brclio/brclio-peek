import assert from 'node:assert/strict'
import { afterEach, mock, test } from 'node:test'
import { fetchText, formatBytes, getArchiveUrl, getFileKind, getGithubUrl, getRawUrl, loadRepository, parseGithubUrl } from './github.ts'
import type { Repository, RepoEntry } from './github.ts'

afterEach(() => mock.restoreAll())

const repository: Repository = {
  owner: 'example', name: 'project', branch: 'feature/ui', htmlUrl: 'https://github.com/example/project',
  description: '', stars: 0, entries: [],
}
const textEntry: RepoEntry = { path: 'src/你好 & demo.ts', name: '你好 & demo.ts', type: 'file', size: 100, kind: 'code', url: 'https://raw.githubusercontent.com/example/project/main/test.ts' }
const json = (value: unknown, status = 200, headers?: HeadersInit) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json', ...headers } })

function mockGithub(overrides: Record<string, unknown> = {}) {
  const calls: string[] = []
  mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const path = String(input).replace('https://api.github.com', '')
    calls.push(path)
    assert.equal(new Headers(init?.headers).get('Authorization'), null)
    if (path in overrides) return json(overrides[path])
    if (path === '/repos/example/project') return json({ name: 'project', owner: { login: 'example' }, default_branch: 'main', description: 'Example', stargazers_count: 42, html_url: 'https://github.com/example/project' })
    if (path.endsWith('/branches?per_page=100')) return json([{ name: 'main', commit: { sha: 'main-sha' } }, { name: 'feature', commit: { sha: 'feature-sha' } }])
    if (path.includes('/git/matching-refs/heads/')) return json([{ ref: 'refs/heads/feature', object: { sha: 'feature-sha' } }, { ref: 'refs/heads/feature/ui', object: { sha: 'ui-sha' } }])
    if (path.includes('/git/matching-refs/tags/')) return json([])
    if (path.includes('/git/trees/')) return json({ truncated: false, tree: [{ path: 'src', type: 'tree', sha: 'src-sha' }, { path: 'src/App.tsx', type: 'blob', size: 456, sha: 'file-sha' }, { path: 'README.md', type: 'blob', size: 123, sha: 'readme-sha' }] })
    throw new Error(`Unexpected request: ${path}`)
  })
  return calls
}

test('parses repository links, shorthand and encoded slash refs', () => {
  assert.deepEqual(parseGithubUrl(' https://github.com/example/project.git/ '), { owner: 'example', name: 'project', view: null, refPath: [] })
  assert.deepEqual(parseGithubUrl('example/project'), { owner: 'example', name: 'project', view: null, refPath: [] })
  assert.deepEqual(parseGithubUrl('github.com/example/project/blob/feature%2Fui/src/App.tsx?plain=1#L4'), { owner: 'example', name: 'project', view: 'blob', refPath: ['feature', 'ui', 'src', 'App.tsx'] })
})

test('rejects non-GitHub hosts, credentials, unsupported pages and unsafe paths', () => {
  for (const value of ['https://github.com.attacker.test/example/project', 'https://user:pass@github.com/example/project', 'ftp://github.com/example/project', 'https://github.com/example/project/issues/2', 'https://github.com/example/project/tree/main/%2e%2e/secrets', 'https://github.com/example/project/tree/main/../secrets', 'https://github.com/example/project/blob']) {
    assert.throws(() => parseGithubUrl(value), Error, value)
  }
})

test('classifies common preview and development files', () => {
  assert.equal(getFileKind('landscape.AVIF'), 'image')
  assert.equal(getFileKind('video.webm'), 'video')
  assert.equal(getFileKind('.gitignore'), 'code')
  assert.equal(getFileKind('Dockerfile'), 'code')
  assert.equal(getFileKind('README.md'), 'document')
  assert.equal(getFileKind('LICENSE'), 'document')
  assert.equal(getFileKind('export.tar.gz'), 'archive')
  assert.equal(getFileKind('something.unknown'), 'other')
  assert.equal(formatBytes(1536), '1.5 KB')
  assert.equal(formatBytes(0), '0 B')
})

test('builds encoded URLs without treating a slash-containing branch as a path', () => {
  const entry = { ...textEntry, url: undefined }
  assert.equal(getRawUrl(repository, entry), 'https://raw.githubusercontent.com/example/project/feature%2Fui/src/%E4%BD%A0%E5%A5%BD%20%26%20demo.ts')
  assert.equal(getGithubUrl(repository, entry), 'https://github.com/example/project/blob/feature%2Fui/src/%E4%BD%A0%E5%A5%BD%20%26%20demo.ts')
  assert.equal(getArchiveUrl(repository), 'https://github.com/example/project/archive/feature%2Fui.zip')
})

test('loads the default branch and creates file URLs and directory kinds', async () => {
  const calls = mockGithub()
  const repo = await loadRepository('https://github.com/example/project')
  assert.equal(repo.branch, 'main')
  assert.equal(repo.entries[0].kind, 'folder')
  assert.equal(repo.entries[1].url, 'https://raw.githubusercontent.com/example/project/main/src/App.tsx')
  assert.equal(repo.entries[1].kind, 'code')
  assert.equal(repo.stars, 42)
  assert.ok(calls.includes('/repos/example/project/git/trees/main-sha?recursive=1'))
})

test('resolves the longest real slash-containing ref and selects a deep-linked file', async () => {
  const calls = mockGithub()
  const repo = await loadRepository('https://github.com/example/project/blob/feature/ui/src/App.tsx')
  assert.equal(repo.branch, 'feature/ui')
  assert.equal(repo.initialPath, 'src')
  assert.equal(repo.initialSelection, 'src/App.tsx')
  assert.ok(repo.branches?.includes('feature/ui'))
  assert.ok(calls.includes('/repos/example/project/git/trees/ui-sha?recursive=1'))
})

test('opens a folder deep link and rejects a missing target', async () => {
  mockGithub()
  assert.equal((await loadRepository('https://github.com/example/project/tree/main/src')).initialPath, 'src')
  await assert.rejects(loadRepository('https://github.com/example/project/tree/main/missing'), /没有找到链接指向/)
})

test('resolves annotated tags to the underlying commit before reading the tree', async () => {
  const calls = mockGithub({
    '/repos/example/project/git/matching-refs/heads/v1': [],
    '/repos/example/project/git/matching-refs/tags/v1': [{ ref: 'refs/tags/v1', object: { sha: 'tag-sha', type: 'tag' } }],
    '/repos/example/project/git/tags/tag-sha': { object: { sha: 'tag-commit-sha', type: 'commit' } },
  })
  const repo = await loadRepository('https://github.com/example/project/tree/v1/src')
  assert.equal(repo.branch, 'v1')
  assert.ok(calls.includes('/repos/example/project/git/trees/tag-commit-sha?recursive=1'))
})

test('never presents a truncated recursive tree as a complete repository', async () => {
  mockGithub({ '/repos/example/project/git/trees/main-sha?recursive=1': { truncated: true, tree: [] } })
  await assert.rejects(loadRepository('example/project'), /不完整的目录/)
})

test('provides actionable anonymous rate limit and private-or-missing errors', async () => {
  mock.method(globalThis, 'fetch', async () => json({ message: 'API rate limit exceeded' }, 403, { 'x-ratelimit-remaining': '0' }))
  await assert.rejects(loadRepository('example/project'), /匿名访问额度暂时用完/)
  mock.restoreAll()
  mock.method(globalThis, 'fetch', async () => json({ message: 'Not Found' }, 404))
  await assert.rejects(loadRepository('example/project'), /私有仓库暂不支持/)
})

test('reads UTF-8 streamed text and returns embedded demo source', async () => {
  mock.method(globalThis, 'fetch', async () => new Response('const greeting = "你好"\n'))
  assert.equal(await fetchText(textEntry), 'const greeting = "你好"\n')
  assert.equal(await fetchText({ ...textEntry, content: 'embedded' }), 'embedded')
})

test('reads real text through the exact GitHub blob without depending on the raw CDN', async () => {
  mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    assert.equal(input, 'https://api.github.com/repos/example/project/git/blobs/file-sha')
    assert.equal(new Headers(init?.headers).get('Accept'), 'application/vnd.github.raw+json')
    return new Response('export const preview = true\n')
  })
  assert.equal(await fetchText({ ...textEntry, sha: 'file-sha' }), 'export const preview = true\n')
})

test('limits streamed preview bytes even when the server omits content-length', async () => {
  mock.method(globalThis, 'fetch', async () => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(1024 * 1024))
      controller.enqueue(new Uint8Array(1024 * 1024 + 1))
      controller.close()
    },
  })))
  await assert.rejects(fetchText(textEntry), /超过 2 MB/)
  await assert.rejects(fetchText({ ...textEntry, size: 2 * 1024 * 1024 + 1 }), /超过 2 MB/)
})

test('preserves cancellation and distinguishes binary or unreachable content', async () => {
  const abort = new DOMException('Cancelled', 'AbortError')
  mock.method(globalThis, 'fetch', async () => { throw abort })
  await assert.rejects(fetchText(textEntry), (error: unknown) => error === abort)
  mock.restoreAll()
  mock.method(globalThis, 'fetch', async () => new Response(new Uint8Array([65, 0, 66])))
  await assert.rejects(fetchText(textEntry), /二进制内容/)
  mock.restoreAll()
  mock.method(globalThis, 'fetch', async () => { throw new TypeError('Failed to fetch') })
  await assert.rejects(loadRepository('example/project'), /无法连接 GitHub/)
})
