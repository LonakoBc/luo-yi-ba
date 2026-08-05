import * as cheerio from 'cheerio';
import { pinyin } from 'pinyin-pro';

export const TEMPLATE_URL = 'https://mzh.moegirl.org.cn/Template:%E6%B4%9B%E5%A4%A9%E4%BE%9D';
export const UNKNOWN = '待核验';

export function cleanText(value) {
  return String(value ?? '')
    .replace(/\[[^\]]*]/g, '')
    .replace(/[\t\r\n\u00a0]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function directCells($, row) {
  return $(row).children('th,td').toArray();
}

function isTier(text) {
  return text === '神话曲' || text === '传说曲';
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findYearTables($, singerName) {
  const titlePattern = singerName
    ? new RegExp(`${escapeRegExp(singerName)}\\s*20\\d{2}年歌曲`)
    : /20\d{2}年歌曲/;
  return $('th.navbox-title').filter((_, title) => (
    titlePattern.test(cleanText($(title).text()))
  )).map((_, title) => $(title).closest('table').get(0)).get();
}

export function parseCandidates(html, baseUrl = TEMPLATE_URL, singerName) {
  const $ = cheerio.load(html);
  const found = [];
  const byUrl = new Map();

  for (const table of findYearTables($, singerName)) {
    const tableText = cleanText($(table).find('th.navbox-title').first().text());
    const yearMatch = tableText.match(/(20\d{2})年歌曲/);
    if (!yearMatch) continue;
    const year = Number(yearMatch[1]);

    const originalTables = $(table).find('table').filter((_, nested) => {
      const ownTitle = $(nested).children('tbody').children('tr').first().children('th.navbox-title');
      return cleanText(ownTitle.text()) === '原创曲';
    });

    originalTables.each((_, originalTable) => {
      $(originalTable).find('tr').each((__, row) => {
        const cells = directCells($, row);
        const tierIndex = cells.findIndex((cell) => isTier(cleanText($(cell).text())));
        if (tierIndex < 0) return;
        const tier = cleanText($(cells[tierIndex]).text());
        const dataCell = cells[tierIndex + 1];
        if (!dataCell) return;

        $(dataCell).find('a').each((___, anchor) => {
          const title = cleanText($(anchor).text());
          const href = $(anchor).attr('href');
          if (!title || !href || title === '编辑' || title === '查看') return;
          if (href.startsWith('#') || href.includes('action=edit')) return;
          const parsedUrl = new URL(href, baseUrl);
          const sectionAnchor = parsedUrl.hash ? decodeURIComponent(parsedUrl.hash.slice(1)) : '';
          parsedUrl.hash = '';
          const url = parsedUrl.href;
          const candidateKey = `${url}#${title.normalize('NFKC').toLocaleLowerCase('zh-CN')}`;
          if (byUrl.has(candidateKey)) {
            const existing = byUrl.get(candidateKey);
            existing.year = Math.min(existing.year, year);
            if (tier === '神话曲') existing.tier = '神话曲';
            return;
          }
          const candidate = { title, year, tier, url, sectionAnchor };
          byUrl.set(candidateKey, candidate);
          found.push(candidate);
        });
      });
    });
  }

  return found;
}

function normalizedCellValue($, cell) {
  const valueCell = $(cell).clone();
  valueCell.find('sup').remove();
  valueCell.find('br').replaceWith('、');
  valueCell.find('li').each((_, item) => $(item).append('、'));
  return cleanText(valueCell.text()).replace(/[、；;]+$/u, '');
}

function originalCellValue($, cell) {
  const valueCell = $(cell).clone();
  valueCell.find('sup').remove();
  valueCell.find('br').replaceWith('\n');
  valueCell.find('li').each((_, item) => $(item).append('\n'));
  let lines = valueCell.text().split(/\n+/).map(cleanText).filter(Boolean);
  const hasOriginalMarker = lines.some((line) => /[（(]原版[）)]/u.test(line));
  if (hasOriginalMarker) lines = lines.filter((line) => /[（(]原版[）)]/u.test(line));
  else lines = lines.filter((line) => !/[（(](?:重制|重置|翻唱|二创|改编|人声|新版|ACE版)[^）)]*[）)]/u.test(line));
  return lines
    .map((line) => line.replace(/[（(]原版[）)]/gu, '').trim())
    .filter(Boolean)
    .join('、');
}

function cardCellValue($, cell) {
  const anchorNames = $(cell).find('a').map((_, anchor) => cleanText($(anchor).text())).get().filter(Boolean);
  if (anchorNames.length) return [...new Set(anchorNames)].join('、');
  const lastSpan = cleanText($(cell).find('span').last().text());
  return lastSpan || normalizedCellValue($, cell);
}

function rowValues($, labels) {
  const results = [];
  $('tr').each((_, row) => {
    if ($(row).closest('.navbox').length) return;
    const cells = directCells($, row);
    if (cells.length === 0) return;
    const label = cleanText($(cells[0]).text());
    if (/重填|翻填|歌词|曲绘|歌曲|曲目|主题曲|序曲|尾曲|组曲|贺曲/u.test(label)) return;
    if (label.length > 30 || !labels.some((pattern) => pattern.test(label))) return;
    if (cells.slice(1).some((cell) => $(cell).find('.navbox').length)) return;
    let value = cells.slice(1).map((cell) => originalCellValue($, cell)).filter(Boolean).join('、');
    if (!value && cells.length === 1) {
      const nextRow = $(row).next('tr');
      const nextCells = directCells($, nextRow);
      if (nextCells.length === 1) value = cardCellValue($, nextCells[0]);
    }
    if (value && value.length <= 200) results.push({ label, value, table: $(row).closest('table').get(0) });
  });
  return results;
}

function singerValues($) {
  const tableResults = [];
  const cardResults = [];
  let primaryTable = null;
  $('tr').each((_, row) => {
    if ($(row).closest('.navbox').length) return;
    const cells = directCells($, row);
    if (cells.length === 0) return;
    const label = cleanText($(cells[0]).text());
    if (label.length > 30 || !/(?:演唱者?|歌手)$/u.test(label)) return;
    if (cells.length >= 2) {
      const table = $(row).closest('table').get(0);
      if (primaryTable && table !== primaryTable) return;
      primaryTable = table;
      const value = originalCellValue($, cells[1]);
      if (value) tableResults.push(...value.split(/[、,，；;／/＋+]/u).map(cleanText).filter(Boolean));
      return;
    }
    let valueCell;
    if (cells.length >= 2) valueCell = $(cells[1]).clone();
    else {
      const nextCells = directCells($, $(row).next('tr'));
      if (nextCells.length !== 1) return;
      const cardValue = cardCellValue($, nextCells[0]);
      if (cardValue) cardResults.push(cardValue);
      return;
    }
    valueCell.find('sup,sub').remove();
    valueCell.find('br').replaceWith('\n');
    const values = valueCell.text().split(/\n+/).map(cleanText).filter(Boolean);
    if (cardResults.length === 0) cardResults.push(...values);
  });
  const results = tableResults.length ? tableResults : cardResults;
  return [...new Set(results)];
}

function staffRole(label) {
  if (/UP主/i.test(label)) return 'UP主';
  if (/作曲|作编曲/u.test(label)) return '作曲';
  if (/作词|填词/u.test(label)) return '作词';
  if (/编曲/u.test(label)) return '编曲';
  return null;
}

function extractStaff($) {
  const allRows = rowValues($, [/UP主/i, /作曲/u, /作词/u, /填词/u, /编曲/u]);
  const uploader = allRows.find(({ label }) => /UP主/i.test(label));
  const roleRows = allRows.filter(({ label }) => !/UP主/i.test(label));
  const primaryTable = roleRows[0]?.table;
  const rows = [
    ...(uploader ? [uploader] : []),
    ...roleRows.filter(({ table }) => !primaryTable || table === primaryTable),
  ];
  const people = new Map();
  const roleOrder = ['UP主', '作曲', '作词', '编曲'];
  let foundUploader = false;

  for (const { label, value } of rows) {
    const roles = roleOrder.filter((role) => {
      if (role === 'UP主') return /UP主/i.test(label);
      if (role === '作曲') return /作曲|作编曲/u.test(label);
      if (role === '作词') return /作词|填词/u.test(label);
      return label.includes(role);
    });
    if (!roles.length) {
      const role = staffRole(label);
      if (role) roles.push(role);
    }
    if (roles.includes('UP主')) {
      if (foundUploader) continue;
      foundUploader = true;
    }
    const expandedValue = value.replace(/[（(]([^）)]*[、,，；;／/＋+][^）)]*)[）)]/gu, '$1');
    const names = expandedValue.split(/[、,，；;／/＋+]/u).map((name) => cleanText(name)
      .replace(/[（(](?:原版|重制版|重置版|新版|旧版|VC版|人声版)[^）)]*[）)]/gu, '')
      .trim()).filter(Boolean);
    for (const name of names) {
      const key = name.normalize('NFKC').toLocaleLowerCase('en-US').replace(/\s*([()])\s*/g, '$1');
      if (!people.has(key)) people.set(key, { name, roles: new Set() });
      for (const role of roles) people.get(key).roles.add(role);
    }
  }

  return [...people.values()]
    .sort(({ roles: rolesA }, { roles: rolesB }) => {
      const rank = (roles) => Math.min(...[...roles].map((role) => roleOrder.indexOf(role)));
      return rank(rolesA) - rank(rolesB);
    })
    .map(({ name, roles }) => {
      const orderedRoles = roleOrder.filter((role) => roles.has(role));
      return `${name}（${orderedRoles.join('、')}）`;
    })
    .join('；') || UNKNOWN;
}

