import JSZip from 'jszip';

/** Dossier sûr sur Windows / macOS / Linux (caractères interdits retirés). */
export function sanitizeFolderName(poste) {
  const line = (poste || '').trim().split(/\r?\n/)[0] || 'export';
  let s = line
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  s = s.replace(/[. ]+$/g, '');
  if (s.length > 80) s = s.slice(0, 80).trim();
  return s || 'export_candidats';
}

/**
 * Top N par score sur un pool déjà filtré (même logique que la feuille « Top 10 » de l’Excel).
 * Ne réapplique pas de filtre « décision oui » : sinon le ZIP serait vide si le classement
 * affiche « à évaluer » ou « tous » sans uniquement des « oui ».
 */
export function topRowsForZip(results, topN) {
  const rows = [...(results || [])].sort((a, b) => (b.score || 0) - (a.score || 0));
  return rows.slice(0, topN);
}

/**
 * ZIP : `nomDuPoste/export_candidats.xlsx` + `nomDuPoste/01_fichier.pdf`, …
 * @returns {{ blob: Blob, missing: number, added: number }}
 */
export async function buildTopExportZip({ poste, results, files, topN, excelBlob }) {
  const folder = sanitizeFolderName(poste);
  const top = topRowsForZip(results, topN);
  const zip = new JSZip();
  const root = zip.folder(folder);

  root.file('export_candidats.xlsx', excelBlob);

  let added = 0;
  let missing = 0;
  const usedNames = new Set(['export_candidats.xlsx']);

  top.forEach((row, idx) => {
    const key = row._file;
    if (!key) {
      missing += 1;
      return;
    }
    const fileObj = files.find((f) => f.name === key);
    if (!fileObj) {
      missing += 1;
      return;
    }
    const prefix = String(idx + 1).padStart(2, '0');
    let base = key;
    let zipName = `${prefix}_${base}`;
    let n = 2;
    while (usedNames.has(zipName)) {
      const dot = base.lastIndexOf('.');
      const stem = dot > 0 ? base.slice(0, dot) : base;
      const ext = dot > 0 ? base.slice(dot) : '';
      zipName = `${prefix}_${stem} (${n})${ext}`;
      n += 1;
    }
    usedNames.add(zipName);
    root.file(zipName, fileObj);
    added += 1;
  });

  const blob = await zip.generateAsync({ type: 'blob' });
  return { blob, missing, added, folderName: folder, count: top.length };
}
