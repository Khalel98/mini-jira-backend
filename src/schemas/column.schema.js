const { z } = require("zod");

const createColumnSchema = z.object({
  name: z.string().min(1),
});

const updateColumnSchema = z
  .object({
    name: z.string().min(1),
    position: z.number().int().min(0),
  })
  .partial();

module.exports = {
  createColumnSchema,
  updateColumnSchema,
};
