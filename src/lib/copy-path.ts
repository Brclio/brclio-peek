import { getGithubUrl } from './github.ts'
import type { Repository, RepoEntry } from './github.ts'

export type CopyPathFormat = 'url' | 'relative'

export function normalizeCopyPathFormat(value: unknown): CopyPathFormat {
  return value === 'relative' ? 'relative' : 'url'
}

/** Relative paths always start at the repository root, independent of the open folder. */
export function formatCopyPaths(repository: Repository, entries: RepoEntry[], format: CopyPathFormat): string {
  return entries.map((entry) => format === 'relative'
    ? entry.path.replace(/^(?:\.\/|\/)+/, '')
    : getGithubUrl(repository, entry)).join('\n')
}

export function shouldHandlePathCopy(
  event: { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean },
  context: { typing: boolean; hasTextSelection: boolean; hasEntries: boolean; inWorkspace: boolean },
): boolean {
  return event.key.toLowerCase() === 'c'
    && (event.metaKey || event.ctrlKey)
    && !event.altKey
    && !event.shiftKey
    && context.inWorkspace
    && context.hasEntries
    && !context.typing
    && !context.hasTextSelection
}
