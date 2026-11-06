import { getDb, query } from '~/server/utils/database'
import { getExamQuery } from '~/server/utils/exam-query'

export default defineEventHandler(async event => {
  const examId = await getExamQuery(event)
  const section = getQuery(event).section
  if (typeof section !== 'string' || !/^[a-z0-9-]+$/.test(section)) {
    throw createError({ statusCode: 400, statusMessage: 'Capítulo inválido.' })
  }
  const db = await getDb()
  if (section === 'glosario') {
    const row = (await query(db, 'SELECT glossary_json FROM study_guides WHERE exam_id = ?', [examId]))[0]
    if (!row) throw createError({ statusCode: 404, statusMessage: 'Guía no encontrada.' })
    return { html: '', glossary: JSON.parse(String(row.glossary_json)) as { term: string, definition: string, aliases: string[] }[] }
  }
  const row = (await query(db, 'SELECT html FROM guide_sections WHERE exam_id = ? AND slug = ?', [examId, section]))[0]
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Capítulo no encontrado.' })
  const html = String(row.html).replace(/href="#([a-z0-9-]+)"/g,
    (_, slug) => `href="/guide?examId=${examId}&amp;section=${slug}"`)
  return { html, glossary: [] as { term: string, definition: string, aliases: string[] }[] }
})
