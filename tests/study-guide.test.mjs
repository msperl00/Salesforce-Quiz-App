import assert from 'node:assert/strict'
import test from 'node:test'
import { execFileSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createClient } from '@libsql/client'
import { migrateDatabase } from '../server/database/schema.mjs'
import { importStudyGuide, readGuideIndex } from '../server/database/study-guide.mjs'

const guide = { version: 1, title: 'Guide', sourceName: 'guide.html', sections: [
  { slug: 'events', title: 'Events', subtitle: 'Reliable messaging', kind: 'topic', tag: 'Events', html: '<details><summary>Case</summary><p>Answer</p></details>' }
], glossary: [{ term: 'CDC', definition: 'Change Data Capture', aliases: ['Change events'] }] }

test('guide import stays associated with its exam after rename and cannot overwrite or leak into other exams', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'quiz-guide-'))
  const db = createClient({ url: pathToFileURL(join(directory, 'bank.sqlite')).href })
  try {
    await migrateDatabase(db)
    const exam = await db.execute("INSERT INTO exams(name) VALUES ('Integration')")
    const id = Number(exam.lastInsertRowid)
    await importStudyGuide(db, id, guide)
    const index = await readGuideIndex(db, id)
    assert.equal(index.title, 'Guide')
    assert.equal(index.termCount, 1)
    assert.equal(index.sections[0].tag, 'Events')
    assert.equal(index.sections[0].html, undefined, 'The index must not download chapter bodies')
    await db.execute({ sql: 'UPDATE exams SET name = ? WHERE id = ?', args: ['Renamed', id] })
    assert.deepEqual(await readGuideIndex(db, id), index)
    assert.equal(await readGuideIndex(db, 1), null)
    await assert.rejects(importStudyGuide(db, id, guide))
    assert.equal((await db.execute('SELECT count(*) AS n FROM guide_sections')).rows[0].n, 1)
    const row = (await db.execute('SELECT glossary_json FROM study_guides')).rows[0]
    assert.deepEqual(JSON.parse(row.glossary_json), guide.glossary)
    const bad = { ...guide, sections: [{ ...guide.sections[0], html: '<script>alert(1)</script>' }] }
    await assert.rejects(importStudyGuide(db, 1, bad))
    assert.equal(await readGuideIndex(db, 1), null)
    await db.execute("CREATE TRIGGER fail_guide BEFORE INSERT ON guide_sections BEGIN SELECT RAISE(ABORT, 'test failure'); END")
    await assert.rejects(importStudyGuide(db, 1, guide))
    assert.equal(await readGuideIndex(db, 1), null, 'A section write failure must roll back the guide')
  } finally { db.close(); await rm(directory, { recursive: true, force: true }) }
})

test('HTML extraction strips executable markup and unsafe attributes while preserving readable content and safe links', () => {
  const result = execFileSync('python3', ['-B', '-c', `
import importlib.util
spec = importlib.util.spec_from_file_location('guide', 'scripts/convert-study-guide.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
tree = module.Tree()
tree.feed('<p onclick="bad()" style="display:none">Safe &amp; sound<script>alert(1)</script><iframe src="https://bad.test">bad</iframe><a href="javascript:bad()">unsafe link</a><a href="https://example.com" onclick="bad()">source</a><a href="#events">chapter</a></p><details><summary>Question</summary>Answer</details><table><tr><td>Data</td></tr></table>')
print(module.sanitize(tree.root))
`], { encoding: 'utf8' })
  assert.doesNotMatch(result, /script|iframe|onclick|style=|javascript:/i)
  assert.match(result, /Safe &amp; sound/)
  assert.match(result, /href="https:\/\/example.com" target="_blank" rel="noopener noreferrer"/)
  assert.match(result, /href="#events"/)
  assert.match(result, /<details><summary>Question<\/summary>Answer<\/details>/)
  assert.match(result, /class="guide-table-scroll" tabindex="0"/)
})
