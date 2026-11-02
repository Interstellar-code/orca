import type {
  DartComment,
  DartCommentPage,
  DartConnectionStatus,
  DartTask,
  DartTaskPage,
  DartWorkspaceConfig
} from '../../shared/dart/dart-types'

export function formatDartStatus(status: DartConnectionStatus): string {
  if (!status.connected) {
    return 'Not connected to Dart. Add a Dart API token in Orca settings.'
  }
  const lines = [
    `Connected as ${status.viewer ? `${status.viewer.name} <${status.viewer.email ?? 'no email'}> (${status.viewer.id})` : 'an unknown user'}`
  ]
  if (status.credentialError) {
    lines.push(status.credentialError)
  }
  return lines.join('\n')
}

function formatTaskLine(task: DartTask): string {
  return `${task.id}\t${task.status ?? 'no status'}\t${task.assignee ?? 'unassigned'}\t${task.title}`
}

export function formatDartTaskList(page: DartTaskPage): string {
  if (page.tasks.length === 0) {
    return 'No tasks.'
  }
  const rows = page.tasks.map(formatTaskLine)
  if (page.totalCount > page.tasks.length) {
    rows.push(`${page.tasks.length} of ${page.totalCount} tasks; page with --offset.`)
  }
  return rows.join('\n')
}

export function formatDartTask(task: DartTask): string {
  const lines = [
    `${task.id} ${task.title}`,
    `URL: ${task.htmlUrl || 'not reported'}`,
    `Status: ${task.status ?? 'none'}`,
    `Dartboard: ${task.dartboard ?? 'none'}`,
    `Type: ${task.type ?? 'none'}`,
    `Assignee: ${task.assignee ?? 'unassigned'}`,
    `Priority: ${task.priority ?? 'none'}`,
    `Size: ${task.size ?? 'none'}`
  ]
  if (task.tags.length > 0) {
    lines.push(`Tags: ${task.tags.join(', ')}`)
  }
  if (task.parentId) {
    lines.push(`Parent: ${task.parentId}`)
  }
  if (task.dueAt) {
    lines.push(`Due: ${task.dueAt}`)
  }
  lines.push(`Updated: ${task.updatedAt ?? 'unknown'}`)
  if (task.description) {
    lines.push('', task.description)
  }
  return lines.join('\n')
}

export function formatDartConfig(config: DartWorkspaceConfig): string {
  const sections: [string, string[]][] = [
    ['Dartboards', config.dartboards],
    ['Statuses', config.statuses],
    ['Types', config.types],
    ['Priorities', config.priorities],
    ['Tags', config.tags],
    ['Assignees', config.assignees],
    ['Sizes', config.sizes]
  ]
  return sections
    .map(([label, values]) => `${label}: ${values.length === 0 ? 'none' : values.join(', ')}`)
    .join('\n')
}

export function formatDartCommentList(page: DartCommentPage): string {
  if (page.comments.length === 0) {
    return 'No comments.'
  }
  return page.comments
    .map((comment: DartComment) =>
      [
        `${comment.id}\t${comment.author || 'unknown'} — ${comment.createdAt ?? 'unknown time'}`,
        comment.text
      ].join('\n')
    )
    .join('\n\n')
}

export function formatDartMutation(verb: string, task: DartTask): string {
  return `${verb} ${task.id} ${task.title}\nURL: ${task.htmlUrl || 'not reported'}`
}

export function formatDartCommentAdded(comment: DartComment): string {
  return `Commented on ${comment.taskId}\nURL: ${comment.htmlUrl || 'not reported'}`
}
