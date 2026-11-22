// SPDX-License-Identifier: GPL-2.0-or-later
//
// Brayne Testimonials - collection form behaviour.
//
// The server renders a complete, visible form; this script adds what a form
// needs to behave: a star picker over the rating radios, the site's own
// CAPTCHA provider in the reserved slot, and an asynchronous submit through
// the plugin's public route. The states and copy come from the design
// contract, and no submission ever publishes anything - moderation owns that.

"use strict";

(function () {
  /** One loaded CAPTCHA provider, armed from the site's own configuration. */
  var captcha = {
    provider: null,
    siteKey: "",
    widgetId: null,
    loaded: false,
  };

  /** Insert the provider's script exactly once, then call `ready`. */
  function loadProviderScript(src, ready) {
    if (captcha.loaded) {
      window.setTimeout(ready, 0);
      return;
    }
    var script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.defer = true;
    script.addEventListener("load", function () {
      captcha.loaded = true;
      ready();
    });
    document.head.appendChild(script);
  }

  /** Render the site's configured CAPTCHA into one form's slot. */
  function armCaptcha(form, config, slot) {
    if (!config || !slot) return;

    captcha.provider = config.provider;
    captcha.siteKey = config.siteKey;

    if (config.provider === "turnstile") {
      loadProviderScript(config.scriptSrc, function () {
        if (window.turnstile) {
          captcha.widgetId = window.turnstile.render(slot, { sitekey: config.siteKey });
        }
      });
      return;
    }

    if (config.provider === "hcaptcha") {
      loadProviderScript(config.scriptSrc, function () {
        if (window.hcaptcha) {
          captcha.widgetId = window.hcaptcha.render(slot, { sitekey: config.siteKey });
        }
      });
      return;
    }

    if (config.provider === "recaptcha") {
      loadProviderScript(config.scriptSrc, function () {
        if (window.grecaptcha) {
          captcha.widgetId = window.grecaptcha.render(slot, { sitekey: config.siteKey });
        }
      });
      return;
    }

    if (config.provider === "recaptcha-v3") {
      /** Invisible: no widget to show, the token is requested on submit. */
      loadProviderScript(config.scriptSrc, function () {});
    }
  }

  /** The provider's token for this submission, or an empty string. */
  function captchaToken() {
    if (captcha.provider === "turnstile" && window.turnstile && captcha.widgetId !== null) {
      return window.turnstile.getResponse(captcha.widgetId) || "";
    }
    if (captcha.provider === "hcaptcha" && window.hcaptcha && captcha.widgetId !== null) {
      return window.hcaptcha.getResponse(captcha.widgetId) || "";
    }
    if (captcha.provider === "recaptcha" && window.grecaptcha && captcha.widgetId !== null) {
      return window.grecaptcha.getResponse(captcha.widgetId) || "";
    }
    return "";
  }

  /** A promise for an invisible reCAPTCHA v3 token, or an empty string. */
  function captchaTokenAsync() {
    if (captcha.provider === "recaptcha-v3" && window.grecaptcha && captcha.siteKey) {
      return window.grecaptcha
        .execute(captcha.siteKey, { action: "review" })
        .then(function (token) {
          return token || "";
        })
        .catch(function () {
          return "";
        });
    }
    return Promise.resolve(captchaToken());
  }

  /** Turn the five rating radios into the star picker the design shows. */
  function upgradeStars(form) {
    var fieldset = form.querySelector(".jbt-form__rating");
    if (!fieldset || fieldset.querySelector(".jbt-star-row")) return;

    var row = document.createElement("div");
    row.className = "jbt-star-row";
    row.setAttribute("role", "radiogroup");
    row.setAttribute("aria-label", "Star rating");

    var radios = Array.prototype.slice.call(form.querySelectorAll(".jbt-star-input"));
    radios.forEach(function (radio) {
      var value = Number(radio.value);
      var button = document.createElement("button");
      button.type = "button";
      button.className = "jbt-star-button";
      button.textContent = "\u2605";
      button.setAttribute("aria-label", value + (value === 1 ? " star" : " stars"));
      button.addEventListener("click", function () {
        radios.forEach(function (other) {
          other.checked = other === radio;
        });
        paint(value);
      });
      row.appendChild(button);
    });

    fieldset.appendChild(row);

    /** Fill every star up to `value`, and record it on the group. */
    function paint(value) {
      var buttons = row.querySelectorAll(".jbt-star-button");
      Array.prototype.forEach.call(buttons, function (button, index) {
        button.classList.toggle("jbt-star-button--on", index < value);
      });
      row.setAttribute("data-jbt-value", String(value));
    }

    /** A keyboard can still reach the hidden radios; keep the paint honest. */
    radios.forEach(function (radio) {
      radio.addEventListener("change", function () {
        if (radio.checked) paint(Number(radio.value));
      });
    });
  }

  /** The star value the visitor chose, or null when left unrated. */
  function starValue(form) {
    var row = form.querySelector(".jbt-star-row");
    var painted = row ? Number(row.getAttribute("data-jbt-value") || "0") : 0;
    if (painted > 0) return painted;
    var checked = form.querySelector(".jbt-star-input:checked");
    return checked ? Number(checked.value) : null;
  }

  /** Show one line of status under the form. */
  function status(form, text, kind) {
    var line = form.querySelector(".jbt-form__status");
    if (!line) return;
    line.textContent = text;
    line.className = "jbt-form__status" + (kind ? " jbt-form__status--" + kind : "");
    if (kind === "error") {
      line.setAttribute("role", "alert");
    } else {
      line.removeAttribute("role");
    }
  }

  /** The thank-you state the design specifies, replacing the form. */
  function showSuccess(form) {
    var success = document.createElement("div");
    success.className = "jbt-form__success";
    var heading = document.createElement("h4");
    heading.textContent = "Thanks \u2014 your review is awaiting approval.";
    var note = document.createElement("p");
    note.textContent = "The site owner reads every review before it appears here.";
    success.appendChild(heading);
    success.appendChild(note);
    form.replaceWith(success);
  }

  /** Wire one form: stars, CAPTCHA, and the asynchronous submit. */
  function enhance(form) {
    upgradeStars(form);

    var slot = form.querySelector('[data-jbt="captcha-slot"]');
    var submit = form.querySelector(".jbt-form__submit");
    var method = form.getAttribute("method") || "post";
    if (method.toLowerCase() !== "post") return;

    fetch("/api/brayne-testimonials/form-config", { credentials: "same-origin", cache: "no-store" })
      .then(function (response) {
        return response.ok ? response.json() : null;
      })
      .then(function (config) {
        if (!config) return;
        if (config.captcha && config.requireCaptcha) {
          armCaptcha(form, config.captcha, slot);
        } else if (config.requireCaptcha === false) {
          /** No provider configured: moderation is the gate, and it says so. */
          if (slot) {
            slot.textContent =
              "This site has no CAPTCHA configured; every review is moderated before it appears.";
            slot.className = "jbt-form__hint";
          }
        }
      })
      .catch(function () {
        /** A failed config read leaves the form inert rather than broken. */
      });

    form.addEventListener("submit", function (event) {
      event.preventDefault();

      var quote = form.querySelector('[name="quote"]');
      var name = form.querySelector('[name="personName"]');
      var role = form.querySelector('[name="role"]');
      var consent = form.querySelector('[name="consent"]');

      if (quote && !quote.value.trim()) {
        status(form, "The review text is required.", "error");
        if (quote) quote.focus();
        return;
      }
      if (name && !name.value.trim()) {
        status(form, "The reviewer name is required.", "error");
        if (name) name.focus();
        return;
      }
      if (consent && !consent.checked) {
        status(form, "Permission to publish is required.", "error");
        consent.focus();
        return;
      }

      if (submit) submit.disabled = true;
      status(form, "Sending\u2026", "");

      captchaTokenAsync()
        .then(function (token) {
          var rating = starValue(form);
          var payload = {
            quote: quote ? quote.value.trim() : "",
            personName: name ? name.value.trim() : "",
            role: role ? role.value.trim() : "",
            consent: true,
          };
          if (rating !== null) payload.rating = rating;
          if (token) payload.captchaToken = token;

          return fetch("/api/brayne-testimonials/submit", {
            method: "POST",
            credentials: "same-origin",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          });
        })
        .then(function (response) {
          if (!response) throw new Error("no response");
          return response.json().then(function (body) {
            return { ok: response.ok, body: body || {} };
          });
        })
        .then(function (result) {
          if (result.ok) {
            showSuccess(form);
            return;
          }
          if (submit) submit.disabled = false;
          status(form, result.body.error || "Something went wrong. Please try again.", "error");
        })
        .catch(function () {
          if (submit) submit.disabled = false;
          status(form, "The review could not be sent. Please try again.", "error");
        });
    });
  }

  function scan() {
    var forms = document.querySelectorAll('[data-jbt="form"]');
    Array.prototype.forEach.call(forms, enhance);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scan);
  } else {
    scan();
  }
})();
