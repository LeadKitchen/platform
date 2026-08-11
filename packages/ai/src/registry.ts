export interface Identified {
  readonly id: string;
}

export interface Registry<T extends Identified> {
  readonly kind: string;
  register(item: T): void;
  has(id: string): boolean;
  resolve(id: string): T;
  list(): T[];
  ids(): string[];
}

/**
 * A tiny name → implementation registry, one per pipeline stage.
 *
 * Adding a new approach (RAG over a real vector store, GraphRAG on a property
 * graph, a learned persona policy…) means writing the strategy and calling
 * `register` — nothing in the API layer or the UI has to change.
 */
export function createRegistry<T extends Identified>(
  kind: string,
): Registry<T> {
  const items = new Map<string, T>();

  return {
    kind,
    register(item) {
      if (items.has(item.id)) {
        throw new Error(`${kind} strategy "${item.id}" is already registered`);
      }
      items.set(item.id, item);
    },
    has(id) {
      return items.has(id);
    },
    resolve(id) {
      const item = items.get(id);
      if (!item) {
        throw new Error(
          `Unknown ${kind} strategy "${id}". Registered: ${[...items.keys()].join(", ") || "none"}`,
        );
      }
      return item;
    },
    list() {
      return [...items.values()];
    },
    ids() {
      return [...items.keys()];
    },
  };
}
