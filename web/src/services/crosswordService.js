const PURE_HAN = /^\p{Script=Han}+$/u;

export const DIRECTIONS = {
  across: { row: 0, column: 1, label: '横' },
  down: { row: 1, column: 0, label: '纵' },
};

export const CHARACTER_BANK_LIMIT = 32;
const DISTRACTOR_CHARACTERS = [...'曲名歌声风云星月天心梦光影世界时空故事少年少女春夏秋冬花雪海山夜希望远方未来喜欢音乐旋律一二三四五六七八九十的了在和你我他她它是有无不人中大上小新旧真好想看听来去会能把为与从到这那也都还再更最'].filter((character, index, characters) => characters.indexOf(character) === index);

const cellKey = (row, column) => `${row},${column}`;
const oppositeDirection = (direction) => direction === 'across' ? 'down' : 'across';

export function isPureHanTitle(title) {
  return PURE_HAN.test(title);
}

function shuffled(values, random) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function sharesCharacter(left, right) {
  const rightCharacters = new Set([...right.title]);
  return [...left.title].some((character) => rightCharacters.has(character));
}

export function getCrosswordSongPool(songs, entryCount = 6) {
  const candidates = songs.filter((song) => isPureHanTitle(song.title));
  const adjacency = new Map(candidates.map((song) => [song.id, []]));
  for (let left = 0; left < candidates.length; left += 1) {
    for (let right = left + 1; right < candidates.length; right += 1) {
      if (!sharesCharacter(candidates[left], candidates[right])) continue;
      adjacency.get(candidates[left].id).push(candidates[right].id);
      adjacency.get(candidates[right].id).push(candidates[left].id);
    }
  }

  const byId = new Map(candidates.map((song) => [song.id, song]));
  const visited = new Set();
  const eligibleIds = new Set();
  for (const song of candidates) {
    if (visited.has(song.id)) continue;
    const component = [];
    const pending = [song.id];
    visited.add(song.id);
    while (pending.length) {
      const current = pending.pop();
      component.push(current);
      for (const neighbor of adjacency.get(current)) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        pending.push(neighbor);
      }
    }
    if (component.length >= entryCount) component.forEach((id) => eligibleIds.add(id));
  }
  return candidates.filter((song) => eligibleIds.has(song.id) && byId.has(song.id));
}

function buildCellMap(entries) {
  const cells = new Map();
  for (const entry of entries) {
    const vector = DIRECTIONS[entry.direction];
    entry.characters.forEach((character, index) => {
      const row = entry.row + vector.row * index;
      const column = entry.column + vector.column * index;
      const key = cellKey(row, column);
      const current = cells.get(key) ?? { row, column, character, entryIds: [], directions: [] };
      current.entryIds.push(entry.id);
      current.directions.push(entry.direction);
      cells.set(key, current);
    });
  }
  return cells;
}

function placementOptions(song, entries, random) {
  const cells = buildCellMap(entries);
  const options = [];
  for (const direction of Object.keys(DIRECTIONS)) {
    const vector = DIRECTIONS[direction];
    const perpendicular = direction === 'across' ? { row: 1, column: 0 } : { row: 0, column: 1 };
    const characters = [...song.title];
    for (let characterIndex = 0; characterIndex < characters.length; characterIndex += 1) {
      const character = characters[characterIndex];
      for (const anchor of cells.values()) {
        if (anchor.character !== character || anchor.directions.includes(direction)) continue;
        const row = anchor.row - vector.row * characterIndex;
        const column = anchor.column - vector.column * characterIndex;
        let intersections = 0;
        let valid = true;

        const before = cellKey(row - vector.row, column - vector.column);
        const after = cellKey(row + vector.row * characters.length, column + vector.column * characters.length);
        if (cells.has(before) || cells.has(after)) continue;

        for (let index = 0; index < characters.length; index += 1) {
          const targetRow = row + vector.row * index;
          const targetColumn = column + vector.column * index;
          const existing = cells.get(cellKey(targetRow, targetColumn));
          if (existing) {
            if (existing.character !== characters[index] || existing.directions.includes(direction)) {
              valid = false;
              break;
            }
            intersections += 1;
          } else {
            const sideA = cellKey(targetRow + perpendicular.row, targetColumn + perpendicular.column);
            const sideB = cellKey(targetRow - perpendicular.row, targetColumn - perpendicular.column);
            if (cells.has(sideA) || cells.has(sideB)) {
              valid = false;
              break;
            }
          }
        }
        if (valid && intersections > 0) options.push({ direction, row, column, intersections });
      }
    }
  }
  return shuffled(options, random);
}

