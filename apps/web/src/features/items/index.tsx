import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useFetcher } from "react-router";
import type { Item } from "@innova/contracts";
import type { ItemActionResult } from "./action";
import { itemsQuery } from "./queries";

const inputClassName =
  "mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
const primaryButtonClassName =
  "rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryButtonClassName =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:cursor-not-allowed disabled:opacity-50";

type ItemRowProps = {
  item: Item;
};

const ItemRow = ({ item }: ItemRowProps) => {
  const fetcher = useFetcher<ItemActionResult>();
  const [name, setName] = useState(item.name);
  const [isEditing, setIsEditing] = useState(false);
  const isBusy = fetcher.state !== "idle";
  const showEditForm =
    isEditing && !(fetcher.data?.ok && fetcher.data.intent === "update");

  const startEditing = () => {
    fetcher.reset();
    setName(item.name);
    setIsEditing(true);
  };

  return (
    <li className="px-5 py-4">
      {showEditForm ? (
        <fetcher.Form method="post" className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <input type="hidden" name="intent" value="update" />
          <input type="hidden" name="id" value={item.id} />
          <label className="flex-1 text-sm font-medium text-slate-700">
            Item name
            <input
              className={inputClassName}
              name="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </label>
          <button
            className={primaryButtonClassName}
            type="submit"
            disabled={isBusy || !name.trim()}
          >
            {isBusy ? "Saving…" : "Save"}
          </button>
          <button
            className={secondaryButtonClassName}
            type="button"
            onClick={() => setIsEditing(false)}
          >
            Cancel
          </button>
        </fetcher.Form>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="font-medium text-slate-900">{item.name}</span>
          <div className="flex items-center gap-2">
            <button
              className={secondaryButtonClassName}
              type="button"
              onClick={startEditing}
              disabled={isBusy}
              aria-label={`Edit ${item.name}`}
            >
              Edit
            </button>
            <fetcher.Form method="post">
              <input type="hidden" name="intent" value="delete" />
              <input type="hidden" name="id" value={item.id} />
              <button
                className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-50 focus:outline-none focus:ring-2 focus:ring-rose-200 disabled:cursor-not-allowed disabled:opacity-50"
                type="submit"
                disabled={isBusy}
                aria-label={`Delete ${item.name}`}
              >
                {isBusy ? "Deleting…" : "Delete"}
              </button>
            </fetcher.Form>
          </div>
        </div>
      )}
      {fetcher.data && !fetcher.data.ok && (
        <p className="mt-3 text-sm text-rose-700" role="alert">
          Could not {fetcher.data.intent ?? "process"} item: {fetcher.data.error}
        </p>
      )}
    </li>
  );
};

const ItemsFeature = () => {
  const fetcher = useFetcher<ItemActionResult>();
  const formRef = useRef<HTMLFormElement>(null);
  const { data: items, isPending, isError } = useQuery(itemsQuery);

  useEffect(() => {
    if (fetcher.data?.ok && fetcher.data.intent === "create") {
      formRef.current?.reset();
    }
  }, [fetcher.data]);

  if (isPending) return <p className="text-sm text-slate-600">Loading items…</p>;
  if (isError)
    return <p className="text-sm text-rose-700" role="alert">Could not load items.</p>;

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-2xl font-semibold tracking-tight">Items</h2>
        <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">
          {items.length} items
        </span>
      </div>

      <fetcher.Form
        method="post"
        ref={formRef}
        className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-end"
      >
        <input type="hidden" name="intent" value="create" />
        <label className="flex-1 text-sm font-medium text-slate-700">
          New item
          <input className={inputClassName} name="name" required />
        </label>
        <button
          className={primaryButtonClassName}
          type="submit"
          disabled={fetcher.state !== "idle"}
        >
          {fetcher.state !== "idle" ? "Adding…" : "Add item"}
        </button>
      </fetcher.Form>
      {fetcher.data && !fetcher.data.ok && (
        <p className="text-sm text-rose-700" role="alert">
          Could not create item: {fetcher.data.error}
        </p>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {items.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-500">
            No items yet. Add one above.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((item) => (
              <ItemRow key={item.id} item={item} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
};

export default ItemsFeature;
