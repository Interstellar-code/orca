import { describe, expect, it } from 'vitest'
import {
  buildDescriptionUpdates,
  restoreBaseLineEndings,
  textareaText,
  type DartDescriptionUpdate
} from './dart-description-patch'
import { applyLikeDart, DartRefused } from './dart-description-reference.test-support'

function patchOf(base: string, draft: string): DartDescriptionUpdate[] {
  const patch = buildDescriptionUpdates(base, draft)
  if (patch.kind !== 'patch') {
    throw new Error(`refused: ${patch.reason}`)
  }
  return patch.updates
}

const LONG = 'The quick brown fox jumps over the lazy dog near the river bank.'

describe('buildDescriptionUpdates round trips', () => {
  it.each([
    ['replace a word', 'Paragraph A', 'Paragraph B'],
    ['insert mid text', `${LONG} More after.`, `${LONG} Added here. More after.`],
    ['insert at the end', LONG, `${LONG}\n\nA new closing paragraph.`],
    ['insert at the start', LONG, `A new opening paragraph.\n\n${LONG}`],
    ['delete mid text', `${LONG} Remove this sentence. The end.`, `${LONG} The end.`],
    ['delete at the start', `Remove me. ${LONG}`, LONG],
    ['delete at the end', `${LONG} Remove me.`, LONG],
    ['delete everything', LONG, ''],
    ['replace everything', LONG, 'Nothing in common at all, truly.'],
    [
      'several regions',
      `one\n${LONG}\ntwo\n${LONG} x\nthree`,
      `ONE\n${LONG}\ntwo!\n${LONG} y\nthree`
    ],
    ['repeated phrases', 'same same same end', 'same SAME same end'],
    ['repeated lines, change the second', 'row\nrow\nrow', 'row\nrow2\nrow'],
    ['repeated lines, remove the second', 'row\nrow\nrow', 'row\nrow'],
    ['duplicate anchor before an insert', 'abab', 'abXab'],
    ['unicode', 'Café 😀 naïve 日本語 text', 'Café 😃 naïve 日本語テキスト text'],
    ['emoji beside a repeat', '😀😀😀', '😀😃😀'],
    ['CRLF kept', 'a line\r\nb line\r\nc line', 'a line\r\nb2 line\r\nc line'],
    ['CRLF to LF', 'a line\r\nb line', 'a line\nb line'],
    ['no change', LONG, LONG],
    ['leading newline replaced', '\nabc def', 'xabc def'],
    [
      'many regions collapse',
      'a0 b1 c2 d3 e4 f5 g6 h7 i8 j9 k0 l1 m2 n3 o4 p5 q6 r7 s8 t9',
      'A0 b1 C2 d3 E4 f5 G6 h7 I8 j9 K0 l1 M2 n3 O4 p5 Q6 r7 S8 t9'
    ]
  ])('%s', (_name, base, draft) => {
    const updates = patchOf(base, draft)
    let doc = base
    for (const update of updates) {
      doc = applyLikeDart(doc, [update])
    }
    expect(doc).toBe(draft)
    expect(applyLikeDart(base, updates)).toBe(draft)
  })

  it('returns no update when nothing changed', () => {
    expect(patchOf(LONG, LONG)).toEqual([])
  })

  it('sends only the changed text, not the document', () => {
    const base = `${LONG}\n\nSecond paragraph stays.\n\n${'Third stays too. '.repeat(50)}`
    const updates = patchOf(base, base.replace('Second', 'Next'))
    expect(updates).toEqual([{ type: 'replace', oldText: 'Second', newText: 'Next' }])
  })

  it('collapses past the update limit into one replace', () => {
    const updates = patchOf(
      'a0 b1 c2 d3 e4 f5 g6 h7 i8 j9 k0 l1 m2 n3 o4 p5 q6 r7 s8 t9',
      'A0 b1 C2 d3 E4 f5 G6 h7 I8 j9 K0 l1 M2 n3 O4 p5 Q6 r7 S8 t9'
    )
    expect(updates).toHaveLength(1)
    expect(updates[0].type).toBe('replace')
  })

  it('gives a pure removal a delete that carries no newText', () => {
    const [update] = patchOf(`${LONG} Remove this. End.`, `${LONG} End.`)
    expect(update.type).toBe('delete')
    expect(update).not.toHaveProperty('newText')
  })

  it('widens a repeated removal into a replace that keeps its context', () => {
    const [update] = patchOf('alpha row\nbeta row\n', 'alpha \nbeta row\n')
    expect(update.type).toBe('replace')
    expect(update.oldText!.length).toBeGreaterThan('row'.length)
  })

  it('never splits a surrogate pair when widening', () => {
    for (const update of patchOf('😀😀😀😀😀😀😀😀😀😀', '😀😀😀😀😀😃😀😀😀😀')) {
      for (const text of [update.oldText, update.newText]) {
        expect(text?.isWellFormed() ?? true).toBe(true)
      }
    }
  })
})

