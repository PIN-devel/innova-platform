import { itemJsonSchemas } from "@innova/contracts";
import type { ItemInput, ItemParams } from "@innova/contracts";
import type { FastifyPluginAsync } from "fastify";
import type { ItemRepository } from "../db/items.js";

export const itemRoutes: FastifyPluginAsync<{ repository: ItemRepository }> = async (app, { repository }) => {

  app.get("/", { schema: { response: { 200: itemJsonSchemas.items } } }, async () =>
    repository.list(),
  );

  app.get<{ Params: ItemParams }>("/:id", {
    schema: { params: itemJsonSchemas.params, response: { 200: itemJsonSchemas.item } },
  }, async (request, reply) => {
    const item = await repository.find(request.params.id);
    if (!item) return reply.code(404).send({ message: "Item not found" });
    return item;
  });

  app.post<{ Body: ItemInput }>("/", {
    schema: { body: itemJsonSchemas.input, response: { 201: itemJsonSchemas.item } },
  }, async (request, reply) => {
    const name = request.body.name.trim();
    if (!name) return reply.code(400).send({ message: "Name is required" });

    const item = await repository.create(name);
    return reply.code(201).send(item);
  });

  app.put<{ Params: ItemParams; Body: ItemInput }>("/:id", {
    schema: { params: itemJsonSchemas.params, body: itemJsonSchemas.input, response: { 200: itemJsonSchemas.item } },
  }, async (request, reply) => {
    const name = request.body.name.trim();
    if (!name) return reply.code(400).send({ message: "Name is required" });

    const item = await repository.update(request.params.id, name);
    if (!item) return reply.code(404).send({ message: "Item not found" });
    return item;
  });

  app.delete<{ Params: ItemParams }>("/:id", {
    schema: { params: itemJsonSchemas.params },
  }, async (request, reply) => {
    if (!await repository.remove(request.params.id)) {
      return reply.code(404).send({ message: "Item not found" });
    }
    return reply.code(204).send();
  });
};
