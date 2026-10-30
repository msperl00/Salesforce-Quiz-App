export async function migrateDatabase(client) {
  const requiredNames = ['exams', 'questions', 'answers', 'tags', 'question_tags',
    'users', 'invitations', 'login_attempts', 'questions_exam_id', 'exam_attempts', 'exam_attempts_owner']
  const [objects, fields] = await client.batch([
    { sql: `SELECT name FROM sqlite_master WHERE name IN (${requiredNames.map(() => '?').join(',')})`, args: requiredNames },
    { sql: 'PRAGMA table_info(questions)', args: [] }
  ], 'read')
  const names = new Set(objects.rows.map(row => row.name))
  const questionFields = new Set(fields.rows.map(row => row.name))
  // Warm schemas need no write transaction or repeated CREATE statements on every cold start.
  if (requiredNames.every(name => names.has(name)) && questionFields.has('image_data_url') && questionFields.has('exam_id')) return

  const tx = await client.transaction('write')
  try {
    for (const sql of [
      `CREATE TABLE IF NOT EXISTS exams (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL COLLATE NOCASE UNIQUE)`,
      `CREATE TABLE IF NOT EXISTS questions (id INTEGER PRIMARY KEY AUTOINCREMENT, prompt TEXT NOT NULL,
        image_data_url TEXT DEFAULT '', explanation TEXT DEFAULT '', note TEXT DEFAULT '',
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS answers (id INTEGER PRIMARY KEY AUTOINCREMENT, question_id INTEGER NOT NULL,
        text TEXT NOT NULL, is_correct INTEGER NOT NULL DEFAULT 0, position INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE)`,
      `CREATE TABLE IF NOT EXISTS tags (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE)`,
      `CREATE TABLE IF NOT EXISTS question_tags (question_id INTEGER NOT NULL, tag_id INTEGER NOT NULL,
        PRIMARY KEY (question_id, tag_id), FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
        FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE)`,
      `CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'member', session_version INTEGER NOT NULL DEFAULT 1)`,
      `CREATE TABLE IF NOT EXISTS invitations (token_hash TEXT PRIMARY KEY, email TEXT NOT NULL, expires_at INTEGER NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS login_attempts (key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, expires_at INTEGER NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS exam_attempts (user_id INTEGER NOT NULL, id TEXT NOT NULL,
        exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
        mode TEXT NOT NULL CHECK (mode IN ('practice', 'exam')), question_ids TEXT NOT NULL,
        completed_at TEXT NOT NULL, PRIMARY KEY (user_id, id))`
    ]) await tx.execute(sql)
    const columns = (await tx.execute('PRAGMA table_info(questions)')).rows.map(row => row.name)
    if (!columns.includes('image_data_url')) await tx.execute("ALTER TABLE questions ADD COLUMN image_data_url TEXT DEFAULT ''")
    if (!columns.includes('exam_id')) {
      await tx.execute("INSERT OR IGNORE INTO exams (name) VALUES ('General')")
      await tx.execute('ALTER TABLE questions ADD COLUMN exam_id INTEGER REFERENCES exams(id)')
      await tx.execute("UPDATE questions SET exam_id = (SELECT id FROM exams WHERE name = 'General')")
    }
    await tx.execute('CREATE INDEX IF NOT EXISTS questions_exam_id ON questions(exam_id)')
    await tx.execute('CREATE INDEX IF NOT EXISTS exam_attempts_owner ON exam_attempts(user_id, exam_id, completed_at DESC)')
    await tx.commit()
  } finally { tx.close() }
}
