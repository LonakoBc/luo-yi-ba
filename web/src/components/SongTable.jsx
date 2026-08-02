const COLUMNS = [
  ['title', '曲目'],
  ['staff', 'STAFF'],
  ['year', '年份'],
  ['voicebank', '声库'],
  ['vocalType', '独唱或合唱'],
];

function FeedbackValue({ value, feedback }) {
  const direction = feedback?.direction === 'up' ? ' ↑' : feedback?.direction === 'down' ? ' ↓' : '';
  const marker = feedback?.state === 'exact' ? '✓' : feedback?.state === 'near' ? '≈' : '';
  const label = feedback?.state === 'exact' ? '完全匹配' : feedback?.state === 'near' ? '相近' : '不匹配';
  return (
    <span className={`feedback-value ${feedback?.state ?? 'miss'}`} title={label}>
      <span>{value}{direction}</span>
      {marker && <span className="feedback-marker" aria-label={label}>{marker}</span>}
    </span>
  );
}

function HiddenValue({ value, revealed }) {
  if (revealed) return <span className="answer-value revealed">{value}</span>;
  return (
    <span className="answer-value blurred" aria-label="尚未揭示">
      <span aria-hidden="true">{value}</span>
    </span>
  );
}

function AnswerRow({ answer, hintLevel, won }) {
  const values = {
    title: answer.title,
    staff: answer.staffDisplay,
    year: answer.year,
    voicebank: answer.voicebank,
    vocalType: answer.vocalType,
  };
  return (
    <tr className={`song-row answer-row ${won ? 'won' : ''}`}>
      {COLUMNS.map(([key, label]) => {
        const revealed = won || (key === 'year' && hintLevel >= 1) || (key === 'staff' && hintLevel >= 2);
        return (
          <td key={key} data-label={label} className={revealed && won ? 'answer-correct' : ''}>
            <HiddenValue value={values[key]} revealed={revealed} />
          </td>
        );
      })}
    </tr>
  );
}

function GuessRow({ entry }) {
  const { song, feedback } = entry;
  const values = {
    title: song.title,
    staff: song.staffDisplay,
    year: song.year,
    voicebank: song.voicebank,
    vocalType: song.vocalType,
  };
  return (
    <tr className={`song-row guess-row ${feedback.isCorrect ? 'correct-answer' : ''}`}>
      {COLUMNS.map(([key, label]) => (
        <td key={key} data-label={label}>
          <FeedbackValue value={values[key]} feedback={feedback[key]} />
        </td>
      ))}
    </tr>
  );
}

export default function SongTable({ answer, guesses, hintLevel, won }) {
  return (
    <section className="table-section" aria-labelledby="table-title">
      <div className="table-heading">
        <div>
          <p className="eyebrow">猜测记录</p>
          <h2 id="table-title">答案就在这里</h2>
        </div>
        <div className="legend" aria-label="反馈图例">
          <span><i className="legend-dot exact" />完全匹配</span>
          <span><i className="legend-dot near" />部分匹配</span>
        </div>
      </div>
      <div className="table-scroll">
        <table className="song-table">
          <thead>
            <tr>{COLUMNS.map(([, label]) => <th key={label}>{label}</th>)}</tr>
          </thead>
          <tbody>
            <AnswerRow answer={answer} hintLevel={hintLevel} won={won} />
            {guesses.map((entry) => <GuessRow key={entry.song.id} entry={entry} />)}
          </tbody>
        </table>
      </div>
      {!guesses.length && <p className="empty-state">答案行已经就位，输入一首歌开始寻找线索吧。</p>}
    </section>
  );
}
