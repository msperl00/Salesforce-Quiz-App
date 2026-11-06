import assert from 'node:assert/strict'
import test from 'node:test'
import { reviseGuide } from '../scripts/review-study-guide.mjs'

const guide = { version: 1, title: 'Guide', sourceName: 'guide.html', sections: [
  { slug: 'outbound', title: 'Callouts', subtitle: '', kind: 'topic', tag: 'Callouts', html: '<p>Old claim.</p>' },
  { slug: 'events', title: 'Events', subtitle: '', kind: 'topic', tag: 'Events', html: '<p>Unchanged.</p>' }
], glossary: [{ term: 'ReplayId', definition: 'Old definition', aliases: ['Replay ID'] }] }
const review = { date: '2026-11-06', sections: { outbound: {
  replacements: [['Old claim.', 'Corrected claim.']], notes: [{ title: 'Context <version>', text: 'Corrected & sourced.',
    source: 'https://developer.salesforce.com/docs/platform/lwc/guide/apex-continuations.html' }]
} }, glossary: { ReplayId: 'Opaque position, not a global ID.' } }

test('review preserves other chapters and glossary aliases, escapes added text and leaves the original unchanged', () => {
  const before = JSON.stringify(guide)
  const result = reviseGuide(guide, review)
  assert.equal(JSON.stringify(guide), before)
  assert.deepEqual(result.sections[1], guide.sections[1])
  assert.match(result.sections[0].html, /Corrected claim/)
  assert.match(result.sections[0].html, /Context &lt;version&gt;/)
  assert.match(result.sections[0].html, /Corrected &amp; sourced/)
  assert.equal(result.glossary[0].definition, review.glossary.ReplayId)
  assert.deepEqual(result.glossary[0].aliases, ['Replay ID'])
  assert.throws(() => reviseGuide(result, review), /ya está revisado/)
})

test('unexpected source text stops a review instead of silently skipping a correction', () => {
  assert.throws(() => reviseGuide({ ...guide, sections: [{ ...guide.sections[0], html: '<p>Someone edited this.</p>' }] }, review), /ha cambiado/)
})
