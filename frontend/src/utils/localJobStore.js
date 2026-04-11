const TEMPLATES_KEY = 'cv_filtre_templates_v1';
const HISTORY_KEY = 'cv_filtre_history_v1';
const HISTORY_MAX = 12;

function safeParse(json, fallback) {
  try {
    return JSON.parse(json) || fallback;
  } catch {
    return fallback;
  }
}

export function loadTemplates() {
  return safeParse(localStorage.getItem(TEMPLATES_KEY) || '[]', []);
}

export function saveTemplate(name, text) {
  const list = loadTemplates().filter((t) => t.name !== name);
  list.unshift({ id: Date.now().toString(), name: name.trim(), text, savedAt: Date.now() });
  localStorage.setItem(TEMPLATES_KEY, JSON.stringify(list.slice(0, 30)));
}

export function deleteTemplate(id) {
  const list = loadTemplates().filter((t) => t.id !== id);
  localStorage.setItem(TEMPLATES_KEY, JSON.stringify(list));
}

export function loadHistory() {
  return safeParse(localStorage.getItem(HISTORY_KEY) || '[]', []);
}

export function pushHistorySession({ poste, results }) {
  if (!poste?.trim() || !results?.length) return;
  const entry = {
    id: Date.now().toString(),
    at: Date.now(),
    poste: poste.trim(),
    results,
  };
  const list = loadHistory().filter((h) => h.poste !== entry.poste || JSON.stringify(h.results) !== JSON.stringify(entry.results));
  list.unshift(entry);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, HISTORY_MAX)));
}

export function exportSessionJson({ poste, results }) {
  return JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), poste, results }, null, 2);
}

export function importSessionJson(text) {
  const o = safeParse(text, null);
  if (!o || !Array.isArray(o.results)) throw new Error('JSON invalide');
  return { poste: o.poste || '', results: o.results };
}
