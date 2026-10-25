'use strict'
// Temporary CI probe: does a ConPTY pane started while user32 cannot initialize lose all input?
const { spawn: spawnChild } = require('node:child_process')
const pty = require('node-pty')

function log(obj) {
  process.stdout.write(`${JSON.stringify(obj)}\n`)
}

const FILLER = `
Add-Type @"
using System; using System.Runtime.InteropServices;
public static class HeapFill {
  [DllImport("user32.dll", SetLastError=true, CharSet=CharSet.Unicode)]
  public static extern IntPtr CreateWindowExW(int ex, string cls, string name, int style, int x, int y, int w, int h, IntPtr parent, IntPtr menu, IntPtr inst, IntPtr p);
  public static string Fill(int titleChars) {
    int n = 0; string title = new string('x', titleChars);
    while (n < 9000) {
      IntPtr h = CreateWindowExW(0, "STATIC", title, 0, 0, 0, 0, 0, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero);
      if (h == IntPtr.Zero) { return n + " " + Marshal.GetLastWin32Error(); }
      n++;
    }
    return n + " cap";
  }
}
"@
$r = [HeapFill]::Fill($env:FILL_TITLE_CHARS)
[Console]::Out.WriteLine("FILLED " + $r)
[Console]::Out.Flush()
Start-Sleep -Seconds 600
`

function startFiller(titleChars) {
  return new Promise((resolve) => {
    const child = spawnChild('powershell.exe', ['-NoProfile', '-Command', FILLER], {
      env: { ...process.env, FILL_TITLE_CHARS: String(titleChars) },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    })
    let out = ''
    child.stdout.on('data', (d) => {
      out += d
      const m = /FILLED (.*)/.exec(out)
      if (m) resolve({ child, result: m[1].trim() })
    })
    child.stderr.on('data', (d) => log({ phase: 'filler-stderr', text: String(d).slice(0, 400) }))
    child.on('exit', (code) => resolve({ child, result: `exited ${code} ${out.slice(0, 200)}` }))
  })
}

function probePane(label, useConptyDll) {
  return new Promise((resolve) => {
    const t0 = Date.now()
    let output = ''
    let proc
    try {
      proc = pty.spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/q'], {
        cwd: process.cwd(),
        cols: 80,
        rows: 24,
        useConptyDll
      })
    } catch (error) {
      resolve({ label, useConptyDll, spawnError: String(error) })
      return
    }
    const marker = `HEAP_${label}_OK`
    let done = false
    const finish = (result) => {
      if (done) return
      done = true
      clearTimeout(timer)
      try {
        proc.kill()
      } catch {}
      resolve({
        label,
        useConptyDll,
        result,
        ms: Date.now() - t0,
        prelude: output.includes('\x1b[c'),
        head: JSON.stringify(output.slice(0, 120))
      })
    }
    proc.onData((chunk) => {
      output += chunk
      if (output.includes(marker)) finish('echoed')
    })
    proc.onExit((e) => finish(`exited ${e.exitCode}`))
    proc.write(`echo ${marker.replace('OK', 'O^K')}\r`)
    const timer = setTimeout(() => finish('timeout'), 20_000)
  })
}

async function batch(phase, n) {
  const results = await Promise.all(
    Array.from({ length: n }, (_, i) => probePane(`${phase}_${i}`, i % 4 !== 3))
  )
  for (const r of results) log({ phase, ...r })
  const dll = results.filter((r) => r.useConptyDll)
  log({
    phase: `${phase}-summary`,
    dllPanes: dll.length,
    dllEchoed: dll.filter((r) => r.result === 'echoed').length,
    dllNoPrelude: dll.filter((r) => r.result !== undefined && !r.prelude).length,
    dllNoPreludeAndTimeout: dll.filter((r) => !r.prelude && r.result === 'timeout').length,
    inboxPanes: results.length - dll.length,
    inboxEchoed: results.filter((r) => !r.useConptyDll && r.result === 'echoed').length
  })
}

async function main() {
  await batch('baseline', 8)
  for (const titleChars of [4000, 1000, 200]) {
    const filler = await startFiller(titleChars)
    log({ phase: 'filled', titleChars, result: filler.result })
    await batch(`exhausted${titleChars}`, 8)
    filler.child.kill()
    await new Promise((r) => setTimeout(r, 2000))
    await batch(`recovered${titleChars}`, 4)
  }
  process.exit(0)
}

main().catch((error) => {
  log({ phase: 'error', message: String(error?.stack || error) })
  process.exit(0)
})
