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
      '<div class="tv" id="scoreboard-view">',
      '  <header class="tv-head">',
      '    <img class="tv-sign" src="brand/bal-sign.svg" alt="Bandeja Amateur League">',
      '    <div class="tv-head-text">',
      '      <span class="tv-league">Bandeja Amateur League</span>',
      '      <span class="tv-event" id="tv-event"></span>',
      '    </div>',
      '    <img class="tv-chevrons" src="brand/bal-chevrons.svg" alt="">',
      '    <div class="tv-court"><span>Корт</span><b>' + courtId + '</b></div>',
      '    <span class="sb-conn hidden" id="sb-conn">Нет связи</span>',
      '  </header>',
      '  <main class="tv-board" id="sb-table">',
      '    <section class="tv-team" id="sb-row-a"></section>',
      '    <section class="tv-team" id="sb-row-b"></section>',
      '  </main>',
      '  <footer class="tv-foot">',
      '    <div class="tv-partners">',
      '      <img src="brand/mfp-white.svg" alt="МФП">',
      '      <img src="brand/fonbet-white.svg" alt="FONBET">',
      '    </div>',
      '    <div class="tv-status" id="sb-footer"></div>',
      '  </footer>',
      '</div>'
    ].join('\n');

    // Фото подгружаются один раз; до этого табло показывает фамилии без портретов.
    Players.load().then(function () { if (lastData) renderState(lastData.state, false); });

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
  var lastData = null;

  function applyState(data) {
    lastData = data;
    renderEvent(data.event);
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

  function renderEvent(event) {
    var el = document.getElementById('tv-event');
    if (el) el.textContent = (event && event.title) || '';
  }

  function renderState(state, animate) {
    var d = ScoreEngine.getDisplayScore(state);
    var numSets = d.sets.length;

    var table = document.getElementById('sb-table');
    if (!table) return;
    table.style.setProperty('--num-sets', numSets);
    var hasPhotos = hasAnyPhoto(state);
    table.classList.toggle('no-photos', !hasPhotos);

    renderRow('sb-row-a', d, state, 'A', numSets);
    renderRow('sb-row-b', d, state, 'B', numSets);
    renderFooter(d, state);
    // Заставка конца матча не должна пережить начало нового.
    if (d.status !== 'finished') hideOverlay();
    if (animate) handleEvents(d);
  }

  function hasAnyPhoto(state) {
    var ids = (state.playersA || []).concat(state.playersB || []);
    return ids.some(function (id) { return !!Players.get(id); });
  }

  function renderRow(rowId, d, state, team, numSets) {
    var row = document.getElementById(rowId);
    if (!row) return;

    var live = d.status === 'in_progress';
    var isServerTeam = live && d.server === team;
    var ids = (team === 'A' ? state.playersA : state.playersB) || [null, null];
    var servingIdx = (state.servingPlayer && state.servingPlayer[team]) || 0;
    var players = ids.map(function (id) { return Players.get(id); });
    var anyPlayer = players[0] || players[1];

    var point = team === 'A' ? d.pointA : d.pointB;
    var pointDisplay = point;
    if (d.isAdvantage === team) pointDisplay = 'AD';
    else if (d.isAdvantage) pointDisplay = '';

    var won = d.status === 'finished' && d.winner === team;
    row.className = 'tv-team' + (isServerTeam ? ' is-serving' : '') + (won ? ' is-winner' : '');

    var html = '';

    // Портреты
    html += '<div class="tv-photos">';
    for (var i = 0; i < 2; i++) {
      var p = players[i];
      var serving = isServerTeam && servingIdx === i;
      html += '<figure class="tv-photo' + (serving ? ' is-serving' : '') + (p ? '' : ' is-empty') + '">';
      html += p ? '<img src="' + p.photo + '" alt="' + escAttr(p.surname) + '">' : '<img class="tv-photo-mark" src="brand/bal-sign.svg" alt="">';
      if (serving) html += '<span class="tv-ball" aria-label="Подаёт"></span>';
      html += '</figure>';
    }
    html += '</div>';

    // Фамилии: по игроку на строку, мяч у подающего
    html += '<div class="tv-names">';
    if (anyPlayer) {
      for (var j = 0; j < 2; j++) {
        var pl = players[j];
        var srv = isServerTeam && servingIdx === j;
        html += '<div class="tv-player' + (srv ? ' is-serving' : '') + '">' +
          '<span class="tv-surname">' + escHtml(pl ? pl.surname || 'Игрок' : '—') + '</span>' +
          (srv ? '<span class="tv-ball tv-ball-inline" aria-label="Подаёт"></span>' : '') +
          '</div>';
      }
    } else {
      var name = team === 'A' ? d.teamA : d.teamB;
      html += '<div class="tv-player' + (isServerTeam ? ' is-serving' : '') + '">' +
        '<span class="tv-surname">' + escHtml(name || '—') + '</span>' +
        (isServerTeam ? '<span class="tv-ball tv-ball-inline" aria-label="Подаёт"></span>' : '') +
        '</div>';
    }
    html += '</div>';

    // Сеты
    for (var s = 0; s < numSets; s++) {
      var games = team === 'A' ? d.sets[s].gamesA : d.sets[s].gamesB;
      var other = team === 'A' ? d.sets[s].gamesB : d.sets[s].gamesA;
      var cls = 'tv-set';
      if (d.sets[s].isCurrentSet && live) cls += ' is-current';
      else if (games > other) cls += ' is-won';
      html += '<div class="' + cls + '">' + games + '</div>';
    }

    // Текущее очко
    html += '<div class="tv-point' + (pointDisplay === 'AD' ? ' is-ad' : '') + '">' +
      (live ? pointDisplay : '') + '</div>';

    row.innerHTML = html;
  }

  function renderFooter(d, state) {
    var footer = document.getElementById('sb-footer');
    if (!footer) return;

    var parts = [];

    if (d.status === 'in_progress') {
      if (d.isSuperTiebreak) parts.push('<span class="tv-flag">Супер-тай-брейк</span>');
      else if (d.isTiebreak) parts.push('<span class="tv-flag">Тай-брейк</span>');
      else if (d.isDeuce) parts.push('<span class="tv-flag">Ровно</span>');

      parts.push('<span>Сет ' + d.currentSet + ' из ' + d.totalSets + '</span>');
      if (state.matchStartTime) parts.push('<span class="tv-timer" id="sb-timer"></span>');
    } else if (d.status === 'waiting') {
      parts.push('<span>Скоро начало</span>');
    } else if (d.status === 'finished') {
      parts.push('<span class="tv-flag">Матч завершён</span>');
    }

    footer.innerHTML = parts.join('<span class="tv-dot" aria-hidden="true"></span>');

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
      showOverlay('Гейм', evt.team === 'A' ? d.teamA : d.teamB, 1600);
    }

    if (evt.type === 'set') {
      var teamName = evt.team === 'A' ? d.teamA : d.teamB;
      showOverlay('Сет ' + (evt.setIndex + 1), teamName, 3000);
    }

    if (evt.type === 'match') {
      var winner = evt.team === 'A' ? d.teamA : d.teamB;
      showOverlay('Победа', winner, MATCH_OVERLAY_MS);
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
      '  <img class="overlay-chevrons" src="brand/bal-chevrons-white.svg" alt="">',
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

  function escAttr(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
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
