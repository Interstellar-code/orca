import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { REMOTE_RUNTIME_MAX_INBOUND_REQUEST_JSON_BYTES } from '../../../shared/remote-runtime/remote-runtime-memory-limits'
import { getUtf8ByteLength } from '../../../shared/utf8-byte-limits'
import { dartCreateTaskForTarget } from '../runtime/runtime-dart-write-client'
import { createWebDartApi } from './preload-api/web-dart-api'
import { WebRuntimeConnectionTransport } from './web-runtime-connection-transport'
import { WebRuntimeRequestRegistry } from './web-runtime-request-registry'

const mocks = vi.hoisted(() => ({ call: vi.fn() }))
vi.mock('./preload-api/web-runtime-calls', () => ({
  callRuntimeEnvelope: mocks.call,
  getRemoteRuntimeStatus: vi.fn()
}))
vi.mock('./preload-api/web-runtime-session', () => ({
  requireActiveEnvironment: () => ({ id: 'env-1' }),
  assertActiveEnvironment: vi.fn()
}))

const cap = REMOTE_RUNTIME_MAX_INBOUND_REQUEST_JSON_BYTES

type Harness = {
  transport: WebRuntimeConnectionTransport
  registry: WebRuntimeRequestRegistry
  send: ReturnType<typeof vi.fn>
  sealText: ReturnType<typeof vi.fn>
}

// The real sendEncrypted and registry, with the socket and the sealing channel replaced; the constructor would open a connection.
function harness(): Harness {
  const send = vi.fn()
  const sealText = vi.fn((text: string) => text)
  const transport = Object.create(WebRuntimeConnectionTransport.prototype)
  Object.assign(transport, {
    ws: { readyState: WebSocket.OPEN, send },
    handshake: { channel: { sealText } },
    auth: { outbound: (message: unknown) => message }
  })
  const registry = new WebRuntimeRequestRegistry({
    deviceToken: 'dvt_'.padEnd(64, 'a'),
    nextId: () => 'req-1',
    waitForConnected: () => Promise.resolve(),
    sendEncrypted: (message) => transport.sendEncrypted(message)
  })
  return { transport, registry, send, sealText }
}

function envelopeBytes(text: string): number {
  return getUtf8ByteLength(
    JSON.stringify({
      id: 'req-1',
      deviceToken: 'dvt_'.padEnd(64, 'a'),
      method: 'dart.createTask',
      params: { description: text }
    })
  )
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('WebSocket', { OPEN: 1 })
  vi.stubGlobal('window', {
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis)
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('web runtime request admission', () => {
  const textForCap = 'x'.repeat(cap - envelopeBytes(''))

  it('seals and sends a request whose stringified envelope is exactly the cap', () => {
    const { transport, send, sealText } = harness()
    expect(envelopeBytes(textForCap)).toBe(cap)

    const sent = transport.sendEncrypted({
      id: 'req-1',
      deviceToken: 'dvt_'.padEnd(64, 'a'),
      method: 'dart.createTask',
      params: { description: textForCap }
    })

    expect(sent).toBe(true)
    expect(sealText).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('refuses cap plus one before sealText and cleans up the pending request', async () => {
    const { registry, send, sealText } = harness()

    await expect(
      registry.call('dart.createTask', { description: `${textForCap}x` })
    ).rejects.toMatchObject({ code: 'invalid_argument' })

    expect(sealText).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
    expect(registry.pending.size).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('refuses an over-cap callNow the same way', async () => {
    const { registry, send, sealText } = harness()

    await expect(
      registry.callNow('dart.createTask', { description: `${textForCap}x` })
    ).rejects.toMatchObject({ code: 'invalid_argument' })

    expect(sealText).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
    expect(registry.pending.size).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('web Dart client size refusal end to end', () => {
  it('reaches the user as notApplied with the too-large message through the real web Dart API', async () => {
    const { registry, send, sealText } = harness()
    mocks.call.mockImplementation(async (method: string, params: unknown, timeoutMs: number) =>
      registry.call(method, params, { timeoutMs })
    )
    vi.stubGlobal('window', {
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      api: { dart: createWebDartApi() }
    })

    // Control characters pass the text caps but their JSON escapes push the envelope past the cap.
    const result = await dartCreateTaskForTarget(
      { kind: 'local' },
      { title: 't', description: '\u0001'.repeat(200_000) }
    )

    expect(result).toMatchObject({ ok: false, outcome: 'notApplied' })
    expect(result.ok === false && result.error).toContain('too large')
    expect(sealText).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
    expect(registry.pending.size).toBe(0)
  })
})
