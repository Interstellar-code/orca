import { describe, expect, it } from 'vitest'
import { spawnNativeDaemonPty } from './native-pty-spawn'
import { conptyNoInputReaderRespawnCount } from './conpty-startup-input-reader'

// TEMPORARY CI probe (not for merge): launch commands under the boundary suite's load.
const describeOnWindows = process.platform === 'win32' ? describe : describe.skip
const BATCHES = 60
const BATCH = 5

const q = (a: number[], p: number): number =>
  Math.round([...a].sort((x, y) => x - y)[Math.floor(p * (a.length - 1))] ?? 0)

describeOnWindows('ConPTY launch probe', () => {
  it('runs every launch command exactly once', async () => {
    const gateMs: number[] = []
    const rawFirstMs: number[] = []
    let lost = 0
    let doubled = 0
    let panes = 0
    const nodePty = await import('node-pty')
    let id = 0
    for (let b = 0; b < BATCHES; b++) {
      await Promise.all(
        Array.from({ length: BATCH }, async () => {
          const n = id++
          const rawStart = performance.now()
          const raw = nodePty.spawn('cmd.exe', ['/d', '/q'], {
            cols: 80,
            rows: 24,
            cwd: process.cwd(),
            useConptyDll: true
          })
          await new Promise<void>((resolve) => {
            const sub = raw.onData(() => {
              sub.dispose()
              resolve()
            })
          })
          rawFirstMs.push(performance.now() - rawStart)
          raw.kill()

          const start = performance.now()
          const spawned = await spawnNativeDaemonPty({
            shellPath: 'cmd.exe',
            shellArgs: ['/d', '/q'],
            spawnCwd: process.cwd(),
            env: Object.fromEntries(
              Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined)
            ),
            cols: 80,
            rows: 24,
            windowsFallbackAttempts: []
          })
          gateMs.push(performance.now() - start)
          const proc = spawned.process
          let output = spawned.claimStartupEvents?.().data.join('') ?? ''
          proc.onData((d) => {
            output += d
          })
          const marker = `ORCA_LAUNCH_${n}_DONE`
          proc.write(`echo ${marker.replace('DONE', 'DO^NE')}\r`)
          const deadline = Date.now() + 20_000
          while (!output.includes(marker) && Date.now() < deadline) {
            await new Promise((r) => setTimeout(r, 100))
          }
          await new Promise((r) => setTimeout(r, 500))
          const count = output.split(marker).length - 1
          panes += 1
          if (count === 0) lost += 1
          if (count > 1) doubled += 1
          proc.kill()
        })
      )
    }
    console.log(
      'CONPTY_LAUNCH_PROBE',
      JSON.stringify({
        panes,
        lost,
        doubled,
        respawns: conptyNoInputReaderRespawnCount(),
        gateP50: q(gateMs, 0.5),
        gateP99: q(gateMs, 0.99),
        rawFirstP50: q(rawFirstMs, 0.5),
        rawFirstP99: q(rawFirstMs, 0.99)
      })
    )
    expect(lost).toBe(0)
    expect(doubled).toBe(0)
  }, 900_000)
})
