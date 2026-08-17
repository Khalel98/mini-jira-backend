const pool = require("../db");

const {
  createProjectSchema,
  updateProjectSchema,
} = require("../schemas/project.schema");

// GET /projects
const getProjects = async (req, res) => {
  const result = await pool.query(
    `
      SELECT p.*
      FROM projects p
      JOIN project_members pm ON pm.project_id = p.id
      WHERE pm.user_id = $1
      ORDER BY p.id
    `,
    [req.user.userId],
  );

  res.json({
    projects: result.rows,
  });
};

// GET /projects/:id
const getProjectById = async (req, res) => {
  const { id } = req.params;

  const result = await pool.query(
    `
      SELECT p.*
      FROM projects p
      JOIN project_members pm ON pm.project_id = p.id
      WHERE p.id = $1
        AND pm.user_id = $2
    `,
    [id, req.user.userId],
  );

  if (result.rows.length === 0) {
    return res.status(404).json({
      error: "Project not found",
    });
  }

  res.json({
    project: result.rows[0],
  });
};

// POST /projects
const createProject = async (req, res) => {
  const validation = createProjectSchema.safeParse(req.body);

  if (!validation.success) {
    return res.status(400).json({
      error: validation.error.issues,
    });
  }

  const { name, description } = validation.data;

  const userId = req.user.userId;

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const projectResult = await client.query(
      `
        INSERT INTO projects (
          name,
          description,
          user_id
        )
        VALUES ($1, $2, $3)
        RETURNING *
      `,
      [name, description, userId],
    );

    const project = projectResult.rows[0];

    await client.query(
      "INSERT INTO project_members (project_id, user_id) VALUES ($1, $2)",
      [project.id, userId],
    );

    await client.query(
      `
        INSERT INTO task_columns (project_id, name, position)
        VALUES ($1, 'To Do', 0), ($1, 'In Progress', 1), ($1, 'Done', 2)
      `,
      [project.id],
    );

    await client.query("COMMIT");

    res.status(201).json({
      project,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

// PATCH /projects/:id
const updateProject = async (req, res) => {
  const { id } = req.params;

  const validation = updateProjectSchema.safeParse(req.body);

  if (!validation.success) {
    return res.status(400).json({
      error: validation.error.issues,
    });
  }

  const { name, description } = validation.data;

  if (name === undefined && description === undefined) {
    return res.status(400).json({
      error: "At least one field is required",
    });
  }

  const result = await pool.query(
    `
      UPDATE projects
      SET
        name = COALESCE($1, name),
        description = COALESCE($2, description)
      WHERE id = $3
        AND user_id = $4
      RETURNING *
    `,
    [name, description, id, req.user.userId],
  );

  if (result.rows.length === 0) {
    return res.status(404).json({
      error: "Project not found",
    });
  }

  res.json({
    project: result.rows[0],
  });
};

// DELETE /projects/:id
const deleteProject = async (req, res) => {
  const { id } = req.params;

  const result = await pool.query(
    `
      DELETE FROM projects
      WHERE id = $1
        AND user_id = $2
      RETURNING *
    `,
    [id, req.user.userId],
  );

  if (result.rows.length === 0) {
    return res.status(404).json({
      error: "Project not found",
    });
  }

  res.json({
    project: result.rows[0],
  });
};

module.exports = {
  getProjects,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
};
