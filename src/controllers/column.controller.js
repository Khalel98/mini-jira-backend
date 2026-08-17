const pool = require("../db");
const { createColumnSchema, updateColumnSchema } = require("../schemas/column.schema");
const { getAccessibleProject } = require("../utils/projectAccess");

// GET /projects/:id/columns
const getColumns = async (req, res) => {
  const { id } = req.params;

  const project = await getAccessibleProject(id, req.user.userId);
  if (!project) {
    return res.status(404).json({ error: "Project not found" });
  }

  const result = await pool.query(
    "SELECT * FROM task_columns WHERE project_id = $1 ORDER BY position",
    [id],
  );

  res.json({ columns: result.rows });
};

// POST /projects/:id/columns
const createColumn = async (req, res) => {
  const { id } = req.params;

  const validation = createColumnSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({ error: validation.error.issues });
  }

  const project = await getAccessibleProject(id, req.user.userId);
  if (!project) {
    return res.status(404).json({ error: "Project not found" });
  }

  const { name } = validation.data;

  const maxPosition = await pool.query(
    "SELECT COALESCE(MAX(position), -1) AS max FROM task_columns WHERE project_id = $1",
    [id],
  );

  const result = await pool.query(
    `
      INSERT INTO task_columns (project_id, name, position)
      VALUES ($1, $2, $3)
      RETURNING *
    `,
    [id, name, maxPosition.rows[0].max + 1],
  );

  res.status(201).json({ column: result.rows[0] });
};

// PATCH /columns/:columnId
const updateColumn = async (req, res) => {
  const { columnId } = req.params;

  const validation = updateColumnSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({ error: validation.error.issues });
  }

  const { name, position } = validation.data;

  if (name === undefined && position === undefined) {
    return res.status(400).json({ error: "At least one field is required" });
  }

  const column = await pool.query("SELECT * FROM task_columns WHERE id = $1", [columnId]);
  if (column.rows.length === 0) {
    return res.status(404).json({ error: "Column not found" });
  }

  const project = await getAccessibleProject(column.rows[0].project_id, req.user.userId);
  if (!project) {
    return res.status(404).json({ error: "Column not found" });
  }

  const result = await pool.query(
    `
      UPDATE task_columns
      SET
        name = COALESCE($1, name),
        position = COALESCE($2, position)
      WHERE id = $3
      RETURNING *
    `,
    [name, position, columnId],
  );

  res.json({ column: result.rows[0] });
};

// DELETE /columns/:columnId
const deleteColumn = async (req, res) => {
  const { columnId } = req.params;

  const column = await pool.query("SELECT * FROM task_columns WHERE id = $1", [columnId]);
  if (column.rows.length === 0) {
    return res.status(404).json({ error: "Column not found" });
  }

  const project = await getAccessibleProject(column.rows[0].project_id, req.user.userId);
  if (!project) {
    return res.status(404).json({ error: "Column not found" });
  }

  const remainingColumns = await pool.query(
    "SELECT COUNT(*)::int AS count FROM task_columns WHERE project_id = $1",
    [column.rows[0].project_id],
  );
  if (remainingColumns.rows[0].count <= 1) {
    return res.status(400).json({ error: "Project must have at least one column" });
  }

  const tasksInColumn = await pool.query(
    "SELECT COUNT(*)::int AS count FROM tasks WHERE column_id = $1",
    [columnId],
  );
  if (tasksInColumn.rows[0].count > 0) {
    return res.status(400).json({ error: "Move or delete the tasks in this column first" });
  }

  const result = await pool.query(
    "DELETE FROM task_columns WHERE id = $1 RETURNING *",
    [columnId],
  );

  res.json({ column: result.rows[0] });
};

module.exports = { getColumns, createColumn, updateColumn, deleteColumn };
