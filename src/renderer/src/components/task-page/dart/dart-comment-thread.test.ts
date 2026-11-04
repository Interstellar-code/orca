import { describe, expect, it } from 'vitest'
import type { DartComment } from '../../../../../shared/dart/dart-types'
import { buildDartCommentThread } from './dart-comment-thread'

function comment(id: string, parentId?: string, createdAt?: string): DartComment {
  return {
    id,
    parentId: parentId ?? null,
    taskId: 'task1',
    htmlUrl: `https://app.dartai.com/c/${id}`,
    author: 'Alex Example',
    text: id,
    createdAt
  }
}

function shape(comments: readonly DartComment[]): string[] {
  return buildDartCommentThread(comments).map(({ comment, depth }) => `${comment.id}@${depth}`)
}

describe('buildDartCommentThread', () => {
  it('nests replies under their parent depth first', () => {
    const comments = [
      comment('root', undefined, '2026-01-01T00:00:00Z'),
      comment('reply', 'root', '2026-01-02T00:00:00Z'),
      comment('nested', 'reply', '2026-01-03T00:00:00Z')
    ]

    expect(shape(comments)).toEqual(['root@0', 'reply@1', 'nested@2'])
  })

  it('puts replies whose parent is missing on this page at depth 0', () => {
    const comments = [comment('orphan', 'elsewhere', '2026-01-01T00:00:00Z')]

    expect(shape(comments)).toEqual(['orphan@0'])
  })

  it('treats a self-parent as a root', () => {
    expect(shape([comment('loop', 'loop')])).toEqual(['loop@0'])
  })

  it('orders threads oldest first, falling back to input order on equal or missing times', () => {
    const comments = [
      comment('later', undefined, '2026-01-03T00:00:00Z'),
      comment('untimed'),
      comment('tied-a', undefined, '2026-01-02T00:00:00Z'),
      comment('tied-b', undefined, '2026-01-02T00:00:00Z'),
      comment('earlier', undefined, '2026-01-01T00:00:00Z')
    ]

    expect(shape(comments)).toEqual(['earlier@0', 'tied-a@0', 'tied-b@0', 'later@0', 'untimed@0'])
  })

  it('orders siblings oldest first without interleaving other threads', () => {
    const comments = [
      comment('root-a', undefined, '2026-01-01T00:00:00Z'),
      comment('root-b', undefined, '2026-01-02T00:00:00Z'),
      comment('a-second', 'root-a', '2026-01-05T00:00:00Z'),
      comment('b-first', 'root-b', '2026-01-03T00:00:00Z'),
      comment('a-first', 'root-a', '2026-01-04T00:00:00Z'),
      comment('a-first-reply', 'a-first', '2026-01-06T00:00:00Z')
    ]

    expect(shape(comments)).toEqual([
      'root-a@0',
      'a-first@1',
      'a-first-reply@2',
      'a-second@1',
      'root-b@0',
      'b-first@1'
    ])
  })

  it('shows every comment in a parent cycle exactly once', () => {
    const comments = [comment('a', 'b'), comment('b', 'a'), comment('free')]

    const entries = buildDartCommentThread(comments)

    expect(entries.map(({ comment }) => comment.id).sort()).toEqual(['a', 'b', 'free'])
    expect(entries.find(({ comment }) => comment.id === 'free')?.depth).toBe(0)
  })

  it('shows each duplicate id once', () => {
    const comments = [comment('dup'), comment('dup', 'dup')]

    expect(shape(comments)).toEqual(['dup@0'])
  })
})
