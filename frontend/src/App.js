import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useDropzone } from 'react-dropzone';
import FileItem from './components/FileItem';
import ResultCard from './components/ResultCard';
import StatsPanel from './components/StatsPanel';
import CorisLogo from './components/CorisLogo';
import SiteFooter from './components/SiteFooter';
import JobToolsBar from './components/JobToolsBar';
import ComparePanel from './components/ComparePanel';
import { pushHistorySession } from './utils/localJobStore';
import { buildTopExportZip, sanitizeFolderName } from './utils/exportTopZip';
import './styles.css';

const API_BASE = process.env.REACT_APP_API_URL || '';
const FILE_LIST_COLLAPSE_AT = 5;

function getAuthHeaders(contentType = true) {
  const h = {};
  if (contentType) h['Content-Type'] = 'application/json';
  const t = process.env.REACT_APP_API_TOKEN;
  if (t) h.Authorization = `Bearer ${t}`;
  return h;
}

function buildErrorResult(msg) {
  return {
    _file: msg.name,
    _index: msg.index,
    _error: msg.error,
    _errorCode: msg.error_code || null,
    score: 0,
    nom: msg.name,
    recommandation: "Erreur d'analyse",
    decision: 'non',
  };
}

function sortResults(arr) {
  return [...arr].sort((a, b) => (b.score || 0) - (a.score || 0));
}

/** Profil géo affiché côté API (ancienne valeur « mixte » → non classé). */
function normalizeProfilGeo(pg) {
  if (pg === 'mixte') return 'inconnu';
  return pg || 'inconnu';
}

/** Filtre classement / export : score minimal, profil géographique, décision RH. */
function applyResultFilters(results, scoreFloor, geoFilter, decisionFilter) {
  return results.filter((r) => {
    if (r.score < scoreFloor) return false;
    const pg = normalizeProfilGeo(r.profil_geographique);
    if (geoFilter === 'national_tchad' && pg !== 'national_tchad') return false;
    if (geoFilter === 'international' && pg !== 'international') return false;
    if (decisionFilter === 'oui') return r.decision === 'oui';
    if (decisionFilter === 'peut-être') return r.decision === 'peut-être';
    if (decisionFilter === 'non') return r.decision === 'non';
    return true;
  });
}

/** FastAPI renvoie parfois `detail` en chaîne ou en tableau (validation 422). */
function formatApiErrorDetail(detail) {
  if (detail == null) return 'Erreur inconnue';
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    const parts = detail
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item.msg === 'string') return item.msg;
        return null;
      })
      .filter(Boolean);
    return parts.length ? parts.join(' · ') : 'Requête invalide';
  }
  if (typeof detail === 'object' && detail.message) return String(detail.message);
  return 'Erreur serveur';
}

function useToast() {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const addToast = useCallback((message, type = 'error') => {
    const id = ++idRef.current;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  const ToastContainer = () => (
    <div className="toast-container">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          {t.message}
        </div>
      ))}
    </div>
  );

  return { addToast, ToastContainer };
}

