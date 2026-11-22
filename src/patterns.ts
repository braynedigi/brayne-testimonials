/**
 * The editable patterns Brayne Testimonials contributes to the builder's
 * pattern library. Each pattern composes only blocks this plugin registers,
 * so inserting one never depends on another extension.
 */

import type { PluginPatternDefinition } from "@justflows/sdk";
import {
  REVIEW_FORM_BLOCK,
  STRIP_BLOCK,
  TESTIMONIALS_BLOCK,
} from "./blocks.js";

/** The display block configured for a wall of reviews. */
function displayBlock(
  id: string,
  props: Record<string, unknown>,
): { id: string; type: string; version: number; props: Record<string, unknown> } {
  return { id, type: TESTIMONIALS_BLOCK, version: 1, props };
}

/** The three patterns the design file specifies, as block compositions. */
export function testimonialPatterns(): PluginPatternDefinition[] {
  return [
    {
      id: "testimonial-wall",
      title: "Testimonial wall",
      description: "A three-column grid of up to six curated reviews.",
      requiresBlockTypes: [TESTIMONIALS_BLOCK],
      blocks: [
        displayBlock("wall-grid", {
          layout: "grid",
          columns: "3",
          limit: 6,
          source: "all",
          style: "cards",
          showStars: true,
          showAvatars: true,
          showRole: true,
          showDate: false,
        }),
      ],
    },
    {
      id: "hero-with-social-proof",
      title: "Hero with social proof",
      description: "The activity strip above a short row of reviews.",
      requiresBlockTypes: [TESTIMONIALS_BLOCK, STRIP_BLOCK],
      blocks: [
        { id: "hero-strip", type: STRIP_BLOCK, version: 1, props: {} },
        displayBlock("hero-row", {
          layout: "grid",
          columns: "3",
          limit: 3,
          source: "all",
          style: "minimal",
          showStars: true,
          showAvatars: false,
          showRole: true,
          showDate: false,
        }),
      ],
    },
    {
      id: "footer-quote",
      title: "Footer quote",
      description: "One quiet, featured review with quote marks.",
      requiresBlockTypes: [TESTIMONIALS_BLOCK],
      blocks: [
        displayBlock("footer-feature", {
          layout: "feature",
          columns: "3",
          limit: 1,
          source: "featured",
          style: "quote",
          showStars: true,
          showAvatars: true,
          showRole: true,
          showDate: false,
        }),
      ],
    },
  ];
}
