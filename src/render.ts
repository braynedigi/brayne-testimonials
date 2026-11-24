/**
 * Server-side HTML rendering for Brayne Testimonials.
 *
 * Every block the plugin registers renders through this module, so the
 * escaping rules live in one place: testimonial text is visitor input, names
 * and roles are operator input, and image addresses are stored URLs — all of
 * it is written with `textContent`-style escaping before it touches markup.
 * The host sanitizes block output as well; this layer keeps every value safe
 * on its own, before that pass.
 */

import { toEmbedUrl } from "./records.js";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** The six avatar chip colours from the design contract (`avatar-1`..`avatar-6`). */
const AVATAR_COLORS = [
  "#4f56d8",
  "#166432",
  "#b42318",
  "#8a4b00",
  "#0e6a80",
  "#7a3ec8",
] as const;

/** One testimonial as the renderer sees it. Fields are already validated. */
export interface RenderRecord {
  id: string;
  quote: string;
  personName: string;
  role: string;
  rating: number | null;
  avatarUrl: string;
  /** The owner's public reply; empty renders nothing. */
  ownerReply: string;
  /** The owner's own attestation, shown as a small badge. */
  verified: boolean;
  /** A review photo the owner attached; empty renders nothing. */
  photoUrl: string;
  /** A YouTube or Vimeo address, rendered as a click-to-load facade. */
  videoUrl: string;
  approvedAt: string;
}

/** Display toggles the block renderer honours. */
export interface RenderOptions {
  layout: "grid" | "slider" | "feature";
  columns: string;
  style: "cards" | "minimal" | "quote";
  showStars: boolean;
  showAvatars: boolean;
  showRole: boolean;
  showDate: boolean;
  /** The slider advances by itself, off under reduced motion. */
  autoplay: boolean;
}

/** Aggregate numbers the activity strip renders. */
export interface RenderStats {
  approved: number;
  averageRating: number | null;
  publishedThisMonth: number;
  /**
   * Approved, rated reviews by star: index 0 is 5 stars. The detailed strip
   * turns this into an honest distribution; the pill never invents one.
   */
  ratingDistribution?: number[];
}

/** Escape a value for element or attribute context. */
export function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Escape a quote and keep the reviewer's own line breaks: the textarea
 * accepts multi-line text, and the customer's phrasing is part of the proof.
 */
function escapeMultiline(raw: string): string {
  return escapeHtml(raw).replace(/\r?\n/g, "<br>");
}

/** Up to two initials from a name, for the colour chip when no photo exists. */
export function initialsFromName(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .map((part) => (part.match(/[a-zA-Z0-9]/) ?? [""])[0] ?? "")
    .join("")
    .toUpperCase();
  if (parts.length === 0) return "?";
  return parts.slice(0, 2);
}

/** A deterministic chip colour for a name, so the same person keeps theirs. */
export function colorFromName(name: string): string {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) % 100000;
  }
  const picked = AVATAR_COLORS[hash % AVATAR_COLORS.length];
  return typeof picked === "string" ? picked : AVATAR_COLORS[0];
}

/** "21 Nov 2026" from an ISO date, with the machine-readable form attached. */
export function formatDate(iso: string): string {
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return "";
  const date = new Date(parsed);
  const month = MONTHS[date.getUTCMonth()] ?? "";
  if (!month) return "";
  const day = date.getUTCDate();
  return `<time class="jbt-card__date" datetime="${escapeHtml(iso)}">${day} ${month} ${date.getUTCFullYear()}</time>`;
}

/** Five stars with a text equivalent, or nothing for an unrated review. */
function starRow(rating: number | null): string {
  if (rating === null) return "";
  const filled = Math.max(0, Math.min(5, Math.trunc(rating)));
  const stars = (count: number, on: boolean) =>
    `<span class="jbt-star${on ? " jbt-star--on" : " jbt-star--off"}" aria-hidden="true">\u2605</span>`.repeat(
      count,
    );
  return (
    `<span class="jbt-stars" role="img" aria-label="Rated ${filled} of 5 stars">` +
    stars(filled, true) +
    stars(5 - filled, false) +
    "</span>"
  );
}

