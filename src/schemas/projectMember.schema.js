const { z } = require("zod");

const addMemberSchema = z.object({
  user_id: z.number().int().positive(),
});

module.exports = {
  addMemberSchema,
};
