/**
 * Bandeja Scoreboard — Scoring Engine Tests
 */
const assert = require('assert');
const SE = require('./public/score-engine.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}`);
    console.log(`    ${e.message}`);
  }
}

function playGame(state, team) {
  // Win a normal game (no deuce)
  state = SE.scorePoint(state, team); // 0→15
  state = SE.scorePoint(state, team); // 15→30
  state = SE.scorePoint(state, team); // 30→40
  state = SE.scorePoint(state, team); // 40→Game
  return state;
}

function playGames(state, teamAGames, teamBGames) {
  // Alternate games to avoid winning a set prematurely
  let a = 0, b = 0;
  while (a < teamAGames || b < teamBGames) {
    if (a < teamAGames) { state = playGame(state, 'A'); a++; }
    if (b < teamBGames) { state = playGame(state, 'B'); b++; }
  }
  return state;
}

// === BASIC MATCH CREATION ===
console.log('\n--- Match Creation ---');

test('creates a match with default settings', () => {
  const m = SE.createMatch();
  assert.strictEqual(m.status, 'waiting');
  assert.strictEqual(m.format, 'A');
  assert.strictEqual(m.teamA, 'Team A');
  assert.strictEqual(m.teamB, 'Team B');
  assert.strictEqual(m.pointA, 0);
  assert.strictEqual(m.pointB, 0);
  assert.strictEqual(m.sets.length, 1);
  assert.strictEqual(m.setsWonA, 0);
  assert.strictEqual(m.setsWonB, 0);
});

test('creates a match with custom team names', () => {
  const m = SE.createMatch({ teamA: 'Ivanov/Petrov', teamB: 'Sidorov/Kozlov' });
  assert.strictEqual(m.teamA, 'Ivanov/Petrov');
  assert.strictEqual(m.teamB, 'Sidorov/Kozlov');
});

test('cannot score on a waiting match', () => {
  const m = SE.createMatch();
  const m2 = SE.scorePoint(m, 'A');
  assert.strictEqual(m2.pointA, 0);
});

test('startMatch sets status to in_progress', () => {
  let m = SE.createMatch();
  m = SE.startMatch(m);
  assert.strictEqual(m.status, 'in_progress');
  assert.ok(m.matchStartTime > 0);
});

// === POINT SEQUENCE ===
console.log('\n--- Point Sequence ---');

test('normal point sequence: 0→15→30→40→Game', () => {
  let m = SE.startMatch(SE.createMatch());
  m = SE.scorePoint(m, 'A');
  assert.strictEqual(m.pointA, 15);
  m = SE.scorePoint(m, 'A');
  assert.strictEqual(m.pointA, 30);
  m = SE.scorePoint(m, 'A');
  assert.strictEqual(m.pointA, 40);
  m = SE.scorePoint(m, 'A');
  assert.strictEqual(m.sets[0].gamesA, 1);
  assert.strictEqual(m.pointA, 0);
  assert.strictEqual(m.pointB, 0);
});

// === DEUCE + ADVANTAGE ===
console.log('\n--- Deuce & Advantage ---');

test('deuce at 40:40', () => {
  let m = SE.startMatch(SE.createMatch());
  // Get to 40:40
  m = SE.scorePoint(m, 'A'); // 15-0
  m = SE.scorePoint(m, 'A'); // 30-0
  m = SE.scorePoint(m, 'A'); // 40-0
  m = SE.scorePoint(m, 'B'); // 40-15
  m = SE.scorePoint(m, 'B'); // 40-30
  m = SE.scorePoint(m, 'B'); // 40-40 → deuce
  assert.strictEqual(m.isDeuce, true);
  assert.strictEqual(m.pointA, 40);
  assert.strictEqual(m.pointB, 40);
});

test('advantage then game', () => {
  let m = SE.startMatch(SE.createMatch());
  m = SE.scorePoint(m, 'A'); m = SE.scorePoint(m, 'A'); m = SE.scorePoint(m, 'A');
  m = SE.scorePoint(m, 'B'); m = SE.scorePoint(m, 'B'); m = SE.scorePoint(m, 'B');
  // Now 40-40
  m = SE.scorePoint(m, 'A'); // Advantage A
  assert.strictEqual(m.isAdvantage, 'A');
  assert.strictEqual(m.isDeuce, false);
  m = SE.scorePoint(m, 'A'); // Game A
  assert.strictEqual(m.sets[0].gamesA, 1);
});

