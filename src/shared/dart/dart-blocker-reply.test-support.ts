export const BLOCKER_TASK_ID = 'abcDEF123456'
export const BLOCKER_OTHER_ID = 'zyxWVU654321'
export const BLOCKER_PARAMS = { taskId: BLOCKER_TASK_ID, blockerIds: [BLOCKER_OTHER_ID] }

export const BLOCKER_RAW_TASK = {
  id: BLOCKER_TASK_ID,
  htmlUrl: `https://app.dartai.com/t/${BLOCKER_TASK_ID}-fix-it`,
  title: 'Fix it',
  status: 'Doing',
  taskRelationships: { blockerIds: [BLOCKER_OTHER_ID], subtaskIds: [] }
}

// The reply every transport must return for BLOCKER_RAW_TASK.
export const BLOCKER_REPLY = {
  ok: true,
  task: {
    id: BLOCKER_TASK_ID,
    title: 'Fix it',
    htmlUrl: `https://app.dartai.com/t/${BLOCKER_TASK_ID}-fix-it`,
    parentId: null,
    dartboard: null,
    type: null,
    status: 'Doing',
    assignee: null,
    tags: [],
    priority: null,
    size: null,
    startAt: null,
    dueAt: null,
    createdBy: null,
    updatedBy: null,
    completedAt: null,
    relationships: {
      subtaskIds: [],
      blockerIds: [BLOCKER_OTHER_ID],
      blockingIds: [],
      duplicateIds: [],
      relatedIds: []
    }
  }
}
