import { ItemSchema, ItemsSchema } from "@innova/contracts";
import type { Item } from "@innova/contracts";
import { apiClient } from "../../api/client";

export const getItems = async () => ItemsSchema.parse(await apiClient.get<unknown>("/items"));

export const createItem = async (name: string) =>
  ItemSchema.parse(await apiClient.post<unknown>("/items", { name }));

export const updateItem = async ({ id, name }: Pick<Item, "id" | "name">) =>
  ItemSchema.parse(await apiClient.put<unknown>(`/items/${id}`, { name }));

export const deleteItem = (id: Item["id"]) =>
  apiClient.delete<void>(`/items/${id}`);
