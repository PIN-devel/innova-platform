import { z } from "zod";

export const ItemSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export const ItemsSchema = z.array(ItemSchema);

export const ItemInputSchema = z.object({
  name: z.string(),
});

export const ItemParamsSchema = z.object({
  id: z.string(),
});

export const ItemErrorSchema = z.object({
  message: z.string(),
});

export type Item = z.infer<typeof ItemSchema>;
export type ItemInput = z.infer<typeof ItemInputSchema>;
export type ItemParams = z.infer<typeof ItemParamsSchema>;
export type ItemError = z.infer<typeof ItemErrorSchema>;

// Fastify uses JSON Schema for request validation and response serialization.
export const itemJsonSchemas = {
  item: z.toJSONSchema(ItemSchema, { target: "draft-7" }),
  items: z.toJSONSchema(ItemsSchema, { target: "draft-7" }),
  input: z.toJSONSchema(ItemInputSchema, { target: "draft-7" }),
  params: z.toJSONSchema(ItemParamsSchema, { target: "draft-7" }),
  error: z.toJSONSchema(ItemErrorSchema, { target: "draft-7" }),
};
