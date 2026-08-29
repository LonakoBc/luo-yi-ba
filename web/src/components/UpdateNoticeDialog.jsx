import { useEffect, useRef, useState } from 'react';

export const UPDATE_NOTICE_STORAGE_KEY = 'luo-yi-ba-update-notice-2026-08-29-v2';
const QQ_GROUP_COPY_TEXT = '1087737854';

export function canShowUpdateNotice({ initialPage, initialRoute, storage = window.localStorage }) {
  if (initialPage || initialRoute.page !== 'home') return false;
  try {
    return storage.getItem(UPDATE_NOTICE_STORAGE_KEY) !== 'dismissed';
  } catch {
    return true;
  }
}

export default function UpdateNoticeDialog({ onClose }) {
  const [copyFeedback, setCopyFeedback] = useState('');
  const feedbackTimer = useRef(null);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.clearTimeout(feedbackTimer.current);
    };
  }, [onClose]);

  const copyQqGroup = async () => {
    let copied = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(QQ_GROUP_COPY_TEXT);
        copied = true;
      }
    } catch {
      // Fall through to the legacy clipboard path.
    }
    if (!copied) {
      const textarea = document.createElement('textarea');
      textarea.value = QQ_GROUP_COPY_TEXT;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        copied = document.execCommand?.('copy') ?? false;
      } catch {
        copied = false;
      }
      textarea.remove();
    }
    setCopyFeedback(copied ? '已复制！' : '复制失败，请手动复制');
    window.clearTimeout(feedbackTimer.current);
    feedbackTimer.current = window.setTimeout(() => setCopyFeedback(''), 1600);
  };

  return (
    <div className="update-notice-backdrop" role="presentation">
      <section className="update-notice-card" role="dialog" aria-modal="true" aria-labelledby="update-notice-title">
        <button type="button" className="update-notice-close" aria-label="关闭更新公告" onClick={onClose}>×</button>
        <div className="update-notice-mark" aria-hidden="true">♫</div>
        <p className="eyebrow">更新公告</p>
        <h2 id="update-notice-title">2026-08-29更新</h2>
        <div className="update-notice-items">
          <article>
            <strong>1. 模式上新</strong>
            <span>新增加“听歌识曲”模式，玩家可根据前奏猜测歌曲，从熟悉的旋律中回忆起那首心中的歌吧。</span>
            <span>暂时只接入洛天依曲库。</span>
          </article>
          <article>
            <strong>2. 曲库优化</strong>
            <span>新增加歌曲《迷》等，优化部分已有曲库。</span>
          </article>
          <article>
            <strong>3. BUG修复</strong>
            <span>修复了部分反馈bug。</span>
          </article>
        </div>
        <button type="button" className="update-notice-qq" onClick={copyQqGroup} aria-label="复制联机水友 QQ 群号">
          <span>欢迎加入联机水友Q群：</span><strong>1087737854</strong>
        </button>
        {copyFeedback && <div className={'update-notice-copy-feedback ' + (copyFeedback === '已复制！' ? 'success' : 'error')} role="status" aria-live="polite">{copyFeedback}</div>}
        <button type="button" className="primary-button update-notice-confirm" onClick={onClose}>知道了，开始探索</button>
      </section>
    </div>
  );
}
