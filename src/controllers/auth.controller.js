const bcrypt = require("bcrypt");
const pool = require("../db");
const jwt = require("jsonwebtoken");

const { registerSchema, loginSchema } = require("../schemas/user.schema");

const register = async (req, res) => {
  const validation = registerSchema.safeParse(req.body);

  if (!validation.success) {
    return res.status(400).json({
      error: validation.error.issues,
    });
  }

  const { name, email, password } = validation.data;

  const passwordHash = await bcrypt.hash(password, 10);

  try {
    const userCount = await pool.query("SELECT COUNT(*)::int AS count FROM users");
    const role = userCount.rows[0].count === 0 ? "admin" : "member";

    const result = await pool.query(
      `
      INSERT INTO users (
        name,
        email,
        password_hash,
        role
      )
      VALUES ($1, $2, $3, $4)
      RETURNING id, name, email, role, created_at
    `,
      [name, email, passwordHash, role],
    );

    res.status(201).json({
      user: result.rows[0],
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        error: "Email already exists",
      });
    }

    throw error;
  }
};

const login = async (req, res) => {
  const validation = loginSchema.safeParse(req.body);

  if (!validation.success) {
    return res.status(400).json({
      error: validation.error.issues,
    });
  }

  const { email, password } = validation.data;

  const result = await pool.query("SELECT * FROM users WHERE email = $1", [
    email,
  ]);

  if (result.rows.length === 0) {
    return res.status(401).json({
      error: "Invalid email or password",
    });
  }

  const user = result.rows[0];

  const passwordValid = await bcrypt.compare(password, user.password_hash);

  if (!passwordValid) {
    return res.status(401).json({
      error: "Invalid email or password",
    });
  }

  const token = jwt.sign(
    {
      userId: user.id,
      email: user.email,
      role: user.role,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: "1h",
    },
  );

  res.json({
    message: "Login successful",
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  });
};

module.exports = {
  register,
  login,
};
