# Changelog

All notable changes to **Brayne Testimonials** are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **"Apply layout" on the plugin's Display settings screen.** Pick Grid,
  Slider, or Feature quote and the admin app edits every placed Testimonials
  block through the content API — walking each page, updating the reviews
  nodes, and publishing the pages it touched — so one click changes the site
  and the page builder's inspector stays truthful, because the choice is
  written onto the blocks themselves.

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

### Added

- `tests/unit/blocks.test.ts` pins the render-time prop contract: the block
  registry renders `def.render(validateProps(storedProps))`, so the visible
  reviews and the strip's stats that the `content.blocks` pass injects must
  survive `validateProps` to reach the HTML, while a builder save (which never
  carries injected data) stores none of it.
- The slider answers the mouse wheel: a wheel over the track moves the cards
  and hands the scroll back to the page at either end, so the page never
  feels trapped.

### Fixed

- The public Testimonials and Review activity blocks rendered their honest
  empty state even when approved reviews existed: the hydration pass set the
  records on the stored tree, but the registry's `validateProps` step dropped
  the injected render-time props before `render` ran. Both blocks now let the
  injected props through, so pages again carry the reviews in their HTML.

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
