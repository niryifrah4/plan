/**
 * Shim for `next/navigation` backed by react-router. Lets the reused
 * app/(client) pages + components run unchanged in the Vite SPA.
 *
 * The hooks read react-router's singleton history/location, so they work in
 * any component rendered inside the <BrowserRouter> (see main.tsx).
 */
import {
  useNavigate,
  useLocation,
  useParams as useRouterParams,
  useSearchParams as useRouterSearchParams,
} from "react-router-dom";

export function useRouter() {
  const navigate = useNavigate();
  return {
    push: (href: string) => navigate(href),
    replace: (href: string) => navigate(href, { replace: true }),
    back: () => navigate(-1),
    forward: () => navigate(1),
    refresh: () => navigate(0),
    prefetch: (_href?: string) => {},
  };
}

export function usePathname(): string {
  return useLocation().pathname;
}

export function useSearchParams(): URLSearchParams {
  const [params] = useRouterSearchParams();
  return params;
}

export function useParams<T = Record<string, string>>(): T {
  return useRouterParams() as T;
}

/**
 * next/navigation's redirect() throws to interrupt render server-side. In the
 * SPA we can't synchronously navigate from a non-hook context, so we schedule
 * a hard location change. Components that previously relied on redirect()
 * mid-render should prefer <Navigate> / useEffect, but this keeps callers working.
 */
export function redirect(href: string): never {
  if (typeof window !== "undefined") window.location.assign(href);
  throw new Error(`redirect:${href}`);
}

export function notFound(): never {
  if (typeof window !== "undefined") window.location.assign("/404");
  throw new Error("not-found");
}

export const RedirectType = { push: "push", replace: "replace" } as const;