function pageCategories(html, $) {
  const categories = new Set();
  $('#mw-normal-catlinks a, .mw-normal-catlinks a').each((_, anchor) => {
    const value = cleanText($(anchor).text());
    if (value && value !== '分类') categories.add(value);
  });

  const match = html.match(/"wgCategories":(\[[^\]]*\])/);
  if (match) {
    try {
      for (const value of JSON.parse(match[1])) categories.add(cleanText(value));
    } catch {
      // Rendered category links remain available when the inline JSON changes.
    }
  }
  return [...categories];
}

function headingBlock($, heading) {
  const parent = $(heading).parent();
  return parent.hasClass('mw-heading') ? parent : $(heading);
}

function sectionElements($, pattern) {
  const heading = $('h2,h3,h4').filter((_, item) => pattern.test(cleanText($(item).text()))).first();
  if (!heading.length) return [];
  const elements = [];
  let current = headingBlock($, heading).next();
  while (current.length && !current.hasClass('mw-heading') && !/^H[234]$/u.test(current.prop('tagName') ?? '')) {
    elements.push(current.get(0));
    current = current.next();
  }
  return elements;
}

function introductionText($) {
  const elements = sectionElements($, /简介|簡介/u);
  const paragraphs = elements
    .filter((element) => $(element).is('p'))
    .slice(0, 3)
    .map((element) => cleanText($(element).text()))
    .filter(Boolean);
  if (paragraphs.length) return paragraphs.join(' ');
  return cleanText($('#mw-content-text .mw-parser-output > p').first().text());
}

