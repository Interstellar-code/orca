import type {
  DartComment,
  DartTask,
  DartWorkspaceConfig
} from '../../../../../shared/dart/dart-types'

// Invented data only: fake people, fake board, 12-character fake ids.
export const fixtureConfig: DartWorkspaceConfig = {
  dartboards: ['Example/Platform', 'Example/Platform/Search', 'Example/Design'],
  statuses: ['To-do', 'Doing', 'Blocked', 'Done'],
  types: [],
  tags: [],
  priorities: [],
  sizes: [],
  assignees: []
}

const base = {
  htmlUrl: 'https://app.dartai.com/t/aB3dE5gH7jK9-example',
  assignee: 'Alex Example',
  tags: [] as string[]
}

export const fixtureTasks: DartTask[] = [
  {
    ...base,
    id: 'aB3dE5gH7jK9',
    title: 'Search results ignore archived projects',
    dartboard: 'Example/Platform/Search',
    status: 'Doing',
    priority: 'High',
    updatedAt: new Date(Date.now() - 12 * 60_000).toISOString()
  },
  {
    ...base,
    id: 'bC4eF6hI8kL0',
    title: 'Add CSV export to the billing report',
    dartboard: 'Example/Platform',
    status: 'To-do',
    priority: 'Medium',
    updatedAt: new Date(Date.now() - 3_600_000).toISOString()
  },
  {
    ...base,
    id: 'cD5fG7iJ9lM1',
    title: 'Onboarding email links to the old docs',
    dartboard: 'Example/Design',
    status: 'Blocked',
    priority: 'High',
    assignee: null,
    updatedAt: new Date(Date.now() - 3 * 3_600_000).toISOString()
  },
  {
    ...base,
    id: 'dE6gH8jK0mN2',
    title: 'Remove unused feature flags',
    dartboard: 'Example/Platform',
    status: 'Done',
    priority: 'Low',
    updatedAt: new Date(Date.now() - 5 * 86_400_000).toISOString()
  }
]

// Release A board data: finished tasks, on-hold by status and by tag, and a status /config does not list.
export const fixtureBoardConfig: DartWorkspaceConfig = {
  ...fixtureConfig,
  statuses: ['To-do', 'Doing', 'On hold', 'Done'],
  tags: ['search', 'backend', 'on-hold'],
  priorities: ['high', 'medium', 'low']
}

export const fixtureBoardTasks: DartTask[] = [
  ...fixtureTasks.slice(0, 3),
  {
    ...base,
    id: 'eF7hI9kL1nO3',
    title: 'Wait for legal review of the data terms',
    dartboard: 'Example/Platform',
    status: 'On hold',
    priority: 'Medium',
    updatedAt: new Date(Date.now() - 2 * 86_400_000).toISOString()
  },
  {
    ...base,
    id: 'fG8iJ0lM2oP4',
    title: 'Migrate invoices to the new tax service',
    dartboard: 'Example/Platform',
    status: 'To-do',
    priority: 'Low',
    tags: ['on-hold'],
    updatedAt: new Date(Date.now() - 4 * 86_400_000).toISOString()
  },
  {
    ...base,
    id: 'gH9jK1mN3pQ5',
    title: 'Ship the dark theme for the settings page',
    dartboard: 'Example/Design',
    status: 'Done',
    priority: 'Medium',
    completedAt: new Date(Date.now() - 86_400_000).toISOString(),
    updatedAt: new Date(Date.now() - 86_400_000).toISOString()
  },
  {
    ...base,
    id: 'hI0kL2nO4qR6',
    title: 'Import the legacy customer notes',
    dartboard: 'Example/Platform',
    status: 'Archived',
    priority: 'Low',
    updatedAt: new Date(Date.now() - 9 * 86_400_000).toISOString()
  }
]

// Release B data: a parent with subtasks, a three-level chain, and on-hold tasks with blocker links.
const noLinks = {
  subtaskIds: [],
  blockerIds: [],
  blockingIds: [],
  duplicateIds: [],
  relatedIds: []
}

