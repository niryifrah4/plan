/**
 * Shim for bare `next` imports used by reused pages, e.g.
 * `import type { Route } from "next"`. These are type-only (erased at build),
 * so we just provide compatible type aliases.
 */
export type Route = string;
export type Metadata = Record<string, unknown>;
export type Viewport = Record<string, unknown>;
