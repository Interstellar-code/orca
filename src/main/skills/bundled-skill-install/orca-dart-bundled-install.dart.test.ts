import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { BUNDLED_SKILL_SOURCES } from './bundled-skill-sources'
import { installBundledSkills, previewBundledSkillInstall } from './service'
import { makeSkillHome, removeSkillHomes, serviceInput } from './skill-home.test-support'

afterEach(removeSkillHomes)

const orcaDartSource = BUNDLED_SKILL_SOURCES.find((source) => source.name === 'orca-dart')

// serviceInput pins a fake `sources` list; the shipped list is what the Dart card installs.
async function realInput(names: string[], installedOnly = false) {
  const home = await makeSkillHome()
  const { sources: _fake, ...input } = serviceInput(home, { installedOnly })
  return { home, input: { ...input, names } }
}

describe('orca-dart bundled skill install', () => {
  it('ships a source the plan path can install', () => {
    expect(orcaDartSource?.text).toContain('name: orca-dart')
  })

  it('installs from the shipped sources and then reads as installed', async () => {
    const { home, input } = await realInput(['orca-dart'])
    const plan = await previewBundledSkillInstall(input)
    expect(plan.skills.map((skill) => skill.name)).toEqual(['orca-dart'])

    const result = await installBundledSkills(input, plan.planDigest)
    expect(result.skills.map((skill) => skill.status)).toEqual(['ran'])
    const installed = await readFile(
      join(home.home, '.claude', 'skills', 'orca-dart', 'SKILL.md'),
      'utf8'
    )
    expect(installed).toBe(orcaDartSource?.text)

    const again = await previewBundledSkillInstall({
      ...input,
      installedOnly: true,
      names: undefined
    })
    const dart = again.skills.find((skill) => skill.name === 'orca-dart')
    expect(dart?.ops.length).toBeGreaterThan(0)
    expect(dart?.ops.every((op) => op.kind === 'keep')).toBe(true)
  })

  it('rejects a skill name the host does not bundle, as an older host would for orca-dart', async () => {
    const { input } = await realInput(['orca-not-bundled-here'])
    await expect(previewBundledSkillInstall(input)).rejects.toThrow(
      'bundled-skill-unknown: orca-not-bundled-here'
    )
  })
})
