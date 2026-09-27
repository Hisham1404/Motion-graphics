// Projects are kept in this browser's localStorage.
//
// A project: { id, prompt, settings, versions: [{ code, title, description, note, createdAt }],
//              active, thumb, createdAt, updatedAt }

const KEY = 'motion-studio:projects';
const SETTINGS_KEY = 'motion-studio:settings';
const API_KEY = 'motion-studio:api-key';
const MAX_PROJECTS = 40;

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function loadProjects() {
  const projects = read(KEY, []);
  return Array.isArray(projects) ? projects : [];
}

export function saveProject(project) {
  const projects = loadProjects().filter((p) => p.id !== project.id);
  projects.unshift({ ...project, updatedAt: Date.now() });
  projects.length = Math.min(projects.length, MAX_PROJECTS);
  // If storage is full, drop the oldest projects until it fits.
  while (!write(KEY, projects) && projects.length > 1) projects.pop();
}

export function deleteProject(id) {
  write(KEY, loadProjects().filter((p) => p.id !== id));
}

export function loadSettings() {
  return read(SETTINGS_KEY, null);
}

export function saveSettings(settings) {
  write(SETTINGS_KEY, settings);
}

export function loadApiKey() {
  try { return localStorage.getItem(API_KEY) || ''; } catch { return ''; }
}

export function saveApiKey(key) {
  try {
    if (key) localStorage.setItem(API_KEY, key);
    else localStorage.removeItem(API_KEY);
  } catch { /* storage unavailable */ }
}

export function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
