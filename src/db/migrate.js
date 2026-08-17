const pool = require("../db");

async function runMigrations() {
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'member'
  `);

  // Bootstrap: if nobody is an admin yet, promote the earliest-created user.
  const adminCount = await pool.query(`SELECT COUNT(*)::int AS count FROM users WHERE role = 'admin'`);
  if (adminCount.rows[0].count === 0) {
    await pool.query(`
      UPDATE users SET role = 'admin'
      WHERE id = (SELECT id FROM users ORDER BY id LIMIT 1)
    `);
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS project_members (
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      PRIMARY KEY (project_id, user_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS task_columns (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0
    )
  `);

  await pool.query(`
    ALTER TABLE tasks ADD COLUMN IF NOT EXISTS column_id INTEGER REFERENCES task_columns(id) ON DELETE CASCADE
  `);
  await pool.query(`
    ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL
  `);
  await pool.query(`
    ALTER TABLE tasks ADD COLUMN IF NOT EXISTS position INTEGER NOT NULL DEFAULT 0
  `);
  await pool.query(`
    ALTER TABLE tasks ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'task'
  `);
  await pool.query(`
    ALTER TABLE tasks ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'medium'
  `);

  // Every project owner is also a member.
  await pool.query(`
    INSERT INTO project_members (project_id, user_id)
    SELECT id, user_id FROM projects
    ON CONFLICT DO NOTHING
  `);

  // Seed default columns for any project that doesn't have any yet.
  const projectsWithoutColumns = await pool.query(`
    SELECT p.id
    FROM projects p
    LEFT JOIN task_columns tc ON tc.project_id = p.id
    WHERE tc.id IS NULL
  `);

  for (const project of projectsWithoutColumns.rows) {
    await pool.query(
      `
        INSERT INTO task_columns (project_id, name, position)
        VALUES ($1, 'To Do', 0), ($1, 'In Progress', 1), ($1, 'Done', 2)
      `,
      [project.id],
    );
  }

  // Backfill legacy tasks (status column, no column_id yet) into the matching new column.
  const hasStatusColumn = await pool.query(`
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'status'
  `);

  if (hasStatusColumn.rows.length > 0) {
    const statusToName = {
      todo: "To Do",
      in_progress: "In Progress",
      done: "Done",
    };

    for (const [status, name] of Object.entries(statusToName)) {
      await pool.query(
        `
          UPDATE tasks t
          SET column_id = tc.id
          FROM task_columns tc
          WHERE t.column_id IS NULL
            AND t.status = $1
            AND tc.project_id = t.project_id
            AND tc.name = $2
        `,
        [status, name],
      );
    }
  }

  // Any task that still has no column (e.g. unknown status) falls back to the project's first column.
  await pool.query(`
    UPDATE tasks t
    SET column_id = first_col.id
    FROM (
      SELECT DISTINCT ON (project_id) project_id, id
      FROM task_columns
      ORDER BY project_id, position
    ) first_col
    WHERE t.column_id IS NULL
      AND first_col.project_id = t.project_id
  `);

  await pool.query(`ALTER TABLE tasks ALTER COLUMN column_id SET NOT NULL`);

  if (hasStatusColumn.rows.length > 0) {
    await pool.query(`ALTER TABLE tasks DROP COLUMN status`);
  }
}

module.exports = { runMigrations };