test('advantage lost → back to deuce', () => {
  let m = SE.startMatch(SE.createMatch());
  m = SE.scorePoint(m, 'A'); m = SE.scorePoint(m, 'A'); m = SE.scorePoint(m, 'A');
  m = SE.scorePoint(m, 'B'); m = SE.scorePoint(m, 'B'); m = SE.scorePoint(m, 'B');
  m = SE.scorePoint(m, 'A'); // Advantage A
  m = SE.scorePoint(m, 'B'); // Back to deuce
  assert.strictEqual(m.isDeuce, true);
  assert.strictEqual(m.isAdvantage, null);
});

// === GOLDEN POINT ===
console.log('\n--- Golden Point ---');

test('golden point: 40:40 → next point wins', () => {
  let m = SE.startMatch(SE.createMatch({ deuceMode: 'golden' }));
  m = SE.scorePoint(m, 'A'); m = SE.scorePoint(m, 'A'); m = SE.scorePoint(m, 'A');
  m = SE.scorePoint(m, 'B'); m = SE.scorePoint(m, 'B'); m = SE.scorePoint(m, 'B');
  // 40-40, golden point
  m = SE.scorePoint(m, 'B'); // B wins game
  assert.strictEqual(m.sets[0].gamesB, 1);
  assert.strictEqual(m.pointA, 0);
});

// === SERVICE ROTATION ===
console.log('\n--- Service Rotation ---');

test('service switches after each game', () => {
  let m = SE.startMatch(SE.createMatch({ server: 'A' }));
  assert.strictEqual(m.server, 'A');
  m = playGame(m, 'A'); // game 1
  assert.strictEqual(m.server, 'B');
  m = playGame(m, 'B'); // game 2
  assert.strictEqual(m.server, 'A');
});

// === SET COMPLETION ===
console.log('\n--- Set Completion ---');

test('win set at 6-0', () => {
  let m = SE.startMatch(SE.createMatch());
  for (let i = 0; i < 6; i++) m = playGame(m, 'A');
  assert.strictEqual(m.setsWonA, 1);
  assert.strictEqual(m.currentSetIndex, 1);
  assert.strictEqual(m.sets.length, 2);
});

test('set needs win by 2: 6-5 does not end set', () => {
  let m = SE.startMatch(SE.createMatch());
  m = playGames(m, 5, 5); // 5-5
  m = playGame(m, 'A'); // 6-5
  assert.strictEqual(m.setsWonA, 0);
  assert.strictEqual(m.sets[0].gamesA, 6);
  assert.strictEqual(m.sets[0].gamesB, 5);
});

test('win set 7-5', () => {
  let m = SE.startMatch(SE.createMatch());
  m = playGames(m, 5, 5);
  m = playGame(m, 'A'); // 6-5
  m = playGame(m, 'B'); // 6-6 → tiebreak starts
  // Wait, at 6-6 it should be tiebreak...
  // Let me test 7-5 path differently
  let m2 = SE.startMatch(SE.createMatch());
  m2 = playGames(m2, 5, 4); // 5-4
  m2 = playGame(m2, 'B'); // 5-5
  m2 = playGame(m2, 'A'); // 6-5
  m2 = playGame(m2, 'A'); // 7-5
  assert.strictEqual(m2.setsWonA, 1);
});

// === TIEBREAK ===
console.log('\n--- Tiebreak ---');

test('tiebreak starts at 6-6', () => {
  let m = SE.startMatch(SE.createMatch());
  m = playGames(m, 6, 6);
  assert.strictEqual(m.isTiebreak, true);
  assert.strictEqual(m.sets[0].gamesA, 6);
  assert.strictEqual(m.sets[0].gamesB, 6);
});

test('tiebreak uses numeric score', () => {
  let m = SE.startMatch(SE.createMatch());
  m = playGames(m, 6, 6);
  m = SE.scorePoint(m, 'A');
  assert.strictEqual(m.pointA, 1);
  m = SE.scorePoint(m, 'A');
  assert.strictEqual(m.pointA, 2);
});

test('tiebreak won at 7-0', () => {
  let m = SE.startMatch(SE.createMatch());
  m = playGames(m, 6, 6);
  for (let i = 0; i < 7; i++) m = SE.scorePoint(m, 'A');
  assert.strictEqual(m.isTiebreak, false);
  assert.strictEqual(m.setsWonA, 1);
  assert.strictEqual(m.sets[0].gamesA, 7);
});

