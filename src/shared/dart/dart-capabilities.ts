// Lane A advertises this in task-source-runtime-capabilities.ts once the dart.* methods exist.
export const DART_PROVIDER_RUNTIME_CAPABILITY = 'dart.provider.v1' as const

// Stands for dart.updateTaskDescription, the `size` field and YYYY-MM-DD dates; an older host drops or refuses all three.
export const DART_WRITES_V2_RUNTIME_CAPABILITY = 'dart.writes.v2' as const
