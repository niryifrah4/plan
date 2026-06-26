/**
 * Shim for `next/image` — renders a plain <img>. Drops Next-only optimization
 * props (fill, priority, quality, loader, …) that have no meaning in Vite.
 */
import { forwardRef, type ImgHTMLAttributes } from "react";

interface NextImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "width" | "height"> {
  src: string | { src: string };
  width?: number | string;
  height?: number | string;
  fill?: boolean;
  priority?: boolean;
  quality?: number;
  loader?: unknown;
  placeholder?: string;
  blurDataURL?: string;
  unoptimized?: boolean;
}

const Image = forwardRef<HTMLImageElement, NextImageProps>(function Image(
  { src, width, height, fill, priority, quality, loader, placeholder, blurDataURL, unoptimized, style, ...rest },
  ref
) {
  void priority;
  void quality;
  void loader;
  void placeholder;
  void blurDataURL;
  void unoptimized;
  const resolvedSrc = typeof src === "string" ? src : src.src;
  const fillStyle = fill ? { position: "absolute" as const, inset: 0, width: "100%", height: "100%", ...style } : style;
  return <img ref={ref} src={resolvedSrc} width={width} height={height} style={fillStyle} {...rest} />;
});

export default Image;