function detectVoicebank(categories, introText, articleText, year) {
  const introPatterns = [
    ['VOCALOID', /VOCALOID\s*中文(?:原创)?歌曲/i],
    ['ACE', /\bACE\s*中文(?:原创)?歌曲/i],
    ['Xstudio', /X\s*Studio\s*中文(?:原创)?歌曲/i],
  ];
  const introHits = introPatterns
    .map(([value, pattern]) => ({ value, index: introText.search(pattern) }))
    .filter(({ index }) => index >= 0)
    .sort((a, b) => a.index - b.index);
  if (introHits.length) return introHits[0].value;

  const values = [];
  const haystack = `${categories.join(' ')} ${articleText.slice(0, 2500)}`;
  if (/VOCALOID/i.test(haystack)) values.push('VOCALOID');
  if (/(?:使用|声库|引擎).{0,12}\bACE\b|\bACE\b.{0,12}(?:声库|引擎)/i.test(haystack)) values.push('ACE');
  if (/X\s*Studio/i.test(haystack)) values.push('Xstudio');
  if (values.length === 1) return values[0];
  if (values.includes('VOCALOID') && year < 2020) return 'VOCALOID';
  return UNKNOWN;
}

function wordCount(line) {
  const segmenter = new Intl.Segmenter('zh', { granularity: 'word' });
  return [...segmenter.segment(line)].filter(({ isWordLike }) => isWordLike).length;
}

