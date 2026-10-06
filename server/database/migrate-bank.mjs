export async function copyQuestionBank(db, records) {
  // Keep the empty-target guard and all inserts in the same atomic batch.
  const statements = [
    'CREATE TABLE migration_guard (empty INTEGER CHECK (empty = 1))',
    'INSERT INTO migration_guard SELECT CASE WHEN (SELECT count(*) FROM questions) = 0 AND (SELECT count(*) FROM answers) = 0 AND (SELECT count(*) FROM question_tags) = 0 AND (SELECT count(*) FROM tags) = 0 AND (SELECT count(*) FROM exams WHERE name != \'General\') = 0 THEN 1 ELSE 0 END',
    'DELETE FROM exams'
  ]
  const tables = new Set(['exams', 'questions', 'answers', 'tags', 'question_tags'])
  for (const { table, rows } of records) {
    if (!tables.has(table)) throw new Error('Tabla inesperada.')
    for (const row of rows) {
      const columns = Object.keys(row)
      if (!columns.every(column => /^[a-z_]+$/.test(column))) throw new Error('Esquema local inesperado.')
      statements.push({ sql: `INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`, args: columns.map(column => row[column]) })
    }
  }
  statements.push('DROP TABLE migration_guard')
  await db.batch(statements, 'write')
}
