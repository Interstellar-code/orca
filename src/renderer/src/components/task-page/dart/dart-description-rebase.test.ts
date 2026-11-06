import { describe, expect, it } from 'vitest'
import { rebaseDescriptionLineage, rebaseDraft } from './dart-description-rebase'

describe('rebaseDraft', () => {
  it('merges a hunk with a remote addition after it', () => {
    expect(rebaseDraft('Paragraph A', 'Paragraph B', 'Paragraph A\n\nRemote addition')).toEqual({
      merged: 'Paragraph B\n\nRemote addition',
      unresolved: []
    })
  })

  it('keeps remote additions before, after and between the hunks', () => {
    const base = 'First para\n\nSecond para'
    const draft = 'First edited\n\nSecond edited'
    const latest = 'Top\n\nFirst para\n\nBetween\n\nSecond para\n\nBottom'
    expect(rebaseDraft(base, draft, latest)).toEqual({
      merged: 'Top\n\nFirst edited\n\nBetween\n\nSecond edited\n\nBottom',
      unresolved: []
    })
  })

  it('returns the draft when Dart has not changed', () => {
    expect(rebaseDraft('one two', 'one three', 'one two').merged).toBe('one three')
  })

  it('has nothing to merge when Dart already holds the draft', () => {
    expect(rebaseDraft('one two', 'one three', 'one three')).toEqual({
      merged: 'one three',
      unresolved: []
    })
  })

  it('keeps a hunk unresolved when its text now appears twice', () => {
    const result = rebaseDraft('Keep me', 'Keep you', 'Keep me\n\nKeep me')
    expect(result.merged).toBe('Keep me\n\nKeep me')
    expect(result.unresolved).toMatchObject([{ baseText: 'me', userText: 'you' }])
  })

  it('keeps a hunk unresolved when Dart edited its text', () => {
    const result = rebaseDraft('Keep me', 'Keep you', 'Keep him')
    expect(result.merged).toBe('Keep him')
    expect(result.unresolved).toMatchObject([{ baseText: 'me', userText: 'you' }])
  })

  it('keeps a hunk unresolved when the text around it on its line changed', () => {
    const result = rebaseDraft('Keep me', 'Keep you', 'Please Keep me now')
    expect(result.merged).toBe('Please Keep me now')
    expect(result.unresolved).toHaveLength(1)
  })

  it('keeps a deletion of text Dart changed unresolved and the text in place', () => {
    const result = rebaseDraft('One two three', 'One three', 'One TWO three')
    expect(result.merged).toBe('One TWO three')
    expect(result.unresolved).toMatchObject([{ baseText: 'two ', userText: '' }])
  })

  it('applies the clean hunks and holds back only the conflicting one', () => {
    const result = rebaseDraft(
      'Alpha line\nBeta line',
      'Alpha edit\nBeta edit',
      'Alpha line\nBeta changed'
    )
    expect(result.merged).toBe('Alpha edit\nBeta changed')
    expect(result.unresolved).toMatchObject([{ baseText: 'line', userText: 'edit' }])
  })

  it('gives each unresolved hunk its own id', () => {
    const first = rebaseDraft('Keep me', 'Keep you', 'gone').unresolved[0]
    const second = rebaseDraft('Keep me', 'Keep you', 'gone').unresolved[0]
    expect(first.id).not.toBe(second.id)
  })
})

describe('rebaseDescriptionLineage', () => {
  it('keeps manual work, clean hunks and remote additions through two conflicts', () => {
    const start = {
      base: 'Alpha one\n\nBeta one\n\nGamma one',
      draft: 'Alpha two\n\nBeta two\n\nGamma one',
      unresolved: []
    }
    // First conflict: Dart changed Beta, so that hunk cannot apply.
    const first = rebaseDescriptionLineage(
      start,
      'Alpha one\n\nBeta remote\n\nGamma one\n\nRemote one'
    )
    expect(first.base).toBe('Alpha one\n\nBeta remote\n\nGamma one\n\nRemote one')
    expect(first.draft).toBe('Alpha two\n\nBeta remote\n\nGamma one\n\nRemote one')
    expect(first.unresolved).toMatchObject([{ baseText: 'one', userText: 'two' }])

    // The user resolves it by hand and adds a sentence.
    const typed = {
      ...first,
      draft: 'Alpha two\n\nBeta merged by hand\n\nGamma one\n\nRemote one\n\nMy new sentence.'
    }
    const second = rebaseDescriptionLineage(
      typed,
      'Alpha one\n\nBeta remote\n\nGamma one\n\nRemote one\n\nRemote two'
    )
    expect(second.draft).toBe(
      'Alpha two\n\nBeta merged by hand\n\nGamma one\n\nRemote one\n\nMy new sentence.\n\nRemote two'
    )
    // Stored hunks are carried, not retried or duplicated.
    expect(second.unresolved).toEqual(first.unresolved)
  })

  it('rebases from the current editor text, not the first draft', () => {
    const lineage = { base: 'Text one', draft: 'Text typed later', unresolved: [] }
    expect(rebaseDescriptionLineage(lineage, 'Text one\n\nRemote').draft).toBe(
      'Text typed later\n\nRemote'
    )
  })
})
