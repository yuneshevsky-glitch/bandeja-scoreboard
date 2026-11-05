/**
 * Bandeja Scoreboard — SPA Router & App Shell
 */
(function () {
  'use strict';

  var socket = io();
  var currentView = null;
  var adminAuthenticated = false;

  function router() {
    var hash = location.hash || '#/';
    var app = document.getElementById('app');

    // Destroy previous view
    if (currentView && currentView.destroy) {
      currentView.destroy(socket);
    }
    currentView = null;

    // Parse route
    var courtMatch = hash.match(/^#\/court\/(\d+)\/(display|control)$/);
    var adminMatch = hash === '#/admin';

    if (courtMatch) {
      var courtId = parseInt(courtMatch[1]);
      var mode = courtMatch[2];
      if (courtId < 1 || courtId > 8) {
        location.hash = '#/';
        return;
      }
      if (mode === 'display') {
        Scoreboard.render(app, socket, courtId);
        currentView = Scoreboard;
      } else {
        Controller.render(app, socket, courtId);
        currentView = Controller;
      }
    } else if (adminMatch) {
      renderAdmin(app);
    } else {
      Dashboard.render(app, socket);
      currentView = Dashboard;
    }
  }

  // === ADMIN ===
  function renderAdmin(container) {
    if (!adminAuthenticated) {
      renderPinEntry(container);
      return;
    }
    renderAdminPanel(container);
  }

  function renderPinEntry(container) {
    container.innerHTML = [
      '<div class="pin-entry">',
      '  <h2>Admin Access</h2>',
      '  <input type="password" class="pin-input" id="pin-input" maxlength="8" placeholder="PIN" autocomplete="off">',
      '  <button class="btn btn-accent" id="pin-submit">Enter</button>',
      '  <div class="pin-error hidden" id="pin-error">Invalid PIN</div>',
      '  <a href="#/" class="btn btn-sm mt-16">Back to Dashboard</a>',
      '</div>'
    ].join('\n');

    var input = document.getElementById('pin-input');
    var submit = document.getElementById('pin-submit');
    var error = document.getElementById('pin-error');

    function tryPin() {
      var pin = input.value;
      fetch('/admin/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pin })
      })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.valid) {
          adminAuthenticated = true;
          renderAdminPanel(container);
        } else {
          error.classList.remove('hidden');
          input.value = '';
          input.focus();
        }
      });
    }

    submit.addEventListener('click', tryPin);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') tryPin();
    });
    input.focus();
  }

  function renderAdminPanel(container) {
    container.innerHTML = [
      '<div class="admin">',
      '  <div class="admin-header">',
      '    <h1 class="admin-title">Admin Panel</h1>',
      '    <div style="display:flex;gap:8px;">',
      '      <button class="btn btn-sm" id="admin-download">Download State</button>',
      '      <button class="btn btn-sm btn-danger" id="admin-reset-all">Reset All Courts</button>',
      '      <a href="#/" class="btn btn-sm">Dashboard</a>',
      '    </div>',
      '  </div>',
      '  <table class="admin-table">',
      '    <thead><tr>',
      '      <th>Court</th><th>Status</th><th>Team A</th><th>Team B</th><th>Score</th><th>Clients</th><th>Actions</th>',
      '    </tr></thead>',
      '    <tbody id="admin-tbody"></tbody>',
      '  </table>',
      '</div>',
      '<div class="modal-backdrop hidden" id="qr-modal"></div>'
    ].join('\n');

    document.getElementById('admin-download').addEventListener('click', function () {
      fetch('/admin/state')
        .then(function (r) { return r.json(); })
        .then(function (data) {
          var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
          var a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'bandeja-state-' + Date.now() + '.json';
          a.click();
        });
    });

    document.getElementById('admin-reset-all').addEventListener('click', function () {
      if (confirm('Reset ALL courts? This cannot be undone.')) {
        socket.emit('reset-all-courts', { pin: prompt('Enter Admin PIN:') });
      }
    });

    socket.emit('get-all-courts');
    socket.on('all-courts-update', function (data) {
      renderAdminTable(data.courts);
    });
    socket.on('court-summary-update', function () {
      socket.emit('get-all-courts');
    });

    // Fetch client counts
    refreshAdminTable();
  }

  function refreshAdminTable() {
    fetch('/health')
      .then(function (r) { return r.json(); })
      .then(function (health) {
        window._adminHealth = health;
      });
  }

  function renderAdminTable(courts) {
    var tbody = document.getElementById('admin-tbody');
    if (!tbody) return;

    var health = window._adminHealth || {};
    var clients = health.clients || {};
    var html = '';

    for (var i = 1; i <= 8; i++) {
      var court = courts[i];
      var state = court ? court.matchState : null;
      var status = state ? state.status : 'waiting';
      var teamA = state && state.teamA ? state.teamA : '---';
      var teamB = state && state.teamB ? state.teamB : '---';
      var score = formatScore(state);
      var clientCount = clients[i] || 0;
      var baseUrl = location.origin;

      html += [
        '<tr>',
        '  <td><strong>Court ' + i + '</strong></td>',
        '  <td><span class="court-status ' + status + '">' + formatStatus(status) + '</span></td>',
        '  <td>' + escHtml(teamA) + '</td>',
        '  <td>' + escHtml(teamB) + '</td>',
        '  <td style="font-family:var(--font-score);font-variant-numeric:tabular-nums;">' + score + '</td>',
        '  <td>' + clientCount + '</td>',
        '  <td class="admin-actions">',
        '    <a href="#/court/' + i + '/display" class="btn btn-sm">Display</a>',
        '    <a href="#/court/' + i + '/control" class="btn btn-sm btn-accent">Control</a>',
        '    <button class="btn btn-sm" onclick="showQR(' + i + ')">QR</button>',
        '    <button class="btn btn-sm btn-danger" onclick="resetCourt(' + i + ')">Reset</button>',
        '  </td>',
        '</tr>'
      ].join('\n');
    }
    tbody.innerHTML = html;
  }

  // Global functions for admin buttons
  window.showQR = function (courtId) {
    var modal = document.getElementById('qr-modal');
    if (!modal) return;

    var url = location.origin + '/#/court/' + courtId + '/control';

    modal.innerHTML = [
      '<div class="modal" style="max-width:400px;margin:auto;">',
      '  <div class="modal-title">',
      '    <span>Court ' + courtId + ' — Control QR</span>',
      '    <button class="modal-close" onclick="document.getElementById(\'qr-modal\').classList.add(\'hidden\')">&times;</button>',
      '  </div>',
      '  <div class="qr-container">',
      '    <div id="qr-canvas"></div>',
      '    <div class="qr-url">' + url + '</div>',
      '  </div>',
      '</div>'
    ].join('\n');
    modal.classList.remove('hidden');
    modal.addEventListener('click', function handler(e) {
      if (e.target === modal) {
        modal.classList.add('hidden');
        modal.removeEventListener('click', handler);
      }
    });

    // Load QR code library and render
    if (!window.QRCode) {
      var script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js';
      script.onload = function () { generateQR(url); };
      document.head.appendChild(script);
    } else {
      generateQR(url);
    }
  };

  function generateQR(url) {
    var container = document.getElementById('qr-canvas');
    if (!container) return;
    container.innerHTML = '';
    new QRCode(container, {
      text: url,
      width: 256,
      height: 256,
      colorDark: '#FFFFFF',
      colorLight: '#152236',
      correctLevel: QRCode.CorrectLevel.M
    });
  }

  window.resetCourt = function (courtId) {
    if (confirm('Reset Court ' + courtId + '?')) {
      var pin = prompt('Enter Admin PIN:');
      socket.emit('reset-court', { courtId: courtId, pin: pin });
    }
  };

  function formatScore(state) {
    if (!state || state.status === 'waiting') return '---';
    var d = ScoreEngine.getDisplayScore(state);
    var parts = [];
    for (var s = 0; s < d.sets.length; s++) {
      parts.push(d.sets[s].gamesA + ':' + d.sets[s].gamesB);
    }
    if (d.status === 'in_progress') {
      parts.push('(' + d.pointA + ':' + d.pointB + ')');
    }
    return parts.join(' ');
  }

  function formatStatus(s) {
    if (s === 'in_progress') return 'In Progress';
    if (s === 'finished') return 'Finished';
    return 'Waiting';
  }

  function escHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // === Keep-alive ===
  // Бесплатный тариф Render усыпляет сервер после 15 минут без HTTP-запросов,
  // а при засыпании теряется счёт. Пока открыт хоть один экран (ТВ, пульт,
  // дашборд), раз в 4 минуты отправляем лёгкий запрос, чтобы сервер не засыпал.
  setInterval(function () {
    fetch('/health', { cache: 'no-store' }).catch(function () {});
  }, 4 * 60 * 1000);

  // === Init ===
  window.addEventListener('hashchange', router);
  router();
})();
