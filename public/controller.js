/**
 * Bandeja Scoreboard — Referee Control Panel (Mobile)
 */
(function (root) {
  'use strict';

  var Controller = {};
  var currentState = null;
  var currentCourtId = null;
  var currentSocket = null;
  var historyLength = 0;
  var soundEnabled = false;
  var audioCtx = null;
  var actionQueue = [];
  var isConnected = true;
  var timerInterval = null;

  Controller.render = function (container, socket, courtId) {
    currentCourtId = courtId;
    currentSocket = socket;

    container.innerHTML = [
      '<div class="controller">',
      '  <div class="controller-header">',
      '    <span class="controller-court-label">Court ' + courtId + '</span>',
      '    <div style="display:flex;align-items:center;gap:12px;">',
      '      <button class="sound-toggle" id="sound-toggle" title="Sound">&#128264;</button>',
      '      <div class="connection-status">',
      '        <div class="connection-dot" id="conn-dot"></div>',
      '        <span id="conn-text">Connected</span>',
      '      </div>',
      '    </div>',
      '  </div>',
      '  <div class="disconnect-banner hidden" id="disconnect-banner">Connection lost. Retrying...</div>',
      '  <div class="mini-scoreboard" id="mini-sb"></div>',
      '  <div class="score-buttons" id="score-buttons">',
      '    <button class="score-btn score-btn-a" id="btn-point-a" disabled>',
      '      <span class="score-btn-label">+Point</span>',
      '      <span class="score-btn-icon">+</span>',
      '      <span class="score-btn-name" id="btn-name-a">Team A</span>',
      '    </button>',
      '    <button class="score-btn score-btn-b" id="btn-point-b" disabled>',
      '      <span class="score-btn-label">+Point</span>',
      '      <span class="score-btn-icon">+</span>',
      '      <span class="score-btn-name" id="btn-name-b">Team B</span>',
      '    </button>',
      '  </div>',
      '  <div class="controller-bottom">',
      '    <button class="btn" id="btn-undo" disabled>&#8630; Undo <span class="undo-count" id="undo-count"></span></button>',
      '    <button class="btn" id="btn-serve">&#127934; Serve</button>',
      '    <button class="btn" id="btn-settings">&#9881; Settings</button>',
      '  </div>',
      '</div>',
      '<div class="modal-backdrop hidden" id="settings-modal"></div>'
    ].join('\n');

    bindEvents(socket, courtId);
    socket.emit('join-court', { courtId: courtId, mode: 'control' });

    socket.on('state-update', function (data) {
      if (String(data.courtId) === String(courtId)) {
        currentState = data.state;
        historyLength = data.historyLength || 0;
        renderMiniScoreboard(data.state);
        updateButtons(data.state);
      }
    });

    socket.on('connect', function () {
      isConnected = true;
      updateConnectionUI();
      socket.emit('join-court', { courtId: courtId, mode: 'control' });
      flushQueue();
    });

    socket.on('disconnect', function () {
      isConnected = false;
      updateConnectionUI();
    });
  };

  function bindEvents(socket, courtId) {
    document.getElementById('btn-point-a').addEventListener('click', function () {
      sendAction('POINT_TEAM_A');
      playSound('point');
    });

    document.getElementById('btn-point-b').addEventListener('click', function () {
      sendAction('POINT_TEAM_B');
      playSound('point');
    });

    document.getElementById('btn-undo').addEventListener('click', function () {
      sendAction('UNDO');
    });

    document.getElementById('btn-serve').addEventListener('click', function () {
      sendAction('TOGGLE_SERVICE');
    });

    document.getElementById('btn-settings').addEventListener('click', function () {
      openSettingsModal();
    });

    document.getElementById('sound-toggle').addEventListener('click', function () {
      soundEnabled = !soundEnabled;
      this.classList.toggle('active', soundEnabled);
      this.innerHTML = soundEnabled ? '&#128266;' : '&#128264;';
    });
  }

  function sendAction(action, payload) {
    var msg = { courtId: currentCourtId, action: action, payload: payload || {} };
    if (isConnected && currentSocket) {
      currentSocket.emit('score-action', msg);
    } else {
      actionQueue.push(msg);
    }
  }

  function flushQueue() {
    while (actionQueue.length > 0 && isConnected) {
      currentSocket.emit('score-action', actionQueue.shift());
    }
  }

  function updateConnectionUI() {
    var dot = document.getElementById('conn-dot');
    var text = document.getElementById('conn-text');
    var banner = document.getElementById('disconnect-banner');
    if (!dot) return;

    if (isConnected) {
      dot.classList.remove('disconnected');
      text.textContent = 'Connected';
      banner.classList.add('hidden');
    } else {
      dot.classList.add('disconnected');
      text.textContent = 'Offline';
      banner.classList.remove('hidden');
    }
  }

  function renderMiniScoreboard(state) {
    var el = document.getElementById('mini-sb');
    if (!el) return;
    var d = ScoreEngine.getDisplayScore(state);

    var setsA = '', setsB = '';
    for (var s = 0; s < d.sets.length; s++) {
      setsA += '<span>' + d.sets[s].gamesA + '</span>';
      setsB += '<span>' + d.sets[s].gamesB + '</span>';
    }

    var pointADisplay = d.pointA;
    var pointBDisplay = d.pointB;
    if (d.isAdvantage === 'A') { pointADisplay = 'AD'; pointBDisplay = ''; }
    if (d.isAdvantage === 'B') { pointBDisplay = 'AD'; pointADisplay = ''; }

    var html = [
      '<div class="mini-team-row">',
      '  <div class="mini-serve">' + (d.server === 'A' && d.status === 'in_progress' ? '<div class="mini-serve-dot"></div>' : '') + '</div>',
      '  <div class="mini-team-name">' + escHtml(d.teamA || '---') + '</div>',
      '  <div class="mini-sets">' + setsA + '</div>',
      '  <div class="mini-point">' + (d.status === 'in_progress' ? pointADisplay : '') + '</div>',
      '</div>',
      '<div class="mini-team-row">',
      '  <div class="mini-serve">' + (d.server === 'B' && d.status === 'in_progress' ? '<div class="mini-serve-dot"></div>' : '') + '</div>',
      '  <div class="mini-team-name">' + escHtml(d.teamB || '---') + '</div>',
      '  <div class="mini-sets">' + setsB + '</div>',
      '  <div class="mini-point">' + (d.status === 'in_progress' ? pointBDisplay : '') + '</div>',
      '</div>',
      '<div class="mini-info">'
    ];

    if (d.isSuperTiebreak) {
      html.push('<span class="text-danger">Super Tiebreak</span>');
    } else if (d.isTiebreak) {
      html.push('<span class="text-danger">Tiebreak</span>');
    } else if (d.isDeuce) {
      html.push('<span style="color:#FFD700">Deuce</span>');
    }

    if (d.status === 'in_progress') {
      html.push('<span>Set ' + d.currentSet + '/' + d.totalSets + '</span>');
      if (state.matchStartTime) {
        html.push('<span id="ctrl-timer"></span>');
      }
    } else if (d.status === 'waiting') {
      html.push('<span>' + d.formatName + '</span>');
    } else if (d.status === 'finished') {
      var winner = d.winner === 'A' ? d.teamA : d.teamB;
      html.push('<span class="text-accent">Winner: ' + escHtml(winner) + '</span>');
    }

    html.push('</div>');
    el.innerHTML = html.join('\n');

    clearInterval(timerInterval);
    if (state.matchStartTime && d.status === 'in_progress') {
      updateTimer(state.matchStartTime);
      timerInterval = setInterval(function () { updateTimer(state.matchStartTime); }, 1000);
    }
  }

  function updateTimer(startTime) {
    var el = document.getElementById('ctrl-timer');
    if (!el) return;
    var elapsed = Math.floor((Date.now() - startTime) / 1000);
    var m = Math.floor(elapsed / 60);
    var s = elapsed % 60;
    el.textContent = (m < 10 ? '0' + m : m) + ':' + (s < 10 ? '0' + s : s);
  }

  function updateButtons(state) {
    var btnA = document.getElementById('btn-point-a');
    var btnB = document.getElementById('btn-point-b');
    var btnUndo = document.getElementById('btn-undo');
    var nameA = document.getElementById('btn-name-a');
    var nameB = document.getElementById('btn-name-b');
    var undoCount = document.getElementById('undo-count');
    if (!btnA) return;

    var canScore = state.status === 'in_progress';
    btnA.disabled = !canScore;
    btnB.disabled = !canScore;
    btnUndo.disabled = historyLength === 0;

    nameA.textContent = state.teamA || 'Team A';
    nameB.textContent = state.teamB || 'Team B';
    undoCount.textContent = historyLength > 0 ? '(' + historyLength + ')' : '';
  }

  function openSettingsModal() {
    var modal = document.getElementById('settings-modal');
    if (!modal) return;

    var state = currentState || ScoreEngine.createMatch();
    var isWaiting = state.status === 'waiting';

    modal.innerHTML = [
      '<div class="modal">',
      '  <div class="modal-title">',
      '    <span>Settings</span>',
      '    <button class="modal-close" id="modal-close">&times;</button>',
      '  </div>',
      '  <div class="form-group">',
      '    <label class="form-label">Team A</label>',
      '    <input class="form-input" id="set-team-a" value="' + escAttr(state.teamA) + '" placeholder="Team A names">',
      '  </div>',
      '  <div class="form-group">',
      '    <label class="form-label">Team B</label>',
      '    <input class="form-input" id="set-team-b" value="' + escAttr(state.teamB) + '" placeholder="Team B names">',
      '  </div>',
      isWaiting ? [
        '  <div class="form-row">',
        '    <div class="form-group">',
        '      <label class="form-label">Format</label>',
        '      <select class="form-select" id="set-format">',
        '        <option value="A"' + (state.format === 'A' ? ' selected' : '') + '>Classic (Best of 3)</option>',
        '        <option value="B"' + (state.format === 'B' ? ' selected' : '') + '>Super Tiebreak</option>',
        '        <option value="C"' + (state.format === 'C' ? ' selected' : '') + '>Set to 9</option>',
        '        <option value="D"' + (state.format === 'D' ? ' selected' : '') + '>Single Set</option>',
        '      </select>',
        '    </div>',
        '    <div class="form-group">',
        '      <label class="form-label">Deuce Mode</label>',
        '      <select class="form-select" id="set-deuce">',
        '        <option value="advantage"' + (state.config.deuceMode === 'advantage' ? ' selected' : '') + '>Advantage</option>',
        '        <option value="golden"' + (state.config.deuceMode === 'golden' ? ' selected' : '') + '>Golden Point</option>',
        '      </select>',
        '    </div>',
        '  </div>',
        '  <div class="form-group">',
        '    <label class="form-label">First Server</label>',
        '    <select class="form-select" id="set-server">',
        '      <option value="A"' + (state.server === 'A' ? ' selected' : '') + '>Team A</option>',
        '      <option value="B"' + (state.server === 'B' ? ' selected' : '') + '>Team B</option>',
        '    </select>',
        '  </div>'
      ].join('\n') : '',
      '  <div class="form-actions">',
      isWaiting
        ? '    <button class="btn btn-accent" id="btn-start-match">Start Match</button>'
        : '    <button class="btn btn-accent" id="btn-save-settings">Save</button>',
      '    <button class="btn btn-danger" id="btn-reset-match">Reset Match</button>',
      '  </div>',
      '</div>'
    ].join('\n');

    modal.classList.remove('hidden');

    document.getElementById('modal-close').addEventListener('click', closeModal);
    modal.addEventListener('click', function (e) {
      if (e.target === modal) closeModal();
    });

    if (isWaiting) {
      document.getElementById('btn-start-match').addEventListener('click', function () {
        var teamA = document.getElementById('set-team-a').value.trim();
        var teamB = document.getElementById('set-team-b').value.trim();
        var format = document.getElementById('set-format').value;
        var deuce = document.getElementById('set-deuce').value;
        var server = document.getElementById('set-server').value;

        sendAction('UPDATE_SETTINGS', {
          teamA: teamA || 'Team A',
          teamB: teamB || 'Team B',
          format: format,
          deuceMode: deuce,
          server: server
        });

        setTimeout(function () {
          sendAction('START_MATCH');
          closeModal();
        }, 100);
      });
    } else {
      document.getElementById('btn-save-settings').addEventListener('click', function () {
        var teamA = document.getElementById('set-team-a').value.trim();
        var teamB = document.getElementById('set-team-b').value.trim();
        sendAction('UPDATE_SETTINGS', {
          teamA: teamA || 'Team A',
          teamB: teamB || 'Team B'
        });
        closeModal();
      });
    }

    document.getElementById('btn-reset-match').addEventListener('click', function () {
      if (confirm('Reset this match? All progress will be lost.')) {
        sendAction('RESET_MATCH');
        closeModal();
      }
    });
  }

  function closeModal() {
    var modal = document.getElementById('settings-modal');
    if (modal) modal.classList.add('hidden');
  }

  // --- Sound ---
  function playSound(type) {
    if (!soundEnabled) return;
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      var osc = audioCtx.createOscillator();
      var gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);

      if (type === 'point') {
        osc.frequency.value = 880;
        gain.gain.value = 0.15;
        osc.start();
        osc.stop(audioCtx.currentTime + 0.08);
      } else if (type === 'game') {
        osc.frequency.value = 660;
        gain.gain.value = 0.2;
        osc.start();
        osc.stop(audioCtx.currentTime + 0.3);
      }
    } catch (e) { /* ignore audio errors */ }
  }

  function escHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function escAttr(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  Controller.destroy = function (socket) {
    clearInterval(timerInterval);
    socket.off('state-update');
    socket.off('connect');
    socket.off('disconnect');
    closeModal();
  };

  root.Controller = Controller;
})(self);
