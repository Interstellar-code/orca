import { createNonSecureContextUuid } from '../non-secure-context-uuid'
import { describe, expect, it } from 'vitest'
import { encrypt } from '../e2ee-crypto'
import { sealMobileE2EEV2Frame } from '../mobile-e2ee-v2-framing'
import { getUtf8ByteLength } from '../utf8-byte-limits'
import {
  REMOTE_RUNTIME_MAX_INBOUND_FRAME_BYTES,
  REMOTE_RUNTIME_MAX_INBOUND_REQUEST_JSON_BYTES,
  serializeRemoteRuntimeRpcRequest
} from './remote-runtime-memory-limits'

describe('remote runtime memory limits', () => {
  it('seals the largest admitted request JSON within the host inbound frame, in both framings', () => {
    const json = 'x'.repeat(REMOTE_RUNTIME_MAX_INBOUND_REQUEST_JSON_BYTES)
    const key = new Uint8Array(32).fill(1)
    const legacy = encrypt(json, key)
    const v2 = Buffer.from(
      sealMobileE2EEV2Frame({
        payload: new TextEncoder().encode(json),
        key,
        sessionId: new Uint8Array(32).fill(2),
        direction: 'mobile-to-desktop',
        payloadKind: 'text',
        counter: 0n
      })
    ).toString('base64')
    for (const frame of [legacy, v2]) {
      expect(frame.length).toBeLessThanOrEqual(REMOTE_RUNTIME_MAX_INBOUND_FRAME_BYTES)
    }
  })
})

describe('serializeRemoteRuntimeRpcRequest host frame admission', () => {
  const cap = REMOTE_RUNTIME_MAX_INBOUND_REQUEST_JSON_BYTES
  const request = (text: string) => ({
    requestId: createNonSecureContextUuid(),
    deviceToken: 'dvt_'.padEnd(64, 'a'),
    method: 'dart.createTask',
    params: { title: 'x', description: text },
    envelope: {
      orchestrationCapability: 'orchestration.v1',
      orchestrationContractVersion: 3,
      orchestrationRequestId: createNonSecureContextUuid()
    }
  })
  const bytesOf = (text: string) =>
    getUtf8ByteLength(serializeRemoteRuntimeRpcRequest(request(text)))

  // Text of `unit` repeated, topped up with 'x', whose serialized request is exactly `target` bytes.
  function textForSize(unit: string, target: number): string {
    const unitBytes = getUtf8ByteLength(JSON.stringify(unit)) - 2
    const room = target - bytesOf('')
    const text = unit.repeat(Math.floor(room / unitBytes)) + 'x'.repeat(room % unitBytes)
    expect(bytesOf(text)).toBe(target)
    return text
  }

  it.each([
    ['ASCII', 'x'],
    ['multi-byte', 'é'],
    ['escape-heavy quotes', '"'],
    ['escape-heavy control characters', '\u0001']
  ])('accepts a %s request at the cap and refuses one byte more', (_label, unit) => {
    const atCap = textForSize(unit, cap)
    expect(getUtf8ByteLength(serializeRemoteRuntimeRpcRequest(request(atCap)))).toBe(cap)
    expect(() => serializeRemoteRuntimeRpcRequest(request(`${atCap}x`))).toThrow(
      expect.objectContaining({ code: 'invalid_argument' })
    )
  })

  it('refuses a request whose params alone fit but whose full envelope does not', () => {
    const text = textForSize('x', cap)
    const paramsBytes = getUtf8ByteLength(JSON.stringify(request(text).params))
    expect(paramsBytes).toBeLessThan(cap)
    expect(() => serializeRemoteRuntimeRpcRequest(request(`${text}x`))).toThrow(
      expect.objectContaining({ code: 'invalid_argument' })
    )
  })
})
