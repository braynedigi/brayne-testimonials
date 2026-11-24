import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The slider/facade script is a static public asset. Its contract: the
 * server's markup carries only a link until a visitor clicks, the script is
 * the only thing that ever builds an iframe, and it only ever iframes the
 * two embed hosts the server's own allowlist produces. Anything else stays
 * a plain link to the video's own site.
 */

const packageRoot = path.dirname(
  fileURLToPath(new URL("../../package.json", import.meta.url)),
);
const script = readFileSync(
  path.join(packageRoot, "public", "testimonials.js"),
  "utf8",
);

describe("testimonials.js asset audit", () => {
  it("builds the player only on click, from the anchor's own attribute", () => {
    expect(script).toContain('querySelectorAll("a[data-jbt-video]")');
    expect(script).toContain('addEventListener("click"');
    expect(script).toContain('getAttribute("data-jbt-video")');
    expect(script).toContain('createElement("iframe")');
    expect(script).toContain("event.preventDefault()");
  });

  it("re-checks the embed against the two allowed hosts before iframing", () => {
    expect(script).toContain("www\\.youtube-nocookie\\.com");
    expect(script).toContain("player\\.vimeo\\.com");
    expect(script).toContain("VIDEO_EMBED_RE.test(embed)");
  });

  it("never writes markup: no innerHTML or eval anywhere in the script", () => {
    expect(script).not.toContain("innerHTML");
    expect(script).not.toContain("insertAdjacentHTML");
    expect(script).not.toContain("document.write");
    expect(script).not.toContain("eval(");
    expect(script).not.toContain("new Function");
  });

  it("marks the iframe with the privacy and media controls", () => {
    expect(script).toContain(
      'allow = "autoplay; fullscreen; picture-in-picture"',
    );
    expect(script).toContain(
      'referrerPolicy = "strict-origin-when-cross-origin"',
    );
    expect(script).toContain('player.title = "Video review"');
  });
});
