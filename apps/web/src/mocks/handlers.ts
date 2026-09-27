import { http, HttpResponse } from "msw";
import { ItemInputSchema } from "@innova/contracts";
import type { Item } from "@innova/contracts";

const items = new Map<string, Item>([
  ["item-1", { id: "item-1", name: "Notebook" }],
  ["item-2", { id: "item-2", name: "Pen" }],
  ["item-3", { id: "item-3", name: "Desk lamp" }],
]);

export const handlers = [
  // Read all
  http.get("/api/items", () => {
    return HttpResponse.json([...items.values()]);
  }),

  // Read one
  http.get("/api/items/:id", ({ params }) => {
    const item = items.get(String(params.id));
    return item
      ? HttpResponse.json(item)
      : HttpResponse.json({ message: "Item not found" }, { status: 404 });
  }),

  // Create
  http.post("/api/items", async ({ request }) => {
    const body = ItemInputSchema.safeParse(await request.json());
    if (!body.success || !body.data.name.trim()) {
      return HttpResponse.json(
        { message: "Name is required" },
        { status: 400 },
      );
    }

    const item: Item = { id: crypto.randomUUID(), name: body.data.name.trim() };
    items.set(item.id, item);
    return HttpResponse.json(item, { status: 201 });
  }),

  // Update
  http.put("/api/items/:id", async ({ params, request }) => {
    const id = String(params.id);
    if (!items.has(id)) {
      return HttpResponse.json({ message: "Item not found" }, { status: 404 });
    }

    const body = ItemInputSchema.safeParse(await request.json());
    if (!body.success || !body.data.name.trim()) {
      return HttpResponse.json(
        { message: "Name is required" },
        { status: 400 },
      );
    }

    const item: Item = { id, name: body.data.name.trim() };
    items.set(id, item);
    return HttpResponse.json(item);
  }),

  // Delete
  http.delete("/api/items/:id", ({ params }) => {
    return items.delete(String(params.id))
      ? new HttpResponse(null, { status: 204 })
      : HttpResponse.json({ message: "Item not found" }, { status: 404 });
  }),
];
