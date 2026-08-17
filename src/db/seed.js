require("dotenv").config();

const bcrypt = require("bcrypt");
const pool = require("../db");
const { runMigrations } = require("./migrate");

async function seed() {
  await runMigrations();

  await pool.query(`TRUNCATE TABLE tasks, task_columns, project_members, projects, users RESTART IDENTITY CASCADE`);

  const passwordHash = await bcrypt.hash("password123", 10);
  const adminPasswordHash = await bcrypt.hash("admin123", 10);

  const users = {};

  const admin = await pool.query(
    `INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, 'admin') RETURNING id`,
    ["Admin", "admin@example.com", adminPasswordHash],
  );
  users.admin = admin.rows[0].id;

  for (const [key, name, email] of [
    ["alice", "Alice", "alice@example.com"],
    ["bob", "Bob", "bob@example.com"],
    ["carol", "Carol", "carol@example.com"],
  ]) {
    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, 'member') RETURNING id`,
      [name, email, passwordHash],
    );
    users[key] = result.rows[0].id;
  }

  async function createProject(name, description, memberKeys) {
    const project = await pool.query(
      `INSERT INTO projects (name, description, user_id) VALUES ($1, $2, $3) RETURNING id`,
      [name, description, users.admin],
    );
    const projectId = project.rows[0].id;

    for (const key of memberKeys) {
      await pool.query(
        `INSERT INTO project_members (project_id, user_id) VALUES ($1, $2)`,
        [projectId, users[key]],
      );
    }

    return projectId;
  }

  async function createColumns(projectId, names) {
    const columns = {};
    for (let i = 0; i < names.length; i++) {
      const result = await pool.query(
        `INSERT INTO task_columns (project_id, name, position) VALUES ($1, $2, $3) RETURNING id`,
        [projectId, names[i], i],
      );
      columns[names[i]] = result.rows[0].id;
    }
    return columns;
  }

  async function createTask(projectId, columnId, title, assigneeKey, position, type = "task", priority = "medium") {
    await pool.query(
      `
        INSERT INTO tasks (project_id, column_id, title, assignee_id, position, type, priority)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [projectId, columnId, title, assigneeKey ? users[assigneeKey] : null, position, type, priority],
    );
  }

  // Project 1: Website Redesign
  const website = await createProject(
    "Website Redesign",
    "Redesign of the marketing site",
    ["admin", "alice", "bob"],
  );
  const websiteColumns = await createColumns(website, ["To Do", "In Progress", "Done"]);

  await createTask(website, websiteColumns["To Do"], "Design homepage mockup", "alice", 0, "task", "high");
  await createTask(website, websiteColumns["To Do"], "Set up CI pipeline", "bob", 1, "task", "medium");
  await createTask(website, websiteColumns["In Progress"], "Implement navbar", "alice", 0, "task", "medium");
  await createTask(website, websiteColumns["In Progress"], "Fix footer layout", "bob", 1, "bug", "low");
  await createTask(website, websiteColumns["Done"], "Deploy staging", "admin", 0, "task", "high");

  // Project 2: Mobile App
  const mobile = await createProject(
    "Mobile App",
    "Native mobile app MVP",
    ["admin", "bob", "carol"],
  );
  const mobileColumns = await createColumns(mobile, ["Backlog", "In Progress", "Review", "Done"]);

  await createTask(mobile, mobileColumns["Backlog"], "Define app architecture", "carol", 0, "story", "high");
  await createTask(mobile, mobileColumns["In Progress"], "Login screen", "bob", 0, "task", "medium");
  await createTask(mobile, mobileColumns["In Progress"], "Push notifications", null, 1, "bug", "high");
  await createTask(mobile, mobileColumns["Review"], "Onboarding flow", "carol", 0, "story", "medium");
  await createTask(mobile, mobileColumns["Done"], "Release v1.0", "admin", 0, "task", "low");

  console.log("Seed complete:");
  console.log("  admin@example.com / admin123 (admin)");
  console.log("  alice@example.com / password123 (member)");
  console.log("  bob@example.com / password123 (member)");
  console.log("  carol@example.com / password123 (member)");
}

seed()
  .then(() => {
    console.log("Done");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  });
