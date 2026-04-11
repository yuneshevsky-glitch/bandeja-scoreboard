/**
 * Bandeja Scoreboard — Dashboard View
 */
(function (root) {
  'use strict';

  var Dashboard = {};
  var courtsData = {};

  Dashboard.render = function (container, socket) {
    container.innerHTML = [
      '<div class="dashboard">',
      '  <div class="dashboard-header">',
      '    <h1 class="dashboard-title"><img src="img/logo-white.png" alt="Bandeja"> <span>Bandeja</span> Scoreboard</h1>',
      '    <div class="dashboard-nav">',
      '      <a href="#/admin" class="btn btn-sm">Admin</a>',
      '    </div>',
      '  </div>',
      '  <div class="courts-grid" id="courts-grid"></div>',
      '</div>'
    ].join('\n');

    socket.emit('get-all-courts');

    socket.on('all-courts-update', function (data) {
      courtsData = data.courts;
      renderGrid();
    });

    socket.on('court-summary-update', function (data) {
      courtsData[data.courtId] = {
        matchState: data.matchState,
        historyLength: data.historyLength
      };
      renderGrid();
    });
  };

  function renderGrid() {
    var grid = document.getElementById('courts-grid');
    if (!grid) return;

    var html = '';
    for (var i = 1; i <= 8; i++) {
      var court = courtsData[i];
      var state = court ? court.matchState : null;
      html += renderCard(i, state);
    }
    grid.innerHTML = html;

    grid.querySelectorAll('.court-card').forEach(function (card) {
      var courtId = card.dataset.court;
      card.querySelector('.btn-display').addEventListener('click', function (e) {
        e.stopPropagation();
        location.hash = '#/court/' + courtId + '/display';
      });
      card.querySelector('.btn-control').addEventListener('click', function (e) {
        e.stopPropagation();
        location.hash = '#/court/' + courtId + '/control';
      });
    });
  }

  function renderCard(courtId, state) {
    var status = state ? state.status : 'waiting';
    var teamA = state && state.teamA ? state.teamA : '---';
    var teamB = state && state.teamB ? state.teamB : '---';
    var display = state ? ScoreEngine.getDisplayScore(state) : null;

    var setsHtml = '';
    if (display && display.sets) {
      for (var s = 0; s < display.sets.length; s++) {
        setsHtml += '<span class="court-team-set">' + display.sets[s].gamesA + '</span>';
      }
      setsHtml += '<span class="court-team-point">' + (display.pointA || '0') + '</span>';
    }

    var setsHtmlB = '';
    if (display && display.sets) {
      for (var s = 0; s < display.sets.length; s++) {
        setsHtmlB += '<span class="court-team-set">' + display.sets[s].gamesB + '</span>';
      }
      setsHtmlB += '<span class="court-team-point">' + (display.pointB || '0') + '</span>';
    }

    var emptyA = (!state || !state.teamA) ? ' empty' : '';
    var emptyB = (!state || !state.teamB) ? ' empty' : '';

    return [
      '<div class="court-card status-' + status + '" data-court="' + courtId + '">',
      '  <div class="court-card-header">',
      '    <span class="court-number">Court ' + courtId + '</span>',
      '    <span class="court-status ' + status + '">' + formatStatus(status) + '</span>',
      '  </div>',
      '  <div class="court-teams">',
      '    <div class="court-team-row">',
      '      <span class="court-team-name' + emptyA + '">' + escHtml(teamA) + '</span>',
      '      <div class="court-team-sets">' + setsHtml + '</div>',
      '    </div>',
      '    <div class="court-team-row">',
      '      <span class="court-team-name' + emptyB + '">' + escHtml(teamB) + '</span>',
      '      <div class="court-team-sets">' + setsHtmlB + '</div>',
      '    </div>',
      '  </div>',
      '  <div class="court-card-actions">',
      '    <button class="btn btn-sm btn-display">Display</button>',
      '    <button class="btn btn-sm btn-accent btn-control">Control</button>',
      '  </div>',
      '</div>'
    ].join('\n');
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

  Dashboard.destroy = function (socket) {
    socket.off('all-courts-update');
    socket.off('court-summary-update');
  };

  root.Dashboard = Dashboard;
})(self);
