const { z } = require("zod");

const taskType = z.enum(["task", "bug", "story"]);
const taskPriority = z.enum(["low", "medium", "high"]);

const createTaskSchema = z.object({
  project_id: z.number().int().positive(),
  column_id: z.number().int().positive().optional(),
  title: z.string().min(1),
  description: z.string().optional(),
  assignee_id: z.number().int().positive().nullable().optional(),
  type: taskType.optional(),
  priority: taskPriority.optional(),
});

const updateTaskSchema = z
  .object({
    title: z.string().min(1),
    description: z.string(),
    assignee_id: z.number().int().positive().nullable(),
    type: taskType,
    priority: taskPriority,
  })
  .partial();

const moveTaskSchema = z.object({
  column_id: z.number().int().positive(),
  position: z.number().int().min(0),
});

module.exports = {
  createTaskSchema,
  updateTaskSchema,
  moveTaskSchema,
};