export default function App() {
  const [poste, setPoste] = useState('');
  const [files, setFiles] = useState([]);
  const [filesListOpen, setFilesListOpen] = useState(true);
  const [statuses, setStatuses] = useState({});
  const [results, setResults] = useState([]);
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState('');
  const [phase, setPhase] = useState('idle');
  const [filter, setFilter] = useState('tous');
  const [geoFilter, setGeoFilter] = useState('tous');
  const [scoreMin, setScoreMin] = useState(0);
  const [minScoreExport, setMinScoreExport] = useState(0);
  const [minContactScore, setMinContactScore] = useState(70);
  const [processingMode, setProcessingMode] = useState('parallel');
  const [compareFiles, setCompareFiles] = useState([]);
  const [billingAlert, setBillingAlert] = useState(null);
  const [rankingPage, setRankingPage] = useState(1);
  const [rankingPageSize, setRankingPageSize] = useState(50);
  const resultsListScrollRef = useRef(null);
  const abortRef = useRef(null);
  const { addToast, ToastContainer } = useToast();

  useEffect(() => {
    if (files.length <= FILE_LIST_COLLAPSE_AT) {
      setFilesListOpen(true);
    }
  }, [files.length]);

  useEffect(() => {
    const onRestore = (e) => {
      setCompareFiles([]);
      setResults(e.detail?.results || []);
      setPhase('done');
      setProgress(100);
      setProgressText('Session restaurée');
    };
    window.addEventListener('cv-restore-results', onRestore);
    return () => window.removeEventListener('cv-restore-results', onRestore);
  }, []);

  const onDrop = useCallback((accepted) => {
    setFiles((prev) => {
      const names = new Set(prev.map((f) => f.name));
      const fresh = accepted.filter((f) => !names.has(f.name));
      if (prev.length + fresh.length > FILE_LIST_COLLAPSE_AT) {
        setFilesListOpen(false);
      }
      return [...prev, ...fresh];
    });
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
    },
    multiple: true,
  });

  const removeFile = (name) => setFiles((prev) => prev.filter((f) => f.name !== name));

  const toggleCompare = useCallback(
    (fileKey) => {
      setCompareFiles((prev) => {
        if (prev.includes(fileKey)) return prev.filter((x) => x !== fileKey);
        if (prev.length >= 3) {
          addToast('Maximum 3 CV en comparaison.', 'info');
          return prev;
        }
        return [...prev, fileKey];
      });
    },
    [addToast],
  );

  const compareItems = useMemo(
    () => compareFiles.map((k) => results.find((r) => r._file === k)).filter(Boolean),
    [compareFiles, results],
  );

  const startAnalysis = async () => {
    const posteTrim = poste.trim();
    if (!posteTrim) {
      addToast('Renseignez la description du poste : sans ce texte, l’IA ne peut pas évaluer l’adéquation des CV.', 'info');
      return;
    }
    if (files.length === 0) {
      addToast('Ajoutez au moins un fichier CV avant de lancer l’analyse.', 'info');
      return;
    }
    setPhase('running');
    setResults([]);
    setCompareFiles([]);
    setBillingAlert(null);
    setProgress(0);
    setProgressText('Envoi des fichiers…');
    const initSt = {};
    files.forEach((f) => {
      initSt[f.name] = 'wait';
    });
    setStatuses(initSt);

    const formData = new FormData();
    formData.append('poste', posteTrim);
    formData.append('processing_mode', processingMode);
    files.forEach((f) => formData.append('files', f));

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    let streamStarted = false;
    let gotComplete = false;
    let processed = 0;

    try {
      const resp = await fetch(`${API_BASE}/api/score-stream`, {
        method: 'POST',
        body: formData,
        signal: ctrl.signal,
        headers: getAuthHeaders(false),
      });

      if (!resp.ok) {
        try {
          const err = await resp.json();
          addToast(`Erreur : ${formatApiErrorDetail(err.detail)}`);
        } catch {
          addToast(`Erreur serveur (${resp.status})`);
        }
        setPhase('idle');
        return;
      }

      streamStarted = true;
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const msg = JSON.parse(line.slice(6));
            if (msg.type === 'start') {
              setStatuses((prev) => ({ ...prev, [msg.name]: 'running' }));
              setProgressText(`Analyse de ${msg.name}… (${msg.index + 1}/${msg.total})`);
            } else if (msg.type === 'result') {
              processed++;
              setStatuses((prev) => ({ ...prev, [msg.name]: 'done' }));
              setProgress(Math.round((processed / files.length) * 100));
              setResults((prev) => sortResults([...prev, msg.data]));
            } else if (msg.type === 'error') {
              processed++;
              setStatuses((prev) => ({ ...prev, [msg.name]: 'error' }));
              setProgress(Math.round((processed / files.length) * 100));
              if (msg.error_code === 'insufficient_credits') {
                setBillingAlert(
                  msg.error ||
                    'Les crédits API Anthropic sont insuffisants. Contactez l’administrateur.',
                );
              }
              setResults((prev) => sortResults([...prev, buildErrorResult(msg)]));
            } else if (msg.type === 'fatal') {
              gotComplete = true;
              addToast(
                msg.error ||
                  'L’analyse a été interrompue par une erreur serveur. Réessayez avec moins de fichiers ou vérifiez les ressources du serveur.',
              );
              setPhase(processed > 0 ? 'done' : 'idle');
              setProgressText('Analyse interrompue');
            } else if (msg.type === 'complete') {
              gotComplete = true;
              setResults(msg.results);
              setPhase('done');
              setProgressText('Analyse terminée');
              setProgress(100);
              pushHistorySession({ poste, results: msg.results });
            }
          } catch (_) {}
        }
      }

      if (streamStarted && !gotComplete) {
        addToast(
          'La connexion au serveur a été coupée avant la fin de l’analyse (souvent : mémoire insuffisante du serveur, timeout ou redémarrage). Réessayez avec moins de CV en parallèle ou augmentez la mémoire du conteneur « backend ».',
        );
        setPhase(processed > 0 ? 'done' : 'idle');
        setProgressText('Analyse interrompue');
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        if (streamStarted) {
          addToast(
            `Connexion interrompue pendant l’analyse : ${e.message}. Si le problème persiste, réduisez le nombre de fichiers ou le parallélisme.`,
          );
          setPhase(processed > 0 ? 'done' : 'idle');
          setProgressText('Analyse interrompue');
        } else {
          addToast(`Erreur réseau: ${e.message}`);
          setPhase('idle');
        }
      }
    }
  };

  const stopAnalysis = () => {
    abortRef.current?.abort();
    setPhase('idle');
  };

  const exportExcel = async () => {
    try {
      const payload = {
        results: resultsForExport,
        min_score: 0,
        top_n: 10,
      };
      const resp = await fetch(`${API_BASE}/api/export-excel`, {
        method: 'POST',
        headers: getAuthHeaders(true),
        body: JSON.stringify(payload),
      });
      if (!resp.ok) {
        addToast("Erreur lors de l'export Excel");
        return;
      }
      const excelBlob = await resp.blob();
      const safeName = sanitizeFolderName(poste);
      const { blob: zipBlob, missing, added, count } = await buildTopExportZip({
        poste,
        results: resultsForExport,
        files,
        topN: 10,
        excelBlob,
      });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safeName}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      if (count > 0 && missing > 0) {
        addToast(
          `Archive créée : ${added} CV sur ${count} (fichiers originaux introuvables : ${missing}). Réimportez les CV si la session a été restaurée sans fichiers.`,
          'info',
        );
      } else if (count === 0) {
        addToast('Téléchargement terminé.', 'info');
      }
    } catch (e) {
      addToast(`Export échoué: ${e.message}`);
    }
  };

  const filtered = useMemo(
    () => applyResultFilters(results, scoreMin, geoFilter, filter),
    [results, scoreMin, geoFilter, filter],
  );

  /** Même logique que le classement, avec le seuil « Options & outils » pour l’export. */
  const resultsForExport = useMemo(
    () => applyResultFilters(results, minScoreExport, geoFilter, filter),
    [results, minScoreExport, geoFilter, filter],
  );

  const rankingTotalPages = Math.max(1, Math.ceil(filtered.length / rankingPageSize) || 1);
  const rankingPageSafe = Math.min(rankingPage, rankingTotalPages);

  useEffect(() => {
    setRankingPage(1);
  }, [filter, geoFilter, scoreMin, rankingPageSize]);

  useEffect(() => {
    setRankingPage((p) => Math.min(p, rankingTotalPages));
  }, [filtered.length, rankingPageSize, rankingTotalPages]);

  const paginatedResults = useMemo(() => {
    const start = (rankingPageSafe - 1) * rankingPageSize;
    return filtered.slice(start, start + rankingPageSize);
  }, [filtered, rankingPageSafe, rankingPageSize]);

  const rankingRangeStart = filtered.length === 0 ? 0 : (rankingPageSafe - 1) * rankingPageSize + 1;
  const rankingRangeEnd = Math.min(rankingPageSafe * rankingPageSize, filtered.length);

  useEffect(() => {
    resultsListScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [rankingPageSafe, rankingPageSize, filter, geoFilter]);

  const showFileCollapse = files.length > FILE_LIST_COLLAPSE_AT;
  const filesToShow = showFileCollapse && !filesListOpen ? [] : files;

  return (
    <div className="page">
      <ToastContainer />

      <header className="header">
        <div className="header-inner">
          <div className="header-left">
            <CorisLogo />
            <span className="header-title" lang="fr">
              <span className="header-title-main">Filtre</span>
              <span className="header-title-cv">CV</span>
            </span>
          </div>
        </div>
      </header>

      <main className="main main-flow">
        <section className="card form-card" aria-labelledby="poste-label">
          <h2 id="poste-label" className="section-label">
            Description du poste{' '}
            <span className="req-marker" title="Obligatoire">
              *
            </span>
          </h2>
          <textarea
            id="poste-textarea"
            className={`textarea ${files.length > 0 && !poste.trim() ? 'textarea-needs-poste' : ''}`}
            placeholder="Ex. : Responsable RH, 5+ ans d'expérience, maîtrise du droit social français…"
            value={poste}
            onChange={(e) => setPoste(e.target.value)}
            disabled={phase === 'running'}
            aria-required="true"
            aria-invalid={files.length > 0 && !poste.trim()}
            aria-describedby={files.length > 0 && !poste.trim() ? 'poste-required-hint' : undefined}
          />
          {files.length > 0 && !poste.trim() && (
            <p id="poste-required-hint" className="poste-required-hint" role="status">
              Décrivez le poste recherché : ce champ est obligatoire pour lancer l’analyse (l’outil compare les CV à cette
              fiche).
            </p>
          )}

          <JobToolsBar
            poste={poste}
            setPoste={setPoste}
            phase={phase}
            minScoreExport={minScoreExport}
            setMinScoreExport={setMinScoreExport}
            minContactScore={minContactScore}
            setMinContactScore={setMinContactScore}
            processingMode={processingMode}
            setProcessingMode={setProcessingMode}
          />

          <h2 className="section-label section-label-spaced">CV à analyser</h2>
          <div
            {...getRootProps()}
            className={`drop-zone ${isDragActive ? 'drop-zone-active' : ''}`}
          >
            <input {...getInputProps()} />
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ marginBottom: 8 }} aria-hidden>
              <path d="M12 16V8M12 8l-3 3M12 8l3 3" stroke="#888" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1" stroke="#888" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <div className="drop-title">
              {isDragActive ? 'Déposer ici…' : 'Glisser-déposer les CV ici'}
            </div>
            <div className="drop-sub">PDF uniquement · plusieurs fichiers</div>
          </div>

          {files.length > 0 && (
            <div className="file-block">
              {showFileCollapse && !filesListOpen && (
                <button
                  type="button"
                  className="file-summary-btn"
                  onClick={() => setFilesListOpen(true)}
                >
                  <span className="file-summary-count">{files.length} fichiers</span>
                  <span className="file-summary-names">
                    {files
                      .slice(0, 3)
                      .map((f) => f.name)
                      .join(' · ')}
                    {files.length > 3 ? '…' : ''}
                  </span>
                  <span className="file-summary-action">Afficher la liste</span>
                </button>
              )}
              {(showFileCollapse ? filesListOpen : true) && (
                <>
                  <div className="file-list-toolbar">
                    <span className="file-list-title">Fichiers</span>
                    {showFileCollapse && (
                      <button
                        type="button"
                        className="link-btn"
                        onClick={() => setFilesListOpen(false)}
                      >
                        Réduire
                      </button>
                    )}
                  </div>
                  <div className="file-list-wrap">
                    {filesToShow.map((f) => (
                      <FileItem
                        key={f.name}
                        file={f}
                        status={statuses[f.name] || 'wait'}
                        onRemove={removeFile}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {phase !== 'running' ? (
            <button
              className="btn-primary"
              disabled={!poste.trim() || files.length === 0}
              onClick={startAnalysis}
            >
              Analyser et classer les CV
            </button>
          ) : (
            <button type="button" className="btn-primary btn-stop" onClick={stopAnalysis}>
              Arrêter l'analyse
            </button>
          )}

          {phase === 'running' && (
            <div className="progress-wrap">
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${progress}%` }} />
              </div>
              <div className="progress-text">{progressText}</div>
            </div>
          )}

          {billingAlert && (
            <div className="alert-billing" role="alert">
              <div className="alert-billing-title">Crédits API insuffisants</div>
              <p className="alert-billing-text">{billingAlert}</p>
            </div>
          )}

          {phase === 'done' && <StatsPanel results={results} />}
        </section>

        {(phase === 'running' || phase === 'done') && (
          <section className="card results-card" aria-label="Résultats">
            {results.length === 0 && phase === 'running' && (
              <div className="results-live-placeholder">
                <div className="live-dot" />
                Analyse en cours — les profils apparaissent au fil de l’eau…
              </div>
            )}

            {results.length > 0 && (
              <>
                <div className="results-header">
                  <div className="results-title-row">
                    <strong className="results-title">Classement</strong>
                    {phase === 'running' && (
                      <span className="live-badge">
                        <span className="live-dot" />
                        Direct
                      </span>
                    )}
                    <span className="results-count">
                      {filtered.length} après filtre
                      {filtered.length > 0 && (
                        <>
                          {' '}
                          · affichage <strong>{rankingRangeStart}–{rankingRangeEnd}</strong>
                        </>
                      )}
                    </span>
                  </div>
                  <div className="results-filter-row">
                    <select className="select" value={filter} onChange={(e) => setFilter(e.target.value)}>
                      <option value="tous">Tous</option>
                      <option value="oui">À contacter</option>
                      <option value="peut-être">À évaluer</option>
                      <option value="non">Non retenus</option>
                    </select>
                    <select className="select" value={geoFilter} onChange={(e) => setGeoFilter(e.target.value)}>
                      <option value="tous">Profil géographique : tous</option>
                      <option value="national_tchad">National (Tchad)</option>
                      <option value="international">International</option>
                    </select>
                    <select className="select" value={scoreMin} onChange={(e) => setScoreMin(Number(e.target.value))}>
                      <option value={0}>Score ≥ 0</option>
                      <option value={50}>Score ≥ 50</option>
                      <option value={70}>Score ≥ 70</option>
                      <option value={80}>Score ≥ 80</option>
                    </select>
                  </div>
                </div>

                {filtered.length > 0 && (
                  <div className="ranking-pagination" aria-label="Pagination du classement">
                    <div className="ranking-pagination-top">
                      <div className="ranking-pagination-info">
                        Lignes <strong>{rankingRangeStart}–{rankingRangeEnd}</strong> sur {filtered.length}
                      </div>
                      <label className="ranking-page-size">
                        <span className="ranking-page-size-label">Par page</span>
                        <select
                          className="select select-compact"
                          value={rankingPageSize}
                          onChange={(e) => setRankingPageSize(Number(e.target.value))}
                        >
                          <option value={25}>25</option>
                          <option value={50}>50</option>
                          <option value={100}>100</option>
                          <option value={200}>200</option>
                        </select>
                      </label>
                    </div>
                    {rankingTotalPages > 1 && (
                      <div className="ranking-pagination-controls">
                        <button
                          type="button"
                          className="btn-secondary ranking-page-btn"
                          disabled={rankingPageSafe <= 1}
                          onClick={() => setRankingPage((p) => Math.max(1, p - 1))}
                        >
                          ← Précédent
                        </button>
                        <span className="ranking-page-indicator">
                          Page {rankingPageSafe} / {rankingTotalPages}
                        </span>
                        <button
                          type="button"
                          className="btn-secondary ranking-page-btn"
                          disabled={rankingPageSafe >= rankingTotalPages}
                          onClick={() => setRankingPage((p) => Math.min(rankingTotalPages, p + 1))}
                        >
                          Suivant →
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {compareItems.length >= 2 && (
                  <ComparePanel items={compareItems} onClose={() => setCompareFiles([])} />
                )}

                <div className="results-list-scroll" ref={resultsListScrollRef}>
                  <div className="results-list">
                    {paginatedResults.map((r, i) => (
                      <ResultCard
                        key={`${r._file}-${r._index ?? i}`}
                        result={r}
                        rank={(rankingPageSafe - 1) * rankingPageSize + i}
                        minContactScore={minContactScore}
                        compareEnabled={phase === 'done'}
                        compareSelected={compareFiles.includes(r._file)}
                        onToggleCompare={toggleCompare}
                      />
                    ))}
                  </div>
                </div>
                {phase === 'done' && (
                  <div className="export-row">
                    <button
                      type="button"
                      className="btn-export"
                      onClick={exportExcel}
                      title="Export selon les filtres du classement (profil géographique, décision) et le seuil de score des options. Excel : liste + Top 10. ZIP : jusqu’à 10 CV selon la décision (options)."
                    >
                      Télécharger
                    </button>
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {phase === 'idle' && results.length === 0 && (
          <section className="card empty-card">
            <div className="empty-state">
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none" style={{ marginBottom: 12 }} aria-hidden>
                <rect x="8" y="6" width="32" height="36" rx="4" stroke="#D3D1C7" strokeWidth="2" />
                <path d="M16 18h16M16 24h12M16 30h14" stroke="#D3D1C7" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <div className="empty-title">Les résultats s’affichent ici</div>
              <div className="empty-sub">Décrivez le poste, ajoutez des CV, puis lancez l’analyse</div>
            </div>
          </section>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
