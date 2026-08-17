const pool = require("../db");

// Returns the project row if the user owns it or is a member, otherwise null.
async function getAccessibleProject(projectId, userId) {
  const result = await pool.query(
    `
      SELECT p.*
      FROM projects p
      JOIN project_members pm ON pm.project_id = p.id
      WHERE p.id = $1
        AND pm.user_id = $2
    `,
    [projectId, userId],
  );

  return result.rows[0] ?? null;
}

// Returns the project row if the user owns it, otherwise null.
async function getOwnedProject(projectId, userId) {
  const result = await pool.query(
    `
      SELECT *
      FROM projects
      WHERE id = $1
        AND user_id = $2
    `,
    [projectId, userId],
  );

  return result.rows[0] ?? null;
}

module.exports = { getAccessibleProject, getOwnedProject };
