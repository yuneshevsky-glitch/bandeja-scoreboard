/**
 * Bandeja Scoreboard — Scoreboard Display (TV)
 */
(function (root) {
  'use strict';

  var Scoreboard = {};
  var timerInterval = null;

  Scoreboard.render = function (container, socket, courtId) {
    container.innerHTML = [
      '<div class="scoreboard" id="scoreboard-view">',
      '  <div class="scoreboard-header">',
      '    <span class="scoreboard-tournament"><img src="img/logo-white.png" alt="" style="height:28px;vertical-align:middle;margin-right:10px;opacity:0.7;">Bandeja Cup</span>',
      '    <span class="scoreboard-court">Court ' + courtId + '</span>',
      '  </div>',
      '  <div class="scoreboard-table" id="sb-table">',
      '    <div class="scoreboard-row" id="sb-row-a"></div>',
      '    <div class="scoreboard-row" id="sb-row-b"></div>',
      '  </div>',
      '  <div class="scoreboard-footer" id="sb-footer"></div>',
      '</div>'
    ].join('\n');

    socket.emit('join-court', { courtId: courtId, mode: 'display' });

    socket.on('state-update', function (data) {
      if (String(data.courtId) === String(courtId)) {
        renderState(data.state);
      }
    });
  };

  function renderState(state) {
    var d = ScoreEngine.getDisplayScore(state);
    var numSets = d.sets.length;

    // Set CSS variable for grid columns
    var table = document.getElementById('sb-table');
    if (table) table.style.setProperty('--num-sets', numSets);

    renderRow('sb-row-a', d, 'A', numSets);
    renderRow('sb-row-b', d, 'B', numSets);
    renderFooter(d, state);
    handleEvents(d);
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
      showOverlay('Match', winner + ' Wins!', 0); // stays until dismissed
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
      duration === 0 ? '  <div class="overlay-dismiss">Tap to dismiss</div>' : '',
      '</div>'
    ].join('\n');

    overlay.classList.remove('hidden');

    if (duration > 0) {
      setTimeout(function () { overlay.classList.add('hidden'); }, duration);
    } else {
      overlay.addEventListener('click', function dismiss() {
        overlay.classList.add('hidden');
        overlay.removeEventListener('click', dismiss);
      });
    }
  }

  function escHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  Scoreboard.destroy = function (socket) {
    clearInterval(timerInterval);
    socket.off('state-update');
    var overlay = document.getElementById('overlay');
    if (overlay) overlay.classList.add('hidden');
  };

  root.Scoreboard = Scoreboard;
})(self);
