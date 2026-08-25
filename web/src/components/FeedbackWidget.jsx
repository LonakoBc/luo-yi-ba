import { useEffect, useState } from 'react';
import { listFeedback, submitFeedback } from '../services/feedbackClient';
import { getToyUserProfile, IS_TOY_BUILD } from '../services/toyService';

const CATEGORY_LABELS = { catalog: '曲库纠错', gameplay: '玩法建议', bug: '问题反馈', other: '其他' };
const STATUS_LABELS = { pending: '待审核', public: '已公开', adopted: '已采纳', fixed: '已修复' };

export default function FeedbackWidget({ onOpenAdmin }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [category, setCategory] = useState('catalog');
  const [content, setContent] = useState('');
  const [profile, setProfile] = useState(null);
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    let active = true;
    const refresh = () => listFeedback().then((next) => active && setItems((current) => [...current.filter((item) => item.status === 'pending'), ...next])).catch(() => active && setMessage('暂时无法读取公开留言'));
    refresh();
    const timer = window.setInterval(refresh, 20_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [open]);

  const connectBilibili = async () => {
    setMessage('');
    try {
      const next = await getToyUserProfile();
      if (!next) return setMessage('当前环境不支持读取 B站资料，可继续匿名提交');
      setProfile(next);
      setName(next.nickname ?? '');
    } catch { setMessage('未获得 B站资料授权，可继续匿名提交'); }
  };

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true); setMessage('');
    try {
      const item = await submitFeedback({ category, content, displayName: profile?.nickname ?? name, avatarUrl: profile?.avatar, toyOpenId: profile?.toyOpenId, context: { page: window.location.hash || window.location.pathname, label: document.title } });
      setItems((current) => [item, ...current]);
      setContent('');
      setMessage('提交成功，审核通过后会公开显示');
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  };

  return (
    <aside className={`feedback-widget ${open ? 'is-open' : ''}`} aria-label="意见箱">
      <button type="button" className="feedback-tab" aria-expanded={open} onClick={() => setOpen((value) => !value)}>意见箱</button>
      {open && <div className="feedback-drawer">
        <header><div><p className="eyebrow">共同维护曲库</p><h2>意见箱</h2></div><button type="button" className="feedback-close" aria-label="关闭意见箱" onClick={() => setOpen(false)}>×</button></header>
        <p className="feedback-help">纠错、玩法建议和问题都可以留在这里。新留言需审核后公开。</p>
        <form onSubmit={submit} className="feedback-form">
          <label>类型<select value={category} onChange={(event) => setCategory(event.target.value)}>{Object.entries(CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>称呼<input maxLength="20" value={profile?.nickname ?? name} disabled={Boolean(profile)} placeholder="匿名听众" onChange={(event) => setName(event.target.value)} /></label>
          {IS_TOY_BUILD && !profile && <button type="button" className="feedback-profile-button" onClick={connectBilibili}>使用 B站昵称与头像</button>}
          {profile && <div className="feedback-profile">{profile.avatar && <img src={profile.avatar} alt="" />}<span>{profile.nickname}</span></div>}
          <label>内容<textarea required minLength="4" maxLength="300" rows="4" value={content} placeholder="请尽量写清歌曲名、错误内容或复现步骤" onChange={(event) => setContent(event.target.value)} /></label>
          <button type="submit" className="feedback-submit" disabled={busy}>{busy ? '提交中…' : '提交意见'}</button>
        </form>
        {message && <p className="feedback-message" role="status">{message}</p>}
        <section className="feedback-list"><h3>公开留言</h3>{items.length ? items.map((item) => <article key={item.id} className={`feedback-item status-${item.status}`}><div><strong>{item.author.displayName}</strong><span>{CATEGORY_LABELS[item.category]} · {STATUS_LABELS[item.status]}</span></div><p>{item.content}</p></article>) : <p className="feedback-empty">还没有公开留言。</p>}</section>
        <button type="button" className="feedback-admin-link" onClick={() => { setOpen(false); onOpenAdmin?.(); }}>管理员入口</button>
      </div>}
    </aside>
  );
}