/** The reviewer chip: their photo when one is stored, otherwise initials. */
function avatar(record: RenderRecord, options: RenderOptions): string {
  if (!options.showAvatars) return "";
  if (record.avatarUrl) {
    return (
      '<img class="jbt-card__photo" src="' +
      escapeHtml(record.avatarUrl) +
      '" alt="" loading="lazy" decoding="async" />'
    );
  }
  return (
    '<span class="jbt-card__initials" style="background:' +
    escapeHtml(colorFromName(record.personName)) +
    '" aria-hidden="true">' +
    escapeHtml(initialsFromName(record.personName)) +
    "</span>"
  );
}

/** Name, role, date, and the owner's verification badge. */
function whoBlock(record: RenderRecord, options: RenderOptions): string {
  const parts: string[] = [];
  parts.push('<figcaption class="jbt-card__who">');
  parts.push(
    '<span class="jbt-card__name">' + escapeHtml(record.personName) + "</span>",
  );
  if (record.verified) {
    /**
     * The badge says exactly what it is: the owner's attestation, never a
     * third-party verification claim.
     */
    parts.push(
      '<span class="jbt-badge jbt-badge--verified">Verified by the site owner</span>',
    );
  }
  if (options.showRole && record.role) {
    parts.push(
      '<span class="jbt-card__role">' + escapeHtml(record.role) + "</span>",
    );
  }
  if (options.showDate && record.approvedAt)
    parts.push(formatDate(record.approvedAt));
  parts.push("</figcaption>");
  return parts.join("");
}

/** The owner's public reply, when one exists. */
function ownerReplyBlock(record: RenderRecord): string {
  if (!record.ownerReply) return "";
  return (
    '<div class="jbt-card__reply">' +
    '<span class="jbt-card__reply-label">Response from the owner</span>' +
    '<p class="jbt-card__reply-text">' +
    escapeMultiline(record.ownerReply) +
    "</p>" +
    "</div>"
  );
}

/** The review's photo, when the owner attached one. */
function photoBlock(record: RenderRecord): string {
  if (!record.photoUrl) return "";
  return (
    '<img class="jbt-card__photo-review" src="' +
    escapeHtml(record.photoUrl) +
    '" alt="Review photo" loading="lazy" decoding="async" />'
  );
}

/**
 * The video facade. Until the visitor clicks, there is no iframe and no
 * third-party request; without scripting the link opens the video on its
 * own site. The embed address the script swaps in comes from the server's
 * own `toEmbedUrl` allowlist.
 */
function videoBlock(record: RenderRecord): string {
  const embed = record.videoUrl ? toEmbedUrl(record.videoUrl) : "";
  if (!embed) return "";
  return (
    '<a class="jbt-card__video" href="' +
    escapeHtml(record.videoUrl) +
    '" target="_blank" rel="noopener noreferrer" data-jbt-video="' +
    escapeHtml(embed) +
    '"><span class="jbt-card__video-play" aria-hidden="true">\u25b6</span>' +
    '<span class="jbt-card__video-label">Watch the review</span></a>'
  );
}

/** One testimonial card: the rating, the quote, then who said it. */
function card(record: RenderRecord, options: RenderOptions): string {
  return (
    '<figure class="jbt-card">' +
    (options.showStars ? starRow(record.rating) : "") +
    photoBlock(record) +
    '<blockquote class="jbt-card__quote">' +
    escapeMultiline(record.quote) +
    "</blockquote>" +
    videoBlock(record) +
    '<div class="jbt-card__head">' +
    avatar(record, options) +
    whoBlock(record, options) +
    "</div>" +
    ownerReplyBlock(record) +
    "</figure>"
  );
}

