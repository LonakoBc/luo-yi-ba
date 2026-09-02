import { describe, expect, it } from 'vitest';
import { PLAYER_COLORS, PLAYER_SEATS, ROUND_DURATION_MS, SENIORITY_MODE, SORTING_MODE, TRIATHLON_MODE, allowedRoundCounts, applyGuess, hintLevelAt, isFinalRound, playerColorFor, playerSeatFor, projectRoom, rankPlayers, roundCompletionState, scoreSortingTimeline, seniorityChoiceScore, seniorityDifficultyForRound, sortingRoundScores, validateMatchConfig } from './multiplayerRules';

const song = (id) => ({ id, title: id, staffPeople: [id], staffDisplay: id, releaseMonth: '2020-01', singerMembers: ['洛天依'], singersDisplay: '洛天依', voicebankMembers: ['VOCALOID'], voicebanksDisplay: 'VOCALOID', concertCount: 0, special: '单曲', lyrics: '歌词' });

it('按人数限制轮数并校验曲库数量', () => {
  expect(allowedRoundCounts(2)).toEqual([1, 3, 5]);
  expect(allowedRoundCounts(4)).toEqual([3, 5, 7]);
  expect(validateMatchConfig({ capacity: 3, roundCount: 3, songCount: 2 })).toBeTruthy();
  expect(validateMatchConfig({ capacity: 3, roundCount: 3, songCount: 3 })).toBeNull();
  expect(allowedRoundCounts(2, SENIORITY_MODE)).toEqual([5, 10, 15]);
  expect(validateMatchConfig({ capacity: 4, roundCount: 10, songCount: 2, mode: SENIORITY_MODE })).toBeNull();
  expect(validateMatchConfig({ capacity: 4, roundCount: 3, songCount: 20, mode: SENIORITY_MODE })).toBeTruthy();
  expect(allowedRoundCounts(2, SORTING_MODE)).toEqual([3, 5, 7]);
  expect(validateMatchConfig({ capacity: 2, roundCount: 3, songCount: 15, mode: SORTING_MODE })).toBeNull();
  expect(validateMatchConfig({ capacity: 2, roundCount: 3, songCount: 14, mode: SORTING_MODE })).toBeTruthy();
  expect(allowedRoundCounts(4, TRIATHLON_MODE)).toEqual([9]);
  expect(validateMatchConfig({ capacity: 4, roundCount: 9, songCount: 5, mode: TRIATHLON_MODE })).toBeNull();
  expect(validateMatchConfig({ capacity: 4, roundCount: 3, songCount: 20, mode: TRIATHLON_MODE })).toBeTruthy();
});

it('老资历按答对顺序获得 5、4、3、2 分并随轮次加难', () => {
  expect([0, 1, 2, 3].map(seniorityChoiceScore)).toEqual([5, 4, 3, 2]);
  expect(seniorityDifficultyForRound(1, 15)).toMatchObject({ minYears: 2, maxYears: 3 });
  expect(seniorityDifficultyForRound(6, 15)).toMatchObject({ minYears: 1, maxYears: 2 });
  expect(seniorityDifficultyForRound(11, 15)).toMatchObject({ minYears: 0, maxYears: 1 });
});

it('排序按两两相对顺序计分，正确率并列同档且完全倒序不得分', () => {
  const answer = ['a', 'b', 'c', 'd', 'e'];
  expect(scoreSortingTimeline(answer, answer)).toEqual({ correctPairs: 10, totalPairs: 10, percentage: 100 });
  expect(scoreSortingTimeline([...answer].reverse(), answer)).toEqual({ correctPairs: 0, totalPairs: 10, percentage: 0 });
  expect(scoreSortingTimeline(['a', 'b'], answer)).toBeNull();
  const scores = sortingRoundScores([
    { id: 'a', joinOrder: 0, submitted: true, correctPairs: 10 },
    { id: 'b', joinOrder: 1, submitted: true, correctPairs: 10 },
    { id: 'c', joinOrder: 2, submitted: true, correctPairs: 8 },
    { id: 'd', joinOrder: 3, submitted: true, correctPairs: 0 },
  ]);
  expect([...scores.values()]).toEqual([5, 5, 2, 0]);
});

