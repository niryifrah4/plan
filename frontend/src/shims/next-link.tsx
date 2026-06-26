/**
 * Shim for `next/link` backed by react-router's Link. Maps Next's `href` prop
 * to react-router's `to`. External/hash links fall back to a plain <a>.
 */
import { forwardRef, type AnchorHTMLAttributes, type ReactNode } from "react";
import { Link as RouterLink } from "react-router-dom";

interface NextLinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
  href: string;
  children?: ReactNode;
  // Next-only props that are no-ops here.
  prefetch?: boolean;
  replace?: boolean;
  scroll?: boolean;
  shallow?: boolean;
  passHref?: boolean;
  locale?: string | false;
}

const Link = forwardRef<HTMLAnchorElement, NextLinkProps>(function Link(
  { href, prefetch, replace, scroll, shallow, passHref, locale, children, ...rest },
  ref
) {
  void prefetch;
  void scroll;
  void shallow;
  void passHref;
  void locale;
  const isExternal = /^(https?:)?\/\//.test(href) || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("#");
  if (isExternal) {
    return (
      <a ref={ref} href={href} {...rest}>
        {children}
      </a>
    );
  }
  return (
    <RouterLink ref={ref} to={href} replace={replace} {...rest}>
      {children}
    </RouterLink>
  );
});

export default Link;
