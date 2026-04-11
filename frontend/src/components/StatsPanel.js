import React from 'react';

export default function StatsPanel({ results }) {
  if (!results || results.length === 0) return null;

  const stats = [
    { label: 'Analysés', val: results.length, color: '#005596', bg: '#E8F2F9' },
    {
      label: 'À contacter',
      val: results.filter((r) => r.decision === 'oui').length,
      color: '#004070',
      bg: '#D6EAF5',
    },
    {
      label: 'À évaluer',
      val: results.filter((r) => r.decision === 'peut-être').length,
      color: '#B45309',
      bg: '#FFF4E6',
    },
    {
      label: 'Score moyen',
      val: Math.round(results.reduce((a, r) => a + (r.score || 0), 0) / results.length),
      color: '#005596',
      bg: '#E8F2F9',
    },
  ];

  return (
    <div className="stats-row">
      {stats.map((st) => (
        <div key={st.label} className="stat-card" style={{ background: st.bg }}>
          <div className="stat-value" style={{ color: st.color }}>
            {st.val}
          </div>
          <div className="stat-label" style={{ color: st.color }}>
            {st.label}
          </div>
        </div>
      ))}
    </div>
  );
}
