const pool = require("../db");

// GET /users
const getUsers = async (req, res) => {
  const result = await pool.query(
    "SELECT id, name, email FROM users ORDER BY name",
  );

  res.json({
    users: result.rows,
  });
};

module.exports = { getUsers };
