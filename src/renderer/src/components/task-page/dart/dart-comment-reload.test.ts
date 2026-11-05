import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DartComment } from '../../../../../shared/dart/dart-types'
import { dartListCommentsForTarget } from '@/runtime/runtime-dart-client'
import { readAllDartComments } from './dart-comment-reload'

vi.mock('@/runtime/runtime-dart-client', () => ({ dartListCommentsForTarget: vi.fn() }))

const list = vi.mocked(dartListCommentsForTarget)
const target = { kind: 'local' } as const
const comment = (id: string): DartComment => ({
  id,
  taskId: 'task',
  htmlUrl: '',
  author: '',
  text: id
})

beforeEach(() => list.mockReset())

describe('readAllDartComments', () => {
  it('advances by raw rows when an unmappable row precedes the next page', async () => {
    const first = Array.from({ length: 249 }, (_, i) => comment(String(i)))
    list
      .mockResolvedValueOnce({ ok: true, comments: first, totalCount: 251, rawCount: 250 })
      .mockResolvedValueOnce({
        ok: true,
        comments: [comment('last')],
        totalCount: 251,
        rawCount: 1
      })
    const result = await readAllDartComments(target, 'task')
    expect(list.mock.calls.map(([, args]) => args.offset)).toEqual([0, 250])
    expect(result).toMatchObject({ ok: true, comments: [...first, comment('last')] })
  })

  it('rejects a repeated id rather than publishing an incomplete read', async () => {
    list
      .mockResolvedValueOnce({ ok: true, comments: [comment('same')], totalCount: 2 })
      .mockResolvedValueOnce({ ok: true, comments: [comment('same')], totalCount: 2 })
    await expect(readAllDartComments(target, 'task')).rejects.toThrow()
  })

  it('rejects an empty page when rows remain', async () => {
    list.mockResolvedValueOnce({ ok: true, comments: [], totalCount: 1, rawCount: 0 })
    await expect(readAllDartComments(target, 'task')).rejects.toThrow()
  })
})
