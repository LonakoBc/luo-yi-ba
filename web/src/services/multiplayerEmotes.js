export const MULTIPLAYER_EMOTE_COOLDOWN_MS = 1_200;

export const MULTIPLAYER_EMOTES = Object.freeze([
  { id: 'luotianyi-hit', singer: '洛天依', label: '一发入魂', fileName: '1天依1_一发入魂.png' },
  { id: 'luotianyi-clueless', singer: '洛天依', label: '完全不会', fileName: '1天依2_完全不会....png' },
  { id: 'yuezhengling-steady', singer: '乐正绫', label: '稳了稳了', fileName: '2阿绫1_稳了稳了.png' },
  { id: 'yuezhengling-rushing', singer: '乐正绫', label: '急了急了', fileName: '2阿绫2_急了急了.png' },
  { id: 'yanhe-understood', singer: '言和', label: '我懂了', fileName: '3言和1_我懂了.png' },
  { id: 'yanhe-thinking', singer: '言和', label: '再想想', fileName: '3言和2_再想想....png' },
  { id: 'yuezhenglongya-cheer', singer: '乐正龙牙', label: '好耶！！', fileName: '4龙牙1_好耶！！.png' },
  { id: 'yuezhenglongya-almost', singer: '乐正龙牙', label: '差一点', fileName: '4龙牙2_差一点....png' },
  { id: 'zhiyumoke-calculating', singer: '徵羽摩柯', label: '计算中', fileName: '5摩柯1_计算中....png' },
  { id: 'zhiyumoke-insufficient', singer: '徵羽摩柯', label: '信息不足', fileName: '5摩柯2_信息不足....png' },
  { id: 'moqingxian-calm', singer: '墨清弦', label: '淡定', fileName: '6墨清弦1_淡定.png' },
  { id: 'moqingxian-concede', singer: '墨清弦', label: '承让', fileName: '6墨清弦2_承让.png' },
  { id: 'xinhua-cheer', singer: '心华', label: '加油', fileName: '7心华1_加油.png' },
  { id: 'xinhua-help', singer: '心华', label: '帮帮我', fileName: '7心华2_帮帮我....png' },
  { id: 'xingchen-insight', singer: '星尘', label: '灵光一闪！', fileName: '8星尘1_灵光一闪！.png' },
  { id: 'xingchen-blank', singer: '星尘', label: '脑内空白', fileName: '8星尘2_脑内空白....png' },
  { id: 'haiyi-arrive', singer: '海伊', label: '我来啦', fileName: '9海伊1_我来啦.png' },
  { id: 'haiyi-wait', singer: '海伊', label: '等等我', fileName: '9海伊2_等等我.png' },
  { id: 'chiyu-fired-up', singer: '赤羽', label: '燃起来了', fileName: '10赤羽1_燃起来了.png' },
  { id: 'chiyu-rematch', singer: '赤羽', label: '不服再来！', fileName: '10赤羽2_不服再来！.png' },
  { id: 'cangqiong-see-through', singer: '苍穹', label: '看穿了', fileName: '11苍穹1_看穿了.png' },
  { id: 'cangqiong-silent', singer: '苍穹', label: '沉默了', fileName: '11苍穹2_沉默了....png' },
  { id: 'shian-idea', singer: '诗岸', label: '有思路了', fileName: '12诗岸1_有思路了.png' },
  { id: 'shian-hint', singer: '诗岸', label: '提示呢', fileName: '12诗岸2_提示呢.png' },
  { id: 'muxin-synergy', singer: '牧心', label: '好默契', fileName: '13牧心1_好默契.png' },
  { id: 'muxin-thanks', singer: '牧心', label: '谢谢你', fileName: '13牧心2_谢谢你.png' },
  { id: 'yongye-stare', singer: '永夜Minus', label: '盯——', fileName: '14永夜1_盯——.png' },
  { id: 'yongye-give-up', singer: '永夜Minus', label: '摆——', fileName: '14永夜2_摆——.png' },
]);

const emotesById = new Map(MULTIPLAYER_EMOTES.map((emote) => [emote.id, emote]));

export function multiplayerEmoteFor(id) {
  return emotesById.get(String(id ?? '')) ?? null;
}

export function isMultiplayerEmoteId(id) {
  return emotesById.has(String(id ?? ''));
}
