# Security policy

## Reporting a vulnerability

Email **support@braynesmartsolutions.com** with details: the file and line,
how to reproduce it, and what an attacker could gain. Please do not open a
public GitHub issue for a security problem.

We aim to acknowledge reports within two business days and to ship a fix in
the next plugin release. If a fix needs more time, we will say so and keep
you updated.

## Scope

This policy covers the code in this repository: the plugin server module
(`src/`), the public blocks and form (`public/`), and the admin app (`admin/`).

What the plugin stores is worth stating plainly: customer reviews — the
review text, the reviewer's name, an optional role, an optional rating, an
optional same-site avatar address, and the moderation timestamps. Reviews are
stored in the site's own database through `ctx.data` and only ever render
after a moderator approves them. Submissions travel through a rate-limited,
origin-checked route that verifies the site's CAPTCHA when one is configured.

## Out of scope

- The JustFlows platform itself (report platform issues upstream).
- The CAPTCHA providers (Turnstile, hCaptcha, reCAPTCHA) — the plugin only
  consumes their public widget details and verify APIs.
