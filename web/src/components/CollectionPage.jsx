import { useEffect, useMemo, useState } from 'react';
import {
  COLLECTION_SLOT_DEFINITIONS,
  COLLECTION_STORAGE_KEY,
  buildCollectionSongPool,
  collectionEntryFromCustom,
  collectionEntryFromProducer,
  collectionEntryFromSinger,
  collectionEntryFromSong,
  collectionShouldShowCover,
  collectionSlotInitialState,
  searchCollectionSongs,
} from '../services/collectionService';
import './CollectionPage.css';

const MAX_ITEMS = 3;

function emptyDraft() {
  return { title: '术曲个人喜好表', nickname: '', slots: collectionSlotInitialState() };
}

function loadDraft() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(COLLECTION_STORAGE_KEY) || 'null');
    if (!saved || typeof saved !== 'object' || !saved.slots) return emptyDraft();
    return {
      title: typeof saved.title === 'string' && saved.title.trim() ? saved.title : '术曲个人喜好表',
      nickname: typeof saved.nickname === 'string' ? saved.nickname : '',
      slots: { ...collectionSlotInitialState(), ...saved.slots },
    };
  } catch {
    return emptyDraft();
  }
}

function saveDraft(draft) {
  try {
    window.localStorage.setItem(COLLECTION_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // A large uploaded image should not prevent the sheet from being used in memory.
  }
}

function readCompressedImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('封面读取失败'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('封面格式无法读取'));
      image.onload = () => {
        const size = 640;
        const scale = Math.min(1, size / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
        canvas.height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/webp', 0.82));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function Cover({ entry, large = false }) {
  const [failed, setFailed] = useState(false);
  if (!entry?.coverUrl || failed) return <div className={'collection-cover-placeholder' + (large ? ' large' : '')} aria-label="暂无封面">♫</div>;
  return <img className={'collection-cover' + (large ? ' large' : '') + (entry.kind === 'singer' ? ' singer-cover' : '')} src={entry.coverUrl} alt={`${entry.title}封面`} onError={() => setFailed(true)} />;
}

function EntryNames({ entries }) {
  return <div className="collection-entry-names">{entries.map((entry) => <span key={entry.id}>{entry.title}</span>)}</div>;
}

function SlotPreview({ definition, entries, onEdit, onRemove }) {
  const showCover = collectionShouldShowCover(entries);
  return (
    <article className={'collection-slot ' + (entries.length ? 'filled' : 'empty')}>
      <div className="collection-slot-label"><span>{definition.label}</span><small className={entries.length ? 'collection-filled-status' : ''}>{entries.length ? '已填入' : '未填写'} · {entries.length}/{MAX_ITEMS}</small></div>
      {showCover ? <div className="collection-single-cover"><Cover entry={entries[0]} large /><strong>{entries[0].title}</strong></div> : entries.length ? <EntryNames entries={entries} /> : <div className="collection-slot-empty">点击选择{definition.type === 'singer' ? '歌姬' : definition.type === 'producer' ? 'P 主' : '歌曲'}</div>}
      <div className="collection-slot-actions">
        <button type="button" onClick={onEdit}>{entries.length ? '编辑' : '填入'}</button>
        {entries.length > 0 && <button type="button" className="collection-clear-button" onClick={onRemove}>清空</button>}
      </div>
    </article>
  );
}

function Picker({ slot, songs, producers, singers, selectedEntries = [], onAdd, onClose }) {
  const [query, setQuery] = useState('');
  const [customTitle, setCustomTitle] = useState('');
  const [customCover, setCustomCover] = useState('');
  const [error, setError] = useState('');
  const isSong = slot.type === 'song';
  const isSinger = slot.type === 'singer';
  const selectedIds = useMemo(() => new Set(selectedEntries.map((entry) => entry.id)), [selectedEntries]);
  const results = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('zh-CN');
    if (isSong) return searchCollectionSongs(songs, query);
    const pool = isSinger ? singers : producers;
    if (!normalized) return pool.slice(0, 20);
    return pool.filter((item) => {
      const values = [item.name, item.shortName, ...(item.aliases || [])];
      return values.some((value) => String(value || '').toLocaleLowerCase('zh-CN').includes(normalized));
    }).slice(0, 20);
  }, [isSinger, isSong, producers, query, singers, songs]);

  const pickerTitle = isSong ? '歌曲' : isSinger ? '歌姬' : 'P 主';
  const customHint = isSong ? '自定义歌曲只保存在你的本地喜好表中，不会修改公共曲库。' : isSinger ? '自定义歌姬只保存在你的本地喜好表中。' : '数据库之外的创作者也可以手动加入。';
  const addCustom = () => {
    if (selectedEntries.length >= MAX_ITEMS) return setError('当前栏位已达到 3 项上限');
    if (!customTitle.trim()) return setError('请先填写' + pickerTitle + '名');
    onAdd(collectionEntryFromCustom(customTitle, customCover, isSong ? 'song' : isSinger ? 'singer' : 'producer'));
    setCustomTitle('');
    setCustomCover('');
    setError('已填入' + pickerTitle + '，可继续选择');
  };

  return <div className="collection-picker-backdrop" role="presentation"><section className="collection-picker" role="dialog" aria-modal="true" aria-labelledby="collection-picker-title">
    <div className="collection-picker-heading"><div><p className="eyebrow">快速填表</p><h2 id="collection-picker-title">{slot.label}</h2><small>已填入 {selectedEntries.length}/{MAX_ITEMS} · 最多选择 {MAX_ITEMS} 项</small></div><button type="button" className="collection-close" onClick={onClose} aria-label={'关闭' + pickerTitle + '选择'}>×</button></div>
    <label className="collection-search-label">搜索本地{pickerTitle}库<input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={'输入' + pickerTitle + '名称' + (isSong ? '、拼音或歌姬' : '或别名')} /></label>
    <div className={'collection-picker-results ' + (isSong ? '' : 'producer-results')}>
      {results.length ? results.map((item) => {
        const selected = selectedIds.has(item.id);
        const entry = isSong ? collectionEntryFromSong(item) : isSinger ? collectionEntryFromSinger(item) : collectionEntryFromProducer(item);
        return <button type="button" className={'collection-picker-result ' + (selected ? 'selected' : '')} key={item.id} onClick={() => { if (!selected && selectedEntries.length < MAX_ITEMS) { onAdd(entry); setError('已填入' + pickerTitle); } }} disabled={selected || selectedEntries.length >= MAX_ITEMS} aria-pressed={selected}>
          {isSong ? <span className="collection-result-cover"><Cover entry={entry} /></span> : entry.coverUrl ? <span className="collection-result-cover collection-entity-image"><Cover entry={entry} /></span> : <span className={isSinger ? 'collection-singer-mark' : 'collection-producer-mark'}>{isSinger ? item.shortName || '姬' : 'P'}</span>}
          <span><strong>{isSong ? item.title : item.name}</strong><small>{isSinger ? '数据库歌姬' : item.collectionKind === 'song-staff' ? '歌曲 STAFF · 填词 / 作曲 / 编曲等' : item.aliases?.length ? item.aliases.join('、') : 'P 主数据库'}</small></span>
          <b>{selected ? '✓ 已填入' : '＋ 填入'}</b>
        </button>;
      }) : <p className="collection-picker-empty">没有找到匹配的{pickerTitle}。</p>}
    </div>
    <div className="collection-custom-form"><strong>找不到？添加自定义{pickerTitle}</strong><div className="collection-custom-row"><input value={customTitle} onChange={(event) => setCustomTitle(event.target.value)} placeholder={'自定义' + pickerTitle + '名'} />{isSong && <label className="collection-upload-button">{customCover ? '已选择封面' : '上传封面'}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; try { setCustomCover(await readCompressedImage(file)); setError('封面已准备好'); } catch (caught) { setError(caught.message); } }} /></label>}<button type="button" onClick={addCustom}>加入</button></div><small>{customHint}</small></div>
    {error && <p className="collection-picker-message" role="status">{error}</p>}
  </section></div>;
}
function wrapCanvasText(context, text, maxWidth) {
  const chars = [...String(text)];
  const lines = [];
  let line = '';
  for (const char of chars) {
    const next = line + char;
    if (line && context.measureText(next).width > maxWidth) {
      lines.push(line);
      line = char;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

function roundedRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

function loadCanvasImage(url) {
  return new Promise((resolve) => {
    if (!url) return resolve(null);
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

async function downloadSheet(title, nickname, slots) {
  const canvas = document.createElement('canvas');
  const scale = 2;
  const width = 900;
  const height = 1260;
  canvas.width = width * scale;
  canvas.height = height * scale;
  const context = canvas.getContext('2d');
  context.scale(scale, scale);
  const background = context.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, '#e9f6f7');
  background.addColorStop(0.5, '#f9f1ed');
  background.addColorStop(1, '#e9eafb');
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);
  context.fillStyle = 'rgba(255,255,255,.55)';
  context.beginPath(); context.arc(770, 90, 170, 0, Math.PI * 2); context.fill();
  context.fillStyle = '#19364c';
  context.textAlign = 'center';
  context.font = '800 34px "Microsoft YaHei", sans-serif';
  context.fillText(title || '术曲个人喜好表', width / 2, 54);
  context.font = '500 13px "Microsoft YaHei", sans-serif';
  context.fillStyle = '#60788a';
  context.fillText(nickname || '我的歌曲收藏记录', width / 2, 79);

  const marginX = 34;
  const gap = 12;
  const cardWidth = (width - marginX * 2 - gap * 4) / 5;
  const cardHeight = 173;
  const startY = 105;
  const labelHeight = 28;
  for (let index = 0; index < COLLECTION_SLOT_DEFINITIONS.length; index += 1) {
    const definition = COLLECTION_SLOT_DEFINITIONS[index];
    const entries = slots[definition.id] || [];
    const x = marginX + (index % 5) * (cardWidth + gap);
    const y = startY + Math.floor(index / 5) * (cardHeight + 12);
    context.fillStyle = 'rgba(255,255,255,.82)';
    roundedRect(context, x, y, cardWidth, cardHeight, 13); context.fill();
    context.strokeStyle = definition.type === 'producer' ? '#db8b72' : '#8ebfc2';
    context.lineWidth = 1.4; context.stroke();
    context.fillStyle = definition.type === 'producer' ? '#fff0e9' : '#edf7f7';
    roundedRect(context, x, y, cardWidth, labelHeight, 13); context.fill();
    context.fillStyle = '#31576b';
    context.font = '800 11px "Microsoft YaHei", sans-serif';
    context.textAlign = 'center';
    context.fillText(definition.label, x + cardWidth / 2, y + 18);
    const showCover = collectionShouldShowCover(entries);
    if (showCover) {
      const image = await loadCanvasImage(entries[0].coverUrl);
      if (image) {
        const imageSize = Math.min(cardWidth - 26, cardHeight - labelHeight - 34);
        const imageX = x + (cardWidth - imageSize) / 2;
        const imageY = y + labelHeight + 8;
        context.save(); roundedRect(context, imageX, imageY, imageSize, imageSize, 8); context.clip();
        const ratio = Math.max(imageSize / image.width, imageSize / image.height);
        const drawWidth = image.width * ratio; const drawHeight = image.height * ratio;
        const drawY = entries[0].kind === 'singer' ? imageY : imageY + (imageSize - drawHeight) / 2;
        context.drawImage(image, imageX + (imageSize - drawWidth) / 2, drawY, drawWidth, drawHeight); context.restore();
        context.fillStyle = '#31576b'; context.font = '700 10px "Microsoft YaHei", sans-serif'; context.fillText(entries[0].title, x + cardWidth / 2, y + cardHeight - 10);
        continue;
      }
    }
    context.fillStyle = entries.length ? '#28495c' : '#9bb0ba';
    context.font = entries.length ? '700 12px "Microsoft YaHei", sans-serif' : '500 11px "Microsoft YaHei", sans-serif';
    const lines = entries.length ? entries.flatMap((entry) => wrapCanvasText(context, entry.title, cardWidth - 22)) : ['点击后填写'];
    lines.slice(0, 6).forEach((line, lineIndex) => context.fillText(line, x + cardWidth / 2, y + labelHeight + 31 + lineIndex * 19));
  }
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('图片生成失败');
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${(title || '术曲个人喜好表').replace(/[\\/:*?"<>|]/gu, '_')}.png`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function CollectionPage({ songs, producers, singers = [], onBack, Brand }) {
  const collectionSongs = useMemo(() => buildCollectionSongPool(songs), [songs]);
  const [draft, setDraft] = useState(loadDraft);
  const [picker, setPicker] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');

  useEffect(() => saveDraft(draft), [draft]);

  const updateSlot = (slotId, entry) => {
    setDraft((current) => {
      const existing = current.slots[slotId] || [];
      if (existing.length >= MAX_ITEMS || existing.some((item) => item.id === entry.id)) return current;
      return { ...current, slots: { ...current.slots, [slotId]: [...existing, entry] } };
    });
  };

  const clearSlot = (slotId) => setDraft((current) => ({ ...current, slots: { ...current.slots, [slotId]: [] } }));

  const generate = () => {
    setConfirmed(true);
    setSaveStatus('');
    window.scrollTo?.({ top: 0, behavior: 'smooth' });
  };

  if (confirmed) return <div className="page-shell collection-page"><header className="inner-header collection-header"><Brand compact /><div className="collection-header-actions"><span>成果预览</span><button type="button" className="back-button" onClick={() => setConfirmed(false)}>← 返回修改</button></div></header><main className="collection-result-main"><div className="collection-result-heading"><p className="eyebrow">个人喜好表 · 已确认</p><h2>{draft.title || '术曲个人喜好表'}</h2><p>这是你的歌曲收藏成果，可以保存为图片。</p><label className="collection-nickname-input">玩家昵称（可选）<input value={draft.nickname} onChange={(event) => setDraft((current) => ({ ...current, nickname: event.target.value }))} maxLength={24} placeholder="输入昵称，保存结果图时会显示" /></label></div><CollectionSheetPreview title={draft.title} nickname={draft.nickname} slots={draft.slots} /><div className="collection-result-actions"><button type="button" className="primary-button" onClick={async () => { try { await downloadSheet(draft.title, draft.nickname, draft.slots); setSaveStatus('已生成图片，请在浏览器下载栏查看。'); } catch (error) { setSaveStatus(error.message); } }}>保存成果图</button><button type="button" className="ghost-button" onClick={() => setConfirmed(false)}>继续修改</button></div>{saveStatus && <p className="collection-save-status" role="status">{saveStatus}</p>}</main></div>;

  return <div className="page-shell collection-page"><header className="inner-header collection-header"><Brand compact /><div className="collection-header-actions"><span>{collectionSongs.length} 首可选歌曲</span><button type="button" className="back-button" onClick={onBack}>← 返回主页</button></div></header><main className="collection-main"><div className="collection-editor-heading"><div><p className="eyebrow">趣味收集</p><h2>术曲个人喜好表</h2><p>把你心里最重要的歌曲，放进属于自己的 30 个位置。</p></div><label className="collection-title-input">表格标题<input value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} maxLength={30} /></label></div><section className="collection-sheet collection-editor-sheet" aria-label="个人喜好表填写区域"><div className="collection-sheet-heading"><strong>{draft.title || '术曲个人喜好表'}</strong><small>每格最多 3 项 · 仅一首且有封面时显示封面</small></div><div className="collection-grid">{COLLECTION_SLOT_DEFINITIONS.map((definition) => <SlotPreview key={definition.id} definition={definition} entries={draft.slots[definition.id] || []} onEdit={() => setPicker(definition)} onRemove={() => clearSlot(definition.id)} />)}</div></section><div className="collection-editor-footer"><div><strong>填完了吗？</strong><span>确认后会生成一张完整的成果表格图，之后仍可以返回修改。</span></div><button type="button" className="primary-button collection-confirm-button" onClick={generate}>确认并生成成果图 →</button></div></main>{picker && <Picker slot={picker} songs={collectionSongs} producers={producers} singers={singers} selectedEntries={draft.slots[picker.id] || []} onAdd={(entry) => updateSlot(picker.id, entry)} onClose={() => setPicker(null)} />}</div>;
}

function CollectionSheetPreview({ title, nickname, slots }) {
  return <section className="collection-sheet collection-result-sheet" aria-label="个人喜好表成果图预览"><div className="collection-sheet-heading"><strong>{title || '术曲个人喜好表'}</strong><small>{nickname || '我的歌曲收藏记录'}</small></div><div className="collection-grid">{COLLECTION_SLOT_DEFINITIONS.map((definition) => <SlotPreview key={definition.id} definition={definition} entries={slots[definition.id] || []} onEdit={() => undefined} onRemove={() => undefined} />)}</div></section>;
}

