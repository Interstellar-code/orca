import { describe, expect, it } from 'vitest'
import { parseOrcadMigrationDormantAutomationRuns } from './orcad-migration-dormant-automation-validation'

function run(provider: string): Record<string, unknown> {
  return {
    id: 'run-1',
    automationId: 'automation-1',
    title: 'Run',
    scheduledFor: 1,
    status: 'completed',
    trigger: 'manual',
    sessionKind: 'chat',
    outputSnapshot: null,
    precheckResult: null,
    usage: null,
    createdAt: 1,
    sourceContext: { kind: 'task-source', hostId: 'local', projectId: 'project-1', provider }
  }
}

describe('dormant automation task-source validation', () => {
  it('accepts a Dart task-source context carried by a migrated run', () => {
    const [parsed] = parseOrcadMigrationDormantAutomationRuns([run('dart')])
    expect(parsed.sourceContext).toMatchObject({ provider: 'dart' })
  })

  it('still rejects an unknown task-source provider', () => {
    expect(() => parseOrcadMigrationDormantAutomationRuns([run('trello')])).toThrow(
      'orcad_migration_dormant_automation_context_provider_invalid'
    )
  })
})
