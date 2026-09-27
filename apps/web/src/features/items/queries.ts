import { queryOptions } from "@tanstack/react-query";
import { getItems } from "./api";

export const itemsQuery = queryOptions({
  queryKey: ["items"],
  queryFn: getItems,
});
