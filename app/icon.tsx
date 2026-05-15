import { ImageResponse } from "next/og";

export const size = { width: 192, height: 192 };
export const contentType = "image/png";

/**
 * App icon — rendered at build time by Next.js into a 192×192 PNG.
 * Botanical forest tile with a stylized leaf monogram, matching the
 * brand palette (#012D1D / #C1ECD4). One file, no external image deps.
 */
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg,#1B4332 0%,#012D1D 100%)",
          borderRadius: 28,
        }}
      >
        <svg viewBox="0 0 64 64" width="118" height="118" fill="none">
          <path
            d="M32 8 C 18 18 14 32 18 44 C 22 52 30 56 32 56 C 34 56 42 52 46 44 C 50 32 46 18 32 8 Z"
            fill="#C1ECD4"
          />
          <path
            d="M32 8 C 32 24 32 40 32 56"
            stroke="#012D1D"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path
            d="M32 22 C 26 22 22 26 22 30"
            stroke="#012D1D"
            strokeWidth="2.5"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M32 32 C 38 32 42 36 42 40"
            stroke="#012D1D"
            strokeWidth="2.5"
            strokeLinecap="round"
            fill="none"
          />
        </svg>
      </div>
    ),
    { ...size }
  );
}
