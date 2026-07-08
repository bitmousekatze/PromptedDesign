// prmpted Games SDK — tiny script for game creators.
// Auto-loaded by the platform at upload time; safe to include locally too.
//
// API exposed on `window.prmpted`:
//   prmpted.unlock(achievementKey)   — awards the player 15 builder points (server-validated, idempotent)
//   prmpted.score(value, opts)       — submit a leaderboard score. Keeps the player's best.
//                                       opts: { board: 'default', lowerIsBetter: false, meta: {} }
//                                       Returns a Promise resolving to { ok, rank, total, improved, score }.
//
// Heartbeats are sent automatically every 30 seconds while the tab is visible.
(function () {
  if (window.prmpted) return; // idempotent

  function send(msg) {
    try { window.parent.postMessage(msg, '*'); } catch (_) { /* sandboxed */ }
  }

  function heartbeat() {
    if (document.visibilityState !== 'visible') return;
    send({ type: 'prmpted:heartbeat', t: Date.now() });
  }

  setInterval(heartbeat, 30000);
  // Fire one early so play_count increments on first interaction
  setTimeout(heartbeat, 2000);

  // Pending score submissions awaiting a result from the parent, keyed by a
  // request id. Lets prmpted.score(...) return a Promise that resolves with the
  // player's new rank.
  var pending = {};
  var seq = 0;
  window.addEventListener('message', function (e) {
    var d = e.data;
    if (!d || d.type !== 'prmpted:score:result') return;
    var cb = pending[d.rid];
    if (cb) { delete pending[d.rid]; cb(d.result || { ok: false }); }
  });

  window.prmpted = {
    unlock: function (achievementKey) {
      if (!achievementKey || typeof achievementKey !== 'string') return;
      send({ type: 'prmpted:achievement', id: achievementKey });
    },
    score: function (value, opts) {
      opts = opts || {};
      var num = Number(value);
      if (!isFinite(num)) return Promise.resolve({ ok: false, reason: 'invalid_score' });
      var rid = 'r' + (++seq);
      send({
        type: 'prmpted:score',
        rid: rid,
        score: num,
        board: typeof opts.board === 'string' ? opts.board : 'default',
        lowerIsBetter: !!opts.lowerIsBetter,
        meta: opts.meta && typeof opts.meta === 'object' ? opts.meta : {},
      });
      return new Promise(function (resolve) {
        pending[rid] = resolve;
        // Don't leak the resolver if the parent never answers (e.g. logged out).
        setTimeout(function () {
          if (pending[rid]) { delete pending[rid]; resolve({ ok: false, reason: 'timeout' }); }
        }, 8000);
      });
    },
  };
})();
