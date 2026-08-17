require("dotenv").config();

const express = require("express");
const cors = require("cors");
const pool = require("./db");
const { runMigrations } = require("./db/migrate");

const asyncHandler = require("./middleware/asyncHandler");
const errorHandler = require("./middleware/errorHandler");
const authMiddleware = require("./middleware/authMiddleware");
const requireAdmin = require("./middleware/requireAdmin");

const { register, login } = require("./controllers/auth.controller");
const { getUsers } = require("./controllers/user.controller");

const {
  getProjects,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
} = require("./controllers/project.controller");

const {
  getMembers,
  addMember,
  removeMember,
} = require("./controllers/projectMember.controller");

const {
  getColumns,
  createColumn,
  updateColumn,
  deleteColumn,
} = require("./controllers/column.controller");

const {
  getTasks,
  getTaskById,
  createTask,
  updateTask,
  moveTask,
  deleteTask,
} = require("./controllers/task.controller");

const app = express();

app.use(cors());
app.use(express.json());

// ==================== Profile ====================

app.get("/profile", authMiddleware, (req, res) => {
  res.json({
    message: "You are authenticated",
    user: req.user,
  });
});

// ==================== AUTH ====================

app.post("/auth/register", asyncHandler(register));

app.post("/auth/login", asyncHandler(login));

// ==================== USERS ====================

app.get("/users", authMiddleware, requireAdmin, asyncHandler(getUsers));

// ==================== PROJECTS ====================

app.get("/projects", authMiddleware, asyncHandler(getProjects));

app.get("/projects/:id", authMiddleware, asyncHandler(getProjectById));

app.post("/projects", authMiddleware, requireAdmin, asyncHandler(createProject));

app.patch("/projects/:id", authMiddleware, requireAdmin, asyncHandler(updateProject));

app.delete("/projects/:id", authMiddleware, requireAdmin, asyncHandler(deleteProject));

// ==================== PROJECT MEMBERS ====================

app.get("/projects/:id/members", authMiddleware, asyncHandler(getMembers));

app.post("/projects/:id/members", authMiddleware, requireAdmin, asyncHandler(addMember));

app.delete("/projects/:id/members/:userId", authMiddleware, requireAdmin, asyncHandler(removeMember));

// ==================== COLUMNS ====================

app.get("/projects/:id/columns", authMiddleware, asyncHandler(getColumns));

app.post("/projects/:id/columns", authMiddleware, asyncHandler(createColumn));

app.patch("/columns/:columnId", authMiddleware, asyncHandler(updateColumn));

app.delete("/columns/:columnId", authMiddleware, asyncHandler(deleteColumn));

// ==================== TASKS ====================

app.get("/tasks", authMiddleware, asyncHandler(getTasks));

app.get("/tasks/:id", authMiddleware, asyncHandler(getTaskById));

app.post("/tasks", authMiddleware, asyncHandler(createTask));

app.patch("/tasks/:id", authMiddleware, asyncHandler(updateTask));

app.patch("/tasks/:id/move", authMiddleware, asyncHandler(moveTask));

app.delete("/tasks/:id", authMiddleware, asyncHandler(deleteTask));

// ==================== ERROR HANDLER ====================

app.use(errorHandler);

// ==================== DATABASE ====================

pool
  .query("SELECT NOW()")
  .then(async (result) => {
    console.log("Database connected");
    console.log(result.rows[0]);
    await runMigrations();
    console.log("Migrations applied");
  })
  .catch((error) => {
    console.error("Database error:", error);
  });

// ==================== SERVER ====================

app.listen(3000, () => {
  console.log("Server started on http://localhost:3000");
});
