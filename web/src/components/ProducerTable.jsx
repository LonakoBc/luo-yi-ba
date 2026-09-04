function Arrow({ direction }) {
  return direction ? <span className="producer-arrow" aria-label={direction === 'up' ? '答案更多或更晚' : '答案更少或更早'}>{direction === 'up' ? '↑' : '↓'}</span> : null;
}

function Scalar({ value, feedback }) {
  return <span className={`producer-scalar feedback-${feedback?.state ?? 'hidden'}`}>{value}<Arrow direction={feedback?.direction} /></span>;
}

function SongTokens({ songs = [], feedback = [], revealed = songs.map(() => true) }) {
  return <div className="producer-song-tags">{songs.map((song, index) => <span key={`${song}-${index}`} className={`producer-song-tag ${feedback[index]?.matched ? 'matched' : ''} ${revealed[index] ? '' : 'concealed'}`}>{revealed[index] ? song : '隐藏曲目'}</span>)}</div>;
}

function AnswerRow({ answer, hintLevel, yearDebutRevealed, finished }) {
  const revealYearDebut = finished || hintLevel >= 1 || yearDebutRevealed;
  const revealedSongs = [finished || hintLevel >= 3, finished || hintLevel >= 3, finished || hintLevel >= 3, finished || hintLevel >= 2, finished || hintLevel >= 1];
  return (
    <tr className="answer-row">
      <td data-label="P 主"><span className={finished ? 'answer-revealed' : 'blurred-answer'}>{finished ? answer.name : '答案 P 主'}</span></td>
      <td data-label="初投稿年份"><span className={revealYearDebut ? 'answer-revealed' : 'blurred-answer'}>{revealYearDebut ? answer.debutYear : '0000'}</span></td>
      <td data-label="出道曲"><span className={revealYearDebut ? 'answer-revealed' : 'blurred-answer'}>{revealYearDebut ? answer.debutSong : '隐藏曲目'}</span></td>
      {['hallCount', 'legendCount', 'mythCount'].map((key) => <td key={key} data-label={{ hallCount: '殿堂及以上', legendCount: '传说', mythCount: '神话' }[key]}><span className={(finished || hintLevel >= 2) ? 'answer-revealed' : 'blurred-answer'}>{(finished || hintLevel >= 2) ? answer[key] : '00'}</span></td>)}
      <td data-label="代表曲"><SongTokens songs={answer.representativeSongs} revealed={revealedSongs} /></td>
    </tr>
  );
}

export default function ProducerTable({ answer, guesses, hintLevel, yearDebutRevealed, finished }) {
  return (
    <section className="table-wrap producer-table-wrap" aria-label="P 主猜测记录">
      <table className="producer-table">
        <thead><tr><th>P 主</th><th>初投稿年份</th><th>出道曲</th><th>殿堂及以上</th><th>传说</th><th>神话</th><th>代表曲</th></tr></thead>
        <tbody>
          <AnswerRow answer={answer} hintLevel={hintLevel} yearDebutRevealed={yearDebutRevealed} finished={finished} />
          {guesses.map(({ producer, feedback }) => (
            <tr key={producer.id} className="guess-row">
              <td data-label="P 主"><span className={`producer-scalar feedback-${feedback.name?.state ?? 'miss'}`}>{producer.name}</span></td>
              <td data-label="初投稿年份"><Scalar value={producer.debutYear} feedback={feedback.debutYear} /></td>
              <td data-label="出道曲"><span className={`producer-scalar feedback-${feedback.debutSong?.state ?? 'miss'}`}>{producer.debutSong}</span></td>
              <td data-label="殿堂及以上"><Scalar value={producer.hallCount} feedback={feedback.hallCount} /></td>
              <td data-label="传说"><Scalar value={producer.legendCount} feedback={feedback.legendCount} /></td>
              <td data-label="神话"><Scalar value={producer.mythCount} feedback={feedback.mythCount} /></td>
              <td data-label="代表曲"><SongTokens songs={producer.representativeSongs} feedback={feedback.representativeSongs} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
