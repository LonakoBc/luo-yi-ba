import * as cheerio from 'cheerio';
import { parseCandidates as parseRenderedCandidates } from './lib.mjs';

export const VCPEDIA_BASE_URL = 'https://vcpedia.cn/';
export const VCPEDIA_API_URL = 'https://vcpedia.cn/api.php';
export const UNKNOWN = '待核验';

const ROLE_ORDER = ['UP主', '作曲', '作词', '编曲'];
const ENGINE_RULES = [
  ['VOCALOID', /\bVOCALOID\b/i],
  ['ACE Studio', /\bACE(?:\s+Studio)?\b/i],
  ['X Studio', /\bX\s*Studio\b/i],
  ['Synthesizer V', /\bSynthesizer\s*V\b/i],
  ['UTAU', /\bUTAU\b/i],
  ['DeepVocal', /\bDeepVocal\b/i],
  ['MUTA', /\bMUTA\b/i],
  ['Sharpkey', /\bSharpkey\b/i],
  ['袅袅虚拟歌手', /袅袅虚拟歌手/u],
];
const KNOWN_VIRTUAL_SINGERS = new Set([
  '洛天依', '言和', '乐正绫', '乐正龙牙', '徵羽摩柯', '墨清弦', '星尘', '心华',
  '初音未来', '镜音铃', '镜音连', '巡音流歌', 'MEIKO', 'KAITO', 'GUMI', 'IA',
  'v flower', '赤羽', '苍穹', '海伊', '诗岸', '艾可', '默辰', '牧心', 'Minus',
  '夏语遥', '祈Inory', '悦成', '章楚楚', '重音Teto', '重音テト',
]);

