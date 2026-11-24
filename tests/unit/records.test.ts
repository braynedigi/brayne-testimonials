import { describe, expect, it } from "vitest";
import {
  buildRecord,
  buildStats,
  importRow,
  isLikelyBot,
  makeRecordId,
  normalizeLocaleTag,
  selectByLocale,
  selectVisible,
  toCsv,
  toEmbedUrl,
  validateInvitation,
  validateRecord,
  validateSubmission,
  withTag,
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
    photoUrl: "",
    videoUrl: "",
    tag: "",
    locale: "",
    featuredAt: "",
    status: "approved",
    ownerReply: "",
    note: "",
    verified: false,
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
    expect(
      validateRecord({ avatarUrl: "https://cdn.example.com/a.png" }).ok,
    ).toBe(true);
    expect(validateRecord({ avatarUrl: "" }).ok).toBe(true);
    for (const bad of [
      '" onerror="alert(1)',
      "javascript:alert(1)",
      "media/a.png",
    ]) {
      const checked = validateRecord({ avatarUrl: bad });
      expect(checked.ok).toBe(false);
      if (!checked.ok) expect(checked.field).toBe("avatarUrl");
    }
  });

  it("keeps status, source, and ids to their documented values", () => {
    expect(validateRecord({ status: "live" }).ok).toBe(false);
    expect(validateRecord({ source: "import" }).ok).toBe(false);
    expect(validateRecord({ id: "Bad Id!" }).ok).toBe(false);
    expect(
      validateRecord({ status: "pending", source: "form", id: "t-9_a" }).ok,
    ).toBe(true);
    /** Trash is a real state now: soft delete, restorable from the inbox. */
    expect(validateRecord({ status: "trash" }).ok).toBe(true);
  });

  it("accepts an owner reply and an internal note, bounded", () => {
    const checked = validateRecord({
      ownerReply: "Thank you for the kind words.",
      note: "Phone verified.",
    });
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    expect(checked.values.ownerReply).toBe("Thank you for the kind words.");
    expect(checked.values.note).toBe("Phone verified.");
    expect(validateRecord({ ownerReply: "x".repeat(501) }).ok).toBe(false);
    expect(validateRecord({ note: "x".repeat(301) }).ok).toBe(false);
    expect(validateRecord({ ownerReply: 42 }).ok).toBe(false);
    expect(validateRecord({ note: [] }).ok).toBe(false);
  });

  it("accepts the owner's verification as a real boolean only", () => {
    expect(validateRecord({ verified: true }).ok).toBe(true);
    expect(validateRecord({ verified: false }).ok).toBe(true);
    expect(validateRecord({ verified: "true" }).ok).toBe(false);
  });

  it("accepts a review photo under the same rules as the avatar", () => {
    expect(validateRecord({ photoUrl: "/media/reviews/shop.png" }).ok).toBe(
      true,
    );
    expect(
      validateRecord({ photoUrl: "https://cdn.example.com/shop.png" }).ok,
    ).toBe(true);
    expect(validateRecord({ photoUrl: "" }).ok).toBe(true);
    for (const bad of [
      '" onerror="alert(1)',
      "javascript:alert(1)",
      "data:text/html,hi",
    ]) {
      const checked = validateRecord({ photoUrl: bad });
      expect(checked.ok).toBe(false);
      if (!checked.ok) expect(checked.field).toBe("photoUrl");
    }
  });

  it("accepts only YouTube and Vimeo video addresses", () => {
    expect(
      validateRecord({
        videoUrl: "https://www.youtube.com/watch?v=aqz-KE-bpKQ",
      }).ok,
    ).toBe(true);
    expect(
      validateRecord({ videoUrl: "https://youtu.be/aqz-KE-bpKQ" }).ok,
    ).toBe(true);
    expect(validateRecord({ videoUrl: "https://vimeo.com/76979871" }).ok).toBe(
      true,
    );
    expect(validateRecord({ videoUrl: "" }).ok).toBe(true);
    for (const bad of [
      "https://example.com/watch?v=123",
      "https://www.youtube.com/watch?v=x",
      "not-a-url",
    ]) {
      const checked = validateRecord({ videoUrl: bad });
      expect(checked.ok).toBe(false);
      if (!checked.ok) expect(checked.field).toBe("videoUrl");
    }
  });

  it("bounds the tag and stores it cleaned", () => {
    const checked = validateRecord({ tag: "  Repairs " });
    expect(checked.ok).toBe(true);
    if (checked.ok) expect(checked.values.tag).toBe("Repairs");
    expect(validateRecord({ tag: "x".repeat(41) }).ok).toBe(false);
    expect(validateRecord({ tag: 42 }).ok).toBe(false);
  });

  it("accepts a language tag and stores it canonically", () => {
    const checked = validateRecord({ locale: " en-us " });
    expect(checked.ok).toBe(true);
    if (checked.ok) expect(checked.values.locale).toBe("en-US");
    expect(validateRecord({ locale: "nl" }).ok).toBe(true);
    expect(validateRecord({ locale: "zh-Hant-TW" }).ok).toBe(true);
    expect(validateRecord({ locale: "" }).ok).toBe(true);
    expect(validateRecord({ locale: 42 }).ok).toBe(false);
  });

  it("rejects a locale that is not a language tag", () => {
    for (const bad of [
      "not a locale",
      "e",
      "en_US!!",
      "x".repeat(41),
      '"><script>',
    ]) {
      const checked = validateRecord({ locale: bad });
      expect(checked.ok).toBe(false);
      if (!checked.ok) expect(checked.field).toBe("locale");
    }
  });

  it("accepts only exact ISO timestamps", () => {
    expect(validateRecord({ featuredAt: "2026-11-22T10:00:00.000Z" }).ok).toBe(
      true,
    );
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
      ownerReply: "Fake reply",
      note: "Fake note",
      verified: true,
    });
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    expect("status" in checked.values).toBe(false);
    expect("id" in checked.values).toBe(false);
    expect("ownerReply" in checked.values).toBe(false);
    expect("note" in checked.values).toBe(false);
    expect("verified" in checked.values).toBe(false);
  });

  it("requires consent to publish", () => {
    const missing = validateSubmission({
      quote: "Good work.",
      personName: "Ama",
      consent: false,
    });
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
      ownerReply: "  Thanks   a lot.  ",
      note: 9,
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
    expect(built.ownerReply).toBe("Thanks a lot.");
    expect(built.note).toBe("");
    expect(built.consent).toBe(false);
    expect(built.source).toBe("form");
  });
});

