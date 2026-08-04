import { useLocation, useNavigate, useSearchParams as useNativeSearchParams, Link as RouterLink, type LinkProps } from "react-router-dom";

export { useNavigate };
export function useSearchParams() { return useNativeSearchParams()[0]; }
export function Link({ href, ...props }: Omit<LinkProps, "to"> & { href: string }) { return <RouterLink to={href} {...props} />; }
export function useRouter() {
  const navigate = useNavigate();
  return { push: (href: string) => navigate(href), replace: (href: string) => navigate(href, { replace: true }), back: () => navigate(-1), prefetch: (_href: string) => {} };
}
export function usePathname() { return useLocation().pathname; }
