// Lane A advertises this in task-source-runtime-capabilities.ts once the dart.* methods exist.
export const DART_PROVIDER_RUNTIME_CAPABILITY = 'dart.provider.v1' as const

// Stands for dart.updateTaskDescription, the `size` field and YYYY-MM-DD dates; an older host drops or refuses all three.
export const DART_WRITES_V2_RUNTIME_CAPABILITY = 'dart.writes.v2' as const

// Stands for the `order` list key and `raw` row counts on list replies; not advertised until its handlers land.
export const DART_BOARD_RUNTIME_CAPABILITY = 'dart.board.v1' as const

// Stands for `parentId`/`ids` list queries, `relationships` on tasks and dart.updateTaskBlockers.
export const DART_RELATIONSHIPS_RUNTIME_CAPABILITY = 'dart.relationships.v1' as const
