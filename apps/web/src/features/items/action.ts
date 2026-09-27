import type { QueryClient } from "@tanstack/react-query";
import type { ActionFunctionArgs } from "react-router";
import { createItem, deleteItem, updateItem } from "./api";
import { itemsQuery } from "./queries";

type ItemActionIntent = "create" | "update" | "delete";

export type ItemActionResult =
  | { ok: true; intent: ItemActionIntent }
  | { ok: false; intent: ItemActionIntent | null; error: string };

export const createItemsAction = (queryClient: QueryClient) =>
  async ({ request }: ActionFunctionArgs): Promise<ItemActionResult> => {
    const formData = await request.formData();
    const intentValue = formData.get("intent");
    const intent =
      intentValue === "create" ||
      intentValue === "update" ||
      intentValue === "delete"
        ? intentValue
        : null;

    if (!intent) {
      return { ok: false, intent: null, error: "Unknown item action." };
    }

    try {
      switch (intent) {
        case "create": {
          const name = formData.get("name");
          if (typeof name !== "string" || !name.trim()) {
            return { ok: false, intent, error: "Name is required." };
          }
          await createItem(name.trim());
          break;
        }
        case "update": {
          const id = formData.get("id");
          const name = formData.get("name");
          if (
            typeof id !== "string" ||
            !id ||
            typeof name !== "string" ||
            !name.trim()
          ) {
            return {
              ok: false,
              intent,
              error: "A valid item ID and name are required.",
            };
          }
          await updateItem({ id, name: name.trim() });
          break;
        }
        case "delete": {
          const id = formData.get("id");
          if (typeof id !== "string" || !id) {
            return { ok: false, intent, error: "A valid item ID is required." };
          }
          await deleteItem(id);
          break;
        }
      }

      await queryClient.invalidateQueries({ queryKey: itemsQuery.queryKey });
      return { ok: true, intent };
    } catch (error) {
      return {
        ok: false,
        intent,
        error: error instanceof Error ? error.message : "Item action failed.",
      };
    }
  };