function clean(value) {
  return String(value ?? '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<ref\b[^>]*>[\s\S]*?<\/ref>|<ref\b[^>]*\/>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '、')
    .replace(/<del\b[^>]*>[\s\S]*?<\/del>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/-\{([^{}]+)}-/g, '$1')
    .replace(/'''?|''/g, '')
    .replace(/&nbsp;|\u00a0/g, ' ')
    .replace(/[\t\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function displayWikiText(value) {
  let text = String(value ?? '');
  text = text.replace(/<ref\b[^>]*>[\s\S]*?<\/ref>|<ref\b[^>]*\/>/gi, ' ');
  text = text.replace(/<del\b[^>]*>[\s\S]*?<\/del>/gi, ' ');
  text = text.replace(/-\{([^{}]+)}-/g, '$1');
  text = text.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target, label) => label || target);
  text = text.replace(/\[https?:\/\/\S+\s+([^\]]+)\]/g, '$1');
  text = text.replace(/\{\{ruby\|([^{}|]+)\|[^{}]+}}/gi, '$1');
  text = text.replace(/\{\{(?:color|coloredlink|lang|lj)\|(?:[^{}|]*\|)*([^{}|]+)}}/gi, '$1');
  text = text.replace(/\{\{[^{}]*}}/g, ' ');
  return clean(text);
}

function normalizeTitle(value) {
  return displayWikiText(value).replaceAll('_', ' ').trim();
}

function normalizeUrl(url) {
  const parsed = new URL(url, VCPEDIA_BASE_URL);
  parsed.hash = '';
  parsed.search = '';
  return parsed.href;
}

export function parseYearCandidates(html, templateUrl, singerName) {
  return parseRenderedCandidates(html, VCPEDIA_BASE_URL, singerName).map((candidate, index) => ({
    ...candidate,
    url: normalizeUrl(candidate.url),
    sourceUrl: candidate.sectionAnchor
      ? `${normalizeUrl(candidate.url)}#${encodeURIComponent(candidate.sectionAnchor)}`
      : normalizeUrl(candidate.url),
    templateUrl,
    sourceOrder: index,
    pageTitle: decodeURIComponent(new URL(candidate.url).pathname.replace(/^\/(?:zh-(?:hans|cn)\/)?/u, ''))
      .replaceAll('_', ' '),
  }));
}

export function dedupeCandidates(candidates) {
  const byPage = new Map();
  for (const candidate of candidates) {
    const key = `${normalizeUrl(candidate.url).toLocaleLowerCase('zh-CN')}#${candidate.title.normalize('NFKC').toLocaleLowerCase('zh-CN')}`;
    const existing = byPage.get(key);
    if (!existing) {
      byPage.set(key, { ...candidate });
      continue;
    }
    if (candidate.year < existing.year) {
      byPage.set(key, { ...candidate, tier: existing.tier === '神话曲' ? '神话曲' : candidate.tier });
    } else if (candidate.tier === '神话曲') {
      existing.tier = '神话曲';
    }
  }
  return [...byPage.values()].sort((a, b) => a.year - b.year || a.sourceOrder - b.sourceOrder);
}

function extractTemplates(text) {
  const templates = [];
  const stack = [];
  for (let index = 0; index < text.length - 1; index += 1) {
    const pair = text.slice(index, index + 2);
    if (pair === '{{') {
      stack.push(index);
      index += 1;
    } else if (pair === '}}' && stack.length) {
      const start = stack.pop();
      templates.push(text.slice(start + 2, index));
      index += 1;
    }
  }
  return templates;
}

function splitTopLevel(text, separator = '|') {
  const parts = [];
  let braces = 0;
  let brackets = 0;
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    const pair = text.slice(index, index + 2);
    if (pair === '{{') { braces += 1; index += 1; continue; }
    if (pair === '}}') { braces = Math.max(0, braces - 1); index += 1; continue; }
    if (pair === '[[') { brackets += 1; index += 1; continue; }
    if (pair === ']]') { brackets = Math.max(0, brackets - 1); index += 1; continue; }
    if (text[index] === separator && braces === 0 && brackets === 0) {
      parts.push(text.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

function parseTemplate(raw) {
  const parts = splitTopLevel(raw);
  const name = clean(parts.shift()).replaceAll('_', ' ');
  const params = new Map();
  let positional = 1;
  for (const part of parts) {
    const equals = part.indexOf('=');
    if (equals < 0) params.set(String(positional++), part.trim());
    else params.set(clean(part.slice(0, equals)), part.slice(equals + 1).trim());
  }
  return { name, params };
}

function removeSecondarySections(wikitext) {
  const lines = wikitext.split(/\r?\n/u);
  const kept = [];
  let skipping = false;
  for (const line of lines) {
    if (/^==+[^=].*==+\s*$/u.test(line)) {
      const heading = displayWikiText(line.replaceAll('=', ''));
      if (/^(?:二次创作|二創|翻唱|翻调|翻調|其他版本|相关版本)$/u.test(heading)) {
        skipping = true;
        continue;
      }
      if (/^==[^=]/u.test(line)) skipping = false;
    }
    if (!skipping) kept.push(line);
  }
  return kept.join('\n');
}

function primarySource(wikitext) {
  const parsed = extractTemplates(wikitext).map(parseTemplate);
  const tabs = parsed.find(({ name, params }) => /^tabs\/core$/iu.test(name) && /原版/u.test(displayWikiText(params.get('label1'))));
  const originalTab = tabs?.params.get('text1');
  return removeSecondarySections(originalTab || wikitext);
}

function sourceForCandidate(wikitext, candidate = {}) {
  if (!candidate.sectionAnchor) return String(wikitext ?? '');
  const anchorPattern = new RegExp(`^${escapeRegExp(candidate.sectionAnchor)}$`, 'u');
  const anchored = section(String(wikitext ?? ''), anchorPattern);
  if (!anchored) return String(wikitext ?? '');
  const toggles = extractTemplates(anchored).map(parseTemplate).filter(({ name }) => /^Toggle$/iu.test(name));
  const songToggle = toggles.find(({ params }) => displayWikiText(params.get('button')).includes(candidate.title));
  return songToggle?.params.get('content') || anchored;
}

function normalizeVideoId(value) {
  const match = String(value ?? '').match(/(?:https?:\/\/(?:www\.)?bilibili\.com\/video\/)?(?:av)?(BV[0-9A-Za-z]{10}|av\d+|\d+)/iu);
  if (!match) return null;
  const id = match[1];
  if (/^BV/iu.test(id)) return id;
  return /^av/iu.test(id) ? id.toLowerCase() : `av${id}`;
}

function toBilibiliUrl(id) {
  return id ? `https://www.bilibili.com/video/${id}/` : UNKNOWN;
}

export function extractBilibiliUrl(wikitext, candidate) {
  const source = primarySource(sourceForCandidate(wikitext, candidate));
  const templates = extractTemplates(source).map(parseTemplate);
  const songbox = findSongboxes(templates)[0];
  for (const key of ['bb_id', 'bilibili_id', 'b站id', '链接', '連結', 'link']) {
    const id = normalizeVideoId(songbox?.params.get(key));
    if (id) return toBilibiliUrl(id);
  }
  const direct = source.match(/https?:\/\/(?:www\.)?bilibili\.com\/video\/(BV[0-9A-Za-z]{10}|av\d+|\d+)/iu);
  if (direct) return toBilibiliUrl(normalizeVideoId(direct[1]));
  const videoTemplate = templates.find(({ name }) => /^BilibiliVideo$/iu.test(name));
  const videoId = normalizeVideoId(videoTemplate?.params.get('id') ?? videoTemplate?.params.get('1'));
  if (videoId) return toBilibiliUrl(videoId);
  const avTemplate = templates.find(({ name }) => /^av$/iu.test(name));
  return toBilibiliUrl(normalizeVideoId(avTemplate?.params.get('1')));
}

function renderLyricTemplate(raw) {
  const template = parseTemplate(raw);
  if (/Songbox\s+Introduction|SongboxIntroduction|歌曲信息|歌曲資訊/iu.test(template.name)) return '';
  const positional = [...template.params]
    .filter(([key]) => /^\d+$/u.test(key))
    .sort(([left], [right]) => Number(left) - Number(right))
    .map(([, value]) => value);
  if (/^(?:color|coloredlink|lang|lj)$/iu.test(template.name)) return positional.at(-1) ?? '';
  if (/^LyricsKai$/iu.test(template.name)) return template.params.get('original') ?? '';
  if (/^ruby$/iu.test(template.name)) return positional[0] ?? '';
  if (/交叉颜色|交叉顏色/u.test(template.name)) return positional.join('\n');
  if (/^(?:textHover|MultiLine Lyric)$/iu.test(template.name)) return positional[0] ?? '';
  if (/^(?:columns-list|center|shadowcolor)$/iu.test(template.name)) return positional.at(-1) ?? '';
  return positional.at(-1) ?? '';
}

function renderLyricWikiText(value) {
  let text = String(value ?? '');
  for (let pass = 0; pass < 20 && /\{\{[^{}]*\}\}/u.test(text); pass += 1) {
    text = text.replace(/\{\{([^{}]*)\}\}/gu, (_, raw) => renderLyricTemplate(raw));
  }
  return text
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/gu, (_, target, label) => label || target)
    .replace(/<ref\b[^>]*>[\s\S]*?<\/ref>|<ref\b[^>]*\/>/giu, ' ')
    .replace(/<[^>]+>/gu, ' ')
    .replace(/[{}]/gu, ' ');
}

export function extractLyrics(wikitext, candidate) {
  const targeted = sourceForCandidate(wikitext, candidate);
  const source = primarySource(targeted);
  let lyricSection = section(source, /歌词|歌詞/u);
  if (!lyricSection) lyricSection = primarySource(section(targeted, /歌词|歌詞/u));
  if (!lyricSection) {
    const marker = source.search(/<big[^>]*>[\s\S]{0,40}歌词[\s\S]{0,20}<\/big>/iu);
    if (marker >= 0) lyricSection = source.slice(marker);
  }
  if (!lyricSection) return UNKNOWN;
  const lyricsKai = extractTemplates(lyricSection).map(parseTemplate).find(({ name }) => /^LyricsKai$/iu.test(name));
  let poem = lyricSection.match(/<poem\b[^>]*>([\s\S]*?)<\/poem>/iu)?.[1]
    ?? lyricsKai?.params.get('original')
    ?? lyricSection;
  if (/左侧黑字为文案/u.test(lyricSection)) {
    poem = poem.replace(/-\{([^{}]+)\}-/gu, '$1').replace(/\{\{color\|black\|[^{}]*\}\}/giu, '');
  }
  const lines = renderLyricWikiText(poem).split(/\r?\n/u)
    .filter((line) => !/^\s*''[\s\S]*''\s*$/u.test(line))
    .map((line) => clean(line.replace(/^\s*[*#:;|]+\s*/u, '').replace(/^(?:【[^】]+】|〔[^〕]+〕)+\s*/u, '')))
    .filter(Boolean)
    .filter((line) => !/^(?:【[^】]+】)+$/u.test(line))
    .filter((line) => !/^[（(][^）)]{1,80}[）)]$/u.test(line))
    .filter((line) => !/(?:色字|颜色|顏色).{0,20}(?:演唱|合唱)|为文案|扮演者|情节和场景|^(?:作词|作詞|作曲|编曲|編曲|演唱)[：:]/u.test(line));
  const complete = lines.find((line) => line.replace(/[^\p{Script=Han}\p{L}\p{N}]/gu, '').length >= 8);
  return complete ?? UNKNOWN;
}

function section(wikitext, headingPattern) {
  const lines = wikitext.split(/\r?\n/u);
  const start = lines.findIndex((line) => /^==+[^=].*==+\s*$/u.test(line) && headingPattern.test(displayWikiText(line.replaceAll('=', ''))));
  if (start < 0) return '';
  const selected = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^==+[^=].*==+\s*$/u.test(lines[index])) break;
    selected.push(lines[index]);
  }
  return selected.join('\n');
}

function valuesFromParam(value) {
  return displayWikiText(value)
    .split(/[、，,；;／/＋+]|\s+&\s+/u)
    .map((name) => name.replace(/^普通的/u, '').trim())
    .filter(Boolean);
}

function roleFor(label) {
  const value = displayWikiText(label).replace(/\s/g, '');
  if (/UP主|投稿者/i.test(value)) return ['UP主'];
  const roles = [];
  if (/作编曲|作編曲|作曲|曲作/u.test(value)) roles.push('作曲');
  if (/作词|作詞|填词|填詞/u.test(value)) roles.push('作词');
  if (/作编曲|作編曲|编曲|編曲/u.test(value)) roles.push('编曲');
  return roles;
}

function addRole(roleMap, role, names) {
  if (!roleMap.has(role)) roleMap.set(role, []);
  for (const name of names) if (!roleMap.get(role).includes(name)) roleMap.get(role).push(name);
}

function findSongboxes(templates) {
  return templates.filter(({ name }) => /(?:VOCALOID|ACE|SynthV)?[_ ]?Songbox$/iu.test(name));
}

function extractIntro(wikitext) {
  const standard = section(wikitext, /简介|簡介/u);
  if (standard) return standard;
  const marker = wikitext.search(/<big[^>]*>[\s\S]{0,30}(?:简介|簡介)[\s\S]{0,20}<\/big>/iu);
  if (marker < 0) return '';
  const tail = wikitext.slice(marker);
  const markerEnd = tail.search(/<\/big>/iu);
  const content = markerEnd < 0 ? tail : tail.slice(markerEnd + '</big>'.length);
  const next = content.search(/<big[^>]*>/iu);
  return next < 0 ? content : content.slice(0, next);
}

function extractUploaderFromIntro(intro) {
  const firstParagraph = intro.trim().split(/\n\s*\n|\n(?=[*#;])/u)[0] ?? intro;
  const patterns = [
    /》\s*是\s*(\[\[[^\]]+\]\]|[^于，。]{1,50})\s*于\s*20\d{2}年/u,
    /由\s*(\[\[[^\]]+\]\]|[^，。]{1,50})\s*(?:于\s*20\d{2}年[^，。]*)?投稿/u,
  ];
  for (const pattern of patterns) {
    const match = firstParagraph.match(pattern);
    if (match) return valuesFromParam(match[1]);
  }
  return [];
}

function extractUploaderFromSource(source) {
  const text = displayWikiText(source);
  const match = text.match(/《[^》]{1,120}》\s*是\s*([^于，。]{1,50})\s*于\s*20\d{2}年/u);
  return match ? valuesFromParam(match[1]) : [];
}

function extractStaff(source, templates, intro) {
  const roleMap = new Map(ROLE_ORDER.map((role) => [role, []]));
  const songbox = findSongboxes(templates)[0];
  if (songbox?.params.get('UP主')) addRole(roleMap, 'UP主', valuesFromParam(songbox.params.get('UP主')));
  if (!roleMap.get('UP主').length) addRole(roleMap, 'UP主', extractUploaderFromIntro(intro));
  if (!roleMap.get('UP主').length) addRole(roleMap, 'UP主', extractUploaderFromSource(source));

  for (const template of templates) {
    if (!/Songbox\s+Introduction|SongboxIntroduction|歌曲信息|歌曲資訊/iu.test(template.name)) continue;
    for (let index = 1; index <= 30; index += 1) {
      const label = template.params.get(`group${index}`);
      const value = template.params.get(`list${index}`);
      if (!label || !value) continue;
      for (const role of roleFor(label)) addRole(roleMap, role, valuesFromParam(value));
    }
  }

  const assignment = /^\s*\|\s*(UP主|投稿者|作编曲|作編曲|作曲|作词|作詞|填词|填詞|编曲|編曲)\s*=\s*(.+)$/gmu;
  for (const match of source.matchAll(assignment)) {
    for (const role of roleFor(match[1])) addRole(roleMap, role, valuesFromParam(match[2]));
  }

  const pieces = ROLE_ORDER.filter((role) => roleMap.get(role).length).map((role) => `${role}：${roleMap.get(role).join('、')}`);
  return pieces.join('；') || UNKNOWN;
}

function extractReleaseMonth(source, templates, intro, year) {
  const songboxValues = findSongboxes(templates).flatMap(({ params }) => [params.get('投稿时间'), params.get('投稿時間')]).filter(Boolean);
  const candidates = [...songboxValues, source, intro];
  const patterns = [
    /投稿时间\s*(?:[：:=]\s*)?(20\d{2})[-/.年](\d{1,2})/u,
    /投稿時間\s*(?:[：:=]\s*)?(20\d{2})[-/.年](\d{1,2})/u,
    /于\s*(20\d{2})年(\d{1,2})月\d{1,2}日[^。\n]{0,40}投稿/u,
    /(20\d{2})年(\d{1,2})月\d{1,2}日[^。\n]{0,30}投稿/u,
  ];
  for (const text of candidates) {
    for (const pattern of patterns) {
      const matches = [...String(text).matchAll(new RegExp(pattern.source, `${pattern.flags}g`))];
      const preferred = matches.find((match) => Number(match[1]) === year) ?? matches[0];
      if (preferred) return `${preferred[1]}-${String(preferred[2]).padStart(2, '0')}`;
    }
  }
  return UNKNOWN;
}

function virtualSingerCategories(categories) {
  return categories
    .map((category) => category.match(/^(.+?)歌曲$/u)?.[1])
    .filter((name) => name && KNOWN_VIRTUAL_SINGERS.has(name));
}

function extractSingers(templates, intro, categories) {
  const values = [];
  const categoryNames = virtualSingerCategories(categories);
  const add = (items) => {
    for (const item of items) if (!values.includes(item) && (KNOWN_VIRTUAL_SINGERS.has(item) || categoryNames.includes(item))) values.push(item);
  };
  for (const songbox of findSongboxes(templates)) add(valuesFromParam(songbox.params.get('演唱')));
  for (const template of templates) {
    if (!/Songbox\s+Introduction|SongboxIntroduction/iu.test(template.name)) continue;
    for (let index = 1; index <= 30; index += 1) {
      if (/演唱|歌手/u.test(displayWikiText(template.params.get(`group${index}`)))) add(valuesFromParam(template.params.get(`list${index}`)));
    }
  }
  if (!values.length) {
    const match = intro.match(/由([^。\n]{1,100})演唱/u);
    if (match) add(valuesFromParam(match[1]));
  }
  if (!values.length) add(categoryNames);
  return values.length ? values.join('；') : UNKNOWN;
}

function enginesIn(text) {
  const values = [];
  for (const [engine, pattern] of ENGINE_RULES) if (pattern.test(text) && !values.includes(engine)) values.push(engine);
  return values;
}

function extractVoicebanks(intro, categories, year) {
  const firstParagraph = displayWikiText(intro.trim().split(/\n\s*\n|\n(?=[*#;])/u)[0] ?? intro);
  let values = enginesIn(firstParagraph);
  if (!values.length) values = enginesIn(categories.filter((category) => /^使用.+的歌曲$/u.test(category)).join(' '));
  if (values.length > 1 && year < 2020 && values.includes('VOCALOID')) values = ['VOCALOID'];
  return values.length ? values.join('；') : UNKNOWN;
}

function normalizeActivity(name) {
  return displayWikiText(name)
    .replace(/^(?:举办|舉辦|播出)的/u, '')
    .replace(/(?:北京|成都|广州|上海|武汉|无锡|深圳|杭州|南京|重庆|西安|长沙|厦门|苏州|天津)站/gu, '')
    .replace(/20\d{2}年\d{1,2}月\d{1,2}日/gu, '')
    .replace(/[（(][^）)]*(?:版本|重制|改编)[^）)]*[）)]/gu, '')
    .trim();
}

function extractConcertActivities(intro) {
  const lines = intro.split(/\r?\n/u);
  const activities = [];
  let inPerformanceList = false;
  for (const line of lines) {
    if (/(?:以下|下列).{0,20}(?:场合|活动).{0,15}(?:演唱|演出|曲目)|在以下.{0,20}成为.{0,10}演唱曲目/u.test(displayWikiText(line))) {
      inPerformanceList = true;
      continue;
    }
    if (!inPerformanceList) continue;
    if (!/^\s*[*#]/u.test(line)) {
      if (line.trim()) break;
      continue;
    }
    const links = [...line.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/gu)]
      .map((match) => normalizeActivity(match[2] || match[1]))
      .filter((name) => /演唱会|演唱會|音乐会|音樂會|生日会|生日會|LIVE|Live/u.test(name));
    if (links.length) {
      for (const activity of links) if (!activities.includes(activity)) activities.push(activity);
      continue;
    }
    const plain = normalizeActivity(line.replace(/^\s*[*#]+\s*/u, ''));
    const match = plain.match(/([^。；;]*(?:演唱会|演唱會|音乐会|音樂會|生日会|生日會|LIVE|Live)[^。；;]*)/u);
    if (match) {
      const activity = normalizeActivity(match[1]);
      if (activity && !activities.includes(activity)) activities.push(activity);
    }
  }
  return activities;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function extractSpecial(intro, singer = {}) {
  const text = displayWikiText(intro);
  const labels = [];
  const officialTerms = [...new Set(['官方', 'Vsinger官方', `${singer.name ?? ''}官方`, ...(singer.officialKeywords ?? [])].filter(Boolean))]
    .map(escapeRegExp).join('|');
  const singerTerm = singer.name ? `${escapeRegExp(singer.name)}.{0,30}` : '';
  const birthdayTerm = '(?:生贺曲|生賀曲|生日(?:歌曲|纪念曲|紀念曲|贺曲|賀曲))';
  const officialBirthday = new RegExp(`(?:${officialTerms}).{0,80}${singerTerm}${birthdayTerm}|${birthdayTerm}.{0,80}(?:${officialTerms})`, 'iu');
  const [birthdayMonth, birthdayDay] = String(singer.birthday ?? '').split('-').map(Number);
  const birthdayDate = birthdayMonth && birthdayDay
    ? new RegExp(`20\\d{2}年0?${birthdayMonth}月0?${birthdayDay}日`, 'u')
    : null;
  const officialBirthdayRelease = new RegExp(`(?:${officialTerms}).{0,120}(?:投稿|发布|發佈)`, 'iu').test(text)
    && Boolean(birthdayDate?.test(text)) && /生日/u.test(text);
  if (officialBirthday.test(text) || officialBirthdayRelease) labels.push('生贺曲');
  if (/(?:拜年祭|拜年纪|拜年紀).{0,40}(?:曲目|歌曲|投稿|首发|首發)|(?:曲目|歌曲|投稿|首发|首發).{0,40}(?:拜年祭|拜年纪|拜年紀)/u.test(text)) labels.push('拜年祭曲目');
  const withoutAlbums = text.replace(/[^。；;]{0,30}系列专辑[^。；;]*/gu, '');
  if (/(?:本曲|该曲|此曲).{0,30}(?:为|是|属于).{0,40}(?:系列(?:的?第?\s*[一二三四五六七八九十\d]+\s*(?:作|曲)|首作|作品|曲目|成员)|企划|企劃|计划曲|計劃曲)|(?:企划|企劃).{0,40}(?:曲目|歌曲|作品)/u.test(withoutAlbums)) labels.push('系列/企划曲目');
  return labels.length ? labels.join('；') : '单曲';
}

export function parseVcpediaSong({ wikitext, categories = [] }, candidate, { singer } = {}) {
  const targeted = sourceForCandidate(wikitext, candidate);
  const source = primarySource(targeted);
  const templates = extractTemplates(source).map(parseTemplate);
  const intro = extractIntro(source);
  const activities = extractConcertActivities(intro);
  const song = {
    title: candidate.title,
    tier: candidate.tier,
    staff: extractStaff(source, templates, intro),
    releaseMonth: extractReleaseMonth(source, templates, intro, candidate.year),
    singers: extractSingers(templates, intro, categories),
    voicebanks: extractVoicebanks(intro, categories, candidate.year),
    concertCount: activities.length,
    concertActivities: activities,
    special: extractSpecial(intro, singer),
    lyrics: extractLyrics(wikitext, candidate),
    bilibiliUrl: extractBilibiliUrl(wikitext, candidate),
    templateUrl: candidate.templateUrl,
    pageUrl: candidate.sourceUrl ?? candidate.url,
    vcpediaUrl: candidate.sourceUrl ?? candidate.url,
    originalYear: candidate.year,
  };
  song.issues = missingReviewFields(song);
  return song;
}

export function missingReviewFields(song) {
  return [
    ['staff', song.staff],
    ['发布时间', song.releaseMonth],
    ['演唱歌姬', song.singers],
    ['使用声库', song.voicebanks],
    ['歌词', song.lyrics],
    ['Bilibili 地址', song.bilibiliUrl],
  ].filter(([, value]) => value === UNKNOWN).map(([field]) => field);
}

export function normalizeApiTitle(value) {
  return normalizeTitle(value).toLocaleLowerCase('zh-CN');
}

export function parseRenderedFallback(html) {
  const $ = cheerio.load(html);
  const rows = [];
  $('tr').each((_, row) => {
    if ($(row).closest('.navbox').length) return;
    const cells = $(row).children('th,td').toArray();
    if (cells.length < 2) return;
    const label = clean($(cells[0]).text());
    const roles = roleFor(label);
    if (!roles.length && !/(?:演唱|歌手)$/u.test(label)) return;
    const value = clean($(cells[1]).clone().find('br').replaceWith('、').end().text());
    if (value) rows.push({ label, roles, value });
  });
  const roleMap = new Map(ROLE_ORDER.map((role) => [role, []]));
  for (const row of rows) for (const role of row.roles) addRole(roleMap, role, valuesFromParam(row.value));
  const staff = ROLE_ORDER.filter((role) => roleMap.get(role).length).map((role) => `${role}：${roleMap.get(role).join('、')}`).join('；');
  const singers = rows.filter(({ label }) => /(?:演唱|歌手)$/u.test(label)).flatMap(({ value }) => valuesFromParam(value)).filter((name) => KNOWN_VIRTUAL_SINGERS.has(name));
  return { staff: staff || UNKNOWN, singers: singers.length ? [...new Set(singers)].join('；') : UNKNOWN };
}
