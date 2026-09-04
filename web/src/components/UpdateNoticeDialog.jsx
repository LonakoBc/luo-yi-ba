import { useEffect, useRef, useState } from 'react';

export const UPDATE_NOTICE_STORAGE_KEY = 'luo-yi-ba-update-notice-2026-09-04-v1';
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
        <h2 id="update-notice-title">2026-09-04更新</h2>
        <div className="update-notice-items">
          <article>
            <strong>1. 听歌识曲更新</strong>
            <span>优化听歌识曲的读取速度以及扩展全歌姬歌单。</span>
          </article>
          <article>
            <strong>2. 联机玩法拓展</strong>
            <span>将猜 P 主、曲名填字、听歌识曲接入联机玩法中，且现已支持表情包功能（联机欢迎加群，详见右上角）。</span>
          </article>
          <article>
            <strong>3. 曲名填字优化</strong>
            <span>玩法优化为允许从已有的字词中拖入空格内。</span>
          </article>
          <article>
            <strong>4. 曲目喜好表</strong>
            <span>根据本地数据库快速填写喜好表格分享群友（详见右上角）。</span>
          </article>
          <article>
            <strong>5. 曲库扩展与优化</strong>
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
