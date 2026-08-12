import { describe, expect, it } from 'vitest';
import { allowedRoundCounts, applyGuess, hintLevelAt, isFinalRound, projectRoom, rankPlayers, roundCompletionState, validateMatchConfig } from './multiplayerRules';

const song = (id) => ({ id, title: id, staffPeople: [id], staffDisplay: id, releaseMonth: '2020-01', singerMembers: ['洛天依'], singersDisplay: '洛天依', voicebankMembers: ['VOCALOID'], voicebanksDisplay: 'VOCALOID', concertCount: 0, special: '单曲', lyrics: '歌词' });

it('按人数限制轮数并校验曲库数量', () => {
  expect(allowedRoundCounts(2)).toEqual([1, 3, 5]);
  expect(allowedRoundCounts(4)).toEqual([3, 5, 7]);
  expect(validateMatchConfig({ capacity: 3, roundCount: 3, songCount: 2 })).toBeTruthy();
  expect(validateMatchConfig({ capacity: 3, roundCount: 3, songCount: 3 })).toBeNull();
});

it('提示在 60、120、150 秒依次解锁', () => {
  expect([0, 59_999, 60_000, 120_000, 150_000].map((ms) => hintLevelAt(1000, 1000 + ms))).toEqual([0, 0, 1, 2, 3]);
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
    { id: 'a', nickname: '甲', joinOrder: 0, online: true, score: 0, roundScore: 0, guesses: [] },
    { id: 'b', nickname: '乙', joinOrder: 1, online: true, score: 0, roundScore: 0, guesses: [{ song: song('secret'), feedback: { isCorrect: false }, receivedAt: 1 }] },
  ] };
  const opponentGuess = projectRoom(room, 'a').players[1].guesses[0];
  expect(opponentGuess).toMatchObject({ index: 1, receivedAt: 1, isCorrect: false, feedback: { isCorrect: false, staff: { state: 'miss' }, special: { state: 'miss' } } });
  expect(JSON.stringify(opponentGuess)).not.toContain('secret');
});

it('当前轮数达到总轮数时视为最后一轮', () => {
  expect(isFinalRound(2, 3)).toBe(false);
  expect(isFinalRound(3, 3)).toBe(true);
  expect(roundCompletionState(2, 3, 1000)).toEqual({ phase: 'round-result', nextRoundAt: 11_000 });
  expect(roundCompletionState(3, 3, 1000)).toEqual({ phase: 'finished', nextRoundAt: null });
});
