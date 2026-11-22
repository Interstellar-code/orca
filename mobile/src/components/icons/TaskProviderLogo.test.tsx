import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'

vi.mock('react-native-svg', () => ({ default: 'Svg', Path: 'Path' }))

import { TaskProviderLogo, type TaskProviderLogoKind } from './TaskProviderLogo'

const LINEAR_PATH_PREFIX = 'M2.886 4.18A11.982 11.982 0 0 1 11.99 0'

function pathsFor(provider: TaskProviderLogoKind): string[] {
  let renderer: ReactTestRenderer | null = null
  act(() => {
    renderer = create(createElement(TaskProviderLogo, { provider, color: '#000' }))
  })
  const mounted = renderer!
  const paths = mounted.root
    .findAll((node) => String(node.type) === 'Path')
    .map((node) => String(node.props.d))
  act(() => mounted.unmount())
  return paths
}

describe('TaskProviderLogo', () => {
  it('renders the Linear mark for linear', () => {
    expect(pathsFor('linear')[0]).toContain(LINEAR_PATH_PREFIX)
  })

  // Dart is deferred on mobile; it must never borrow Linear's mark while a host offers it.
  it('never renders the Linear mark for a deferred dart source', () => {
    const paths = pathsFor('dart')

    expect(paths.length).toBeGreaterThan(0)
    expect(paths.some((path) => path.startsWith(LINEAR_PATH_PREFIX))).toBe(false)
  })
})
