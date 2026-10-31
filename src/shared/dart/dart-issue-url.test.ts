import { describe, expect, it } from 'vitest'
import { isTrustedDartHtmlUrl, parseDartTaskUrl } from './dart-issue-url'

describe('Dart task URLs', () => {
  it('accepts only https links on app.dartai.com', () => {
    expect(isTrustedDartHtmlUrl('https://app.dartai.com/t/aBcD3fGh1jKl-ship')).toBe(true)
    for (const url of [
      'http://app.dartai.com/t/aBcD3fGh1jKl',
      'https://app.dartai.com.evil.test/t/aBcD3fGh1jKl',
      'https://user:pw@app.dartai.com/t/aBcD3fGh1jKl',
      'https://app.dartai.com:8443/t/aBcD3fGh1jKl',
      'javascript:alert(1)',
      42
    ]) {
      expect(isTrustedDartHtmlUrl(url)).toBe(false)
    }
  })

  it('reads the task id and a slug-free canonical URL', () => {
    expect(parseDartTaskUrl('https://app.dartai.com/t/aBcD3fGh1jKl-ship-dart')).toEqual({
      taskId: 'aBcD3fGh1jKl',
      canonicalUrl: 'https://app.dartai.com/t/aBcD3fGh1jKl'
    })
    expect(parseDartTaskUrl('https://app.dartai.com/t/aBcD3fGh1jK')).toBeNull()
  })
})
