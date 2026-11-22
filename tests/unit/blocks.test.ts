import { describe, expect, it } from "vitest";
import {
  SAMPLE_RECORDS,
  TESTIMONIALS_BLOCK,
  reviewFormBlock,
  testimonialStripBlock,
  testimonialsBlock,
} from "../../src/blocks.js";

/**
 * The registry renders `def.render(validateProps(storedProps))`, so the
 * render-time props the plugin's `content.blocks` pass injects — the visible
 * reviews and the strip's stats — only reach the HTML if `validateProps` lets
 * them through. These tests pin that contract: the builder's own props still
 * coerce exactly as before, injected data survives, and a builder save (which
 * never carries injected data) stores none of it.
 */

describe("blocks", () => {
  it("declares the block types under the plugin id namespace", () => {
    expect(TESTIMONIALS_BLOCK).toBe("justflows.brayne-testimonials.reviews");
    expect(reviewFormBlock().type).toBe("justflows.brayne-testimonials.form");
    expect(testimonialStripBlock().type).toBe(
      "justflows.brayne-testimonials.strip",
    );
  });

  it("keeps hydrated reviews through validateProps and renders them", () => {
    const block = testimonialsBlock();
    const stored = { layout: "grid", columns: "3", limit: 6, source: "all" };
    const validated = block.validateProps({
      ...stored,
      records: SAMPLE_RECORDS,
    });

    expect(validated["records"]).toHaveLength(SAMPLE_RECORDS.length);
    const html = block.render(validated);
    expect(html).toContain("Maria Santos");
    expect(html).toContain("Sample Bakery");
    expect(html).not.toContain("jbt-empty");
  });

  it("drops nothing a builder save sends and stores no records of its own", () => {
    const block = testimonialsBlock();
    const validated = block.validateProps({ layout: "slider", limit: "9" });

    expect(validated).toEqual({
      layout: "slider",
      columns: "3",
      limit: 9,
      source: "all",
      showStars: true,
      showAvatars: true,
      showRole: true,
      showDate: false,
      style: "cards",
      records: [],
    });
  });

  it("renders the honest empty state when no records reach the block", () => {
    const block = testimonialsBlock();
    const html = block.render(block.validateProps({}));
    expect(html).toContain("jbt-empty");
  });

  it("keeps hydrated strip stats through validateProps and renders them", () => {
    const block = testimonialStripBlock();
    /** The full stats object the `content.blocks` pass injects. */
    const stats = {
      total: 14,
      approved: 12,
      pending: 2,
      featured: 3,
      averageRating: 4.75,
      ratedCount: 10,
      publishedThisMonth: 2,
    };
    const validated = block.validateProps({ stats });
    expect(validated["stats"]).toEqual({
      approved: 12,
      averageRating: 4.8,
      publishedThisMonth: 2,
    });
    const html = block.render(validated);
    expect(html).toContain("2 reviews published this month");
    expect(html).toContain("4.8 average");
  });

  it("renders nothing when no approved reviews back the strip", () => {
    const block = testimonialStripBlock();
    const html = block.render(block.validateProps({}));
    /** With nothing approved there is nothing to prove: an empty strip. */
    expect(html).toBe("");
  });
});
