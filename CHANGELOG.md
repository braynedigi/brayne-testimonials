# Changelog

All notable changes to **Brayne Testimonials** are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.6.0] - 2026-11-23

The plugin belongs to the site, not just to its pages.

### Added

- **Language-aware reviews**: a record can carry a BCP 47 language tag
  (optional, validated, stored canonically). On a localized page, a
  Testimonials block shows only records of the page's language plus
  locale-less records; pages without a locale context still show everything.
  The form records the rendered page's language (`<html lang>`) with each
  submission, and the CSV export and import carry the tag.
- **Theming contract, documented**: every `--jbt-*` variable the stylesheet
  uses is now documented in the README as a theme override point. The
  host's theme stylesheet loads after the plugin's, so a theme that declares
  the same names wins the cascade; the builder's per-block Theme styling
  writes inline custom properties the plugin's styles read directly. A new
  test pins the README table to the stylesheet so the two cannot drift.
- **Static export verification**: a real export run confirmed the display
  blocks render fully into the export, the slider degrades to a native
  scrollable strip, video reviews stay plain links until clicked, and the
  form posts to the live origin through its CORS-enabled config route. The
  README carries the resulting checklist.

## [0.5.0] - 2026-11-23

Reviews with photos, videos, and a way to group them.

### Added

- **Review photos**: the editor accepts an image address from the site's
  media library and the cards and the feature layout show it. The public
  form still accepts no uploads (the SDK has no public upload API), so every
  photo is one the owner attached after moderation — nothing unmoderated can
  render as an image.
- **Video reviews**: the editor accepts a YouTube or Vimeo address. The card
  shows a click-to-load facade — a plain link with a play glyph, and the
  embed iframe is only ever created by the click, only from the two embed
  hosts the server's own allowlist produces (YouTube's privacy-enhanced
  `youtube-nocookie.com` and `player.vimeo.com`). Without scripting, the
  link opens the video on its own site.
- **Tags**: each record can carry one short label, and a Testimonials block
  can show only one tag. Tags ride the CSV export; imports still land plain,
  because media and tags are owner decisions made in the editor.

## [0.4.0] - 2026-11-23

Ask for reviews, and make leaving one easy.

### Added

- **Review invitations**: a new route and an "Invite a customer" panel on the
  Collect screen — one personalized email, sent now (the plugin has no
  scheduler and pretends to none), carrying the reviews-page link with the
  customer's name pre-filled. Sent invitations are listed with a re-send
  button, and an email that cannot be sent records nothing.
- **Prefill links**: the review form fills `?name=` and `?role=` from the
  invitation link; the values land by plain-text assignment, bounded like
  the server's own fields.
- **QR counter card**: the Collect screen draws the reviews-page link as a
  QR code (vendored MIT encoder, no CDN, license preserved) with a "Download
  PNG" button for printing.
- **CSV import**: a paste box on the Collect screen and a new import route —
  every row travels through the same validation a public submission does and
  lands **pending**, whatever moderation state the file claims; each failed
  row is reported without stopping the rest.

### Fixed

- A public submission that omitted the quote or the name (a body with only
  consent) used to pass validation and store an empty record. The quote and
  the name are now required, exactly as the form's own fields are.

## [0.3.0] - 2026-11-23

More proof per pixel, from data the plugin already owns.

### Added

- **Ratings breakdown**: the Review activity strip gains a "With rating bars"
  variant — the average plus a five-to-one star distribution, every bar a
  count of approved, rated reviews, each width a clamped share of the
  biggest bar. Unrated reviews are in no bar, and with no ratings there are
  no bars.
- **Verified badge**: a per-record "Verified by the site owner" attestation
  (inbox one-click toggle and editor checkbox), rendered as a small badge on
  the card and the feature quote. The wording claims exactly what it is —
  the owner's own word, never a third-party verification.
- **Autoplay slider**: a per-block toggle; the slider advances every six
  seconds, wraps at the last card, and never runs under
  `prefers-reduced-motion`, while the pointer rests on it, while a control
  has keyboard focus, or while the tab is hidden.
- **Two patterns**: "Stats band" (the detailed strip on its own) and the
  reworked "Hero with social proof" (the activity strip above one big
  feature quote).

## [0.2.0] - 2026-11-23

The moderation inbox becomes the tool the owner lives in.

### Added

- **Owner replies**: the editor gains a reply field, and a stored reply
  renders under the review on the site as "Response from the owner" —
  escaped like every other stored string, empty renders nothing.
- **Internal notes**: a moderator's note travels with a record (and the CSV
  export) but never renders; a test pins that contract.
- **Soft delete**: "Trash" moves a review out of every list and off the
  site; the Trash tab restores it, or deletes it for good. Only "delete
  forever" removes a row.
- **Bulk actions**: select rows (or all) and approve, feature, or trash them
  in one pass; the trash tab bulk-restores or bulk-deletes forever. Every
  action walks the same per-record route the single buttons use.
