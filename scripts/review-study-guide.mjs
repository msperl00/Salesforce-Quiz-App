import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { openDatabase } from './database-client.mjs'
import { validateStudyGuide } from '../server/database/study-guide.mjs'

const escape = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')

export function reviseGuide(input, review) {
  const guide = structuredClone(input)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(review.date || '')) throw new Error('Fecha de revisión inválida.')
  for (const [slug, edits] of Object.entries(review.sections)) {
    const section = guide.sections.find(section => section.slug === slug)
    if (!section) throw new Error(`Falta el capítulo ${slug}.`)
    const marker = `Revisión documentada · ${review.date}`
    if (section.html.includes(marker)) throw new Error(`El capítulo ${slug} ya está revisado.`)
    for (const [before, after] of edits.replacements || []) {
      if (section.html.split(before).length !== 2) throw new Error(`El texto de ${slug} ha cambiado; revisa antes de sustituirlo.`)
      section.html = section.html.replace(before, after)
    }
    for (const note of [...(edits.notes || [])].reverse()) {
      if (!note.source.startsWith('https://developer.salesforce.com/') && !note.source.startsWith('https://help.salesforce.com/')) {
        throw new Error('La revisión necesita una fuente oficial de Salesforce.')
      }
      section.html = `<div class="tip guide-review"><b>${marker}</b><h3>${escape(note.title)}</h3><p>${escape(note.text)}</p><p><a href="${escape(note.source)}" target="_blank" rel="noopener noreferrer">Documentación oficial de Salesforce</a></p></div>\n${section.html}`
    }
  }
  for (const [term, definition] of Object.entries(review.glossary)) {
    const entry = guide.glossary.find(entry => entry.term === term)
    if (!entry) throw new Error(`Falta el término ${term}.`)
    entry.definition = definition
  }
  return validateStudyGuide(guide)
}

async function main() {
  const [file, rawId, ...flags] = process.argv.slice(2)
  const examId = Number(rawId)
  if (!file || !Number.isSafeInteger(examId) || examId <= 0 || flags.some(flag => flag !== '--apply')) {
    throw new Error('Uso: node --env-file=.env scripts/review-study-guide.mjs revisión.json examId [--apply]')
  }
  const review = JSON.parse(await readFile(file, 'utf8'))
  const db = await openDatabase()
  try {
    const [guides, sections] = await db.batch([
      { sql: 'SELECT * FROM study_guides WHERE exam_id = ?', args: [examId] },
      { sql: 'SELECT * FROM guide_sections WHERE exam_id = ? ORDER BY position', args: [examId] }
    ], 'read')
    const original = guides.rows[0]
    if (!original) throw new Error('La guía no existe.')
    const input = { version: 1, title: original.title, sourceName: original.source_name,
      glossary: JSON.parse(original.glossary_json), sections: sections.rows }
    const result = reviseGuide(input, review)
    console.log(JSON.stringify({ examId, revisedSections: Object.keys(review.sections), revisedTerms: Object.keys(review.glossary) }))
    if (!flags.includes('--apply')) return console.log('Revisión validada. Añade --apply para guardarla.')
    await mkdir('data', { recursive: true })
    const backup = resolve('data', `guide-before-review-${examId}-${Date.now()}.json`)
    await writeFile(backup, JSON.stringify({ guide: original, sections: sections.rows }), { mode: 0o600, flag: 'wx' })
    const statements = [{ sql: 'UPDATE study_guides SET glossary_json = ? WHERE exam_id = ?', args: [JSON.stringify(result.glossary), examId] }]
    for (const section of result.sections.filter(section => review.sections[section.slug])) statements.push({
      sql: 'UPDATE guide_sections SET html = ? WHERE exam_id = ? AND slug = ?', args: [section.html, examId, section.slug]
    })
    await db.batch(statements, 'write')
    console.log(`Revisión guardada. Copia anterior: ${backup}`)
  } finally { db.close() }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.code ? `No se pudo revisar (${error.code}).` : error.message); process.exitCode = 1 })
}
