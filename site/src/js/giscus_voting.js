/**
 * giscus_voting.js — giscus-backed voting system.
 *
 * Votes are stored as reactions (emojis) on the theorem page.
 */

'use strict';

(function () {

  // ---------------------------------------------------------------------------
  // Apply giscus theme (filter emojis + reaction labels)
  // ---------------------------------------------------------------------------
  function applyGiscusTheme() {
    // Reaction key order from giscus's Reactions object (matches GitHub API order)
    var REACTION_ORDER = ['THUMBS_UP', 'THUMBS_DOWN', 'LAUGH', 'HOORAY', 'CONFUSED', 'HEART', 'ROCKET', 'EYES'];
    var REACTION_LABELS = { THUMBS_UP: 'True', THUMBS_DOWN: 'False', HEART: 'Likes' };

    var base = document.documentElement.dataset.base || '';
    fetch(base + '/assets/css/giscus-custom.css')
      .then(function(r) { if (!r.ok) return Promise.reject(); return r.text(); })
      .then(function(baseCss) {
        var currentIframe = null;
        var lastReactions = {};  // { THUMBS_UP: {count, viewerHasReacted}, ... }

        function buildCss() {
          var labelCss = '';
          var pos = 0;
          // Overwrite the label next to the emoji and hide filtered emojis
          // For this we need to know which reactions are currently displayed (lastReactions)
          for (var i = 0; i < REACTION_ORDER.length; i++) {
            var key = REACTION_ORDER[i];
            var group = lastReactions[key];
            if (group && group.count > 0) {
              pos++;
              var label = REACTION_LABELS[key];
              if (label) {
                labelCss += '.gsc-reactions .gsc-direct-reaction-button:nth-child(' + pos + ') .gsc-social-reaction-summary-item-count::before{content:"' + label + ' ";}';
              } else {
                labelCss += '.gsc-reactions .gsc-direct-reaction-button:nth-child(' + pos + '){display:none;}';
              }
            }
          }
          return baseCss + labelCss;
        }

        function sendTheme() {
          if (!currentIframe) return;
          var giscusOrigin = new URL(currentIframe.src).origin;
          var css = '@import url("' + giscusOrigin + '/themes/light.css");' + buildCss();
          currentIframe.contentWindow.postMessage(
            { giscus: { setConfig: { theme: 'data:text/css,' + encodeURIComponent(css) } } },
            '*'
          );
        }

        function reactionsChanged(newReactions, oldReactions) {
          for (var i = 0; i < REACTION_ORDER.length; i++) {
            var key = REACTION_ORDER[i];
            var newCount = (newReactions[key] && newReactions[key].count) || 0;
            var oldCount = (oldReactions[key] && oldReactions[key].count) || 0;
            if (newCount !== oldCount) return true;
          }
          return false;
        }

        window.addEventListener('message', function(event) {
          if (typeof event.data !== 'object' || !event.data.giscus) return;
          var discussion = event.data.giscus.discussion;
          if (!discussion || !discussion.reactions) return;
          if (!reactionsChanged(discussion.reactions, lastReactions)) return;
          lastReactions = discussion.reactions;
          // Recompute reaction labels whenever counts change
          sendTheme();

          // Save current reaction count in the cache.
          // Giscus transmits the most recent count on the theorem.
          var theoremName = document.querySelector('meta[property="og:title"]') &&
            document.querySelector('meta[property="og:title"]').content;
          if (theoremName) {
            var cache = JSON.parse(localStorage.getItem('fc_discussions_cache') || '{}');
            cache[theoremName] = {
              count:      (lastReactions.HEART       && lastReactions.HEART.count)       || 0,
              thumbsUp:   (lastReactions.THUMBS_UP   && lastReactions.THUMBS_UP.count)   || 0,
              thumbsDown: (lastReactions.THUMBS_DOWN && lastReactions.THUMBS_DOWN.count) || 0,
            };
            localStorage.setItem('fc_discussions_cache', JSON.stringify(cache));
          }
        });

        // Ensure the giscus theme is applied after giscus iframe is loaded
        function waitAndApply() {
          window.addEventListener('message', function onReady(event) {
            if (typeof event.data !== 'object' || !event.data.giscus || !event.data.giscus.resizeHeight) return;
            window.removeEventListener('message', onReady);
            currentIframe = document.querySelector('iframe.giscus-frame');
            if (!currentIframe) return;
            sendTheme();
            // Re-apply if the iframe reloads (e.g. after sign-out)
            currentIframe.addEventListener('load', waitAndApply, { once: true });
          });
        }

        waitAndApply();
      });
  }

  applyGiscusTheme();
})();