export const fixtureSubtaskParent: DartTask = {
  ...base,
  id: 'pA1rEnT2tAsK',
  title: 'Rework the billing report',
  dartboard: 'Example/Platform',
  status: 'Doing',
  priority: 'High',
  updatedAt: new Date(Date.now() - 30 * 60_000).toISOString(),
  relationships: { ...noLinks, subtaskIds: ['cH1lDaBcDeF1', 'cH2lDgHiJkL2'] }
}

export const fixtureSubtasks: DartTask[] = [
  {
    ...base,
    id: 'cH1lDaBcDeF1',
    title: 'Add the CSV export button',
    parentId: fixtureSubtaskParent.id,
    dartboard: 'Example/Platform',
    status: 'To-do',
    priority: 'Medium',
    updatedAt: new Date(Date.now() - 50 * 60_000).toISOString(),
    relationships: { ...noLinks, subtaskIds: ['gR2aNdChLd01'] }
  },
  {
    ...base,
    id: 'cH2lDgHiJkL2',
    title: 'Document the export columns',
    parentId: fixtureSubtaskParent.id,
    dartboard: 'Example/Platform',
    status: 'Done',
    priority: 'Low',
    completedAt: new Date(Date.now() - 3_600_000).toISOString(),
    updatedAt: new Date(Date.now() - 3_600_000).toISOString(),
    relationships: noLinks
  }
]

export const fixtureGrandchild: DartTask = {
  ...base,
  id: 'gR2aNdChLd01',
  title: 'Escape commas in exported names',
  parentId: fixtureSubtasks[0].id,
  dartboard: 'Example/Platform',
  status: 'To-do',
  priority: 'Low',
  updatedAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
  relationships: noLinks
}

export const fixtureHierarchyTasks: DartTask[] = [
  fixtureSubtaskParent,
  ...fixtureSubtasks,
  fixtureGrandchild
]

export const fixtureBlockedOnHold: DartTask = {
  ...fixtureBoardTasks[3],
  relationships: { ...noLinks, blockerIds: [fixtureTasks[0].id] }
}

export const fixtureUnblockedOnHold: DartTask = {
  ...fixtureBoardTasks[4],
  relationships: noLinks
}

export const fixtureBlockerTasks: DartTask[] = [
  fixtureBlockedOnHold,
  fixtureUnblockedOnHold,
  {
    ...fixtureTasks[0],
    relationships: { ...noLinks, blockingIds: [fixtureBlockedOnHold.id] }
  }
]

export const fixtureDetailTask: DartTask = {
  ...fixtureTasks[0],
  tags: ['search', 'backend'],
  dueAt: '2026-11-04T00:00:00.000Z',
  description:
    'When a project is archived, its tasks still appear in global search. Users expect archived work to be hidden unless they turn on **Include archived**.\n\n## Acceptance\n\n- Archived projects are excluded from search by default\n- The `include_archived` toggle restores them\n- No change to project pages'
}

export const fixtureComments: DartComment[] = [
  {
    id: 'cm1AbCdEfGhI',
    taskId: 'aB3dE5gH7jK9',
    htmlUrl: 'https://app.dartai.com/c/cm1AbCdEfGhI',
    author: 'Sam Example',
    text: 'Repro: archive the Atlas project, then search "atlas". Six archived tasks show up.',
    createdAt: new Date(Date.now() - 2 * 3_600_000).toISOString()
  },
  {
    id: 'cm2JkLmNoPqR',
    taskId: 'aB3dE5gH7jK9',
    htmlUrl: 'https://app.dartai.com/c/cm2JkLmNoPqR',
    author: 'Alex Example',
    text: 'Picked this up in workspace `fix-search-ranking`. The filter goes in the query builder.',
    createdAt: new Date(Date.now() - 40 * 60_000).toISOString()
  }
]
