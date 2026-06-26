/**
 * Shim for `next/font/google`. The fonts are loaded via <link> in index.html,
 * so each font factory just returns the className/variable shape callers expect.
 */
type FontResult = { className: string; variable: string; style: { fontFamily: string } };

function makeFont(name: string) {
  return (opts: { variable?: string; [k: string]: unknown } = {}): FontResult => ({
    className: "",
    variable: opts.variable ?? "",
    style: { fontFamily: name },
  });
}

export const Heebo = makeFont("Heebo");
export const Rubik = makeFont("Rubik");
export const Inter = makeFont("Inter");
export const Assistant = makeFont("Assistant");