it('提供四个默认颜色和完整歌姬代表色候选', () => {
  expect(PLAYER_SEATS.map(({ number }) => number)).toEqual([1, 2, 3, 4]);
  expect(playerSeatFor(0)).toMatchObject({ number: 1 });
  expect(playerSeatFor(4)).toBeNull();
  expect(PLAYER_COLORS).toHaveLength(14);
  expect(playerColorFor('chiyu')).toMatchObject({ singerName: '赤羽', colorName: '赤羽红', color: '#EE6666' });
  expect(playerColorFor('cangqiong')).toMatchObject({ singerName: '苍穹', colorName: '苍穹绿', color: '#66CC99' });
  expect(playerColorFor('missing')).toBeNull();
});

it('提示在 30、60、75 秒依次解锁', () => {
  expect(ROUND_DURATION_MS).toBe(90_000);
  expect([0, 29_999, 30_000, 60_000, 75_000].map((ms) => hintLevelAt(1000, 1000 + ms))).toEqual([0, 0, 1, 2, 3]);
});

it('按到达顺序计分并拒绝截止时刻与重复答案', () => {
  const answer = song('answer');
  const player = { roundScore: 0, guesses: [] };
  expect(applyGuess({ player, song: answer, answer, receivedAt: 999, endsAt: 1000, correctCount: 0 }).points).toBe(5);
  expect(applyGuess({ player, song: answer, answer, receivedAt: 1000, endsAt: 1000, correctCount: 0 }).error).toBeTruthy();
  expect(applyGuess({ player: { ...player, guesses: [{ song: answer }] }, song: answer, answer, receivedAt: 999, endsAt: 1000, correctCount: 0 }).error).toBeTruthy();
});

it('总分相同时并列且对手猜测不泄露歌曲信息', () => {
  expect(rankPlayers([{ id: 'a', score: 5, joinOrder: 0 }, { id: 'b', score: 5, joinOrder: 1 }, { id: 'c', score: 2, joinOrder: 2 }]).map((p) => p.rank)).toEqual([1, 1, 3]);
  const room = { code: 'ABC234', phase: 'playing', capacity: 2, roundCount: 1, roundNumber: 1, hostId: 'a', poolName: '测试', startedAt: 0, endsAt: 100, nextRoundAt: null, hintLevel: 0, answer: song('answer'), players: [
    { id: 'a', nickname: '甲', joinOrder: 0, seatIndex: 0, colorId: 'chiyu', online: true, score: 0, roundScore: 0, guesses: [] },
    { id: 'b', nickname: '乙', joinOrder: 1, seatIndex: 1, colorId: 'shian', online: true, score: 0, roundScore: 0, guesses: [{ song: song('secret'), feedback: { isCorrect: false }, receivedAt: 1 }] },
  ] };
  const projection = projectRoom(room, 'a');
  expect(projection.players[0].seat).toEqual({ index: 0, number: 1 });
  expect(projection.players[1].seat).toEqual({ index: 1, number: 2 });
  expect(projection.players[0].color).toMatchObject({ id: 'chiyu', colorName: '赤羽红', color: '#EE6666' });
  expect(projection.players[1].color).toMatchObject({ id: 'shian', colorName: '诗岸金', color: '#F6C65B' });
  const opponentGuess = projection.players[1].guesses[0];
  expect(opponentGuess).toMatchObject({ index: 1, receivedAt: 1, isCorrect: false, feedback: { isCorrect: false, staff: { state: 'miss' }, special: { state: 'miss' } } });
  expect(JSON.stringify(opponentGuess)).not.toContain('secret');
});

it('当前轮数达到总轮数时视为最后一轮', () => {
  expect(isFinalRound(2, 3)).toBe(false);
  expect(isFinalRound(3, 3)).toBe(true);
  expect(roundCompletionState(2, 3, 1000)).toEqual({ phase: 'round-result', nextRoundAt: 11_000 });
  expect(roundCompletionState(3, 3, 1000)).toEqual({ phase: 'finished', nextRoundAt: null });
});
