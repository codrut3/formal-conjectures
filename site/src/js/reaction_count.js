/*
 * Retrieve reaction counts per theorem.
 *
 * Reaction data comes from two sources:
 * - giscus iFrame updates - when the user is on a theorem page, giscus periodically emits
 *   messages with all the reaction counts. We store these in fc_discussions_cache in local storage.
 * - periodic calls to Discussion API: every REFRESH_INTERVAL_MS we fetch every discussion in
 *   the category and update reaction counts, then write the result to fc_discussions_cache too.
 *
 * The Discussion API is rate-limited to 60 calls per hour. fc_refresh_ts (also in localStorage)
 * paces refreshReactions() so multiple open tabs share the same pacing instead of each
 * independently hitting the limit.
 *
 * We start by seeding _reactionMap from fc_discussions_cache, then refresh it from the
 * Discussion API immediately if it's stale, and every REFRESH_INTERVAL_MS thereafter.
**/
'use strict';

(function () {
  var _reactionMap = new Map(); // Stores reactions per theorem
  var CATEGORY_ID = 'DIC_kwDOSdVWic4C9Dck';
  var DISCUSSIONS_API = 'https://api.github.com/repos/codrut3/formal-conjectures/discussions';
  var REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

  function get(theoremName) {
    var base = _reactionMap.get(theoremName) || { count: 0, thumbsUp: 0, thumbsDown: 0 };
    return { count: base.count, thumbsUp: base.thumbsUp, thumbsDown: base.thumbsDown };
  }

  function refreshReactions() {
    // Check if a refresh happened recently, if yes, skip the update.
    var lastRefresh = parseInt(localStorage.getItem('fc_refresh_ts') || '0', 10);
    if (Date.now() - lastRefresh < REFRESH_INTERVAL_MS) return;
    localStorage.setItem('fc_refresh_ts', Date.now());

    function fetchDiscussions(url) {
      return fetch(url, {
        headers: {
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      }).then(function (r) {
        if (!r.ok) return;
        var linkHeader = r.headers.get('Link');
        return r.json().then(function (items) {
          if (!Array.isArray(items)) return;
          for (var i = 0; i < items.length; i++) {
            var item = items[i];
            if (!item.title) continue;
            if (item.category && item.category.node_id !== CATEGORY_ID) continue;
            var reactions = item.reactions || {};
            _reactionMap.set(item.title, {
              count: reactions.heart || 0,
              thumbsUp: reactions['+1'] || 0,
              thumbsDown: reactions['-1'] || 0,
            });
          }
          if (items.length === 0) return;
          if (linkHeader) {
            var next = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
            if (next) return fetchDiscussions(next[1]);
          }
        });
      }).catch(function () { });
    }

    fetchDiscussions(DISCUSSIONS_API + '?per_page=100').then(function () {
      // _reactionMap now holds the most recent data. Overwrite the shared cache with it.
      var cache = {};
      _reactionMap.forEach(function (val, key) { cache[key] = val; });
      localStorage.setItem('fc_discussions_cache', JSON.stringify(cache));
      // browse.js registered a { once: true } listener for this event before calling init();
      // it fires applyFilters() + renderList() to update badge counts with fresh data.
      window.dispatchEvent(new CustomEvent('fc:discussions-updated'));
    });
  }

  function init() {
    // Seed _reactionMap from the shared cache -- written either by a previous
    // refreshReactions() call (any tab) or by giscus_voting.js when the user opens a
    // theorem page.
    var cached = JSON.parse(localStorage.getItem('fc_discussions_cache') || 'null');
    if (cached) {
      Object.keys(cached).forEach(function (k) {
        _reactionMap.set(k, cached[k]);
      });
    }

    // Call refreshReactions() now and every REFRESH_INTERVAL_MS to get the latest updates.
    refreshReactions();
    setInterval(refreshReactions, REFRESH_INTERVAL_MS);
  }

  var HEART_SVG = '<svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="13" height="13" style="fill:currentColor;vertical-align:-1px"><path d="M7.655 14.916 8 14.25l.345.666a.752.752 0 0 1-.69 0Zm0 0L8 14.25l.345.666.002-.001.006-.003.018-.01a7.643 7.643 0 0 0 .31-.17 22.08 22.08 0 0 0 3.433-2.414C13.956 10.731 16 8.35 16 5.5 16 2.836 13.914 1 11.75 1 10.203 1 8.847 1.802 8 3.02 7.153 1.802 5.797 1 4.25 1 2.086 1 0 2.836 0 5.5c0 2.85 2.045 5.231 3.886 6.818a22.075 22.075 0 0 0 3.433 2.414 7.62 7.62 0 0 0 .31.17l.018.01.006.003.002.001Z"/></svg>';

  function renderCardVoteCount(theoremName) {
    var d = get(theoremName);
    if (!d.count) return '';
    return '<span class="theorem-card__votes">' + HEART_SVG + '&thinsp;' + d.count + '</span>';
  }

  function renderCardTruth(theoremName) {
    var d = get(theoremName);
    if (!d.thumbsUp && !d.thumbsDown) return '';
    return '<span class="theorem-card__truth" title="Predictions: ' +
      d.thumbsUp + ' true, ' + d.thumbsDown + ' false">' +
      '👍 ' + d.thumbsUp + ' 👎 ' + d.thumbsDown + '</span>';
  }

  window.FC = window.FC || {};
  FC.reactionCount = {
    init: init,
    get: get,
    renderCardVoteCount: renderCardVoteCount,
    renderCardTruth: renderCardTruth,
  };
})();