/** The quiet message a page shows while there is nothing approved yet. */
export function renderEmpty(): string {
  return '<p class="jbt-empty">No reviews to show yet.</p>';
}

/**
 * The Testimonials block: grid, slider, or one feature quote, in the cards,
 * minimal, or quote style. Records arrive hydrated by the plugin's
 * `content.blocks` pass, or from `preview.sampleProps` in the builder.
 */
export function renderTestimonials(
  records: RenderRecord[],
  options: RenderOptions,
): string {
  if (records.length === 0) return renderEmpty();

  const classes = [
    "jbt",
    "jbt--" + options.layout,
    "jbt--cols-" + options.columns,
    "jbt--" + options.style,
  ].join(" ");

  if (options.layout === "feature") {
    const record = records[0];
    if (!record) return renderEmpty();
    return (
      `<div class="${classes}">` +
      '<figure class="jbt-feature">' +
      photoBlock(record) +
      '<blockquote class="jbt-feature__quote">' +
      escapeMultiline(record.quote) +
      "</blockquote>" +
      videoBlock(record) +
      '<div class="jbt-feature__who">' +
      avatar(record, options) +
      '<span class="jbt-card__name">' +
      escapeHtml(record.personName) +
      "</span>" +
      (record.verified
        ? '<span class="jbt-badge jbt-badge--verified">Verified by the site owner</span>'
        : "") +
      (options.showRole && record.role
        ? '<span class="jbt-card__role">' + escapeHtml(record.role) + "</span>"
        : "") +
      (options.showStars ? starRow(record.rating) : "") +
      (options.showDate && record.approvedAt
        ? formatDate(record.approvedAt)
        : "") +
      "</div>" +
      ownerReplyBlock(record) +
      "</figure>" +
      "</div>"
    );
  }

  const cards = records.map((record) => card(record, options)).join("");
  if (options.layout === "slider") {
    /**
     * The track is a horizontal scroll strip on its own, so the slider works
     * before any script runs; the block script only adds arrows and dots,
     * and the autoplay when the block asked for it.
     */
    const autoplay = options.autoplay ? ' data-autoplay="true"' : "";
    return `<div class="${classes}" data-jbt="slider"${autoplay}><div class="jbt-track">${cards}</div></div>`;
  }
  return `<div class="${classes}">${cards}</div>`;
}

/**
 * The activity strip: honest, approved-only numbers. With nothing approved
 * there is nothing to prove, so the strip renders nothing at all. The
 * detailed variant adds the star distribution, bar for bar, from the same
 * approved records — never a percentage invented from thin air.
 */