describe("selectVisible", () => {
  it("shows only approved records, newest first, featured pinned above", () => {
    const approved = record({
      id: "a",
      approvedAt: "2026-11-01T00:00:00.000Z",
    });
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
    const visible = selectVisible([unrated], {
      source: "all",
      minRating: 0,
      limit: 12,
    });
    expect(visible.map((entry) => entry.id)).toEqual(["u"]);
  });

  it("limits the result and respects the featured-only source", () => {
    const pinned = record({ id: "p", featuredAt: "2026-11-05T00:00:00.000Z" });
    const plain = record({ id: "x" });
    expect(
      selectVisible([pinned, plain], {
        source: "featured",
        minRating: 0,
        limit: 12,
      }).map((e) => e.id),
    ).toEqual(["p"]);
    expect(
      selectVisible([pinned, plain], {
        source: "all",
        minRating: 0,
        limit: 1,
      }).map((e) => e.id),
    ).toEqual(["p"]);
  });

  it("never shows trashed records, whatever their other state", () => {
    const trashed = record({
      id: "gone",
      status: "trash",
      featuredAt: "2026-11-05T00:00:00.000Z",
    });
    const live = record({ id: "here" });
    const visible = selectVisible([trashed, live], {
      source: "all",
      minRating: 0,
      limit: 12,
    });
    expect(visible.map((entry) => entry.id)).toEqual(["here"]);
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
        record({
          id: "e",
          rating: null,
          featuredAt: "2026-11-05T00:00:00.000Z",
        }),
        record({ id: "gone", status: "trash" }),
      ],
      NOW,
    );
    expect(stats.total).toBe(6);
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

  it("spreads approved, rated reviews across the five bars honestly", () => {
    const stats = buildStats(
      [
        record({ id: "a", rating: 5 }),
        record({ id: "b", rating: 5 }),
        record({ id: "c", rating: 4 }),
        record({ id: "d", rating: 1 }),
        record({ id: "e", rating: null }),
        record({ id: "f", status: "pending", rating: 5 }),
      ],
      NOW,
    );
    expect(stats.ratingDistribution).toEqual([2, 1, 0, 0, 1]);
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

describe("toCsv", () => {
  it("exports every record with a header row, notes included", () => {
    const csv = toCsv([
      record({ id: "t1", note: "Phone verified.", ownerReply: "Thank you!" }),
    ]);
    const lines = csv.split("\r\n");
    expect(lines[0]).toContain("id,quote,personName,role,rating,status");
    expect(lines[0]).toContain("ownerReply,note");
    expect(lines[1]).toContain("Thank you!");
    expect(lines[1]).toContain("Phone verified.");
    expect(lines[1]).toContain("approved");
  });

  it("escapes commas, quotes, and line breaks the RFC 4180 way", () => {
    const csv = toCsv([
      record({
        quote: 'Great work, honestly "the best"\nSecond line.',
      }),
    ]);
    expect(csv).toContain('"Great work, honestly ""the best""\nSecond line."');
  });

  it("keeps the trash state honest in the export", () => {
    const csv = toCsv([record({ id: "gone", status: "trash" })]);
    expect(csv).toContain("trash");
  });

  it("exports the photo, video, tag, and locale columns", () => {
    const csv = toCsv([
      record({
        photoUrl: "/media/reviews/shop.png",
        videoUrl: "https://vimeo.com/76979871",
        tag: "Repairs",
        locale: "nl-NL",
      }),
    ]);
    expect(csv).toContain("photoUrl,videoUrl,tag,locale");
    expect(csv).toContain("/media/reviews/shop.png");
    expect(csv).toContain("https://vimeo.com/76979871");
    expect(csv).toContain("Repairs");
    expect(csv).toContain("nl-NL");
  });
});

describe("toEmbedUrl", () => {
  it("maps YouTube watch and short links to the nocookie embed", () => {
    expect(toEmbedUrl("https://www.youtube.com/watch?v=aqz-KE-bpKQ")).toBe(
      "https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ",
    );
    expect(toEmbedUrl("https://youtu.be/aqz-KE-bpKQ")).toBe(
      "https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ",
    );
  });

  it("maps Vimeo links to the player domain", () => {
    expect(toEmbedUrl("https://vimeo.com/76979871")).toBe(
      "https://player.vimeo.com/video/76979871",
    );
  });

  it("answers empty for anything else, extra query or not", () => {
    expect(toEmbedUrl("")).toBe("");
    expect(toEmbedUrl("https://example.com/watch?v=aqz-KE-bpKQ")).toBe("");
    expect(toEmbedUrl("https://www.youtube.com/channel/UC1234567890")).toBe("");
    expect(toEmbedUrl(" https://vimeo.com/76979871 ")).toBe(
      "https://player.vimeo.com/video/76979871",
    );
  });
});

describe("withTag", () => {
  const records = [
    record({ id: "a", tag: "Repairs" }),
    record({ id: "b", tag: "Websites" }),
    record({ id: "c", tag: "Repairs" }),
  ];

  it("keeps every record when the tag is empty", () => {
    expect(withTag(records, "")).toHaveLength(3);
    expect(withTag(records, "   ")).toHaveLength(3);
  });

  it("keeps only the exact tag requested", () => {
    const kept = withTag(records, "Repairs");
    expect(kept.map((entry) => entry.id)).toEqual(["a", "c"]);
  });

  it("matches nothing when no record carries the tag", () => {
    expect(withTag(records, "Landscaping")).toHaveLength(0);
  });
});

describe("normalizeLocaleTag", () => {
  it("applies canonical BCP 47 casing", () => {
    expect(normalizeLocaleTag(" en-us ")).toBe("en-US");
    expect(normalizeLocaleTag("EN")).toBe("en");
    expect(normalizeLocaleTag("zh-hant-tw")).toBe("zh-Hant-TW");
    expect(normalizeLocaleTag("nl-NL")).toBe("nl-NL");
  });

  it("answers empty for anything that is not a tag", () => {
    expect(normalizeLocaleTag("")).toBe("");
    expect(normalizeLocaleTag("not a tag")).toBe("");
    expect(normalizeLocaleTag("e")).toBe("");
    expect(normalizeLocaleTag("en-US!!!")).toBe("");
    expect(normalizeLocaleTag("x".repeat(41))).toBe("");
  });
});

describe("selectByLocale", () => {
  const records = [
    record({ id: "any", locale: "" }),
    record({ id: "nl", locale: "nl" }),
    record({ id: "nl-NL", locale: "nl-NL" }),
    record({ id: "de", locale: "de" }),
    record({ id: "en", locale: "en" }),
  ];

  it("shows everything on a page with no locale context", () => {
    expect(selectByLocale(records, "")).toHaveLength(records.length);
  });

  it("keeps locale-less records plus the page language's records", () => {
    const kept = selectByLocale(records, "nl-NL");
    expect(kept.map((entry) => entry.id).sort()).toEqual([
      "any",
      "nl",
      "nl-NL",
    ]);
  });

  it("matches by language, whatever the region", () => {
    const kept = selectByLocale(records, "en-GB");
    expect(kept.map((entry) => entry.id).sort()).toEqual(["any", "en"]);
    expect(selectByLocale(records, "de-DE").map((e) => e.id)).toEqual([
      "any",
      "de",
    ]);
  });

  it("shows only locale-less records when nothing matches", () => {
    const kept = selectByLocale(records, "fr-FR");
    expect(kept.map((entry) => entry.id)).toEqual(["any"]);
  });

  it("treats a malformed page locale as no locale", () => {
    expect(selectByLocale(records, "not a locale")).toHaveLength(
      records.length,
    );
  });
});

describe("isLikelyBot", () => {
  const NOW = 1_000_000;

  it("drops a filled honeypot without touching anything else", () => {
    expect(isLikelyBot({ company: "Spam Co" }, NOW)).toBe(true);
    /** Whitespace alone reads as an empty field, the same as the form would. */
    expect(isLikelyBot({ company: " " }, NOW)).toBe(false);
    expect(isLikelyBot({ company: "" }, NOW)).toBe(false);
  });

  it("drops a form completed faster than a human could type", () => {
    expect(isLikelyBot({ "jbt-start": String(NOW - 800) }, NOW)).toBe(true);
    expect(isLikelyBot({ "jbt-start": String(NOW - 60_000) }, NOW)).toBe(false);
  });

  it("judges only the honeypot when no start stamp exists", () => {
    /** Scripting off, or an honest integration: the timing gate stands down. */
    expect(isLikelyBot({ "jbt-start": "" }, NOW)).toBe(false);
    expect(isLikelyBot({ "jbt-start": "not-a-number" }, NOW)).toBe(false);
    expect(isLikelyBot({}, NOW)).toBe(false);
    expect(isLikelyBot(null, NOW)).toBe(false);
  });
});

describe("validateInvitation", () => {
  it("requires a real email and takes an optional name and note", () => {
    const checked = validateInvitation({
      email: " customer@example.com ",
      name: "Ama Mensah",
      note: "Thanks for the repair.",
    });
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    expect(checked.values).toEqual({
      email: "customer@example.com",
      name: "Ama Mensah",
      note: "Thanks for the repair.",
    });
    const noName = validateInvitation({ email: "customer@example.com" });
    expect(noName.ok).toBe(true);
    if (noName.ok) expect(noName.values.name).toBe("");
  });

  it("rejects a missing or malformed email", () => {
    for (const bad of ["", "not-an-email", "a@b", "a b@example.com"]) {
      const checked = validateInvitation({ email: bad });
      expect(checked.ok).toBe(false);
      if (!checked.ok) expect(checked.field).toBe("email");
    }
  });

  it("bounds the name and the note like every stored string", () => {
    expect(
      validateInvitation({ email: "a@b.co", name: "x".repeat(81) }).ok,
    ).toBe(false);
    expect(validateInvitation({ email: "a@b.co", note: 42 }).ok).toBe(false);
  });
});

describe("importRow", () => {
  const NOW = new Date("2026-11-23T10:00:00.000Z");

  it("turns a valid row into a pending, unfeatured, unverified record", () => {
    const result = importRow(
      {
        quote: "Quick, careful, and honest.",
        personName: "Kwame Boateng",
        role: "Owner, Harbor Cafe",
        rating: 4,
        consent: true,
        locale: "en-GB",
      },
      NOW,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.record.status).toBe("pending");
    expect(result.record.featuredAt).toBe("");
    expect(result.record.verified).toBe(false);
    expect(result.record.approvedAt).toBe("");
    expect(result.record.source).toBe("manual");
    expect(result.record.submittedAt).toBe(NOW.toISOString());
    expect(result.record.quote).toBe("Quick, careful, and honest.");
    expect(result.record.locale).toBe("en-GB");
  });

  it("never lets a row smuggle moderation state", () => {
    const result = importRow(
      {
        quote: "Great work.",
        personName: "Ama",
        consent: true,
        status: "approved",
        verified: true,
        featuredAt: "2026-11-20T00:00:00.000Z",
      },
      NOW,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.record.status).toBe("pending");
    expect(result.record.verified).toBe(false);
    expect(result.record.featuredAt).toBe("");
  });

  it("reports a failed row without inventing a record", () => {
    const noQuote = importRow({ personName: "Ama", consent: true }, NOW);
    expect(noQuote.ok).toBe(false);
    if (!noQuote.ok) expect(noQuote.field).toBe("quote");
    const noConsent = importRow({ quote: "Good.", personName: "Ama" }, NOW);
    expect(noConsent.ok).toBe(false);
    if (!noConsent.ok) expect(noConsent.field).toBe("consent");
  });
});
