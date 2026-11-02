import { describe, expect, it } from 'vitest'
import { CLI_COMMAND_NAMES } from '../../main/startup/cli-command-names'
import { DART_HANDLER_GROUP } from '../dart/dart-handler-group'
import { COMMAND_SPECS } from './index'

describe('dart command specs', () => {
  it('declares a handler for every dart command spec', () => {
    const specKeys = COMMAND_SPECS.filter((spec) => spec.path[0] === 'dart').map((spec) =>
      spec.path.join(' ')
    )
    expect(new Set(specKeys)).toEqual(new Set(DART_HANDLER_GROUP.keys))
  })

  it('routes `dart` as a CLI root', () => {
    expect(CLI_COMMAND_NAMES).toContain('dart')
  })
})