export function renderStrip(
  stats: RenderStats,
  variant: "pill" | "detailed" = "pill",
): string {
  if (stats.approved === 0) return "";

  const average =
    stats.averageRating !== null
      ? `<span class="jbt-strip__avg" role="img" aria-label="Average rating ${stats.averageRating} of 5 stars">\u2605 ${stats.averageRating} average</span>`
      : "";

  if (variant === "detailed") {
    const parts: string[] = [];
    parts.push('<div class="jbt-strip jbt-strip--detailed" role="status">');
    parts.push(
      `<span class="jbt-strip__count">${stats.publishedThisMonth} review${
        stats.publishedThisMonth === 1 ? "" : "s"
      } published this month</span>`,
    );
    if (average) {
      parts.push(
        '<span class="jbt-strip__sep" aria-hidden="true">\u00b7</span>',
      );
      parts.push(average);
    }
    /**
     * The distribution: five rows of five stars down to one. Unrated reviews
     * are in no bar, and every width is a clamped percentage of the biggest
     * bar, computed from the counts themselves.
     */
    const distribution = Array.isArray(stats.ratingDistribution)
      ? stats.ratingDistribution
      : [];
    const counts = [0, 1, 2, 3, 4].map((index) =>
      Math.max(0, Math.trunc(Number(distribution[index]) || 0)),
    );
    const max = Math.max(...counts, 1);
    if (stats.averageRating !== null) {
      parts.push('<ol class="jbt-breakdown">');
      for (let stars = 5; stars >= 1; stars -= 1) {
        const count = counts[5 - stars] ?? 0;
        const width = Math.round((count / max) * 100);
        parts.push(
          '<li class="jbt-breakdown__row">' +
            `<span class="jbt-breakdown__label" aria-hidden="true">${stars}</span>` +
            '<span class="jbt-breakdown__bar">' +
            `<span class="jbt-breakdown__fill" style="width:${width}%"></span>` +
            "</span>" +
            `<span class="jbt-breakdown__count">${count}</span>` +
            "</li>",
        );
      }
      parts.push("</ol>");
    }
    parts.push("</div>");
    return parts.join("");
  }

  const parts: string[] = [];
  parts.push('<div class="jbt-strip" role="status">');
  parts.push(
    `<span class="jbt-strip__count">${stats.publishedThisMonth} review${
      stats.publishedThisMonth === 1 ? "" : "s"
    } published this month</span>`,
  );
  if (average) {
    parts.push('<span class="jbt-strip__sep" aria-hidden="true">\u00b7</span>');
    parts.push(average);
  }
  parts.push("</div>");
  return parts.join("");
}

/**
 * The collection form shell. The block script loads the site's CAPTCHA
 * provider into the slot, turns the rating radios into stars, and submits
 * through the plugin's public route. Without scripting the form is visible
 * but inert, and says so.
 */
export function renderForm(): string {
  const star = (value: number) =>
    `<input class="jbt-star-input" type="radio" name="jbt-rating" value="${value}" ` +
    `aria-label="${value} star${value === 1 ? "" : "s"}" />`;

  return (
    '<form class="jbt-form" data-jbt="form" novalidate="novalidate">' +
    '<h3 class="jbt-form__title">Leave a review</h3>' +
    '<p class="jbt-form__hint">Nothing is published until the site owner approves it.</p>' +
    '<fieldset class="jbt-form__rating">' +
    '<legend class="jbt-form__legend">How would you rate us? (optional)</legend>' +
    [5, 4, 3, 2, 1].map(star).join("") +
    "</fieldset>" +
    '<label class="jbt-field"><span class="jbt-field__label">Your review</span>' +
    '<textarea class="jbt-field__input" name="quote" rows="4" maxlength="500" required="required"></textarea></label>' +
    '<label class="jbt-field"><span class="jbt-field__label">Your name</span>' +
    '<input class="jbt-field__input" type="text" name="personName" maxlength="60" required="required" /></label>' +
    '<label class="jbt-field"><span class="jbt-field__label">Role / company (optional)</span>' +
    '<input class="jbt-field__input" type="text" name="role" maxlength="80" /></label>' +
    /**
     * The spam gate for sites with no CAPTCHA: a honeypot no human can see,
     * and a hidden start stamp the form script sets. Both are judged on the
     * server, and a caught bot is answered with the same success shape.
     */
    '<div class="jbt-honeypot" aria-hidden="true">' +
    '<label>Company<input type="text" name="company" tabindex="-1" autocomplete="off" /></label>' +
    '<input type="hidden" name="jbt-start" value="" />' +
    "</div>" +
    '<label class="jbt-check"><input type="checkbox" name="consent" required="required" />' +
    "<span>Permission to publish \u2014 you confirm the words above may be shown on this site.</span></label>" +
    '<div class="jbt-form__captcha" data-jbt="captcha-slot"></div>' +
    '<button class="jbt-form__submit" type="submit">Send for review</button>' +
    '<p class="jbt-form__status" role="status" aria-live="polite"></p>' +
    "</form>" +
    '<noscript><p class="jbt-form__noscript">Submitting a review needs JavaScript.</p></noscript>'
  );
}
