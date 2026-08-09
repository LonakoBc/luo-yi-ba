import { useMemo, useState } from 'react';
import {
  createDefaultFilters,
  filterSongs,
  getLibraryOptions,
} from '../services/libraryService';

function ToggleGroup({ label, options, selected, onToggle }) {
  return (
    <fieldset className="filter-group">
      <legend>{label}</legend>
      <div className="filter-options">
        {options.map((option) => {
          const value = typeof option === 'string' ? option : option.value;
          const text = typeof option === 'string' ? option : option.label;
          return <button key={value} type="button" className="filter-chip" aria-pressed={selected.includes(value)} onClick={() => onToggle(value)}>{text}</button>;
        })}
      </div>
    </fieldset>
  );
}

export default function LibraryPage({ songs, presets, onBack, onStartPreset, onStartCustom, Brand }) {
  const options = useMemo(() => getLibraryOptions(songs), [songs]);
  const [filters, setFilters] = useState(() => createDefaultFilters(songs));
  const years = Array.from({ length: options.maxYear - options.minYear + 1 }, (_, index) => options.minYear + index);
  const candidates = useMemo(() => filterSongs(songs, filters), [songs, filters]);

  const toggle = (field, value) => setFilters((current) => ({
    ...current,
    [field]: current[field].includes(value) ? current[field].filter((item) => item !== value) : [...current[field], value],
  }));
  const invalidReason = !filters.collections.length ? '请至少选择一个主要曲库'
    : !filters.voicebanks.length ? '请至少选择一种声库'
      : !filters.specials.length ? '请至少选择一种特殊标注'
        : !candidates.length ? '当前条件下没有可用歌曲' : '';

  return (
    <div className="page-shell library-page">
      <header className="inner-header"><button type="button" className="back-button" onClick={onBack}>← 返回主页</button><Brand compact /></header>
      <main className="library-main">
        <p className="eyebrow">猜歌曲库</p><h2>选择曲库范围</h2><p className="mode-intro">使用预设立即开始，或者组合条件建立自己的题库。</p>
        <section className="preset-section" aria-labelledby="preset-title">
          <div className="section-heading"><h3 id="preset-title">快速预设</h3><span>点击后直接开始</span></div>
          <div className="preset-grid">
            {presets.map((preset) => (
              <button type="button" className="preset-card" key={preset.id} onClick={() => onStartPreset(preset.id)}>
                <strong>{preset.name}</strong><span>{preset.description}</span><small>{preset.titles.length} 首 →</small>
                {preset.badge && <span className="preset-singer-badge" style={{ '--preset-badge-color': preset.badge.color, '--preset-badge-text': preset.badge.textColor ?? '#FFFFFF' }} aria-hidden="true">{preset.badge.text}</span>}
              </button>
            ))}
          </div>
        </section>
        <section className="filter-panel" aria-labelledby="custom-title">
          <div className="section-heading"><h3 id="custom-title">自定义曲库</h3><span>当前 {candidates.length} 首候选</span></div>
          <ToggleGroup label="主要曲库（多选取并集）" options={options.collections.map(({ id, name }) => ({ value: id, label: name }))} selected={filters.collections} onToggle={(value) => toggle('collections', value)} />
          <ToggleGroup label="必须包含的演唱歌姬（可选）" options={options.singers} selected={filters.singers} onToggle={(value) => toggle('singers', value)} />
          <ToggleGroup label="使用声库" options={options.voicebanks} selected={filters.voicebanks} onToggle={(value) => toggle('voicebanks', value)} />
          <ToggleGroup label="特殊标注" options={options.specials} selected={filters.specials} onToggle={(value) => toggle('specials', value)} />
          <fieldset className="filter-group">
            <legend>发布时间</legend>
            <div className="year-range">
              <label>最早年份<select value={filters.fromYear} onChange={(event) => setFilters((current) => ({ ...current, fromYear: Number(event.target.value), toYear: Math.max(current.toYear, Number(event.target.value)) }))}>{years.map((year) => <option key={year} value={year}>{year}</option>)}</select></label>
              <span>—</span>
              <label>最晚年份<select value={filters.toYear} onChange={(event) => setFilters((current) => ({ ...current, toYear: Number(event.target.value), fromYear: Math.min(current.fromYear, Number(event.target.value)) }))}>{years.map((year) => <option key={year} value={year}>{year}</option>)}</select></label>
            </div>
          </fieldset>
          <label className="concert-toggle"><input type="checkbox" checked={filters.concertOnly} onChange={(event) => setFilters((current) => ({ ...current, concertOnly: event.target.checked }))} /><span>仅包含登上过演唱会或生日会的曲目</span></label>
          <button type="button" className="start-library-button" disabled={Boolean(invalidReason)} onClick={() => onStartCustom(filters)}>开始游戏 · {candidates.length} 首</button>
          <p className={`filter-notice ${invalidReason ? 'visible' : ''}`} role="status">{invalidReason || '已准备好完整曲库'}</p>
        </section>
      </main>
    </div>
  );
}
