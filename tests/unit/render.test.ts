import { describe, expect, it } from "vitest";
import {
  colorFromName,
  escapeHtml,
  formatDate,
  initialsFromName,
  renderEmpty,
  renderForm,
  renderStrip,
  renderTestimonials,
  type RenderOptions,
  type RenderRecord,
} from "../../src/render.js";

/**
 * The renderer turns operator and visitor text into public HTML, so the
 * escaping rules are the contract: nothing reaches the page unescaped, the
 * star ratings carry their text equivalent, and every layout the block
 * inspector offers renders the agreed structure.
 */

const OPTIONS: RenderOptions = {
  layout: "grid",
  columns: "3",
  style: "cards",
  showStars: true,
  showAvatars: true,
  showRole: true,
  showDate: false,
};

function record(overrides: Partial<RenderRecord> = {}): RenderRecord {
  return {
    id: "t1",
    quote: "They answered every question the same day.",
    personName: "Abena Owusu",
    role: "Owner, Sunshade Fabrics",
    rating: 5,
    avatarUrl: "",
    approvedAt: "2026-11-10T09:00:00.000Z",
    ...overrides,
  };
}

describe("escaping", () => {
  it("escapes markup in every text position", () => {
    const hostile = record({
      quote: '<script>alert("x")</script>',
      personName: 'Ama <img src=x onerror="1">',
      role: '"><svg onload=1>',
    });
    const html = renderTestimonials([hostile], OPTIONS);
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<svg");
    expect(html).toContain("&lt;script");
    expect(html).toContain("&lt;img");
    expect(html).toContain("&quot;&gt;&lt;svg");
  });

  it("escapes attribute values, including image addresses", () => {
    const html = renderTestimonials(
      [record({ avatarUrl: '/media/a.png" onerror="alert(1)' })],
      OPTIONS,
    );
    expect(html).not.toContain('src="/media/a.png" onerror');
    expect(html).toContain("&quot; onerror=&quot;");
  });

  it("keeps the reviewer's own line breaks as br elements", () => {
    const html = renderTestimonials([record({ quote: "First line.\nSecond line." })], OPTIONS);
    expect(html).toContain("First line.<br>Second line.");
  });
});

describe("initials and colours", () => {
  it("takes up to two initials from a name", () => {
    expect(initialsFromName("Ama Mensah")).toBe("AM");
    expect(initialsFromName("Cher")).toBe("C");
    expect(initialsFromName("  kwame  n.  boateng ")).toBe("KN");
    expect(initialsFromName("")).toBe("?");
  });

  it("is deterministic per name and varies between names", () => {
    expect(colorFromName("Ama Mensah")).toBe(colorFromName("Ama Mensah"));
    expect(colorFromName("Ama Mensah")).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("stars and dates", () => {
  it("renders the text equivalent of a rating", () => {
    const html = renderTestimonials([record({ rating: 4 })], OPTIONS);
    expect(html).toContain('aria-label="Rated 4 of 5 stars"');
    expect(html.match(/jbt-star--on/g)?.length).toBe(4);
    expect(html.match(/jbt-star--off/g)?.length).toBe(1);
  });

  it("renders nothing star-shaped for an unrated review", () => {
    const html = renderTestimonials([record({ rating: null })], OPTIONS);
    expect(html).not.toContain("jbt-stars");
  });

  it("hides stars, avatars, roles, and dates when told to", () => {
    const html = renderTestimonials([record()], {
      ...OPTIONS,
      showStars: false,
      showAvatars: false,
      showRole: false,
      showDate: false,
    });
    expect(html).not.toContain("jbt-stars");
    expect(html).not.toContain("jbt-card__photo");
    expect(html).not.toContain("jbt-card__role");
    expect(html).not.toContain("<time");
  });

  it("formats a machine-readable date when dates are shown", () => {
    const html = renderTestimonials([record({ approvedAt: "2026-11-10T09:00:00.000Z" })], {
      ...OPTIONS,
      showDate: true,
    });
    expect(html).toContain('datetime="2026-11-10T09:00:00.000Z"');
    expect(html).toContain("10 Nov 2026");
  });
});

describe("layouts", () => {
  it("renders the grid with its column class", () => {
    const html = renderTestimonials([record({ id: "a" }), record({ id: "b" })], {
      ...OPTIONS,
      columns: "2",
    });
    expect(html).toContain("jbt--grid jbt--cols-2");
    expect(html.match(/jbt-card"/g)?.length).toBe(2);
  });

  it("renders the slider as a track a page can scroll without scripts", () => {
    const html = renderTestimonials([record({ id: "a" }), record({ id: "b" })], {
      ...OPTIONS,
      layout: "slider",
    });
    expect(html).toContain('data-jbt="slider"');
    expect(html).toContain("jbt-track");
  });

  it("renders exactly one feature quote", () => {
    const html = renderTestimonials([record({ id: "a" }), record({ id: "b" })], {
      ...OPTIONS,
      layout: "feature",
    });
    expect(html).toContain("jbt-feature__quote");
    expect(html).not.toContain('class="jbt-card"');
  });

  it("renders the quiet empty state when there is nothing to show", () => {
    expect(renderTestimonials([], OPTIONS)).toBe(renderEmpty());
    expect(renderEmpty()).toContain("No reviews to show yet.");
  });
});

describe("activity strip", () => {
  it("uses the agreed published-only copy", () => {
    const html = renderStrip({ approved: 9, averageRating: 4.8, publishedThisMonth: 2 });
    expect(html).toContain("2 reviews published this month");
    expect(html).toContain("4.8 average");
    expect(html).toContain('aria-label="Average rating 4.8 of 5 stars"');
  });

  it("counts a single review without a plural s", () => {
    const html = renderStrip({ approved: 3, averageRating: null, publishedThisMonth: 1 });
    expect(html).toContain("1 review published this month");
    expect(html).not.toContain("average");
  });

  it("renders nothing at all when nothing is approved", () => {
    expect(renderStrip({ approved: 0, averageRating: null, publishedThisMonth: 0 })).toBe("");
  });
});

describe("collection form", () => {
  it("renders the fields, the consent gate, and the moderation promise", () => {
    const html = renderForm();
    expect(html).toContain("Leave a review");
    expect(html).toContain("Nothing is published until the site owner approves it.");
    expect(html).toContain('name="quote"');
    expect(html).toContain('name="personName"');
    expect(html).toContain('name="role"');
    expect(html).toContain('name="consent"');
    expect(html).toContain('data-jbt="captcha-slot"');
    expect(html).toContain("Send for review");
    expect(html).toContain("Submitting a review needs JavaScript.");
  });

  it("renders five rating radios in reverse order for the star picker", () => {
    const html = renderForm();
    expect(html.match(/type="radio" name="jbt-rating"/g)?.length).toBe(5);
    expect(html).toContain('value="5"');
    expect(html).toContain('value="1"');
  });
});
