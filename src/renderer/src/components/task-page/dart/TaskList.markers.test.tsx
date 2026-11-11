// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { DartTask } from '../../../../../shared/dart/dart-types'
import { TooltipProvider } from '@/components/ui/tooltip'
import { fixtureSubtaskParent, fixtureSubtasks } from './dart-task.mock'
import { DartCardMarkers } from './DartCardMarkers'
import { TaskPageDartTaskList } from './TaskList'

afterEach(cleanup)

const [FIRST, SECOND] = fixtureSubtasks

describe('task list row markers', () => {
  it('says "Blockers not checked" on an on-hold row whose relationship fetch errored, not on others', () => {
    const tasks: DartTask[] = [fixtureSubtaskParent, FIRST, SECOND]
    render(
      <TooltipProvider>
        <TaskPageDartTaskList
          tasks={tasks}
          rowMarkers={(task) => (
            <DartCardMarkers
              info={{ task, onHold: task.id === FIRST.id, relationshipState: 'error' }}
            />
          )}
          selectedTaskId={null}
          getTaskWorkspaces={() => []}
          onOpenTask={() => {}}
          onStartWorkspace={() => {}}
          onOpenWorkspace={() => {}}
        />
      </TooltipProvider>
    )
    expect(screen.getAllByText('Blockers not checked')).toHaveLength(1)
  })
})
