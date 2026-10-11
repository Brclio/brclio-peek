import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatCopyPaths, normalizeCopyPathFormat, shouldHandlePathCopy } from './copy-path.ts'
import type { Repository, RepoEntry } from './github.ts'

const repository: Repository = {
  owner: 'microsoft', name: 'vscode', branch: 'main', htmlUrl: 'https://github.com/microsoft/vscode',
  description: '', stars: 0, entries: [],
}
const file: RepoEntry = {
  path: 'src/vs/workbench/workbench.desktop.main.ts', name: 'workbench.desktop.main.ts',
  type: 'file', size: 100, kind: 'code',
}
const directory: RepoEntry = { path: 'src/vs', name: 'vs', type: 'dir', size: 0, kind: 'folder' }
const key = { key: 'c', metaKey: true, ctrlKey: false, altKey: false, shiftKey: false }
const context = { typing: false, hasTextSelection: false, hasEntries: true, inWorkspace: true }

test('copies the full GitHub file URL by default', () => {
  assert.equal(formatCopyPaths(repository, [file], normalizeCopyPathFormat(undefined)),
    'https://github.com/microsoft/vscode/blob/main/src/vs/workbench/workbench.desktop.main.ts')
})

test('copies a GitHub tree URL for a folder', () => {
  assert.equal(formatCopyPaths(repository, [directory], 'url'), 'https://github.com/microsoft/vscode/tree/main/src/vs')
})

test('encodes slash-containing refs, Unicode, spaces and hash characters in URLs', () => {
  const repo = { ...repository, branch: 'feature/ui polish#1' }
  const entry = { ...file, path: 'assets/你好 # demo.ts', name: '你好 # demo.ts' }
  assert.equal(formatCopyPaths(repo, [entry], 'url'),
    'https://github.com/microsoft/vscode/blob/feature%2Fui%20polish%231/assets/%E4%BD%A0%E5%A5%BD%20%23%20demo.ts')
  assert.equal(formatCopyPaths(repo, [directory], 'url'),
    'https://github.com/microsoft/vscode/tree/feature%2Fui%20polish%231/src/vs')
})

test('relative paths remain repository-root based from a nested initial folder', () => {
  const repo = { ...repository, initialPath: 'src/vs/workbench' }
  assert.equal(formatCopyPaths(repo, [file], 'relative'), 'src/vs/workbench/workbench.desktop.main.ts')
  assert.equal(formatCopyPaths(repo, [directory], 'relative'), 'src/vs')
})

test('relative paths preserve literal Unicode and special characters without a leading slash or dot', () => {
  const entry = { ...file, path: './assets/你好 # demo.ts' }
  assert.equal(formatCopyPaths(repository, [entry], 'relative'), 'assets/你好 # demo.ts')
  assert.equal(formatCopyPaths(repository, [{ ...directory, path: '/src/vs' }], 'relative'), 'src/vs')
})

test('copies multiple selected paths in their order, one per line', () => {
  assert.equal(formatCopyPaths(repository, [file, directory], 'relative'),
    'src/vs/workbench/workbench.desktop.main.ts\nsrc/vs')
  assert.equal(formatCopyPaths(repository, [directory, file], 'url'),
    'https://github.com/microsoft/vscode/tree/main/src/vs\nhttps://github.com/microsoft/vscode/blob/main/src/vs/workbench/workbench.desktop.main.ts')
})

test('empty selection produces no clipboard payload', () => {
  assert.equal(formatCopyPaths(repository, [], 'url'), '')
  assert.equal(formatCopyPaths(repository, [], 'relative'), '')
})

test('only a valid relative preference overrides the full URL default', () => {
  assert.equal(normalizeCopyPathFormat('relative'), 'relative')
  for (const value of ['url', undefined, null, '', 'absolute', 'RELATIVE', false, 0, {}, ['relative']]) {
    assert.equal(normalizeCopyPathFormat(value), 'url')
  }
})

test('handles both macOS Command+C and Control+C', () => {
  assert.equal(shouldHandlePathCopy(key, context), true)
  assert.equal(shouldHandlePathCopy({ ...key, metaKey: false, ctrlKey: true }, context), true)
  assert.equal(shouldHandlePathCopy({ ...key, key: 'C' }, context), true)
})

test('preserves native copying from text inputs, editors and selected preview text', () => {
  assert.equal(shouldHandlePathCopy(key, { ...context, typing: true }), false)
  assert.equal(shouldHandlePathCopy(key, { ...context, hasTextSelection: true }), false)
  assert.equal(shouldHandlePathCopy(key, { ...context, typing: true, hasTextSelection: true }), false)
})

test('leaves shortcuts outside the repository workspace and empty selections alone', () => {
  assert.equal(shouldHandlePathCopy(key, { ...context, inWorkspace: false }), false)
  assert.equal(shouldHandlePathCopy(key, { ...context, hasEntries: false }), false)
})

test('does not handle unmodified C, other keys, or modified copy variants', () => {
  assert.equal(shouldHandlePathCopy({ ...key, metaKey: false }, context), false)
  assert.equal(shouldHandlePathCopy({ ...key, key: 'v' }, context), false)
  assert.equal(shouldHandlePathCopy({ ...key, altKey: true }, context), false)
  assert.equal(shouldHandlePathCopy({ ...key, shiftKey: true }, context), false)
  assert.equal(shouldHandlePathCopy({ ...key, metaKey: false, ctrlKey: true, shiftKey: true }, context), false)
})
