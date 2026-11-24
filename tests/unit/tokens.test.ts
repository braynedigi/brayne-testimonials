import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The theming contract: every `--jbt-*` custom property the public
 * stylesheet uses is a documented override point in the README. A theme
 * overriding one of these names must be able to trust the documentation, so
 * the two can never drift apart: add a variable, document it here.
 */

const packageRoot = path.dirname(
  fileURLToPath(new URL("../../package.json", import.meta.url)),
);
const css = readFileSync(
  path.join(packageRoot, "public", "testimonials.css"),
  "utf8",
);
const readme = readFileSync(path.join(packageRoot, "README.md"), "utf8");

describe("design token contract", () => {
  it("documents every --jbt-* variable the stylesheet mentions", () => {
    const names = [
      ...new Set(
        [...css.matchAll(/--jbt-[a-z0-9-]+/g)].map((match) => match[0]),
      ),
    ].sort();
    /** The design contract ships a real palette, not a token or two. */
    expect(names.length).toBeGreaterThan(10);
    for (const name of names) {
      expect(readme, `README documents ${name}`).toContain(name);
    }
  });

  it("reads every variable through var(), with the :root defaults in place", () => {
    const defaults = new Set(
      [...css.matchAll(/^\s*(--jbt-[a-z0-9-]+)\s*:/gm)].map((m) => m[1]),
    );
    const used = new Set(
      [...css.matchAll(/var\(\s*(--jbt-[a-z0-9-]+)/g)].map((m) => m[1]),
    );
    /** Every variable the rules consume has a declared default to fall back on. */
    for (const name of used) {
      expect(
        defaults.has(name),
        `--jbt usage ${name} needs a :root default`,
      ).toBe(true);
    }
  });
});