function cleanLyricLine(line) {
  return cleanText(line)
    .replace(/^[（(]?(?:洛天依|言和|乐正绫|天依|洛|言|绫)[）)]?[：:]/u, '')
    .replace(/^[（(][^）)]{1,12}[）)]/u, '')
    .trim();
}

function chooseLyricLine(rawLines) {
  const lines = rawLines
    .map(cleanLyricLine)
    .filter((line) => {
      const visible = line.replace(/[^\p{L}\p{N}]/gu, '');
      return visible.length >= 8 && !/^(?:do|re|mi|fa|sol|la|si)(?:\s+(?:do|re|mi|fa|sol|la|si))*$/iu.test(line);
    });
  if (!lines.length) return UNKNOWN;

  const compliant = lines.filter((line) => wordCount(line) <= 10);
  if (!compliant.length) return UNKNOWN;
  const first = compliant[0];
  const counts = new Map(compliant.map((line) => [line, compliant.filter((item) => item === line).length]));
  const repeated = compliant
    .filter((line) => (counts.get(line) ?? 0) > 1 && !/^(?:嘿|啊|呃|唔|喏|啦|哦|哈|诶|哎)/u.test(line))
    .sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0))[0];
  return repeated
    ?? compliant.find((line) => !/^(?:嘿|啊|呃|唔|喏|啦|哦|哈|诶|哎)/u.test(line))
    ?? first;
}

function lyricExcerpt($) {
  const elements = sectionElements($, /歌词|歌詞/u);
  for (const element of elements) {
    const poem = $(element).hasClass('poem') ? $(element) : $(element).find('.poem').first();
    if (poem.length) {
      const text = poem.clone().find('br').replaceWith('\n').end().text();
      return chooseLyricLine(text.split(/\n+/));
    }
  }

  const originals = elements.flatMap((element) => $(element).find('.Lyrics-original').map((_, line) => cleanText($(line).text())).get());
  if (originals.length) return chooseLyricLine(originals);

  for (const element of elements) {
    if ($(element).is('style,script,.navbox') || $(element).find('.navbox').length) continue;
    const paragraphs = $(element).find('p').toArray();
    for (const paragraph of paragraphs) {
      const block = $(paragraph).clone();
      block.find('br').replaceWith('\n');
      const lines = block.text().split(/\n+/);
      if (lines.length >= 4) {
        const result = chooseLyricLine(lines);
        if (result !== UNKNOWN) return result;
      }
    }
  }
  return UNKNOWN;
}

function bilibiliUrl($) {
  const links = $('a').map((_, anchor) => $(anchor).attr('href')).get().filter(Boolean);
  for (const href of links) {
    try {
      const url = new URL(href);
      if (!/(?:^|\.)bilibili\.com$/i.test(url.hostname)) continue;
      const match = url.pathname.match(/\/video\/(BV[\w]+|av\d+)/i);
      if (match) return `https://www.bilibili.com/video/${match[1]}`;
    } catch {
      // Ignore malformed and relative links.
    }
  }
  const countNode = $('#mw-content-text .mw-parser-output .bilibiliCount').filter((_, node) => !$(node).closest('.navbox').length).first();
  const id = countNode.attr('data-bilibili-count-id');
  if (/^BV[\w]+$/i.test(id ?? '')) return `https://www.bilibili.com/video/${id}`;
  if (/^\d+$/u.test(id ?? '')) return `https://www.bilibili.com/video/av${id}`;
  return UNKNOWN;
}

