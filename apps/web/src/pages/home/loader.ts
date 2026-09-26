import type { QueryClient } from "@tanstack/react-query";
import { itemsQuery } from "../../features/items/queries";

export const homeLoader = (queryClient: QueryClient) =>
  queryClient.query(itemsQuery);
