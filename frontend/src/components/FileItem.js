import React from 'react';

const statusDotStyle = {
  wait: { bg: '#E8EEF2' },
  running: { bg: '#B3D4E8', animation: 'pulse 1s infinite' },
  done: { bg: '#7EB8D8' },
  error: { bg: '#F5B5BA' },
  excluded: { bg: '#FCD34D' },
};

export default function FileItem({ file, status, onRemove }) {
  const dot = statusDotStyle[status] || statusDotStyle.wait;

  return (
    <div className="file-item">
      <div className="file-icon">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <rect x="2" y="1" width="8" height="11" rx="1.5" stroke="#005596" strokeWidth="1" />
          <path d="M4 5h6M4 7.5h4" stroke="#005596" strokeWidth="1" strokeLinecap="round" />
        </svg>
      </div>
      <span className="file-name">{file.name}</span>
      <span className="file-size">{(file.size / 1024).toFixed(0)} ko</span>
      <div
        className="status-dot"
        style={{ background: dot.bg, animation: dot.animation || 'none' }}
        title={status === 'excluded' ? 'Document ignoré (non-CV)' : undefined}
      />
      {status === 'wait' && (
        <button className="remove-btn" onClick={() => onRemove(file.name)}>
          ×
        </button>
      )}
    </div>
  );
}
