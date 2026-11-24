// SPDX-License-Identifier: GPL-2.0-or-later
//
// Brayne Testimonials - slider enhancement.
//
// The server already renders the slider as a scrollable strip of cards, so
// this script only adds the controls: two arrows and one dot per card. A
// page without scripting keeps the plain strip, and every control is a real
// button a keyboard can reach.

"use strict";

(function () {
  /** One slider instance: arrows, dots, and the scroll position between them. */
  function enhance(root) {
    var track = root.querySelector(".jbt-track");
    if (!track) return;
    var cards = Array.prototype.slice.call(track.querySelectorAll(".jbt-card"));
    if (cards.length < 2) return;

    var prev = makeArrow("\u2039", "Previous reviews", "jbt-arrow--prev");
    var next = makeArrow("\u203a", "More reviews", "jbt-arrow--next");
    root.appendChild(prev);
    root.appendChild(next);

    var dots = document.createElement("div");
    dots.className = "jbt-dots";
    dots.setAttribute("role", "tablist");
    dots.setAttribute("aria-label", "Reviews");
    var buttons = cards.map(function (card, index) {
      var dot = document.createElement("button");
      dot.type = "button";
      dot.className = "jbt-dot";
      dot.setAttribute("role", "tab");
      dot.setAttribute(
        "aria-label",
        "Review " + (index + 1) + " of " + cards.length,
      );
      dot.setAttribute("aria-selected", String(index === 0));
      dot.addEventListener("click", function () {
        scrollTo(index);
      });
      dots.appendChild(dot);
      return dot;
    });
    root.appendChild(dots);

    /** Bring one card into view and let the observer mark the dot. */
    function scrollTo(index) {
      var clamped = Math.max(0, Math.min(cards.length - 1, index));
      track.scrollTo({
        left: cards[clamped].offsetLeft - track.offsetLeft,
        behavior: "smooth",
      });
    }

    prev.addEventListener("click", function () {
      scrollTo(current() - 1);
    });
    next.addEventListener("click", function () {
      scrollTo(current() + 1);
    });

    /**
     * A mouse wheel over the track moves the cards instead of the page, and
     * hands the scroll straight back at either end so the page never feels
     * trapped. Each tick lands on a card, because the track's mandatory snap
     * would pull a raw pixel scroll straight back. Touch swipes scroll the
     * track natively already.
     */
    track.addEventListener(
      "wheel",
      function (event) {
        if (track.scrollWidth <= track.clientWidth) return;
        var delta =
          Math.abs(event.deltaY) > Math.abs(event.deltaX)
            ? event.deltaY
            : event.deltaX;
        var atStart = track.scrollLeft <= 0;
        var atEnd =
          track.scrollLeft + track.clientWidth >= track.scrollWidth - 1;
        if ((delta < 0 && atStart) || (delta > 0 && atEnd)) return;
        event.preventDefault();
        var target = Math.max(
          0,
          Math.min(cards.length - 1, current() + (delta > 0 ? 1 : -1)),
        );
        track.scrollTo({
          left: cards[target].offsetLeft - track.offsetLeft,
          behavior: "auto",
        });
      },
      { passive: false },
    );

    /**
     * Autoplay, only when the block asked for it. Never under reduced
     * motion, never while the pointer rests on the slider, never while a
     * control has keyboard focus, and never while the tab is hidden. At the
     * last card it wraps home, so the motion reads as a loop, not a stop.
     */
    if (root.getAttribute("data-autoplay") === "true" && cards.length > 1) {
      var reduced =
        window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!reduced) {
        var playing = true;
        var pause = function () {
          playing = false;
        };
        var resume = function () {
          playing = true;
        };
        root.addEventListener("mouseenter", pause);
        root.addEventListener("mouseleave", resume);
        root.addEventListener("focusin", pause);
        root.addEventListener("focusout", resume);
        document.addEventListener("visibilitychange", function () {
          playing = !document.hidden;
        });
        window.setInterval(function () {
          if (!playing || document.hidden) return;
          var nextIndex = current() + 1;
          scrollTo(nextIndex > cards.length - 1 ? 0 : nextIndex);
        }, 6000);
      }
    }

    /** The card whose left edge is nearest the track's start. */
    function current() {
      var origin = track.offsetLeft;
      var best = 0;
      var bestDistance = Infinity;
      cards.forEach(function (card, index) {
        var distance = Math.abs(card.offsetLeft - origin - track.scrollLeft);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = index;
        }
      });
      return best;
    }

    /** Dots follow the scroll without firing further scrolls. */
    var marking = false;
    track.addEventListener("scroll", function () {
      if (marking) return;
      marking = true;
      window.requestAnimationFrame(function () {
        marking = false;
        var index = current();
        buttons.forEach(function (dot, dotIndex) {
          dot.setAttribute("aria-selected", String(dotIndex === index));
        });
      });
    });
  }

  function makeArrow(glyph, label, className) {
    var arrow = document.createElement("button");
    arrow.type = "button";
    /** The base class carries the round, absolutely-positioned look. */
    arrow.className = "jbt-arrow " + className;
    arrow.setAttribute("aria-label", label);
    arrow.textContent = glyph;
    return arrow;
  }

  /**
   * Click-to-load video facades. The server renders a plain link; the first
   * click is what creates the iframe, so no third-party embed ever loads
   * until a visitor asks for it. The embed address is the one the server's
   * own allowlist produced (YouTube's privacy-enhanced nocookie domain or
   * Vimeo's player); this script re-checks it before iframing, and without
   * scripting the link opens the video on its own site instead.
   */
  var VIDEO_EMBED_RE =
    /^https:\/\/(?:www\.youtube-nocookie\.com\/embed\/[A-Za-z0-9_-]{6,20}|player\.vimeo\.com\/video\/[0-9]{4,12})$/;

  function bindVideoFacades() {
    var links = document.querySelectorAll("a[data-jbt-video]");
    Array.prototype.forEach.call(links, function (link) {
      if (link.getAttribute("data-jbt-loaded") === "1") return;
      link.setAttribute("data-jbt-loaded", "1");
      link.addEventListener("click", function (event) {
        var embed = link.getAttribute("data-jbt-video") || "";
        /** Anything but the two allowed embeds stays a plain link. */
        if (!VIDEO_EMBED_RE.test(embed)) return;
        event.preventDefault();
        var frame = document.createElement("div");
        frame.className = "jbt-card__video-frame";
        var player = document.createElement("iframe");
        player.src = embed;
        player.title = "Video review";
        player.loading = "lazy";
        player.allow = "autoplay; fullscreen; picture-in-picture";
        player.allowFullscreen = true;
        player.referrerPolicy = "strict-origin-when-cross-origin";
        frame.appendChild(player);
        link.replaceWith(frame);
      });
    });
  }

  function scan() {
    var sliders = document.querySelectorAll('[data-jbt="slider"]');
    Array.prototype.forEach.call(sliders, enhance);
    bindVideoFacades();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scan);
  } else {
    scan();
  }
})();