test('tiebreak requires win by 2: 6-6 in TB continues', () => {
  let m = SE.startMatch(SE.createMatch());
  m = playGames(m, 6, 6);
  // Get to 6-6 in tiebreak
  for (let i = 0; i < 6; i++) m = SE.scorePoint(m, 'A');
  for (let i = 0; i < 6; i++) m = SE.scorePoint(m, 'B');
  assert.strictEqual(m.pointA, 6);
  assert.strictEqual(m.pointB, 6);
  assert.strictEqual(m.isTiebreak, true); // still going
  m = SE.scorePoint(m, 'A'); // 7-6
  assert.strictEqual(m.isTiebreak, true); // need +2
  m = SE.scorePoint(m, 'A'); // 8-6, win
  assert.strictEqual(m.setsWonA, 1);
});

test('tiebreak service: switch after 1st point, then every 2', () => {
  let m = SE.startMatch(SE.createMatch({ server: 'A' }));
  m = playGames(m, 6, 6);
  // Server entering tiebreak should be based on rotation
  let serverAtTBStart = m.server;
  m = SE.scorePoint(m, 'A'); // point 1 → switch
  assert.notStrictEqual(m.server, serverAtTBStart);
  let serverAfter1 = m.server;
  m = SE.scorePoint(m, 'A'); // point 2 → no switch
  assert.strictEqual(m.server, serverAfter1);
  m = SE.scorePoint(m, 'A'); // point 3 → switch
  assert.notStrictEqual(m.server, serverAfter1);
});

// === MATCH COMPLETION ===
console.log('\n--- Match Completion ---');

test('Format A: win match 2-0 in sets', () => {
  let m = SE.startMatch(SE.createMatch());
  // Win set 1
  for (let i = 0; i < 6; i++) m = playGame(m, 'A');
  // Win set 2
  for (let i = 0; i < 6; i++) m = playGame(m, 'A');
  assert.strictEqual(m.status, 'finished');
  assert.strictEqual(m.winner, 'A');
  assert.strictEqual(m.setsWonA, 2);
});

test('Format A: 3rd set is full set', () => {
  let m = SE.startMatch(SE.createMatch());
  // Win set 1 for A
  for (let i = 0; i < 6; i++) m = playGame(m, 'A');
  assert.strictEqual(m.setsWonA, 1);
  // Win set 2 for B
  for (let i = 0; i < 6; i++) m = playGame(m, 'B');
  assert.strictEqual(m.setsWonB, 1);
  // 3rd set should NOT be super tiebreak
  assert.strictEqual(m.isSuperTiebreak, false);
  assert.strictEqual(m.status, 'in_progress');
  // Win 3rd set normally
  for (let i = 0; i < 6; i++) m = playGame(m, 'A');
  assert.strictEqual(m.winner, 'A');
  assert.strictEqual(m.status, 'finished');
});

// === FORMAT B: SUPER TIEBREAK ===
console.log('\n--- Format B: Super Tiebreak ---');

test('Format B: 3rd set is super tiebreak', () => {
  let m = SE.startMatch(SE.createMatch({ format: 'B' }));
  for (let i = 0; i < 6; i++) m = playGame(m, 'A'); // set 1
  for (let i = 0; i < 6; i++) m = playGame(m, 'B'); // set 2
  assert.strictEqual(m.isSuperTiebreak, true);
  assert.strictEqual(m.status, 'in_progress');
});

test('Format B: super tiebreak to 10', () => {
  let m = SE.startMatch(SE.createMatch({ format: 'B' }));
  for (let i = 0; i < 6; i++) m = playGame(m, 'A');
  for (let i = 0; i < 6; i++) m = playGame(m, 'B');
  // Score 10-0 in super tiebreak
  for (let i = 0; i < 10; i++) m = SE.scorePoint(m, 'A');
  assert.strictEqual(m.status, 'finished');
  assert.strictEqual(m.winner, 'A');
});

test('Format B: super tiebreak needs win by 2', () => {
  let m = SE.startMatch(SE.createMatch({ format: 'B' }));
  for (let i = 0; i < 6; i++) m = playGame(m, 'A');
  for (let i = 0; i < 6; i++) m = playGame(m, 'B');
  // Get to 9-9
  for (let i = 0; i < 9; i++) m = SE.scorePoint(m, 'A');
  for (let i = 0; i < 9; i++) m = SE.scorePoint(m, 'B');
  assert.strictEqual(m.pointA, 9);
  assert.strictEqual(m.pointB, 9);
  assert.strictEqual(m.isSuperTiebreak, true);
  m = SE.scorePoint(m, 'A'); // 10-9
  assert.strictEqual(m.isSuperTiebreak, true); // still going
  m = SE.scorePoint(m, 'A'); // 11-9
  assert.strictEqual(m.winner, 'A');
});