function searchLayout(pool, entries, count, random) {
  if (entries.length === count) return entries;
  const used = new Set(entries.map(({ song }) => song.id));
  const candidates = shuffled(pool.filter((song) => !used.has(song.id)), random);
  for (const song of candidates) {
    for (const option of placementOptions(song, entries, random)) {
      const entry = {
        id: song.id,
        song,
        direction: option.direction,
        row: option.row,
        column: option.column,
        characters: [...song.title],
        intersections: option.intersections,
      };
      const result = searchLayout(pool, [...entries, entry], count, random);
      if (result) return result;
    }
  }
  return null;
}

function layoutScore(entries) {
  const cells = [...buildCellMap(entries).values()];
  const rows = cells.map(({ row }) => row);
  const columns = cells.map(({ column }) => column);
  const area = (Math.max(...rows) - Math.min(...rows) + 1) * (Math.max(...columns) - Math.min(...columns) + 1);
  const intersections = cells.filter(({ entryIds }) => entryIds.length > 1).length;
  return area * 10 - intersections * 3;
}

function fixedStartCandidates(entries) {
  const cells = buildCellMap(entries);
  return entries.filter((entry) => {
    const startCell = cells.get(cellKey(entry.row, entry.column));
    return startCell?.entryIds.length === 1;
  });
}

function normalizeLayout(entries, random) {
  const rawCells = [...buildCellMap(entries).values()];
  const minRow = Math.min(...rawCells.map(({ row }) => row));
  const minColumn = Math.min(...rawCells.map(({ column }) => column));
  const normalized = entries.map((entry) => ({
    ...entry,
    row: entry.row - minRow,
    column: entry.column - minColumn,
  }));
  const ordered = [...normalized].sort((left, right) => left.row - right.row || left.column - right.column || left.direction.localeCompare(right.direction));
  const numbered = ordered.map((entry, index) => ({ ...entry, number: index + 1 }));
  const normalizedCellMap = buildCellMap(numbered);
  const fixedEntries = shuffled(fixedStartCandidates(numbered), random).slice(0, 2);
  const fixedCellKeys = fixedEntries.map((entry) => cellKey(entry.row, entry.column));
  const fixedKeySet = new Set(fixedCellKeys);
  const cells = [...normalizedCellMap.values()].map((cell) => ({
    ...cell,
    isIntersection: cell.entryIds.length > 1,
    isFixed: fixedKeySet.has(cellKey(cell.row, cell.column)),
  }));
  return {
    entries: numbered,
    cells,
    fixedCellKeys,
    width: Math.max(...cells.map(({ column }) => column)) + 1,
    height: Math.max(...cells.map(({ row }) => row)) + 1,
  };
}

export function generateCrossword(songs, { entryCount = 6, random = Math.random, attempts = 36 } = {}) {
  const pool = getCrosswordSongPool(songs, entryCount);
  if (pool.length < entryCount) throw new Error(`至少需要 ${entryCount} 首能够交叉的纯汉字曲名`);
  let best = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const firstSong = pool[Math.floor(random() * pool.length)];
    const firstEntry = {
      id: firstSong.id,
      song: firstSong,
      direction: 'across',
      row: 0,
      column: 0,
      characters: [...firstSong.title],
      intersections: 0,
    };
    const layout = searchLayout(pool, [firstEntry], entryCount, random);
    if (layout && fixedStartCandidates(layout).length >= 2 && (!best || layoutScore(layout) < layoutScore(best))) best = layout;
  }
  if (!best) throw new Error('本局生成失败，请重新生成');
  return normalizeLayout(best, random);
}

export function entryCellKeys(entry) {
  const vector = DIRECTIONS[entry.direction];
  return entry.characters.map((_character, index) => cellKey(
    entry.row + vector.row * index,
    entry.column + vector.column * index,
  ));
}

export function createCharacterBank(puzzle, { random = Math.random, limit = CHARACTER_BANK_LIMIT } = {}) {
  const requiredCharacters = puzzle.cells.filter(({ isFixed }) => !isFixed).map(({ character }) => character);
  if (requiredCharacters.length > limit) {
    throw new Error(`本局需要 ${requiredCharacters.length} 个字块，超过上限 ${limit}`);
  }
  const requiredSet = new Set(requiredCharacters);
  const distractors = shuffled(DISTRACTOR_CHARACTERS.filter((character) => !requiredSet.has(character)), random);
  const characters = [...requiredCharacters];
  let distractorIndex = 0;
  while (characters.length < limit) {
    characters.push(distractors[distractorIndex % distractors.length] ?? DISTRACTOR_CHARACTERS[distractorIndex % DISTRACTOR_CHARACTERS.length]);
    distractorIndex += 1;
  }
  return shuffled(characters, random).map((character, index) => ({
    id: `character-${index}-${character}`,
    character,
  }));
}
