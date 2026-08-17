const pool = require("../db");
const { addMemberSchema } = require("../schemas/projectMember.schema");
const { getAccessibleProject, getOwnedProject } = require("../utils/projectAccess");

// GET /projects/:id/members
const getMembers = async (req, res) => {
  const { id } = req.params;

  const project = await getAccessibleProject(id, req.user.userId);
  if (!project) {
    return res.status(404).json({ error: "Project not found" });
  }

  const result = await pool.query(
    `
      SELECT users.id, users.name, users.email
      FROM project_members
      JOIN users ON users.id = project_members.user_id
      WHERE project_members.project_id = $1
      ORDER BY users.name
    `,
    [id],
  );

  res.json({ members: result.rows });
};

// POST /projects/:id/members
const addMember = async (req, res) => {
  const { id } = req.params;

  const validation = addMemberSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({ error: validation.error.issues });
  }

  const project = await getOwnedProject(id, req.user.userId);
  if (!project) {
    return res.status(404).json({ error: "Project not found" });
  }

  const { user_id } = validation.data;

  const userExists = await pool.query("SELECT id FROM users WHERE id = $1", [user_id]);
  if (userExists.rows.length === 0) {
    return res.status(404).json({ error: "User not found" });
  }

  const result = await pool.query(
    `
      INSERT INTO project_members (project_id, user_id)
      VALUES ($1, $2)
      ON CONFLICT (project_id, user_id) DO NOTHING
      RETURNING project_id
    `,
    [id, user_id],
  );

  if (result.rows.length === 0) {
    return res.status(409).json({ error: "User is already a member" });
  }

  const member = await pool.query("SELECT id, name, email FROM users WHERE id = $1", [user_id]);

  res.status(201).json({ member: member.rows[0] });
};

// DELETE /projects/:id/members/:userId
const removeMember = async (req, res) => {
  const { id, userId } = req.params;

  const project = await getOwnedProject(id, req.user.userId);
  if (!project) {
    return res.status(404).json({ error: "Project not found" });
  }

  if (Number(userId) === project.user_id) {
    return res.status(400).json({ error: "Cannot remove the project owner" });
  }

  const result = await pool.query(
    `
      DELETE FROM project_members
      WHERE project_id = $1
        AND user_id = $2
      RETURNING project_id
    `,
    [id, userId],
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: "Member not found" });
  }

  res.status(204).send();
};

module.exports = { getMembers, addMember, removeMember };
