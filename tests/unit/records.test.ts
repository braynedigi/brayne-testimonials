import { describe, expect, it } from "vitest";
import {
  buildRecord,
  buildStats,
  makeRecordId,
  selectVisible,
  validateRecord,
  validateSubmission,
  type TestimonialRecord,
} from "../../src/records.js";

/**
 * Every moderation rule lives here: what a record may contain, what a
 * visitor may submit, which records the site may show, and how the activity
 * numbers are counted.
 */

const NOW = new Date("2026-11-22T12:00:00.000Z");

function record(overrides: Partial<TestimonialRecord>): TestimonialRecord {
  return {
    id: "t1",
    quote: "They rebuilt our site in a week and bookings doubled.",
    personName: "Ama Mensah",
    role: "Founder, Accra Tours",
    rating: 5,
    avatarUrl: "",
    featuredAt: "",
    status: "approved",
    consent: true,
    submittedAt: "2026-11-20T09:00:00.000Z",
    approvedAt: "2026-11-21T09:00:00.000Z",
    source: "form",
    ...overrides,
  };
}

describe("validateRecord", () => {
  it("accepts a complete record and keeps only what was sent", () => {
    const checked = validateRecord({
      id: "t100",
      quote: "Fast, friendly, and honest about timelines.",
      personName: "Kofi Boateng",
      role: "Operations, Harbor Freight",
      rating: 4,
      avatarUrl: "/media/avatars/kofi.png",
      featuredAt: "2026-11-22T10:00:00.000Z",
      status: "approved",
      consent: true,
      submittedAt: "2026-11-19T10:00:00.000Z",
      approvedAt: "2026-11-20T10:00:00.000Z",
      source: "manual",
    });
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    expect(Object.keys(checked.values).length).toBe(12);
    expect(checked.values.rating).toBe(4);
  });

  it("requires the quote and the reviewer name", () => {
    const noQuote = validateRecord({ quote: "   ", personName: "Ama" });
    expect(noQuote.ok).toBe(false);
    if (!noQuote.ok) expect(noQuote.field).toBe("quote");

    const noName = validateRecord({ quote: "Great work.", personName: "" });
    expect(noName.ok).toBe(false);
    if (!noName.ok) expect(noName.field).toBe("personName");
  });

  it("bounds the quote and the name", () => {
    expect(validateRecord({ quote: "x".repeat(501) }).ok).toBe(false);
    expect(validateRecord({ personName: "y".repeat(61) }).ok).toBe(false);
  });

  it("accepts a rating of 0-5 and treats empty as unrated", () => {
    const five = validateRecord({ rating: 5 });
    const zero = validateRecord({ rating: 0 });
    const empty = validateRecord({ rating: "" });
    expect(five.ok).toBe(true);
    expect(zero.ok).toBe(true);
    expect(empty.ok).toBe(true);
    if (five.ok) expect(five.values).toEqual({ rating: 5 });
    if (zero.ok) expect(zero.values).toEqual({ rating: 0 });
    if (empty.ok) expect(empty.values).toEqual({ rating: "" });
    for (const bad of [6, -1, "five", 3.5]) {
      const checked = validateRecord({ rating: bad });
      expect(checked.ok).toBe(false);
      if (!checked.ok) expect(checked.field).toBe("rating");
    }
  });

  it("accepts only same-origin or http image addresses", () => {
    expect(validateRecord({ avatarUrl: "/media/a.png" }).ok).toBe(true);
    expect(validateRecord({ avatarUrl: "https://cdn.example.com/a.png" }).ok).toBe(true);
    expect(validateRecord({ avatarUrl: "" }).ok).toBe(true);
    for (const bad of ['" onerror="alert(1)', "javascript:alert(1)", "media/a.png"]) {
      const checked = validateRecord({ avatarUrl: bad });
      expect(checked.ok).toBe(false);
      if (!checked.ok) expect(checked.field).toBe("avatarUrl");
    }
  });

  it("keeps status, source, and ids to their documented values", () => {
    expect(validateRecord({ status: "live" }).ok).toBe(false);
    expect(validateRecord({ source: "import" }).ok).toBe(false);
    expect(validateRecord({ id: "Bad Id!" }).ok).toBe(false);
    expect(validateRecord({ status: "pending", source: "form", id: "t-9_a" }).ok).toBe(true);
  });

  it("accepts only exact ISO timestamps", () => {
    expect(validateRecord({ featuredAt: "2026-11-22T10:00:00.000Z" }).ok).toBe(true);
    for (const bad of ["21/11/2026", "not-a-time", "2026-13-99T99:99:99Z"]) {
      const checked = validateRecord({ featuredAt: bad });
      expect(checked.ok).toBe(true);
      if (checked.ok) expect(checked.values.featuredAt).toBe("");
    }
  });
});

