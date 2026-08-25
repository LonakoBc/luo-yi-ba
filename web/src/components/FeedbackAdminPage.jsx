import { useCallback, useEffect, useState } from 'react';
import { listFeedbackAdmin, loginFeedbackAdmin, updateFeedbackStatus } from '../services/feedbackClient';

const STATUS_LABELS = { pending: '待审核', public: '公开', adopted: '已采纳', fixed: '已修复', hidden: '隐藏', rejected: '拒绝' };
const CATEGORY_LABELS = { catalog: '曲库纠错', gameplay: '玩法建议', bug: '问题反馈', other: '其他' };
const TOKEN_KEY = 'luo-yi-ba-feedback-admin-token';

export default function FeedbackAdminPage({ onBack }) {
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_KEY) ?? '');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('pending');
  const [data, setData] = useState({ items: [], counts: {} });
  const [message, setMessage] = useState('');

  const load = useCallback(async (activeToken = token, activeStatus = status) => {
    if (!activeToken) return;
    try { setData(await listFeedbackAdmin(activeToken, activeStatus)); setMessage(''); }
    catch (error) { if (/登录/iu.test(error.message)) { sessionStorage.removeItem(TOKEN_KEY); setToken(''); } setMessage(error.message); }
  }, [status, token]);

  useEffect(() => { load(); }, [load]);

  const login = async (event) => {
    event.preventDefault();
    try { const result = await loginFeedbackAdmin(password); sessionStorage.setItem(TOKEN_KEY, result.token); setToken(result.token); setPassword(''); await load(result.token, status); }
    catch (error) { setMessage(error.message); }
  };

  const changeStatus = async (id, nextStatus) => {
    try { await updateFeedbackStatus(token, id, nextStatus); await load(token, status); }
    catch (error) { setMessage(error.message); }
  };

  return <div className="page-shell feedback-admin-page"><header className="feedback-admin-header"><button type="button" className="back-button" onClick={onBack}>← 返回首页</button><div><p className="eyebrow">仅管理员可见</p><h1>意见箱审核台</h1></div></header>
    {!token ? <form className="feedback-admin-login" onSubmit={login}><label>管理员密码<input type="password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label><button type="submit">登录</button></form> : <main>
      <div className="feedback-admin-toolbar"><label>筛选<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">全部</option>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}（{data.counts[value] ?? 0}）</option>)}</select></label><button type="button" onClick={() => load()}>刷新</button><button type="button" onClick={() => { sessionStorage.removeItem(TOKEN_KEY); setToken(''); }}>退出</button></div>
      <div className="feedback-admin-list">{data.items.map((item) => <article key={item.id}><header><strong>{item.author.displayName}</strong><span>{CATEGORY_LABELS[item.category]} · {STATUS_LABELS[item.status]}</span></header><p>{item.content}</p><small>{new Date(item.createdAt).toLocaleString()} · {item.context.page || '未知页面'}</small><div className="feedback-status-actions">{Object.entries(STATUS_LABELS).map(([value, label]) => <button type="button" key={value} disabled={item.status === value} onClick={() => changeStatus(item.id, value)}>{label}</button>)}</div></article>)}</div>
    </main>}
    {message && <p className="feedback-message" role="alert">{message}</p>}
  </div>;
}
