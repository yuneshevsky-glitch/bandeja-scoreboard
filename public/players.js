/**
 * Bandeja Scoreboard — база игроков с фото (players/players.json).
 * Пополняется в репозитории: фото лежат в public/players.
 */
(function (root) {
  'use strict';

  var Players = { list: [], byId: {} };
  var ready = null;

  Players.load = function () {
    if (!ready) {
      ready = fetch('players/players.json', { cache: 'no-cache' })
        .then(function (r) { return r.json(); })
        .then(function (list) {
          Players.list = list.slice().sort(function (a, b) {
            if (a.gender !== b.gender) return a.gender === 'm' ? -1 : 1;
            return (a.surname || '￿').localeCompare(b.surname || '￿', 'ru');
          });
          Players.byId = {};
          Players.list.forEach(function (p) { Players.byId[p.id] = p; });
          return Players.list;
        })
        .catch(function () { ready = null; return []; });
    }
    return ready;
  };

  Players.get = function (id) { return id ? Players.byId[id] || null : null; };

  Players.surname = function (p) { return p && p.surname ? p.surname : ''; };

  // Подпись в списке выбора: у фото без фамилии показываем исходный файл.
  Players.optionLabel = function (p) {
    if (p.surname) return p.surname + (p.name ? ' ' + p.name : '') + variantSuffix(p);
    return 'Без фамилии · ' + p.source.split('/').pop().replace(/\.png$/i, '');
  };

  function variantSuffix(p) {
    var same = Players.list.filter(function (x) { return x.surname === p.surname && x.gender === p.gender; });
    if (same.length < 2) return '';
    return ' · фото ' + (same.indexOf(p) + 1);
  }

  // «Матус / Рыльский» по выбранным игрокам; null, если никто не выбран.
  Players.teamName = function (ids) {
    var names = (ids || []).map(function (id) { return Players.surname(Players.get(id)); })
      .filter(Boolean);
    return names.length ? names.join(' / ') : null;
  };

  root.Players = Players;
})(self);
