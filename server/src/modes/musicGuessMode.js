import crypto from 'node:crypto';
import { MUSIC_GUESS_CLIP_MANIFEST } from '../../../web/src/data/musicGuessManifest.js';
import {
  MUSIC_GUESS_MODE,
  MUSIC_GUESS_REVEAL_DURATION_MS,
  MUSIC_GUESS_ROUND_DURATION_MS,
  MULTIPLAYER_PROTOCOL_VERSION,
  SCORE_BY_PLACE,
  playerSeatFor,
  rankPlayers,
  resolvedPlayerColor,
} from '../../../web/src/services/multiplayerRules.js';

function randomItem(items) { return items[crypto.randomInt(items.length)]; }

function trackFromClip(clip) {
  const fileName = clip.fileName || clip.clipFile;
  return {
    id: `local-${fileName}`,
    name: String(clip.sourceName || fileName || '').replace(/\.mp3$/iu, '').trim(),
    clipFileName: fileName,
    clipDurationSeconds: Number(clip.durationSeconds) || 15,
    sourceKey: clip.sourceKey || fileName,
  };
}

const TRACKS = MUSIC_GUESS_CLIP_MANIFEST.map(trackFromClip).filter((track) => track.id && track.name && track.clipFileName);
const TRACK_BY_ID = new Map(TRACKS.map((track) => [track.id, track]));
const MUSIC_PLAYLIST_GROUPS = Object.freeze({
  vsinger: ['luotianyi', 'yuezhengling', 'yanhe', 'longya', 'moqingxian', 'zhiyu-moke'],
  'five-dimension': ['xingchen', 'haiyi', 'chiyu', 'cangqiong', 'shian', 'yongye', 'muxing'],
  wangchuan: ['wangchuan'],
});

function publicTrack(track) {
  return track ? { id: track.id, name: track.name, clipFileName: track.clipFileName, clipDurationSeconds: track.clipDurationSeconds } : null;
}

function tracksForSelection(selection) {
  const selectedIds = new Set(Array.isArray(selection?.musicPlaylistIds) ? selection.musicPlaylistIds : []);
  if (!selectedIds.size || selectedIds.has('all')) return TRACKS;
  const expandedIds = new Set(selectedIds);
  selectedIds.forEach((id) => MUSIC_PLAYLIST_GROUPS[id]?.forEach((playlistId) => expandedIds.add(playlistId)));
  const seen = new Set();
  return MUSIC_GUESS_CLIP_MANIFEST
    .filter((clip) => (clip.playlistIds || []).some((id) => expandedIds.has(id)))
    .map(trackFromClip)
    .filter((track) => {
      if (!track.id || !track.name || !track.clipFileName || seen.has(track.id)) return false;
      seen.add(track.id);
      return true;
    });
}

function selectionForRoom(room) {
  if (room.mode === 'party') return room.stages?.[room.partyStageIndex]?.selection ?? room.selection;
  return room.selection;
}

export function initialMusicGuessState() {
  return {
    musicUsedTrackIds: [],
    musicGuessRound: null,
    startedAt: null,
    endsAt: null,
    nextRoundAt: null,
  };
}

export class MusicGuessMode {
  constructor(session) { this.session = session; }

  get room() { return this.session.room; }
  get tracks() { return tracksForSelection(selectionForRoom(this.room)); }

  async handleCommand(player, message, socket) {
    if (message.type === 'start_match') { await this.startMatch(player, socket); return true; }
    if (message.type === 'submit_music_guess') { await this.submitGuess(player, message.trackId, socket); return true; }
    return false;
  }

  async startMatch(player, socket) {
    if (player.id !== this.room.hostId) return this.session.sendError(socket, '只有房主可以开始游戏');
    if (this.room.phase !== 'waiting') return this.session.sendError(socket, '游戏已经开始');
    if (!this.room.players.length) return this.session.sendError(socket, '至少需要一名玩家才能开始');
    if (this.tracks.length < 4) return this.session.sendError(socket, '当前听歌识曲曲库至少需要 4 个可用片段');
    await this.startRound();
  }

  async startRound() {
    const tracks = this.tracks;
    const unused = tracks.filter((track) => !(this.room.musicUsedTrackIds ?? []).includes(track.id));
    const source = unused.length >= 4 ? unused : tracks;
    const answer = randomItem(source);
    const distractors = source.filter((track) => track.id !== answer.id);
    const options = [answer, ...distractors.sort(() => crypto.randomInt(3) - 1).slice(0, 3)];
    while (options.length < 4) {
      const fallback = randomItem(tracks.filter((track) => !options.some((item) => item.id === track.id)));
      if (!fallback) break;
      options.push(fallback);
    }
    const now = Date.now();
    Object.assign(this.room, {
      roundNumber: this.room.roundNumber + 1,
      phase: 'playing',
      musicUsedTrackIds: [...new Set([...(this.room.musicUsedTrackIds ?? []), answer.id])],
      musicGuessRound: { answerId: answer.id, clipFileName: answer.clipFileName, options: options.map(publicTrack) },
      startedAt: now,
      endsAt: now + MUSIC_GUESS_ROUND_DURATION_MS,
      nextRoundAt: null,
    });
    this.room.players.forEach((item) => Object.assign(item, {
      roundScore: 0,
      musicGuessId: null,
      musicGuessCorrect: null,
      musicAnsweredAt: null,
    }));
    await this.session.save();
    this.session.broadcast();
  }

