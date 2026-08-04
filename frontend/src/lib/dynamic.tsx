import { lazy, Suspense, type ComponentType, type ComponentProps, type ReactNode } from "react";

export default function dynamic<T extends ComponentType<any>>(loader: () => Promise<any>, options?: { loading?: () => ReactNode; ssr?: boolean }) {
  const Lazy = lazy(async () => {
    const module = await loader();
    const component = typeof module === "function" ? module : module.default || Object.values(module)[0];
    return { default: component as T };
  });
  return function DynamicComponent(props: ComponentProps<T>) { return <Suspense fallback={options?.loading?.() ?? null}><Lazy {...props} /></Suspense>; };
}
