/**
 * Shim for `next/dynamic` backed by React.lazy + Suspense. Supports the common
 * `dynamic(() => import("..."), { ssr: false, loading })` call shape.
 */
import { lazy, Suspense, type ComponentType } from "react";

interface DynamicOptions {
  ssr?: boolean;
  loading?: ComponentType;
}

export default function dynamic<P extends object>(
  loader: () => Promise<{ default: ComponentType<P> } | ComponentType<P>>,
  options: DynamicOptions = {}
): ComponentType<P> {
  const Lazy = lazy(async () => {
    const mod = await loader();
    const Comp = (mod as { default?: ComponentType<P> }).default ?? (mod as ComponentType<P>);
    return { default: Comp };
  });
  const Loading = options.loading;
  return function DynamicComponent(props: P) {
    const LazyAny = Lazy as unknown as ComponentType<P>;
    return (
      <Suspense fallback={Loading ? <Loading /> : null}>
        <LazyAny {...props} />
      </Suspense>
    );
  };
}
