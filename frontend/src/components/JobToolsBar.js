import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { loadTemplates, saveTemplate, deleteTemplate } from '../utils/localJobStore';

export default function JobToolsBar({
  poste,
  setPoste,
  phase,
  minScoreExport,
  setMinScoreExport,
  minContactScore,
  setMinContactScore,
  includePeutEtreExport,
  setIncludePeutEtreExport,
  processingMode,
  setProcessingMode,
}) {
  const [open, setOpen] = useState(false);
  const [tplName, setTplName] = useState('');
  const [uiTick, setUiTick] = useState(0);

  const templates = loadTemplates();
  const templatesSorted = [...templates].sort((a, b) =>
    a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }),
  );

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  const onSaveTemplate = () => {
    if (!tplName.trim() || !poste.trim()) return;
    saveTemplate(tplName.trim(), poste);
    setTplName('');
    setUiTick((t) => t + 1);
  };

  const modal =
    open &&
    createPortal(
      <div
        className="job-tools-modal-overlay"
        role="presentation"
        onClick={() => setOpen(false)}
      >
        <div
          className="job-tools-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="job-tools-modal-title"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="job-tools-modal-head">
            <h2 id="job-tools-modal-title" className="job-tools-modal-title">
              Options & outils
            </h2>
            <button
              type="button"
              className="job-tools-modal-close"
              aria-label="Fermer"
              onClick={() => setOpen(false)}
            >
              ×
            </button>
          </div>

          <div className="job-tools-modal-body">
            <section className="job-tools-section job-tools-section--compact" aria-labelledby="jt-a">
              <h3 id="jt-a" className="job-tools-section-title">
                Analyse (au lancement)
              </h3>
              <div className="job-tools-field">
                <label className="job-tools-field-label" htmlFor="processing-mode">
                  Mode
                </label>
                <select
                  id="processing-mode"
                  className="select select-compact job-tools-select-wide"
                  value={processingMode}
                  onChange={(e) => setProcessingMode(e.target.value)}
                  disabled={phase === 'running'}
                >
                  <option value="parallel">Parallèle (rapide)</option>
                  <option value="sequential">File — un à la fois</option>
                </select>
              </div>
            </section>

            <section className="job-tools-section job-tools-section--compact" aria-labelledby="jt-b">
              <h3 id="jt-b" className="job-tools-section-title">
                Raccourcis de fiches
              </h3>
              <p className="job-tools-micro-hint job-tools-one-liner">
                Même texte que la zone « Description du poste » : vous le sauvegardez sous un nom pour le rouvrir plus tard.
              </p>
              <div className="job-tools-field-group">
                <div className="job-tools-field">
                  <label className="job-tools-field-label" htmlFor="tpl-load">
                    Rouvrir une fiche
                  </label>
                  <select
                    id="tpl-load"
                    className="select job-tools-select-wide"
                    value=""
                    onChange={(e) => {
                      const id = e.target.value;
                      if (!id) return;
                      const t = loadTemplates().find((x) => x.id === id);
                      if (t) setPoste(t.text);
                      e.target.value = '';
                    }}
                    disabled={phase === 'running'}
                  >
                    <option value="">Choisir…</option>
                    {templatesSorted.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="job-tools-field job-tools-field-inline">
                  <label className="job-tools-field-label" htmlFor="tpl-name">
                    Nom dans la liste <span className="field-optional">(facultatif)</span>
                  </label>
                  <div className="job-tools-inline-actions">
                    <input
                      id="tpl-name"
                      type="text"
                      className="input-compact job-tools-input-grow"
                      placeholder="Ex. Responsable paie – siège"
                      value={tplName}
                      onChange={(e) => setTplName(e.target.value)}
                      disabled={phase === 'running'}
                      title="Ce nom sert uniquement à repérer la fiche dans la liste ; il n’est pas envoyé à l’analyse des CV."
                    />
                    <button type="button" className="btn-secondary" onClick={onSaveTemplate} disabled={phase === 'running'}>
                      Enregistrer
                    </button>
                  </div>
                </div>
              </div>
              {templates.length > 0 && (
                <div className="tpl-list-block">
                  <div
                    className="tpl-list-caption"
                    id="tpl-list-heading"
                    title="Tri alphabétique A → Z"
                  >
                    Liste ({templates.length})
                  </div>
                  <div className="tpl-list-scroll" role="region" aria-labelledby="tpl-list-heading">
                    <ul className="tpl-mini-list" key={uiTick} aria-label="Fiches enregistrées">
                      {templatesSorted.map((t) => (
                        <li key={t.id}>
                          <button type="button" className="link-btn tpl-load" onClick={() => setPoste(t.text)}>
                            {t.name}
                          </button>
                          <button
                            type="button"
                            className="link-btn tpl-del"
                            aria-label={`Supprimer la fiche ${t.name}`}
                            onClick={() => {
                              deleteTemplate(t.id);
                              setUiTick((x) => x + 1);
                            }}
                          >
                            ×
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </section>

            <section className="job-tools-section job-tools-section--compact" aria-labelledby="jt-c">
              <h3 id="jt-c" className="job-tools-section-title">
                Affichage & export Excel
              </h3>
              <div className="job-tools-field">
                <label className="job-tools-field-label" htmlFor="min-contact">
                  Badge priorité (score ≥)
                </label>
                <div className="slider-wrap job-tools-slider">
                  <input
                    id="min-contact"
                    type="range"
                    min="50"
                    max="95"
                    step="1"
                    value={minContactScore}
                    onChange={(e) => setMinContactScore(Number(e.target.value))}
                  />
                  <span className="slider-val">{minContactScore}</span>
                </div>
              </div>
              <div className="job-tools-field">
                <label className="job-tools-field-label" htmlFor="min-export">
                  Export Excel — score ≥
                </label>
                <div className="job-tools-export-row">
                  <div className="slider-wrap job-tools-slider">
                    <input
                      id="min-export"
                      type="range"
                      min="0"
                      max="100"
                      step="1"
                      value={minScoreExport}
                      onChange={(e) => setMinScoreExport(Number(e.target.value))}
                    />
                    <span className="slider-val">{minScoreExport}</span>
                  </div>
                  <label className="checkbox-inline job-tools-checkbox">
                    <input
                      type="checkbox"
                      checked={includePeutEtreExport}
                      onChange={(e) => setIncludePeutEtreExport(e.target.checked)}
                    />
                    Inclure « à évaluer »
                  </label>
                </div>
              </div>
            </section>

            <div className="job-tools-modal-footer">
              <button type="button" className="btn-primary job-tools-modal-done" onClick={() => setOpen(false)}>
                Terminé
              </button>
            </div>
          </div>
        </div>
      </div>,
      document.body,
    );

  return (
    <div className="job-tools-trigger-row">
      <button
        type="button"
        className="btn-tools-open"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        title="Mode d’analyse, raccourcis de fiches, seuils d’affichage et d’export Excel"
      >
        Options & outils
      </button>
      {modal}
    </div>
  );
}