describe('buildDescriptionUpdates refusals', () => {
  it('refuses an empty base', () => {
    expect(buildDescriptionUpdates('', 'text')).toEqual({ kind: 'refused', reason: 'empty-base' })
    expect(buildDescriptionUpdates(' \n', 'text')).toEqual({
      kind: 'refused',
      reason: 'empty-base'
    })
  })

  it('refuses a base with no unique anchor at all', () => {
    const lines = Array.from({ length: 2000 }, () => 'same line')
    const edited = lines.toSpliced(1000, 1, 'other line')
    expect(buildDescriptionUpdates(lines.join('\n'), edited.join('\n'))).toEqual({
      kind: 'refused',
      reason: 'non-unique-anchor'
    })
  })

  it('counts every text of the request against the size cap', () => {
    const base = `${LONG}\n`
    const patch = buildDescriptionUpdates(base, `${base}${'é'.repeat(140 * 1024)}`)
    expect(patch).toMatchObject({ kind: 'refused', reason: 'too-large' })
    const fits = buildDescriptionUpdates(base, `${base}${'é'.repeat(120 * 1024)}`)
    expect(fits.kind).toBe('patch')
  })
})

describe('a remote edit between the read and the write', () => {
  const paragraph = 'A paragraph that holds the target words for this edit.'

  it.each([
    ['replace', paragraph, paragraph.replace('target', 'changed')],
    ['insert', paragraph, `${paragraph} And more.`],
    ['delete', `${paragraph} Drop this sentence.`, paragraph]
  ])('refuses a %s when an identical copy now sits before it', (_name, base, draft) => {
    const updates = patchOf(base, draft)
    expect(applyLikeDart(base, updates)).toBe(draft)
    const latest = `${base}\n\n${base}`
    expect(() => applyLikeDart(latest, updates)).toThrow(DartRefused)
  })

  it('merges with an edit elsewhere', () => {
    const updates = patchOf(paragraph, paragraph.replace('target', 'changed'))
    expect(applyLikeDart(`Remote intro.\n\n${paragraph}`, updates)).toBe(
      `Remote intro.\n\n${paragraph.replace('target', 'changed')}`
    )
  })
})

describe('restoreBaseLineEndings', () => {
  it('keeps an untouched CRLF text equal to the base', () => {
    const base = 'one\r\ntwo\r\nthree'
    expect(restoreBaseLineEndings(base, textareaText(base))).toBe(base)
  })

  it('gives an edited line the base line ending and leaves the rest alone', () => {
    expect(restoreBaseLineEndings('one\r\ntwo\r\nthree', 'one\ntwo!\nnew\nthree')).toBe(
      'one\r\ntwo!\r\nnew\r\nthree'
    )
    expect(restoreBaseLineEndings('one\r\ntwo', 'one\ntwo!')).toBe('one\r\ntwo!')
  })

  it.each([
    ['pure CRLF', 'one\r\ntwo\r\nthree'],
    ['pure LF', 'one\ntwo\nthree'],
    ['mixed', 'one\ntwo\r\nthree\nfour\r\nfive'],
    ['a lone CR', 'one\rtwo\nthree'],
    ['a trailing CRLF', 'one\ntwo\r\n']
  ])('returns an untouched %s text exactly', (_name, base) => {
    expect(restoreBaseLineEndings(base, textareaText(base))).toBe(base)
  })

  it.each([
    ['an edit in a mixed text', 'a\nb\r\nc\nd\r\ne', 'a\nb\r\nC!\nd\r\ne'],
    ['an edit next to a CRLF line', 'a\r\nb\nc\r\nd', 'a\r\nb!\nc\r\nd'],
    ['an added line takes the ending before it', 'a\nb\r\nc', 'a\nb\r\nnew\r\nc'],
    ['a removed line', 'a\nb\r\nc\nd', 'a\nb\r\nd'],
    ['text added after the last line', 'a\nb\r\nc', 'a\nb\r\nc\r\nd'],
    ['the last line removed', 'a\r\nb\nc', 'a\r\nb'],
    ['everything replaced', 'a\r\nb', 'x\r\ny\r\nz']
  ])('keeps each untouched line ending through %s', (_name, base, expected) => {
    expect(restoreBaseLineEndings(base, textareaText(expected))).toBe(expected)
  })

  it('sends no line ending of an untouched line in a mixed text', () => {
    const base = 'first line here\nsecond line here\r\nthird line here\nfourth line here'
    const draft = restoreBaseLineEndings(
      base,
      textareaText(base).replace('third line', 'edited line')
    )
    const updates = patchOf(base, draft)
    expect(updates).toEqual([{ type: 'replace', oldText: 'third', newText: 'edited' }])
    expect(applyLikeDart(base, updates)).toBe(base.replace('third line', 'edited line'))
  })

  it('leaves an LF text as typed', () => {
    expect(restoreBaseLineEndings('one\ntwo', 'one\ntwo!')).toBe('one\ntwo!')
  })
})
