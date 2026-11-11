import { describe, expect, it } from 'vitest'

import {
  DART_BOARD_DRAG_TASK_MIME,
  isDartBoardDragFromHost,
  readDartBoardTaskDragData,
  writeDartBoardTaskDragData
} from './dart-board-drag-payload'

class FakeDataTransfer {
  readonly types: string[] = []
  effectAllowed = 'none'
  private readonly data = new Map<string, string>()

  getData(type: string): string {
    return this.data.get(type) ?? ''
  }

  setData(type: string, value: string): void {
    if (!this.types.includes(type)) {
      this.types.push(type)
    }
    this.data.set(type, value)
  }
}

function transferWith(raw: string): FakeDataTransfer {
  const transfer = new FakeDataTransfer()
  transfer.setData(DART_BOARD_DRAG_TASK_MIME, raw)
  return transfer
}

describe('Dart board task drag payload', () => {
  it('round trips a task ref', () => {
    const transfer = new FakeDataTransfer()
    const ref = { taskId: 'task-1', hostKey: 'host-a' }

    expect(writeDartBoardTaskDragData(transfer, ref)).toBe(true)
    expect(readDartBoardTaskDragData(transfer)).toEqual({ status: 'task', ref })
  })

  it('refuses to write an oversized ref', () => {
    const transfer = new FakeDataTransfer()

    expect(writeDartBoardTaskDragData(transfer, { taskId: 'x'.repeat(2000), hostKey: 'h' })).toBe(
      false
    )
    expect(transfer.types).toEqual([])
  })

  it('rejects malformed JSON', () => {
    expect(readDartBoardTaskDragData(transferWith('{nope'))).toEqual({
      status: 'rejected',
      reason: 'malformed'
    })
  })

  it('rejects a payload missing hostKey', () => {
    expect(readDartBoardTaskDragData(transferWith(JSON.stringify({ taskId: 't' })))).toEqual({
      status: 'rejected',
      reason: 'malformed'
    })
  })

  it('rejects multibyte oversized payloads', () => {
    const raw = JSON.stringify({ taskId: '😀'.repeat(257), hostKey: 'h' })

    expect(readDartBoardTaskDragData(transferWith(raw))).toEqual({
      status: 'rejected',
      reason: 'too-large'
    })
  })

  it('distinguishes hidden dragover data from a foreign drag', () => {
    const hidden = new FakeDataTransfer()
    hidden.types.push(DART_BOARD_DRAG_TASK_MIME)

    expect(readDartBoardTaskDragData(hidden)).toEqual({ status: 'hidden' })
    expect(readDartBoardTaskDragData(new FakeDataTransfer())).toEqual({ status: 'missing' })
  })

  it('only accepts refs from the board host', () => {
    const read = readDartBoardTaskDragData(
      transferWith(JSON.stringify({ taskId: 't', hostKey: 'host-b' }))
    )

    expect(isDartBoardDragFromHost(read, 'host-b')).toEqual({ taskId: 't', hostKey: 'host-b' })
    expect(isDartBoardDragFromHost(read, 'host-a')).toBeNull()
    expect(isDartBoardDragFromHost({ status: 'hidden' }, 'host-b')).toBeNull()
  })
})