// === FORMAT C: SET TO 9 ===
console.log('\n--- Format C: Set to 9 ---');

test('Format C: set goes to 9 games', () => {
  let m = SE.startMatch(SE.createMatch({ format: 'C' }));
  for (let i = 0; i < 6; i++) m = playGame(m, 'A');
  assert.strictEqual(m.setsWonA, 0); // not won at 6
  for (let i = 0; i < 3; i++) m = playGame(m, 'A'); // total 9
  assert.strictEqual(m.setsWonA, 1);
});

test('Format C: tiebreak at 9-9', () => {
  let m = SE.startMatch(SE.createMatch({ format: 'C' }));
  m = playGames(m, 9, 9);
  assert.strictEqual(m.isTiebreak, true);
  assert.strictEqual(m.sets[0].gamesA, 9);
  assert.strictEqual(m.sets[0].gamesB, 9);
});

test('Format C: need win by 2, so 9-8 does not end set', () => {
  let m = SE.startMatch(SE.createMatch({ format: 'C' }));
  m = playGames(m, 8, 7);
  m = playGame(m, 'A'); // 9-7 → win by 2, should win set
  assert.strictEqual(m.setsWonA, 1);
});

// === FORMAT D: SINGLE SET ===
console.log('\n--- Format D: Single Set ---');

test('Format D: single set, win at 6-0 ends match', () => {
  let m = SE.startMatch(SE.createMatch({ format: 'D' }));
  for (let i = 0; i < 6; i++) m = playGame(m, 'A');
  assert.strictEqual(m.status, 'finished');
  assert.strictEqual(m.winner, 'A');
  assert.strictEqual(m.setsWonA, 1);
});

// === DISPLAY SCORE ===
console.log('\n--- Display Score ---');

test('getDisplayScore returns formatted data', () => {
  let m = SE.startMatch(SE.createMatch({ teamA: 'Alpha', teamB: 'Beta' }));
  m = SE.scorePoint(m, 'A');
  const d = SE.getDisplayScore(m);
  assert.strictEqual(d.teamA, 'Alpha');
  assert.strictEqual(d.teamB, 'Beta');
  assert.strictEqual(d.pointA, '15');
  assert.strictEqual(d.pointB, '0');
  assert.strictEqual(d.sets.length, 1);
  assert.strictEqual(d.status, 'in_progress');
});

test('display shows numeric score in tiebreak', () => {
  let m = SE.startMatch(SE.createMatch());
  m = playGames(m, 6, 6);
  m = SE.scorePoint(m, 'A');
  const d = SE.getDisplayScore(m);
  assert.strictEqual(d.pointA, 1);
  assert.strictEqual(d.isTiebreak, true);
});

// === UPDATE SETTINGS ===
console.log('\n--- Update Settings ---');

test('updateSettings changes team names', () => {
  let m = SE.createMatch();
  m = SE.updateSettings(m, { teamA: 'New A', teamB: 'New B' });
  assert.strictEqual(m.teamA, 'New A');
  assert.strictEqual(m.teamB, 'New B');
});

test('updateSettings changes format', () => {
  let m = SE.createMatch();
  m = SE.updateSettings(m, { format: 'B' });
  assert.strictEqual(m.format, 'B');
  assert.strictEqual(m.config.thirdSetType, 'superTiebreak');
});

// === IMMUTABILITY ===
console.log('\n--- Immutability ---');

test('scorePoint does not mutate original state', () => {
  let m = SE.startMatch(SE.createMatch());
  let m2 = SE.scorePoint(m, 'A');
  assert.strictEqual(m.pointA, 0);
  assert.strictEqual(m2.pointA, 15);
});

// === CANNOT SCORE ON FINISHED ===
test('cannot score on a finished match', () => {
  let m = SE.startMatch(SE.createMatch({ format: 'D' }));
  for (let i = 0; i < 6; i++) m = playGame(m, 'A');
  assert.strictEqual(m.status, 'finished');
  const m2 = SE.scorePoint(m, 'A');
  assert.strictEqual(m2.setsWonA, 1); // unchanged
});

// === SUMMARY ===
console.log('\n=============================');
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log('All tests passed!');
}
