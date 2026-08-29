export const SONG_FEEDBACK_COLUMNS = [
  ['title', '曲名'],
  ['staff', 'STAFF'],
  ['releaseMonth', '发布时间'],
  ['singers', '演唱歌姬'],
  ['voicebanks', '使用声库'],
  ['concertCount', '演唱会/生日会次数'],
  ['special', '特殊标注'],
];

function normalizeMember(value) {
  const normalized = String(value ?? '').normalize('NFKC').toLocaleLowerCase('zh-CN').trim();
  return normalized === 'minus' ? '永夜minus' : normalized;
}

function Direction({ direction }) {
  if (!direction) return null;
  return <span className="direction" aria-label={direction === 'up' ? '答案更大或更晚' : '答案更小或更早'}>{direction === 'up' ? '↑' : '↓'}</span>;
}

function ScalarFeedback({ value, feedback }) {
  const marker = feedback?.state === 'exact' ? '✓' : feedback?.state === 'near' ? '≈' : '';
  const label = feedback?.state === 'exact' ? '完全匹配' : feedback?.state === 'near' ? '部分匹配' : '不匹配';
  return (
    <span className={`feedback-value ${feedback?.state ?? 'miss'}`} title={label}>
      <span>{value}</span><Direction direction={feedback?.direction} />
      {marker && <span className="feedback-marker" aria-label={label}>{marker}</span>}
    </span>
  );
}

function MemberTokens({ display, feedback }) {
  const matches = new Set(feedback?.matches ?? []);
  return (
    <span className="token-list">
      {String(display).split('；').map((member) => member.trim()).filter(Boolean).map((member) => (
        <span key={member} className={`clue-token ${matches.has(normalizeMember(member)) ? 'exact' : ''}`}>{member}</span>
      ))}
    </span>
  );
}

function StaffTokens({ display, feedback }) {
  const matches = new Set(feedback?.matches ?? []);
  return (
    <span className="staff-list">
      {String(display).split('；').map((entry, entryIndex) => {
        const separator = Math.max(entry.indexOf('：'), entry.indexOf(':'));
        const role = separator >= 0 ? entry.slice(0, separator + 1) : '';
        const names = (separator >= 0 ? entry.slice(separator + 1) : entry).split(/[、,，/]/u).map((name) => name.trim()).filter(Boolean);
        return (
          <span className="staff-entry" key={`${entry}-${entryIndex}`}>
            {role && <span className="staff-role">{role}</span>}
            {names.map((name) => <span key={name} className={`clue-token ${matches.has(normalizeMember(name)) ? 'exact' : ''}`}>{name}</span>)}
          </span>
        );
      })}
    </span>
  );
}

function ReleaseFeedback({ value, feedback }) {
  const [year, month] = value.split('-');
  return (
    <span className="release-feedback">
      <span className={`date-token ${feedback?.year?.state ?? 'miss'}`}>{year}</span>
      <span className="date-separator">-</span>
      <span className={`date-token ${feedback?.month?.state ?? 'miss'}`}>{month}</span>
      <Direction direction={feedback?.direction} />
    </span>
  );
}

function HiddenValue({ value, revealed }) {
  if (revealed) return <span className="answer-value revealed">{value}</span>;
  return <span className="answer-value blurred" aria-label="尚未揭示"><span aria-hidden="true">{value}</span></span>;
}

function AnswerRow({ answer, hintLevel, finished }) {
  const values = {
    title: answer.title,
    staff: answer.staffDisplay,
    releaseMonth: answer.releaseMonth,
    singers: answer.singersDisplay,
    voicebanks: answer.voicebanksDisplay,
    concertCount: answer.concertCount,
    special: answer.special,
  };
  return (
    <tr className={`song-row answer-row ${finished ? 'won' : ''}`}>
      {SONG_FEEDBACK_COLUMNS.map(([key, label]) => {
        const revealed = finished
          || (hintLevel >= 1 && (key === 'singers' || key === 'releaseMonth'))
          || (hintLevel >= 2 && key === 'staff');
        return <td key={key} data-label={label}><HiddenValue value={values[key]} revealed={revealed} /></td>;
      })}
    </tr>
  );
}

export function GuessValue({ field, song, feedback }) {
  if (field === 'title') return <span className="title-value">{song.title}</span>;
  if (field === 'staff') return <StaffTokens display={song.staffDisplay} feedback={feedback.staff} />;
  if (field === 'releaseMonth') return <ReleaseFeedback value={song.releaseMonth} feedback={feedback.releaseMonth} />;
  if (field === 'singers') return <MemberTokens display={song.singersDisplay} feedback={feedback.singers} />;
  if (field === 'voicebanks') return <MemberTokens display={song.voicebanksDisplay} feedback={feedback.voicebanks} />;
  if (field === 'concertCount') return <ScalarFeedback value={song.concertCount} feedback={feedback.concertCount} />;
  return <ScalarFeedback value={song.special} feedback={feedback.special} />;
}

function GuessRow({ entry }) {
  const { song, feedback } = entry;
  return (
    <tr className={`song-row guess-row ${feedback.isCorrect ? 'correct-answer' : ''}`}>
      {SONG_FEEDBACK_COLUMNS.map(([key, label]) => <td key={key} data-label={label}><GuessValue field={key} song={song} feedback={feedback} /></td>)}
    </tr>
  );
}

export default function SongTable({ answer, guesses, hintLevel, finished }) {
  return (
    <section className="table-section game-feedback-table" aria-labelledby="table-title">
      <div className="table-heading">
        <div><p className="eyebrow">猜测记录</p><h2 id="table-title">答案就在这里</h2></div>
        <div className="legend" aria-label="反馈图例">
          <span><i className="legend-dot exact" />完全匹配</span>
          <span><i className="legend-dot near" />部分匹配</span>
        </div>
      </div>
      <div className="table-scroll">
        <table className="song-table">
          <thead><tr>{SONG_FEEDBACK_COLUMNS.map(([, label]) => <th key={label}>{label}</th>)}</tr></thead>
          <tbody>
            <AnswerRow answer={answer} hintLevel={hintLevel} finished={finished} />
            {guesses.map((entry) => <GuessRow key={entry.song.id} entry={entry} />)}
          </tbody>
        </table>
      </div>
      {!guesses.length && <p className="empty-state">答案行已经就位，输入一首歌开始寻找线索吧。</p>}
    </section>
  );
}
