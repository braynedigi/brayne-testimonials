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

  function scan() {
    var sliders = document.querySelectorAll('[data-jbt="slider"]');
    Array.prototype.forEach.call(sliders, enhance);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scan);
  } else {
    scan();
  }
})();
