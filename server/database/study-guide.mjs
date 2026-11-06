export function validateStudyGuide(data) {
  if (data?.version !== 1 || typeof data.title !== 'string' || !data.title.trim()
    || typeof data.sourceName !== 'string' || !Array.isArray(data.sections) || !data.sections.length
    || !Array.isArray(data.glossary) || !data.glossary.length) throw new Error('Guía inválida.')
  const slugs = new Set()
  for (const section of data.sections) {
    if (!section || typeof section.slug !== 'string' || !/^[a-z0-9-]+$/.test(section.slug)
      || slugs.has(section.slug) || section.slug === 'glosario'
      || typeof section.title !== 'string' || !section.title.trim()
      || typeof section.subtitle !== 'string' || typeof section.tag !== 'string'
      || !['topic', 'reference'].includes(section.kind) || typeof section.html !== 'string'
      || /<\s*(script|style|iframe|object|embed|svg|form|input|button)\b|\son\w+\s*=|\sstyle\s*=/i.test(section.html)
      || /(?:href|src)\s*=\s*["']\s*(?:javascript|data|vbscript):/i.test(section.html)) throw new Error('Capítulo inválido o sin sanear.')
    slugs.add(section.slug)
  }
  const terms = new Set()
  for (const entry of data.glossary) {
    if (!entry || typeof entry.term !== 'string' || !entry.term.trim() || terms.has(entry.term)
      || typeof entry.definition !== 'string' || !entry.definition.trim()
      || !Array.isArray(entry.aliases) || entry.aliases.some(alias => typeof alias !== 'string')) throw new Error('Término de glosario inválido.')
    terms.add(entry.term)
  }
  return data
}

export async function importStudyGuide(db, examId, input) {
  const data = validateStudyGuide(input)
  if (!Number.isSafeInteger(examId) || examId <= 0) throw new Error('Examen inválido.')
  const statements = [{ sql: 'INSERT INTO study_guides (exam_id, title, source_name, glossary_json, created_at) VALUES (?, ?, ?, ?, ?)',
    args: [examId, data.title, data.sourceName, JSON.stringify(data.glossary), new Date().toISOString()] }]
  for (const [position, section] of data.sections.entries()) statements.push({
    sql: 'INSERT INTO guide_sections (exam_id, slug, title, subtitle, kind, tag, html, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    args: [examId, section.slug, section.title, section.subtitle, section.kind, section.tag, section.html, position]
  })
  await db.batch(statements, 'write')
  return { examId, sections: data.sections.length, terms: data.glossary.length }
}

export async function readGuideIndex(db, examId) {
  const [guides, sections] = await db.batch([
    { sql: 'SELECT title, source_name, glossary_json FROM study_guides WHERE exam_id = ?', args: [examId] },
    { sql: 'SELECT slug, title, subtitle, kind, tag FROM guide_sections WHERE exam_id = ? ORDER BY position', args: [examId] }
  ], 'read')
  if (!guides.rows.length) return null
  return { title: String(guides.rows[0].title), sourceName: String(guides.rows[0].source_name),
    termCount: JSON.parse(String(guides.rows[0].glossary_json)).length, sections: sections.rows }
}