function detectPerformance(singers) {
  if (!singers.length || !singers.some((value) => value.includes('洛天依'))) return UNKNOWN;
  const remainder = singers.join('、')
    .replaceAll('洛天依', '')
    .replace(/[（(][^）)]*[）)]/g, '')
    .replace(/[、,，/&＋+和与及·\s]/g, '');
  return remainder ? '合唱' : '独唱';
}

function articleTextWithoutNavigation($) {
  const article = $('#mw-content-text .mw-parser-output').first().clone();
  article.find('table.navbox, .navbox, .toc, style, script, noscript').remove();
  return cleanText(article.text());
}

function detectOfficialBirthday(articleText) {
  const official = '(?:官方|Vsinger|洛天依官方)';
  const birthday = '(?:生贺(?:曲|歌曲)?|生日(?:贺曲|歌曲|纪念曲))';
  return new RegExp(`${official}.{0,40}${birthday}|${birthday}.{0,40}${official}`, 'i').test(articleText);
}

function detectConcert(articleText) {
  return /(?:演唱|演出|献唱|表演).{0,30}演唱会|演唱会.{0,40}(?:演唱|演出|曲目|表演)/.test(articleText);
}

function detectBirthdayEvent(articleText) {
  return /生日会.{0,40}(?:演唱|演出|曲目|表演)|(?:演唱|演出|曲目|表演).{0,40}生日会/u.test(articleText);
}

export function parseSongPage(html, candidate) {
  const $ = cheerio.load(html);
  const categories = pageCategories(html, $);
  const articleText = articleTextWithoutNavigation($);
  const introText = introductionText($);
  const staff = extractStaff($);
  const singers = singerValues($);
  const voicebank = detectVoicebank(categories, introText, articleText, candidate.year);
  const performance = detectPerformance(singers);
  const lyric = lyricExcerpt($);
  const bilibili = bilibiliUrl($);

  let special = '无';
  if (candidate.tier === '神话曲' || categories.some((value) => value.includes('神话曲'))) {
    special = '神话曲';
  } else if (detectOfficialBirthday(articleText)) {
    special = '生贺曲';
  } else if (detectConcert(articleText)) {
    special = '演唱会曲目';
  } else if (detectBirthdayEvent(articleText)) {
    special = '生日会曲目';
  }

  return {
    title: candidate.title,
    staff,
    voicebank,
    year: candidate.year,
    performance,
    lyric,
    special,
    bilibili,
    singers: singers.length ? singers.join('、') : UNKNOWN,
    categories,
  };
}

export function slugifyTitle(title) {
  const converted = pinyin(title, {
    toneType: 'none',
    type: 'array',
    nonZh: 'consecutive',
  })
    .join('-')
    .toLowerCase()
    .replaceAll('ü', 'v')
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
  return converted || 'unknown-song';
}

export function slugifyCandidate(candidate) {
  const titleSlug = slugifyTitle(candidate.title);
  if (titleSlug !== 'unknown-song') return titleSlug;
  try {
    const pageTitle = decodeURIComponent(new URL(candidate.url).pathname)
      .replace(/^\/+/, '')
      .replaceAll('_', ' ');
    return slugifyTitle(pageTitle);
  } catch {
    return titleSlug;
  }
}

export function allocateSlug(baseSlug, usedSlugs) {
  let slug = baseSlug;
  let suffix = 2;
  while (usedSlugs.has(slug)) slug = `${baseSlug}-${suffix++}`;
  usedSlugs.add(slug);
  return slug;
}

export function renderSongMarkdown(song) {
  return [
    `曲名：《${song.title}》`,
    `STAFF：${song.staff}`,
    `声库：${song.voicebank}`,
    `年份：${song.year}`,
    `独唱或合唱：${song.performance}`,
    `歌词：${song.lyric}`,
    `特殊注明：${song.special}`,
    `哔哩哔哩地址：${song.bilibili}`,
  ].join('\n');
}

export function missingFields(song) {
  return [
    ['STAFF', song.staff],
    ['声库', song.voicebank],
    ['独唱或合唱', song.performance],
    ['歌词', song.lyric],
    ['哔哩哔哩地址', song.bilibili],
  ].filter(([, value]) => value === UNKNOWN).map(([field]) => field);
}