describe("validateSubmission", () => {
  it("accepts a visitor's fields and nothing else", () => {
    const checked = validateSubmission({
      quote: "They answered every question the same day.",
      personName: "Efua Sarpong",
      role: "Teacher",
      rating: 5,
      consent: true,
      status: "approved",
      id: "evil",
    });
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    expect("status" in checked.values).toBe(false);
    expect("id" in checked.values).toBe(false);
  });

  it("requires consent to publish", () => {
    const missing = validateSubmission({ quote: "Good work.", personName: "Ama", consent: false });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.field).toBe("consent");
  });
});

describe("buildRecord", () => {
  it("normalizes hostile or half-typed rows into safe values", () => {
    const built = buildRecord({
      id: 42,
      quote: "  Great   work.  ",
      personName: "<b>Ama</b>",
      rating: "5",
      avatarUrl: "javascript:alert(1)",
      status: "live",
      consent: "true",
      source: "csv",
    });
    expect(built.id).toBe("");
    /** The reviewer's own spacing is preserved; only the ends are trimmed. */
    expect(built.quote).toBe("Great   work.");
    expect(built.personName).toBe("<b>Ama</b>");
    expect(built.rating).toBe(5);
    expect(built.avatarUrl).toBe("");
    expect(built.status).toBe("pending");
    expect(built.consent).toBe(false);
    expect(built.source).toBe("form");
  });
});

describe("selectVisible", () => {
  it("shows only approved records, newest first, featured pinned above", () => {
    const approved = record({ id: "a", approvedAt: "2026-11-01T00:00:00.000Z" });
    const newer = record({ id: "b", approvedAt: "2026-11-10T00:00:00.000Z" });
    const pinned = record({
      id: "c",
      featuredAt: "2026-11-05T00:00:00.000Z",
      approvedAt: "2026-10-01T00:00:00.000Z",
    });
    const pending = record({ id: "d", status: "pending" });
    const visible = selectVisible([approved, pending, newer, pinned], {
      source: "all",
      minRating: 0,
      limit: 12,
    });
    expect(visible.map((entry) => entry.id)).toEqual(["c", "b", "a"]);
  });

  it("hides unrated and lower-rated reviews when a minimum is set", () => {
    const unrated = record({ id: "u", rating: null });
    const twoStars = record({ id: "low", rating: 2 });
    const fiveStars = record({ id: "high", rating: 5 });
    const atMinimum = selectVisible([unrated, twoStars, fiveStars], {
      source: "all",
      minRating: 3,
      limit: 12,
    });
    expect(atMinimum.map((entry) => entry.id)).toEqual(["high"]);
  });

  it("shows unrated reviews when there is no minimum", () => {
    const unrated = record({ id: "u", rating: null });
    const visible = selectVisible([unrated], { source: "all", minRating: 0, limit: 12 });
    expect(visible.map((entry) => entry.id)).toEqual(["u"]);
  });

  it("limits the result and respects the featured-only source", () => {
    const pinned = record({ id: "p", featuredAt: "2026-11-05T00:00:00.000Z" });
    const plain = record({ id: "x" });
    expect(
      selectVisible([pinned, plain], { source: "featured", minRating: 0, limit: 12 }).map(
        (e) => e.id,
      ),
    ).toEqual(["p"]);
    expect(
      selectVisible([pinned, plain], { source: "all", minRating: 0, limit: 1 }).map((e) => e.id),
    ).toEqual(["p"]);
  });
});

describe("buildStats", () => {
  it("counts approved, pending, and featured, and averages rated reviews only", () => {
    const stats = buildStats(
      [
        record({ id: "a", rating: 5 }),
        record({ id: "b", rating: 3 }),
        record({ id: "c", rating: null }),
        record({ id: "d", status: "pending" }),
        record({ id: "e", rating: null, featuredAt: "2026-11-05T00:00:00.000Z" }),
      ],
      NOW,
    );
    expect(stats.total).toBe(5);
    expect(stats.approved).toBe(4);
    expect(stats.pending).toBe(1);
    expect(stats.featured).toBe(1);
    expect(stats.averageRating).toBe(4);
    expect(stats.ratedCount).toBe(2);
  });

  it("counts approved reviews from this month as published", () => {
    const stats = buildStats(
      [
        record({ id: "fresh", approvedAt: "2026-11-22T08:00:00.000Z" }),
        record({ id: "old", approvedAt: "2026-10-31T23:00:00.000Z" }),
        record({ id: "later", approvedAt: "2026-12-01T00:00:00.000Z" }),
      ],
      NOW,
    );
    expect(stats.publishedThisMonth).toBe(1);
  });

  it("reports no average when nothing approved is rated", () => {
    const stats = buildStats([record({ id: "a", rating: null })], NOW);
    expect(stats.averageRating).toBeNull();
    expect(stats.ratedCount).toBe(0);
  });
});

describe("makeRecordId", () => {
  it("produces valid, distinct ids even in the same millisecond", () => {
    const first = makeRecordId(NOW);
    const second = makeRecordId(NOW);
    expect(first).toMatch(/^t[a-z0-9_-]+$/);
    expect(second).toMatch(/^t[a-z0-9_-]+$/);
    expect(first === second).toBe(false);
  });
});
