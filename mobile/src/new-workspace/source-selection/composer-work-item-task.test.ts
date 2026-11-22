import { describe, expect, it } from 'vitest'
import { toTaskItem } from './composer-work-item-task'
import { DeferredMobileTaskProviderError } from '../../tasks/providers/mobile-task-provider-visibility'

describe('toTaskItem', () => {
  // A restored Dart item is deferred on mobile; it must fail before it can be sent as a Linear issue.
  it('refuses a Dart work item with the deferred notice', () => {
    const create = () =>
      toTaskItem(
        {
          provider: 'dart',
          type: 'issue',
          number: 0,
          title: 'Deferred on mobile',
          url: 'https://dart.example/task/DART-1',
          dartIdentifier: 'DART-1'
        },
        'repo-1'
      )
    expect(create).toThrow(DeferredMobileTaskProviderError)
    expect(create).toThrow("This task source isn't available in Orca Mobile yet.")
  })
})
