import React, { useState } from 'react';

const AVATAR_COLORS = [
  { bg: '#E8F2F9', fg: '#005596' },
  { bg: '#FDECEE', fg: '#C41E3A' },
  { bg: '#E0EEF6', fg: '#004070' },
  { bg: '#FFF0F0', fg: '#E30613' },
  { bg: '#E8F4FA', fg: '#0077B6' },
  { bg: '#F5F8FB', fg: '#005596' },
];

function getInitials(name) {
  return (
    (name || '?')
      .split(' ')
      .map((w) => w[0] || '')
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?'
  );
}

function scoreClass(score) {
  if (score >= 75) return { color: '#005596', bg: '#005596' };
  if (score >= 50) return { color: '#C45C00', bg: '#D97706' };
  return { color: '#E30613', bg: '#E30613' };
}

function decisionBadge(decision) {
  const map = {
    oui: { label: 'À contacter', bg: '#E8F2F9', fg: '#005596' },
    'peut-être': { label: 'À évaluer', bg: '#FFF4E6', fg: '#B45309' },
    non: { label: 'Non retenu', bg: '#FDECEE', fg: '#B8050F' },
  };
  return map[decision] || map['non'];
}

export default function ResultCard({
  result,
  rank,
  minContactScore = 70,
  compareEnabled = false,
  compareSelected = false,
  onToggleCompare,
}) {
  const [expanded, setExpanded] = useState(false);
  const av = AVATAR_COLORS[rank % AVATAR_COLORS.length];
  const sc = scoreClass(result.score || 0);
  const dec = decisionBadge(result.decision);
  const priority =
    (result.score || 0) >= minContactScore && result.decision !== 'oui';

  const hasError = Boolean(result._error);

  return (
    <div className={`result-card ${rank === 0 ? 'result-card-top' : ''} ${hasError ? 'result-card-error' : ''}`}>
      {hasError && (
        <div className="result-error-banner" role="alert">
          {result._error}
        </div>
      )}
      {compareEnabled && (
        <label className="compare-check">
          <input
            type="checkbox"
            checked={compareSelected}
            onChange={() => onToggleCompare?.(result._file)}
            aria-label={`Comparer ${result.nom || result._file}`}
          />
        </label>
      )}
      <span className="rank">{rank + 1}</span>
      <div className="avatar" style={{ background: av.bg, color: av.fg }}>
        {getInitials(result.nom)}
      </div>
      <div className="result-info">
        <div className="result-header-row">
          <span className="result-name">{result.nom || result._file}</span>
          <span className="badge" style={{ background: dec.bg, color: dec.fg }}>
            {dec.label}
          </span>
          {priority && (
            <span className="badge badge-priority" title="Score au-dessus du seuil RH réglé dans les options">
              Priorité score
            </span>
          )}
        </div>
        {result.email && (
          <div className="result-meta">
            <span className="result-email">{result.email}</span>
            {result.telephone && <span className="result-phone">{result.telephone}</span>}
          </div>
        )}
        <div className="result-summary">{result.recommandation}</div>
        <div className="tag-row">
          {(result.competences_cles || []).slice(0, 3).map((t) => (
            <span key={t} className="tag">
              {t}
            </span>
          ))}
        </div>
        {expanded && (
          <div className="expanded-section">
            {result.points_forts?.length > 0 && (
              <div>
                <div className="expand-label">Points forts</div>
                {result.points_forts.map((p) => (
                  <div key={p} className="expand-item">
                    <span className="icon-ok">✓</span>
                    {p}
                  </div>
                ))}
              </div>
            )}
            {result.points_faibles?.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div className="expand-label">Points faibles</div>
                {result.points_faibles.map((p) => (
                  <div key={p} className="expand-item">
                    <span className="icon-nok">–</span>
                    {p}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <button type="button" className="expand-btn" onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Réduire ▲' : 'Voir le détail ▼'}
        </button>
      </div>
      <div className="score-col">
        <span className="score-value" style={{ color: sc.color }}>
          {result.score}
        </span>
        <div className="score-bar-bg">
          <div
            className="score-bar-fill"
            style={{ width: `${result.score}%`, background: sc.bg }}
          />
        </div>
        <span className="score-label">{result.niveau}</span>
        <span className="score-label">
          {result.annees_experience != null ? `${result.annees_experience} ans` : ''}
        </span>
      </div>
    </div>
  );
}
