import { useEffect, useRef, useState } from 'react';

export default function GuessInput({ service, disabled, guessedIds, onGuess }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef(null);
  const results = service.searchSongs(query).filter((song) => !guessedIds.has(song.id));

  useEffect(() => setActiveIndex(-1), [query]);
  useEffect(() => {
    const close = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);

  const choose = (song) => {
    if (!song) return;
    onGuess(song);
    setQuery('');
    setOpen(false);
  };

  const submit = () => {
    const resolved = service.resolveSong(query);
    if (resolved) choose(resolved);
    else onGuess(null, query);
  };

  const handleKeyDown = (event) => {
    if (event.key === 'ArrowDown' && results.length) {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => (index + 1 + results.length) % results.length);
    } else if (event.key === 'ArrowUp' && results.length) {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => (index - 1 + results.length) % results.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (open && activeIndex >= 0 && results[activeIndex]) choose(results[activeIndex]);
      else submit();
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="guess-form" ref={rootRef}>
      <div className="search-shell">
        <label htmlFor="song-search">输入你猜测的歌曲</label>
        <div className="search-row">
          <input
            id="song-search"
            value={query}
            disabled={disabled}
            autoComplete="off"
            placeholder="支持曲名或拼音，例如：普通DISCO"
            onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onKeyDown={handleKeyDown}
            aria-expanded={open && results.length > 0}
            aria-controls="song-options"
          />
          <button type="button" className="primary-button" disabled={disabled || !query.trim()} onClick={submit}>提交猜测</button>
        </div>
        {open && query.trim() && (
          <ul id="song-options" className="search-results" role="listbox">
            {results.length ? results.map((song, index) => (
              <li key={song.id}>
                <button
                  type="button"
                  className={index === activeIndex ? 'active' : ''}
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => choose(song)}
                  role="option"
                  aria-selected={index === activeIndex}
                >
                  <span>{song.title}</span><small>{song.slug ?? song.id}</small>
                </button>
              </li>
            )) : <li className="no-results">没有找到未猜过的歌曲</li>}
          </ul>
        )}
      </div>
    </div>
  );
}
