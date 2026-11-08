import { measureClipboardTextByteLength } from '../../../shared/clipboard-text'

export const DART_BOARD_DRAG_TASK_MIME = 'application/x-orca-dart-task-ref'
export const DART_BOARD_DRAG_TASK_REF_MAX_BYTES = 1024

export type DartBoardTaskDragRef = { taskId: string; hostKey: string }

export type DartBoardTaskDragReadResult =
  | { status: 'task'; ref: DartBoardTaskDragRef }
  | { status: 'hidden' }
  | { status: 'missing' }
  | { status: 'rejected'; reason: 'too-large' | 'malformed' }

export function writeDartBoardTaskDragData(
  dataTransfer: Pick<DataTransfer, 'setData'> & { effectAllowed: string },
  ref: DartBoardTaskDragRef
): boolean {
  if (!ref.taskId || !ref.hostKey) {
    return false
  }
  const serialized = JSON.stringify({ taskId: ref.taskId, hostKey: ref.hostKey })
  if (isDartBoardTaskDragPayloadTooLarge(serialized)) {
    return false
  }
  dataTransfer.effectAllowed = 'move'
  dataTransfer.setData(DART_BOARD_DRAG_TASK_MIME, serialized)
  dataTransfer.setData('text/plain', ref.taskId)
  return true
}

export function readDartBoardTaskDragData(
  dataTransfer: Pick<DataTransfer, 'getData' | 'types'>
): DartBoardTaskDragReadResult {
  const hasTypedPayload = Array.from(dataTransfer.types).includes(DART_BOARD_DRAG_TASK_MIME)
  const raw = dataTransfer.getData(DART_BOARD_DRAG_TASK_MIME)
  if (!raw) {
    return hasTypedPayload ? { status: 'hidden' } : { status: 'missing' }
  }
  if (isDartBoardTaskDragPayloadTooLarge(raw)) {
    return { status: 'rejected', reason: 'too-large' }
  }
  const ref = parseDartBoardTaskDragRef(raw)
  return ref ? { status: 'task', ref } : { status: 'rejected', reason: 'malformed' }
}

// Drags from another Dart host must not be treated as a move on this board.
export function isDartBoardDragFromHost(
  read: DartBoardTaskDragReadResult,
  hostKey: string
): DartBoardTaskDragRef | null {
  return read.status === 'task' && read.ref.hostKey === hostKey ? read.ref : null
}

function parseDartBoardTaskDragRef(raw: string): DartBoardTaskDragRef | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  return isDartBoardTaskDragRef(parsed) ? { taskId: parsed.taskId, hostKey: parsed.hostKey } : null
}

function isDartBoardTaskDragRef(value: unknown): value is DartBoardTaskDragRef {
  return (
    typeof value === 'object' &&
    value !== null &&
    'taskId' in value &&
    typeof value.taskId === 'string' &&
    value.taskId !== '' &&
    'hostKey' in value &&
    typeof value.hostKey === 'string' &&
    value.hostKey !== ''
  )
}

function isDartBoardTaskDragPayloadTooLarge(payload: string): boolean {
  return (
    payload.length > DART_BOARD_DRAG_TASK_REF_MAX_BYTES ||
    measureClipboardTextByteLength(payload, {
      stopAfterBytes: DART_BOARD_DRAG_TASK_REF_MAX_BYTES
    }).exceededLimit
  )
}