  async submitGuess(player, trackId, socket) {
    if (this.room.phase !== 'playing') return this.session.sendError(socket, '当前不能选择答案');
    if (Date.now() >= this.room.endsAt) return this.session.sendError(socket, '本轮已经结束');
    if (player.musicGuessId) return this.session.sendError(socket, '本轮已经作答');
    const optionIds = this.room.musicGuessRound?.options.map((track) => track.id) ?? [];
    if (!optionIds.includes(trackId) || !this.tracks.some((track) => track.id === trackId)) return this.session.sendError(socket, '歌曲选择无效');
    const correct = trackId === this.room.musicGuessRound.answerId;
    const correctCount = this.room.players.filter((item) => item.roundScore > 0).length;
    const points = correct ? (SCORE_BY_PLACE[correctCount] ?? 0) : 0;
    Object.assign(player, { musicGuessId: trackId, musicGuessCorrect: correct, musicAnsweredAt: Date.now(), roundScore: points });
    player.score += points;
    if (this.room.players.every((item) => item.musicGuessId)) await this.revealRound();
    else { await this.session.save(); this.session.broadcast(); }
  }

  async revealRound() {
    if (this.room.phase !== 'playing') return;
    this.room.phase = 'round-result';
    this.room.nextRoundAt = Date.now() + MUSIC_GUESS_REVEAL_DURATION_MS;
    await this.session.save();
    this.session.broadcast();
  }

  async finishMatch() {
    this.room.phase = 'finished';
    this.room.nextRoundAt = null;
    await this.session.save();
    this.session.broadcast();
  }

  async tick(now) {
    if (this.room.phase === 'playing' && now >= this.room.endsAt) await this.revealRound();
    else if (this.room.phase === 'round-result' && now >= this.room.nextRoundAt) {
      if (this.room.roundNumber >= this.room.roundCount) await this.finishMatch();
      else await this.startRound();
    }
  }

  addScheduleTimes(times) {
    if (this.room.phase === 'playing') times.push(this.room.endsAt);
    if (this.room.phase === 'round-result') times.push(this.room.nextRoundAt);
  }

  project(viewerId) {
    const reveal = ['round-result', 'finished'].includes(this.room.phase);
    const answer = TRACK_BY_ID.get(this.room.musicGuessRound?.answerId);
    const commonPlayer = (player) => ({
      id: player.id, nickname: player.nickname, joinOrder: player.joinOrder, seatIndex: player.seatIndex,
      seat: playerSeatFor(player.seatIndex ?? player.joinOrder), colorId: resolvedPlayerColor(player)?.id ?? null,
      color: resolvedPlayerColor(player), online: player.online, score: player.score, roundScore: player.roundScore,
      answered: Boolean(player.musicGuessId), selectedId: player.id === viewerId || reveal ? player.musicGuessId : null,
      correct: reveal ? player.musicGuessCorrect : null, solved: player.roundScore > 0,
    });
    return {
      protocolVersion: MULTIPLAYER_PROTOCOL_VERSION, mode: MUSIC_GUESS_MODE, code: this.room.code,
      phase: this.room.phase, capacity: this.room.capacity, roundCount: this.room.roundCount,
      roundNumber: this.room.roundNumber, hostId: this.room.hostId, poolName: this.room.poolName,
      selection: this.room.selection, startedAt: this.room.startedAt, endsAt: this.room.endsAt,
      nextRoundAt: this.room.nextRoundAt,
      musicGuessRound: this.room.musicGuessRound ? {
        clipFileName: this.room.musicGuessRound.clipFileName,
        options: this.room.musicGuessRound.options,
        answerId: reveal ? this.room.musicGuessRound.answerId : null,
        answer: reveal ? publicTrack(answer) : null,
      } : null,
      players: this.room.players.map(commonPlayer),
      ranking: this.room.phase === 'finished' ? rankPlayers(this.room.players).map((player) => ({
        id: player.id, nickname: player.nickname, score: player.score, rank: player.rank, seatIndex: player.seatIndex,
        seat: playerSeatFor(player.seatIndex ?? player.joinOrder), colorId: resolvedPlayerColor(player)?.id ?? null,
        color: resolvedPlayerColor(player),
      })) : null,
      serverNow: Date.now(),
    };
  }
}
