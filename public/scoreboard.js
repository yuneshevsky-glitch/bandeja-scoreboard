/**
 * Bandeja Scoreboard — Scoreboard Display (TV)
 */
(function (root) {
  'use strict';

  var Scoreboard = {};
  var timerInterval = null;

  // Надёжность ТВ-экрана. Телевизор никто не трогает, поэтому экран обязан
  // сам восстанавливаться после любого обрыва связи:
  // - при каждом переподключении сокета заново входит в комнату корта;
  // - каждые RESYNC_MS перезапрашивает состояние (страховка от «тихого» обрыва);
  // - если сокет не поднимается, берёт состояние по HTTP;
  // - если связи нет дольше RELOAD_AFTER_MS, перезагружает страницу.
  var RESYNC_MS = 15000;
  var RELOAD_AFTER_MS = 90000;
  var MATCH_OVERLAY_MS = 10000;

  var live = null; // { socket, courtId, handlers, timers }
  var lastSeq = null;
  var wakeLock = null;

  Scoreboard.render = function (container, socket, courtId) {
    container.innerHTML = [
      '<div class="scoreboard" id="scoreboard-view">',
      '  <div class="scoreboard-header">',
      '    <span class="scoreboard-tournament"><img src="img/logo-white.png" alt="" style="height:28px;vertical-align:middle;margin-right:10px;opacity:0.7;">Bandeja Cup</span>',
      '    <span class="scoreboard-court">Court ' + courtId + '<span class="sb-conn hidden" id="sb-conn">Нет связи</span></span>',
      '  </div>',
      '  <div class="scoreboard-table" id="sb-table">',
      '    <div class="scoreboard-row" id="sb-row-a"></div>',
      '    <div class="scoreboard-row" id="sb-row-b"></div>',
      '  </div>',
      '  <div class="scoreboard-footer" id="sb-footer"></div>',
      '</div>'
    ].join('\n');

    lastSeq = null;
    var lastContact = Date.now();

    function join() {
      if (socket.connected) socket.emit('join-court', { courtId: courtId, mode: 'display' });
    }

    function onState(data) {
      if (String(data.courtId) !== String(courtId)) return;
      lastContact = Date.now();
      setConnBadge(false);
      applyState(data);
    }

    function onConnect() { lastContact = Date.now(); setConnBadge(false); join(); }
    function onDisconnect() { setConnBadge(true); }

    function onVisible() {
      if (document.visibilityState !== 'visible') return;
      requestWakeLock();
      if (!socket.connected) socket.connect();
      join();
    }

    function tick() {
      if (socket.connected) {
        join();
        return;
      }
      socket.connect();
      fetch('/court/' + courtId + '/state', { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) {
          if (data) { lastContact = Date.now(); applyState(data); }
        })
        .catch(function () { /* сервер недоступен — ждём следующей попытки */ });
      if (Date.now() - lastContact > RELOAD_AFTER_MS) location.reload();
    }

    live = {
      socket: socket,
      handlers: { 'state-update': onState, connect: onConnect, disconnect: onDisconnect },
      onVisible: onVisible,
      timer: setInterval(tick, RESYNC_MS)
    };
    socket.on('state-update', onState);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    document.addEventListener('visibilitychange', onVisible);

    setConnBadge(!socket.connected);
    requestWakeLock();
    join();
  };

  // seq растёт на каждое действие судьи. Анимации и заставки показываем только
  // для следующего по порядку действия: повторная выдача того же состояния
  // (переподключение, страховочный запрос) их не включает.
  function applyState(data) {
    var seq = typeof data.seq === 'number' ? data.seq : null;
    var isNextAction = lastSeq !== null && seq !== null && seq === lastSeq + 1;
    if (seq !== null) lastSeq = seq;
    renderState(data.state, isNextAction);
  }

  function setConnBadge(offline) {
    var el = document.getElementById('sb-conn');
    if (el) el.classList.toggle('hidden', !offline);
  }

  function requestWakeLock() {
    try {
      if (!navigator.wakeLock || (wakeLock && !wakeLock.released)) return;
      navigator.wakeLock.request('screen').then(function (lock) { wakeLock = lock; }).catch(function () {});
    } catch (e) { /* не поддерживается браузером телевизора */ }
  }

  function renderState(state, animate) {
    var d = ScoreEngine.getDisplayScore(state);
    var numSets = d.sets.length;

    // Set CSS variable for grid columns
    var table = document.getElementById('sb-table');
    if (table) table.style.setProperty('--num-sets', numSets);

    renderRow('sb-row-a', d, 'A', numSets);
    renderRow('sb-row-b', d, 'B', numSets);
    renderFooter(d, state);
    // Заставка конца матча не должна пережить начало нового.
    if (d.status !== 'finished') hideOverlay();
    if (animate) handleEvents(d);
  }

  function renderRow(rowId, d, team, numSets) {
    var row = document.getElementById(rowId);
    if (!row) return;

    var isServer = d.server === team;
    var name = team === 'A' ? d.teamA : d.teamB;
    var point = team === 'A' ? d.pointA : d.pointB;

    var pointDisplay = point;
    if (d.isAdvantage === team) {
      pointDisplay = 'AD';
    } else if (d.isAdvantage && d.isAdvantage !== team) {
      pointDisplay = '';
    }

    var html = '';
    // Serve indicator
    html += '<div class="scoreboard-serve">';
    if (isServer && d.status === 'in_progress') {
      html += '<div class="serve-dot"></div>';
    }
    html += '</div>';

    // Name
    html += '<div class="scoreboard-name">' + escHtml(name || '---') + '</div>';

    // Set scores
    for (var s = 0; s < numSets; s++) {
      var games = team === 'A' ? d.sets[s].gamesA : d.sets[s].gamesB;
      var wonClass = '';
      if (!d.sets[s].isCurrentSet) {
        var otherGames = team === 'A' ? d.sets[s].gamesB : d.sets[s].gamesA;
        if (games > otherGames) wonClass = ' won';
      } else {
        wonClass = ' current';
      }
      html += '<div class="scoreboard-set-score' + wonClass + '">' + games + '</div>';
    }

    // Current point
    if (d.status === 'in_progress') {
      html += '<div class="scoreboard-point">' + pointDisplay + '</div>';
    } else {
      html += '<div class="scoreboard-point"></div>';
    }

    row.innerHTML = html;
  }

  function renderFooter(d, state) {
    var footer = document.getElementById('sb-footer');
    if (!footer) return;

    var parts = [];

    if (d.status === 'in_progress') {
      if (d.isSuperTiebreak) {
        parts.push('<span class="scoreboard-tiebreak-label">Super Tiebreak</span>');
      } else if (d.isTiebreak) {
        parts.push('<span class="scoreboard-tiebreak-label">Tiebreak</span>');
      } else if (d.isDeuce) {
        parts.push('<span class="scoreboard-deuce-label">Deuce</span>');
      }

      parts.push('<span class="scoreboard-set-info">Set ' + d.currentSet + ' of ' + d.totalSets + '</span>');

      if (state.matchStartTime) {
        parts.push('<span class="scoreboard-timer" id="sb-timer"></span>');
      }
    } else if (d.status === 'waiting') {
      parts.push('<span class="scoreboard-set-info">' + d.formatName + ' Format</span>');
    } else if (d.status === 'finished') {
      parts.push('<span class="scoreboard-set-info" style="color: var(--color-accent);">Match Complete</span>');
    }

    footer.innerHTML = parts.join('');

    // Update timer
    clearInterval(timerInterval);
    if (state.matchStartTime && d.status === 'in_progress') {
      updateTimer(state.matchStartTime);
      timerInterval = setInterval(function () {
        updateTimer(state.matchStartTime);
      }, 1000);
    }
  }

  function updateTimer(startTime) {
    var el = document.getElementById('sb-timer');
    if (!el) return;
    var elapsed = Math.floor((Date.now() - startTime) / 1000);
    var m = Math.floor(elapsed / 60);
    var s = elapsed % 60;
    el.textContent = pad(m) + ':' + pad(s);
  }

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function handleEvents(d) {
    var evt = d.lastEvent;
    if (!evt) return;

    if (evt.type === 'point' || evt.type === 'advantage' || evt.type === 'deuce') {
      flashRow(evt.team || (evt.type === 'deuce' ? null : null));
    }

    if (evt.type === 'game') {
      flashRow(evt.team);
      showOverlay('Game', evt.team === 'A' ? d.teamA : d.teamB, 1200);
    }

    if (evt.type === 'set') {
      var teamName = evt.team === 'A' ? d.teamA : d.teamB;
      showOverlay('Set ' + (evt.setIndex + 1), teamName, 2500);
    }

    if (evt.type === 'match') {
      var winner = evt.team === 'A' ? d.teamA : d.teamB;
      showOverlay('Match', winner + ' Wins!', MATCH_OVERLAY_MS);
    }
  }

  function flashRow(team) {
    if (!team) return;
    var rowId = team === 'A' ? 'sb-row-a' : 'sb-row-b';
    var row = document.getElementById(rowId);
    if (!row) return;
    var cls = 'flash-' + team.toLowerCase();
    row.classList.remove(cls);
    void row.offsetWidth; // reflow
    row.classList.add(cls);
    setTimeout(function () { row.classList.remove(cls); }, 500);
  }

  function showOverlay(label, text, duration) {
    var overlay = document.getElementById('overlay');
    if (!overlay) return;

    overlay.innerHTML = [
      '<div class="overlay-content">',
      '  <div class="overlay-label">' + escHtml(label) + '</div>',
      '  <div class="overlay-team">' + escHtml(text) + '</div>',
      '</div>'
    ].join('\n');

    overlay.classList.remove('hidden');

    clearTimeout(overlayTimer);
    overlayTimer = setTimeout(hideOverlay, duration);
  }

  var overlayTimer = null;
  function hideOverlay() {
    clearTimeout(overlayTimer);
    var overlay = document.getElementById('overlay');
    if (overlay) overlay.classList.add('hidden');
  }

  function escHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  Scoreboard.destroy = function (socket) {
    clearInterval(timerInterval);
    if (live) {
      clearInterval(live.timer);
      Object.keys(live.handlers).forEach(function (evt) {
        socket.off(evt, live.handlers[evt]);
      });
      document.removeEventListener('visibilitychange', live.onVisible);
      live = null;
    }
    hideOverlay();
    if (wakeLock && !wakeLock.released) wakeLock.release().catch(function () {});
    wakeLock = null;
  };

  root.Scoreboard = Scoreboard;
})(self);