- **CSV export**: `GET /api/brayne-testimonials/export` (administrator-only)
  answers every record as RFC 4180 CSV, notes included — the owner's data,
  portable in one click from the inbox header.
- **Spam gate for CAPTCHA-less sites**: the form carries a hidden honeypot
  and a quiet start stamp; the submit route drops a filled honeypot or a
  form "completed" faster than a person could type, answering the same
  success shape so a bot learns nothing.
- **"Apply layout" on the plugin's Display settings screen.** Pick Grid,
  Slider, or Feature quote and the admin app edits every placed Testimonials
  block through the content API — walking each page, updating the reviews
  nodes, and publishing the pages it touched — so one click changes the site
  and the page builder's inspector stays truthful, because the choice is
  written onto the blocks themselves.
- `tests/unit/blocks.test.ts` pins the render-time prop contract: the block
  registry renders `def.render(validateProps(storedProps))`, so the visible
  reviews and the strip's stats that the `content.blocks` pass injects must
  survive `validateProps` to reach the HTML, while a builder save (which never
  carries injected data) stores none of it.

### Changed

- **Removed the "Default layout", "Grid columns", "Show star ratings", "Show
  avatars", and "Show review date" settings.** A block's layout, columns, and
  display toggles live with the block itself, chosen in the page builder's
  inspector, and the settings beside them promised something placed blocks
  never followed — the stars, avatars, and dates toggles were never read by
  the renderer at all. The settings screen now says where those choices live,
  and offers the Apply-layout action for the one switch owners kept reaching
  for. An old client still sending those keys has them ignored, never
  honoured.

### Fixed

- The public Testimonials and Review activity blocks rendered their honest
  empty state even when approved reviews existed: the hydration pass set the
  records on the stored tree, but the registry's `validateProps` step dropped
  the injected render-time props before `render` ran. Both blocks now let the
  injected props through, so pages again carry the reviews in their HTML.
- The slider answers the mouse wheel and keeps its arrows off the cards:
  round buttons sit in reserved lanes beside the track (the mobile design is
  a plain swipe strip with dots), and the track's own scrollbar stays out of
  sight while wheel, arrows, touch, and keyboard scrolling all work.

## [0.1.0] - 2026-11-20

First release.

### Added

- **Review form block** for any page: optional star rating, review text, name,
  and role, with the site's own configured CAPTCHA (Turnstile, hCaptcha, or
  reCAPTCHA) verified server-side. Every submission arrives as pending; the
  route accepts only the five fields a visitor may set, whatever the request
  claims to carry.
- **Testimonials block** in three layouts — grid, slider, feature quote — and
  three styles — cards, minimal, quote marks — with per-block toggles for
  stars, avatars, role/company, and dates, plus builder quick actions to
  switch layout and show featured only.
- **Review activity strip block**: reviews published this month and the
  average rating of approved, rated reviews, counted from approval dates.
  With nothing approved the strip renders nothing at all.
- **Plugin-owned admin app** (`manifest.adminApp`) mounted by the host at
  `/admin/plugins/justflows.brayne-testimonials`: a moderation inbox with
  filter tabs (pending, approved, featured, all) and stat tiles, one-click
  moderation actions, a full record editor with a star picker and per-field
  validation messages, tabbed settings, a collection link panel with copy, a
  pending banner, first-run and filtered-empty states, and the admin's light
  and dark theme.
- **Patterns** for the page builder: testimonial wall, hero quote, and footer
  quote, each referencing the block types above.
- **Render-time hydration**: a `content.blocks` filter injects the visible
  records and the strip's stats into the stored tree immediately before a
  page renders, so pages carry the reviews in their HTML; any failure leaves
  the tree untouched and renders an empty block, never a broken page.
- **Featured pinning** by `featuredAt` timestamp, newest pin first; the inbox
  pins with the current moment so the ordering is one click.
- **Minimum star rating setting**: unrated and lower-rated reviews are hidden
  from the site but stay visible in the inbox.
- **Email notification** of new submissions through the host's `mail:send`
  capability; a transport failure is logged and never reported to the visitor
  as a failed review.
- Five vitest suites: settings normalisation, record model and display
  selection, the HTML renderer, the block render-time prop contract, and
  manifest parity.

### Security

- Only approved records ever render; approval is stamped server-side, and a
  record returning to pending loses its approval stamp again.
- The public submit route is `csrf: false` (an anonymous visitor has no
  session token to present), rate-limited, and refuses any request whose
  `Origin` header is not this site; it verifies the site's CAPTCHA token when
  a provider is configured, and accepts only quote, name, role, rating, and
  consent.
- The form config route is read-only, `no-store`, and exposes only the
  provider's public widget details.
- Every stored record is normalised through bounded coercion: text lengths,
  integer ratings 0-5, a timestamp format the plugin accepts, and avatar URLs
  limited to this site's media library or same-site addresses.
- The admin app talks only to the plugin's own administrator-gated routes and
  presents the host's CSRF token; no record data is proxied through core.
