const pool = require("../db");

const {
  createTaskSchema,
  updateTaskSchema,
  moveTaskSchema,
} = require("../schemas/task.schema");
const { getAccessibleProject } = require("../utils/projectAccess");

async function assertAssigneeIsMember(projectId, assigneeId) {
  if (assigneeId === undefined || assigneeId === null) return true;

  const result = await pool.query(
    "SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2",
    [projectId, assigneeId],
  );

  return result.rows.length > 0;
}

// GET /tasks
const getTasks = async (req, res) => {
  const result = await pool.query(
    `
      SELECT tasks.*
      FROM tasks
      JOIN project_members pm
        ON pm.project_id = tasks.project_id
      WHERE pm.user_id = $1
      ORDER BY tasks.column_id, tasks.position
    `,
    [req.user.userId],
  );

  res.json({
    tasks: result.rows,
  });
};

// GET /tasks/:id
const getTaskById = async (req, res) => {
  const { id } = req.params;

  const result = await pool.query(
    `
      SELECT tasks.*
      FROM tasks
      JOIN project_members pm
        ON pm.project_id = tasks.project_id
      WHERE tasks.id = $1
        AND pm.user_id = $2
    `,
    [id, req.user.userId],
  );

  if (result.rows.length === 0) {
    return res.status(404).json({
      error: "Task not found",
    });
  }

  res.json({
    task: result.rows[0],
  });
};

// POST /tasks
const createTask = async (req, res) => {
  const validation = createTaskSchema.safeParse(req.body);

  if (!validation.success) {
    return res.status(400).json({
      error: validation.error.issues,
    });
  }

  const { project_id, title, description, assignee_id, type, priority } = validation.data;
  let { column_id } = validation.data;

  const project = await getAccessibleProject(project_id, req.user.userId);
  if (!project) {
    return res.status(404).json({
      error: "Project not found",
    });
  }

  if (column_id === undefined) {
    const firstColumn = await pool.query(
      "SELECT id FROM task_columns WHERE project_id = $1 ORDER BY position LIMIT 1",
      [project_id],
    );
    if (firstColumn.rows.length === 0) {
      return res.status(400).json({ error: "Project has no columns" });
    }
    column_id = firstColumn.rows[0].id;
  } else {
    const column = await pool.query(
      "SELECT id FROM task_columns WHERE id = $1 AND project_id = $2",
      [column_id, project_id],
    );
    if (column.rows.length === 0) {
      return res.status(404).json({ error: "Column not found" });
    }
  }

  if (!(await assertAssigneeIsMember(project_id, assignee_id))) {
    return res.status(400).json({ error: "Assignee must be a project member" });
  }

  const maxPosition = await pool.query(
    "SELECT COALESCE(MAX(position), -1) AS max FROM tasks WHERE column_id = $1",
    [column_id],
  );

  const result = await pool.query(
    `
      INSERT INTO tasks (
        project_id,
        column_id,
        title,
        description,
        assignee_id,
        position,
        type,
        priority
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `,
    [
      project_id,
      column_id,
      title,
      description,
      assignee_id ?? null,
      maxPosition.rows[0].max + 1,
      type ?? "task",
      priority ?? "medium",
    ],
  );

  res.status(201).json({
    task: result.rows[0],
  });
};

// PATCH /tasks/:id
const updateTask = async (req, res) => {
  const { id } = req.params;

  const validation = updateTaskSchema.safeParse(req.body);

  if (!validation.success) {
    return res.status(400).json({
      error: validation.error.issues,
    });
  }

  const { title, description, assignee_id, type, priority } = validation.data;

  if (
    title === undefined &&
    description === undefined &&
    assignee_id === undefined &&
    type === undefined &&
    priority === undefined
  ) {
    return res.status(400).json({
      error: "At least one field is required",
    });
  }

  const existing = await pool.query(
    `
      SELECT tasks.*
      FROM tasks
      JOIN project_members pm ON pm.project_id = tasks.project_id
      WHERE tasks.id = $1 AND pm.user_id = $2
    `,
    [id, req.user.userId],
  );
  if (existing.rows.length === 0) {
    return res.status(404).json({ error: "Task not found" });
  }

  if (assignee_id !== undefined && !(await assertAssigneeIsMember(existing.rows[0].project_id, assignee_id))) {
    return res.status(400).json({ error: "Assignee must be a project member" });
  }

  const result = await pool.query(
    `
      UPDATE tasks
      SET
        title = COALESCE($1, title),
        description = COALESCE($2, description),
        assignee_id = CASE WHEN $3 THEN $4 ELSE assignee_id END,
        type = COALESCE($5, type),
        priority = COALESCE($6, priority)
      WHERE id = $7
      RETURNING *
    `,
    [title, description, assignee_id !== undefined, assignee_id ?? null, type, priority, id],
  );

  res.json({
    task: result.rows[0],
  });
};

// PATCH /tasks/:id/move
const moveTask = async (req, res) => {
  const { id } = req.params;

  const validation = moveTaskSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({ error: validation.error.issues });
  }

  const { column_id, position } = validation.data;

  const existing = await pool.query(
    `
      SELECT tasks.*
      FROM tasks
      JOIN project_members pm ON pm.project_id = tasks.project_id
      WHERE tasks.id = $1 AND pm.user_id = $2
    `,
    [id, req.user.userId],
  );
  if (existing.rows.length === 0) {
    return res.status(404).json({ error: "Task not found" });
  }
  const task = existing.rows[0];

  const column = await pool.query(
    "SELECT id FROM task_columns WHERE id = $1 AND project_id = $2",
    [column_id, task.project_id],
  );
  if (column.rows.length === 0) {
    return res.status(404).json({ error: "Column not found" });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const sourceColumnId = task.column_id;

    // Pull the task out of its current column ordering.
    const siblingsInTarget = await client.query(
      `
        SELECT id FROM tasks
        WHERE column_id = $1 AND id != $2
        ORDER BY position
      `,
      [column_id, id],
    );

    const reordered = siblingsInTarget.rows.map((row) => row.id);
    const clampedPosition = Math.max(0, Math.min(position, reordered.length));
    reordered.splice(clampedPosition, 0, Number(id));

    for (let i = 0; i < reordered.length; i++) {
      await client.query(
        "UPDATE tasks SET column_id = $1, position = $2 WHERE id = $3",
        [column_id, i, reordered[i]],
      );
    }

    if (sourceColumnId !== column_id) {
      const siblingsInSource = await client.query(
        "SELECT id FROM tasks WHERE column_id = $1 ORDER BY position",
        [sourceColumnId],
      );

      for (let i = 0; i < siblingsInSource.rows.length; i++) {
        await client.query(
          "UPDATE tasks SET position = $1 WHERE id = $2",
          [i, siblingsInSource.rows[i].id],
        );
      }
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  const updated = await pool.query("SELECT * FROM tasks WHERE id = $1", [id]);

  res.json({ task: updated.rows[0] });
};

// DELETE /tasks/:id
const deleteTask = async (req, res) => {
  const { id } = req.params;

  const result = await pool.query(
    `
      DELETE FROM tasks
      USING project_members pm
      WHERE tasks.id = $1
        AND tasks.project_id = pm.project_id
        AND pm.user_id = $2
      RETURNING tasks.*
    `,
    [id, req.user.userId],
  );

  if (result.rows.length === 0) {
    return res.status(404).json({
      error: "Task not found",
    });
  }

  res.json({
    task: result.rows[0],
  });
};

module.exports = {
  getTasks,
  getTaskById,
  createTask,
  updateTask,
  moveTask,
  deleteTask,
};
