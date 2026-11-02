import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

const LIST_FLAGS = [
  ...GLOBAL_FLAGS,
  'mine',
  'assignee',
  'status',
  'dartboard',
  'tag',
  'priority',
  'title',
  'text',
  'limit',
  'offset'
]

const TASK_FLAGS = [...GLOBAL_FLAGS, 'id']

// Version 1 resolves an id or a task URL: Dart exposes no human-readable key.
const TASK_INPUT_NOTE =
  'Task input is a 12-character Dart id or a https://app.dartai.com/t/<id> URL; Dart has no key lookup.'

export const DART_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['dart', 'status'],
    summary: 'Show the Dart connection for the execution host',
    usage: 'orca dart status [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    notes: [
      'Reads the saved Dart token status on the selected execution host; it does not prove API access beyond the reported viewer.'
    ]
  },
  {
    path: ['dart', 'config'],
    summary: 'List Dart dartboards, statuses, types, priorities, tags and assignees',
    usage: 'orca dart config [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    examples: ['orca dart config --json'],
    notes: [
      'Names, not ids: pass these exact names to list filters and writes. Dartboards are full-path titles; short names are ambiguous.'
    ]
  },
  {
    path: ['dart', 'list'],
    summary: 'List Dart tasks for task triage',
    usage:
      'orca dart list [--mine] [--assignee <name|email>] [--status <name>] [--dartboard <full-path>] [--tag <name>] [--priority <name>] [--title <text>] [--text <text>] [--limit <n>] [--offset <n>] [--json]',
    allowedFlags: LIST_FLAGS,
    examples: [
      'orca dart list --mine --limit 10 --json',
      'orca dart list --dartboard "Product/Backlog" --status "To-do" --json'
    ],
    notes: [
      'Dart ignores unknown query parameters, so any other filter flag is rejected instead of silently returning everything.',
      '--title and --text are case-insensitive substring searches; there is no generic query. --text searches descriptions only.',
      'Server order is opaque. Page with --limit (maximum 250) and --offset.'
    ]
  },
  {
    path: ['dart', 'get'],
    aliases: [['dart', 'show']],
    summary: 'Read one Dart task with its description',
    usage: 'orca dart get <id|url> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'id'],
    positionalArgs: ['id'],
    examples: ['orca dart get 01H8XXXXXX12 --json'],
    notes: [TASK_INPUT_NOTE, 'List rows omit descriptions; only this command returns them.']
  },
  {
    path: ['dart', 'comment', 'list'],
    summary: 'List comments on a Dart task',
    usage: 'orca dart comment list <id|url> [--limit <n>] [--offset <n>] [--json]',
    allowedFlags: [...TASK_FLAGS, 'limit', 'offset'],
    positionalArgs: ['id'],
    examples: ['orca dart comment list 01H8XXXXXX12 --json'],
    notes: [TASK_INPUT_NOTE]
  },
  {
    path: ['dart', 'comment', 'add'],
    summary: 'Comment on a Dart task',
    usage: 'orca dart comment add <id|url> (--body <text> | --body-file <path|->) [--json]',
    allowedFlags: [...TASK_FLAGS, 'body', 'body-file'],
    positionalArgs: ['id'],
    examples: ['orca dart comment add 01H8XXXXXX12 --body "Fix is on staging"'],
    notes: [TASK_INPUT_NOTE]
  },
  {
    path: ['dart', 'create'],
    summary: 'Create a Dart task',
    usage:
      'orca dart create --title <text> [--description <text> | --description-file <path|->] [--dartboard <full-path>] [--type <name>] [--status <name>] [--priority <name>] [--assignee <name|email>] [--tag <name>...] [--json]',
    allowedFlags: [
      ...GLOBAL_FLAGS,
      'title',
      'description',
      'description-file',
      'dartboard',
      'type',
      'status',
      'priority',
      'assignee',
      'tag'
    ],
    repeatableFlags: ['tag'],
    examples: ['orca dart create --title "Fix login redirect" --dartboard Product/Backlog --json'],
    notes: [
      'Names must match orca dart config exactly; Dart creates new tags for unknown tag titles, so the host rejects them first.'
    ]
  },
  {
    path: ['dart', 'update'],
    summary: 'Update a Dart task by name',
    usage:
      'orca dart update <id|url> [--title <text>] [--description <text> | --description-file <path|->] [--status <name>] [--priority <name>|null] [--assignee <name|email>|null] [--tag <name>...] [--json]',
    allowedFlags: [
      ...TASK_FLAGS,
      'title',
      'description',
      'description-file',
      'status',
      'priority',
      'assignee',
      'tag'
    ],
    positionalArgs: ['id'],
    repeatableFlags: ['tag'],
    examples: [
      'orca dart update 01H8XXXXXX12 --status "In Progress" --json',
      'orca dart update 01H8XXXXXX12 --priority null --json'
    ],
    notes: [
      TASK_INPUT_NOTE,
      'Omitted fields keep their value. --priority null and --assignee null clear those fields.',
      '--tag replaces the whole tag set; pass --tag "" to clear every tag. Names must match orca dart config.'
    ]
  }
]
