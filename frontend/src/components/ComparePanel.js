import React from 'react';

function profilGeoLabel(pg) {
  if (pg === 'mixte') return '—';
  const m = {
    national_tchad: 'National (Tchad)',
    international: 'International',
    inconnu: '—',
  };
  return m[pg] || m.inconnu;
}

function row(label, values) {
  return (
    <tr key={label}>
      <th scope="row">{label}</th>
      {values.map((v, i) => (
        <td key={i}>{v ?? '—'}</td>
      ))}
    </tr>
  );
}

export default function ComparePanel({ items, onClose }) {
  if (!items?.length) return null;

  return (
    <div className="compare-panel" role="region" aria-label="Comparaison de profils">
      <div className="compare-head">
        <strong>Comparaison ({items.length})</strong>
        <button type="button" className="link-btn compare-close" onClick={onClose}>
          Fermer
        </button>
      </div>
      <div className="compare-scroll">
        <table className="compare-table">
          <thead>
            <tr>
              <th scope="col" />
              {items.map((r) => (
                <th key={r._file} scope="col" className="compare-th-name">
                  {r.nom || r._file}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {row(
              'Score',
              items.map((r) => r.score),
            )}
            {row(
              'Décision',
              items.map((r) => r.decision),
            )}
            {row(
              'Profil géographique',
              items.map((r) => profilGeoLabel(r.profil_geographique || 'inconnu')),
            )}
            {row(
              'Niveau',
              items.map((r) => r.niveau || '—'),
            )}
            {row(
              'Années exp.',
              items.map((r) => (r.annees_experience != null ? `${r.annees_experience} ans` : '—')),
            )}
            {row(
              'Email',
              items.map((r) => r.email || '—'),
            )}
            {row(
              'Compétences clés',
              items.map((r) => (r.competences_cles || []).join(', ') || '—'),
            )}
            {row(
              'Recommandation',
              items.map((r) => r.recommandation || '—'),
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
