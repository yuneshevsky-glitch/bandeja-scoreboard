/**
 * Bandeja Scoreboard — Pure Scoring Engine
 * No DOM, no side effects. Usable in Node.js and browser.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.ScoreEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const POINTS = [0, 15, 30, 40];

  const FORMATS = {
    A: {
      name: 'Classic',
      setsToWin: 2,
      gamesPerSet: 6,
      tiebreakAtDeuce: true,
      tiebreakTo: 7,
      thirdSetType: 'full',
      deuceMode: 'advantage'
    },
    B: {
      name: 'Super Tiebreak',
      setsToWin: 2,
      gamesPerSet: 6,
      tiebreakAtDeuce: true,
      tiebreakTo: 7,
      thirdSetType: 'superTiebreak',
      deuceMode: 'advantage'
    },
    C: {
      name: 'Set to 9',
      setsToWin: 2,
      gamesPerSet: 9,
      tiebreakAtDeuce: true,
      tiebreakTo: 7,
      thirdSetType: 'full',
      deuceMode: 'advantage'
    },
    D: {
      name: 'Single Set',
      setsToWin: 1,
      gamesPerSet: 6,
      tiebreakAtDeuce: true,
      tiebreakTo: 7,
      thirdSetType: 'none',
      deuceMode: 'advantage'
    },
    E: {
      name: 'Custom',
      setsToWin: 2,
      gamesPerSet: 6,
      tiebreakAtDeuce: true,
      tiebreakTo: 7,
      thirdSetType: 'full',
      deuceMode: 'advantage'
    }
  };

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function getFormatConfig(settings) {
    var base = deepClone(FORMATS[settings.format] || FORMATS.A);
    if (settings.format === 'E') {
      if (settings.gamesPerSet != null) base.gamesPerSet = settings.gamesPerSet;
      if (settings.tiebreakAtDeuce != null) base.tiebreakAtDeuce = settings.tiebreakAtDeuce;
      if (settings.tiebreakTo != null) base.tiebreakTo = settings.tiebreakTo;
      if (settings.thirdSetType != null) base.thirdSetType = settings.thirdSetType;
      if (settings.deuceMode != null) base.deuceMode = settings.deuceMode;
      if (settings.setsToWin != null) base.setsToWin = settings.setsToWin;
    }
    if (settings.deuceMode != null && settings.format !== 'E') {
      base.deuceMode = settings.deuceMode;
    }
    return base;
  }

  function createMatch(settings) {
    settings = settings || {};
    var format = settings.format || 'A';
    var config = getFormatConfig({ format: format, deuceMode: settings.deuceMode || undefined, ...settings });
    var maxSets = config.setsToWin * 2 - 1;

    return {
      status: 'waiting',
      format: format,
      config: config,
      teamA: settings.teamA || 'Пара A',
      teamB: settings.teamB || 'Пара B',
      server: settings.server || 'A',
      initialServer: settings.server || 'A',
      sets: [{ gamesA: 0, gamesB: 0 }],
      setsWonA: 0,
      setsWonB: 0,
      currentSetIndex: 0,
      maxSets: maxSets,
      pointA: 0,
      pointB: 0,
      isTiebreak: false,
      isSuperTiebreak: false,
      isDeuce: false,
      isAdvantage: null,
      gameNumber: 1,
      totalGamesPlayed: 0,
      tiebreakPointsPlayed: 0,
      winner: null,
      matchStartTime: null,
      matchEndTime: null,
      lastEvent: null
    };
  }

  function isSetDecider(state) {
    var config = state.config;
    return state.currentSetIndex === config.setsToWin * 2 - 2 &&
           state.setsWonA === config.setsToWin - 1 &&
           state.setsWonB === config.setsToWin - 1;
  }

  function shouldBeSuperTiebreak(state) {
    return isSetDecider(state) && state.config.thirdSetType === 'superTiebreak';
  }

  function isTiebreakScore(state) {
    var currentSet = state.sets[state.currentSetIndex];
    var gps = state.config.gamesPerSet;
    return state.config.tiebreakAtDeuce &&
           currentSet.gamesA === gps &&
           currentSet.gamesB === gps;
  }

  function switchServer(state) {
    state.server = state.server === 'A' ? 'B' : 'A';
  }

  function scorePoint(state, team) {
    state = deepClone(state);
    if (state.status === 'finished' || state.status === 'waiting') {
      return state;
    }

    var other = team === 'A' ? 'B' : 'A';

    if (state.isSuperTiebreak) {
      return scoreSuperTiebreakPoint(state, team, other);
    }
    if (state.isTiebreak) {
      return scoreTiebreakPoint(state, team, other);
    }
    return scoreNormalPoint(state, team, other);
  }

  function scoreNormalPoint(state, team, other) {
    var config = state.config;
    var pKey = 'point' + team;
    var pOther = 'point' + other;

    if (state.isAdvantage === team) {
      return winGame(state, team);
    }
    if (state.isAdvantage === other) {
      state.isAdvantage = null;
      state.isDeuce = true;
      state.lastEvent = { type: 'deuce' };
      return state;
    }

    if (state[pKey] === 40 && state[pOther] === 40) {
      if (config.deuceMode === 'golden') {
        return winGame(state, team);
      }
      state.isAdvantage = team;
      state.isDeuce = false;
      state.lastEvent = { type: 'advantage', team: team };
      return state;
    }

    if (state[pKey] === 40) {
      return winGame(state, team);
    }

    var idx = POINTS.indexOf(state[pKey]);
    state[pKey] = POINTS[idx + 1];

    if (state[pKey] === 40 && state[pOther] === 40) {
      state.isDeuce = true;
    }

    state.lastEvent = { type: 'point', team: team };
    return state;
  }

  function scoreTiebreakPoint(state, team, other) {
    var pKey = 'point' + team;
    var pOther = 'point' + other;
    state[pKey]++;
    state.tiebreakPointsPlayed++;

    var tbTo = state.config.tiebreakTo;
    if (state[pKey] >= tbTo && state[pKey] - state[pOther] >= 2) {
      return winGame(state, team);
    }

    if (state.tiebreakPointsPlayed === 1 ||
        (state.tiebreakPointsPlayed > 1 && (state.tiebreakPointsPlayed - 1) % 2 === 0)) {
      switchServer(state);
    }

    state.lastEvent = { type: 'point', team: team };
    return state;
  }

  function scoreSuperTiebreakPoint(state, team, other) {
    var pKey = 'point' + team;
    var pOther = 'point' + other;
    state[pKey]++;
    state.tiebreakPointsPlayed++;

    if (state[pKey] >= 10 && state[pKey] - state[pOther] >= 2) {
      return winSet(state, team);
    }

    if (state.tiebreakPointsPlayed === 1 ||
        (state.tiebreakPointsPlayed > 1 && (state.tiebreakPointsPlayed - 1) % 2 === 0)) {
      switchServer(state);
    }

    state.lastEvent = { type: 'point', team: team };
    return state;
  }

  function winGame(state, team) {
    var currentSet = state.sets[state.currentSetIndex];
    var gKey = 'games' + team;
    currentSet[gKey]++;
    state.totalGamesPlayed++;

    state.lastEvent = { type: 'game', team: team };

    resetPoints(state);
    switchServer(state);

    var config = state.config;
    var gA = currentSet.gamesA;
    var gB = currentSet.gamesB;
    var gps = config.gamesPerSet;

    if (state.isTiebreak) {
      state.isTiebreak = false;
      return winSet(state, team);
    }

    if (gA >= gps && gA - gB >= 2) {
      return winSet(state, 'A');
    }
    if (gB >= gps && gB - gA >= 2) {
      return winSet(state, 'B');
    }

    if (config.tiebreakAtDeuce && gA === gps && gB === gps) {
      if (shouldBeSuperTiebreak(state)) {
        state.isSuperTiebreak = true;
        state.tiebreakPointsPlayed = 0;
        state.lastEvent = { type: 'superTiebreakStart' };
      } else {
        state.isTiebreak = true;
        state.tiebreakPointsPlayed = 0;
        state.lastEvent = { type: 'tiebreakStart' };
      }
    }

    return state;
  }

  function winSet(state, team) {
    var sKey = 'setsWon' + team;
    state[sKey]++;
    state.lastEvent = { type: 'set', team: team, setIndex: state.currentSetIndex };

    if (state[sKey] >= state.config.setsToWin) {
      state.winner = team;
      state.status = 'finished';
      state.matchEndTime = Date.now();
      state.lastEvent = { type: 'match', team: team };
      return state;
    }

    state.currentSetIndex++;
    state.sets.push({ gamesA: 0, gamesB: 0 });
    resetPoints(state);
    state.isTiebreak = false;
    state.isSuperTiebreak = false;

    if (shouldBeSuperTiebreak(state)) {
      state.isSuperTiebreak = true;
      state.tiebreakPointsPlayed = 0;
    }

    return state;
  }

  function resetPoints(state) {
    state.pointA = 0;
    state.pointB = 0;
    state.isDeuce = false;
    state.isAdvantage = null;
    state.tiebreakPointsPlayed = 0;
  }

  function startMatch(state) {
    state = deepClone(state);
    state.status = 'in_progress';
    state.matchStartTime = Date.now();
    state.initialServer = state.server;
    return state;
  }

  function updateSettings(state, settings) {
    state = deepClone(state);
    if (settings.teamA != null) state.teamA = settings.teamA;
    if (settings.teamB != null) state.teamB = settings.teamB;
    if (settings.server != null) {
      state.server = settings.server;
      state.initialServer = settings.server;
    }
    if (settings.format != null) {
      state.format = settings.format;
      state.config = getFormatConfig(settings);
      state.maxSets = state.config.setsToWin * 2 - 1;
    }
    if (settings.deuceMode != null) {
      state.config.deuceMode = settings.deuceMode;
    }
    return state;
  }

  function getDisplayScore(state) {
    var display = {
      teamA: state.teamA,
      teamB: state.teamB,
      server: state.server,
      status: state.status,
      winner: state.winner,
      isTiebreak: state.isTiebreak,
      isSuperTiebreak: state.isSuperTiebreak,
      format: state.format,
      formatName: state.config.name,
      currentSet: state.currentSetIndex + 1,
      totalSets: state.maxSets,
      setsWonA: state.setsWonA,
      setsWonB: state.setsWonB,
      sets: [],
      matchStartTime: state.matchStartTime,
      matchEndTime: state.matchEndTime,
      lastEvent: state.lastEvent
    };

    for (var i = 0; i < state.sets.length; i++) {
      display.sets.push({
        gamesA: state.sets[i].gamesA,
        gamesB: state.sets[i].gamesB,
        isCurrentSet: i === state.currentSetIndex
      });
    }

    if (state.isTiebreak || state.isSuperTiebreak) {
      display.pointA = state.pointA;
      display.pointB = state.pointB;
      display.isDeuce = false;
      display.isAdvantage = null;
    } else {
      display.pointA = formatPoint(state.pointA);
      display.pointB = formatPoint(state.pointB);
      display.isDeuce = state.isDeuce;
      display.isAdvantage = state.isAdvantage;
    }

    return display;
  }

  function formatPoint(p) {
    if (p === 0) return '0';
    if (p === 15) return '15';
    if (p === 30) return '30';
    if (p === 40) return '40';
    return String(p);
  }

  return {
    FORMATS: FORMATS,
    createMatch: createMatch,
    scorePoint: scorePoint,
    startMatch: startMatch,
    updateSettings: updateSettings,
    getDisplayScore: getDisplayScore,
    deepClone: deepClone
  };
});
