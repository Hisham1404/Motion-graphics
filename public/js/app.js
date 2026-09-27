import { Player } from './player.js';
import { fetchStatus, generate, parseResponse } from './api.js';
import { exportVideo, exportGif, exportPng, exportHtml, captureThumbnail, download } from './exporter.js';
import * as store from './storage.js';
import { PROMPT_IDEAS, SAMPLES } from './examples.js';

const SIZES = { '16:9': [1920, 1080], '9:16': [1080, 1920], '1:1': [1080, 1080], '4:5': [1080, 1350] };
const MAX_VERSIONS = 30;
const REFINE_IDEAS = ['Make it faster', 'Warmer colors', 'Bigger text', 'Add particles', 'Make it loop seamlessly', 'More minimal'];

const $ = (selector) => document.querySelector(selector);
const els = {
  prompt: $('#prompt'), ideas: $('#ideas'), aspect: $('#aspect'), duration: $('#duration'), fps: $('#fps'),
  generateBtn: $('#generate-btn'),
  activity: $('#activity'), activityLabel: $('#activity-label'), stopBtn: $('#stop-btn'),
  thinkingBox: $('#thinking-box'), thinking: $('#thinking'),
  errorCard: $('#error-card'), errorHeading: $('#error-heading'), errorText: $('#error-text'),
  fixBtn: $('#fix-btn'), dismissBtn: $('#dismiss-btn'),
  refine: $('#refine'), refineInput: $('#refine-input'), refineBtn: $('#refine-btn'), refineIdeas: $('#refine-ideas'),
  title: $('#anim-title'), desc: $('#anim-desc'), versions: $('#versions'),
  tabs: document.querySelectorAll('.tab'), previewView: $('#preview-view'), codeView: $('#code-view'),
  stage: $('#stage'), overlay: $('#stage-overlay'), overlayTitle: $('#overlay-title'), overlaySub: $('#overlay-sub'),
  overlayProgress: $('#overlay-progress'), overlayBar: $('#overlay-bar'), overlayCancel: $('#overlay-cancel'),
  playBtn: $('#play-btn'), restartBtn: $('#restart-btn'), scrubber: $('#scrubber'), timeLabel: $('#time-label'), loopBtn: $('#loop-btn'),
  exportBtns: document.querySelectorAll('[data-export]'),
  code: $('#code'), runBtn: $('#run-btn'), copyBtn: $('#copy-btn'),
  keyBanner: $('#key-banner'), bannerSettings: $('#banner-settings'),
  settingsBtn: $('#settings-btn'), settingsDialog: $('#settings-dialog'), settingsForm: $('#settings-form'),
  apiKey: $('#api-key'), toggleKey: $('#toggle-key'), modelHint: $('#model-hint'),
  libraryBtn: $('#library-btn'), libraryDialog: $('#library-dialog'), libraryClose: $('#library-close'),
  libraryProjects: $('#library-projects'), libraryEmpty: $('#library-empty'), librarySamples: $('#library-samples'),
  toast: $('#toast'),
};

const state = {
  project: null,
  settings: { aspect: '16:9', duration: 6, fps: 60, ...store.loadSettings() },
  busy: null,             // { kind: 'generate' | 'export', controller }
  status: null,           // { model, serverKey } from the server
  apiKey: store.loadApiKey(),
  error: null,            // last program error { phase, message, line, time }
  scrubbing: false,
};

const player = new Player(els.stage);

// ───────────────────────── Helpers ─────────────────────────

function canvasSettings(settings = state.settings) {
  const [width, height] = SIZES[settings.aspect] ?? SIZES['16:9'];
  return { aspect: settings.aspect, duration: Number(settings.duration), fps: Number(settings.fps), width, height };
}

const activeVersion = (project = state.project) => project?.versions[project.active];

function hasCredentials() {
  return Boolean(state.apiKey || state.status?.serverKey);
}

let toastTimer;
function toast(message, ms = 3200) {
  els.toast.textContent = message;
  els.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { els.toast.hidden = true; }, ms);
}

function describeError(error) {
  const where = error.line ? `Line ${error.line}: ` : '';
  const when = error.phase === 'render' && typeof error.time === 'number' ? ` (at ${error.time.toFixed(2)} s)` : '';
  return `${where}${error.message}${when}`;
}

// ───────────────────────── UI state ─────────────────────────

function updateUI() {
  const busy = Boolean(state.busy);
  const hasProject = Boolean(state.project);
  els.generateBtn.disabled = busy;
  els.refineBtn.disabled = busy || !hasProject;
  els.refineInput.disabled = busy;
  els.fixBtn.disabled = busy;
  els.runBtn.disabled = busy || !hasProject;
  els.exportBtns.forEach((b) => { b.disabled = busy || !hasProject || Boolean(state.error); });
  els.aspect.disabled = els.duration.disabled = els.fps.disabled = busy;
  els.refine.hidden = !hasProject;
  els.keyBanner.hidden = !state.status || hasCredentials();
  els.code.readOnly = busy;
  renderVersions();
}

function syncSettingsUI() {
  els.aspect.value = state.settings.aspect;
  els.duration.value = String(state.settings.duration);
  els.fps.value = String(state.settings.fps);
  if (!els.duration.value) {
    // A project may use a length that isn't in the list; add it.
    els.duration.add(new Option(`${state.settings.duration} s`, String(state.settings.duration)));
    els.duration.value = String(state.settings.duration);
  }
}

function setTitle(title, description) {
  els.title.textContent = title || 'Untitled';
  els.desc.textContent = description || '';
  document.title = title ? `${title} · Motion Studio` : 'Motion Studio';
}

function renderVersions() {
  const project = state.project;
  if (!project || project.versions.length < 2) {
    els.versions.hidden = true;
    return;
  }
  els.versions.hidden = false;
  els.versions.replaceChildren(
    Object.assign(document.createElement('span'), { className: 'versions-label', textContent: 'Versions' }),
    ...project.versions.map((version, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'version' + (i === project.active ? ' active' : '');
      btn.textContent = `v${i + 1}`;
      btn.title = version.note || 'Original';
      btn.disabled = Boolean(state.busy);
      btn.addEventListener('click', () => {
        if (i === project.active) return;
        project.active = i;
        openProject(project);
      });
      return btn;
    }),
  );
}

function showActivity(label) {
  els.activity.hidden = false;
  els.activityLabel.textContent = label;
  els.thinking.textContent = '';
  els.thinkingBox.hidden = true;
  els.thinkingBox.open = false;
  showOverlay(label, '');
}

function hideActivity() {
  els.activity.hidden = true;
  hideOverlay();
}

function showOverlay(title, sub, { progress = null, cancel = false } = {}) {
  els.overlay.hidden = false;
  els.overlayTitle.textContent = title;
  els.overlaySub.textContent = sub;
  els.overlayProgress.hidden = progress === null;
  if (progress !== null) els.overlayBar.style.width = `${Math.round(progress * 100)}%`;
  els.overlayCancel.hidden = !cancel;
}

function hideOverlay() {
  els.overlay.hidden = true;
}

function showError(heading, message, { fixable = false } = {}) {
  els.errorCard.hidden = false;
  els.errorHeading.textContent = heading;
  els.errorText.textContent = message;
  els.fixBtn.hidden = !fixable;
}

function clearError() {
  state.error = null;
  els.errorCard.hidden = true;
  updateUI();
}

function showProgramError(error) {
  state.error = error;
  showError('The animation has an error', describeError(error), { fixable: true });
  updateUI();
}

// ───────────────────────── Projects ─────────────────────────

function persist(project, { thumbnail = false } = {}) {
  if (project.sample) return;
  store.saveProject(project);
  if (!thumbnail) return;
  const settings = canvasSettings(project.settings);
  captureThumbnail(player, settings, settings.duration * 0.6)
    .then((thumb) => {
      if (state.project !== project) return;
      project.thumb = thumb;
      store.saveProject(project);
    })
    .catch(() => {});
}

/** Samples are read-only; the first change turns one into a regular project. */
function ensureOwnProject() {
  const project = state.project;
  if (!project.sample) return project;
  const copy = structuredClone({ ...project, sample: false });
  copy.id = store.newId();
  copy.createdAt = Date.now();
  state.project = copy;
  return copy;
}

async function openProject(project, { fixBudget = 0, time = 0, autoplay = true } = {}) {
  state.project = project;
  state.settings = { ...project.settings };
  syncSettingsUI();
  const version = activeVersion(project);
  els.code.value = version.code;
  setTitle(version.title, version.description);
  clearError();
  const error = await player.load(version.code, canvasSettings(), { autoplay, time });
  if (state.project !== project) return;
  if (error) {
    showProgramError(error);
    if (fixBudget > 0 && hasCredentials()) runGeneration('fix', { error, fixBudget: fixBudget - 1 });
    return;
  }
  const needsThumbnail = !project.thumb || project.thumbVersion !== project.active;
  project.thumbVersion = project.active;
  persist(project, { thumbnail: needsThumbnail });
}

function sampleProject(sample, index) {
  return {
    id: `sample-${index}`,
    sample: true,
    prompt: sample.prompt,
    settings: { ...sample.settings },
    versions: [{ code: sample.code, title: sample.title, description: sample.description, note: '', createdAt: 0 }],
    active: 0,
    createdAt: 0,
  };
}

function addVersion(project, version) {
  project.versions.push(version);
  if (project.versions.length > MAX_VERSIONS) project.versions.splice(1, project.versions.length - MAX_VERSIONS);
  project.active = project.versions.length - 1;
  project.settings = { ...state.settings };
}

// ───────────────────────── Generation ─────────────────────────

async function runGeneration(mode, { instruction = '', error = null, fixBudget = 1 } = {}) {
  if (state.busy) return;
  if (!hasCredentials()) {
    openSettings();
    toast('Add your Anthropic API key first.');
    return;
  }

  const body = { mode, settings: canvasSettings() };
  if (mode === 'create') {
    body.prompt = els.prompt.value.trim();
    if (!body.prompt) {
      els.prompt.focus();
      toast('Describe the animation you want first.');
      return;
    }
  } else {
    const project = state.project;
    body.prompt = project.prompt;
    body.code = activeVersion(project).code;
    body.changes = project.versions.slice(1, project.active + 1).map((v) => v.note).filter(Boolean);
    if (mode === 'refine') body.instruction = instruction;
    if (mode === 'fix') body.error = { message: error.message, line: error.line ?? null };
  }

  const controller = new AbortController();
  state.busy = { kind: 'generate', controller };
  els.errorCard.hidden = true;
  const labels = { create: 'Designing your animation…', refine: 'Applying your change…', fix: 'Fixing the error…' };
  showActivity(labels[mode]);
  els.overlayTitle.textContent = 'Claude is thinking…';
  updateUI();

  let text = '';
  let thinking = '';
  let frame = 0;
  const render = () => {
    frame = 0;
    const parsed = parseResponse(text);
    if (parsed.code) {
      const lines = parsed.code.split('\n').length;
      els.activityLabel.textContent = `Writing code · ${lines} lines`;
      showOverlay(parsed.title || 'Writing code…', `${lines} lines of code`);
      els.code.value = parsed.code;
    } else if (parsed.title) {
      showOverlay(parsed.title, parsed.description || 'Planning the choreography…');
    }
    if (thinking) {
      els.thinkingBox.hidden = false;
      els.thinking.textContent = thinking;
      els.thinking.scrollTop = els.thinking.scrollHeight;
    }
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(render); };

  try {
    await generate(body, {
      apiKey: state.apiKey,
      signal: controller.signal,
      onThinking: (delta) => { thinking += delta; schedule(); },
      onText: (delta) => { text += delta; schedule(); },
      onStatus: (message) => toast(message),
    });
    cancelAnimationFrame(frame);
    const parsed = parseResponse(text);
    if (!parsed.code.trim()) throw new Error("Claude's reply didn't include any code. Please try again.");

    const version = {
      code: parsed.code,
      title: parsed.title || activeVersion()?.title || 'Untitled',
      description: parsed.description,
      note: mode === 'refine' ? instruction : mode === 'fix' ? `Fixed an error: ${error.message}` : '',
      createdAt: Date.now(),
    };
    let project;
    if (mode === 'create') {
      project = { id: store.newId(), prompt: body.prompt, settings: { ...state.settings }, versions: [version], active: 0, createdAt: Date.now() };
    } else {
      project = ensureOwnProject();
      addVersion(project, version);
    }
    if (mode === 'refine') els.refineInput.value = '';
    state.busy = null;
    hideActivity();
    await openProject(project, { fixBudget: mode === 'fix' ? fixBudget : 1 });
  } catch (err) {
    cancelAnimationFrame(frame);
    // Restore the code view to the version on screen.
    if (state.project) els.code.value = activeVersion().code;
    if (err.name === 'AbortError') toast('Stopped.');
    else showError('Generation failed', err.message);
  } finally {
    if (state.busy?.controller === controller) state.busy = null;
    // An automatic fix may already be running; leave its progress on screen.
    if (!state.busy) hideActivity();
    updateUI();
  }
}

// ───────────────────────── Export ─────────────────────────

async function runExport(kind) {
  if (state.busy || !state.project) return;
  const version = activeVersion();
  const settings = canvasSettings();
  const wasPlaying = player.playing;
  const time = player.time;
  player.pause();

  const controller = new AbortController();
  state.busy = { kind: 'export', controller };
  updateUI();
  const names = { mp4: 'video', gif: 'GIF', png: 'PNG', html: 'HTML file' };
  const onProgress = (p) => showOverlay(`Exporting ${names[kind]}…`, `${Math.round(p * 100)}%`, { progress: p, cancel: true });
  onProgress(0);

  try {
    let file;
    if (kind === 'mp4') file = await exportVideo(player, settings, { onProgress, signal: controller.signal });
    else if (kind === 'gif') file = await exportGif(player, settings, { onProgress, signal: controller.signal });
    else if (kind === 'png') file = await exportPng(player, settings, time);
    else file = await exportHtml({ code: version.code, title: version.title, ...settings });
    download(file, version.title);
    toast(`Saved ${file.extension.toUpperCase()} (${(file.blob.size / 1024 / 1024).toFixed(1)} MB)`);
  } catch (err) {
    if (err.name === 'AbortError') toast('Export cancelled.');
    else showError('Export failed', err.message);
  } finally {
    state.busy = null;
    hideOverlay();
    player.seek(time);
    if (wasPlaying) player.play();
    updateUI();
  }
}

// ───────────────────────── Settings & library ─────────────────────────

function openSettings() {
  els.apiKey.value = state.apiKey;
  els.apiKey.type = 'password';
  els.toggleKey.textContent = 'Show';
  els.modelHint.textContent = state.status
    ? `Model: ${state.status.model}.${state.status.serverKey ? ' The server also has its own key configured; a key entered here takes priority.' : ''}`
    : '';
  els.settingsDialog.showModal();
}

function card({ title, subtitle, thumb, onOpen, onDelete }) {
  const el = document.createElement('div');
  el.className = 'lib-card';
  const open = document.createElement('button');
  open.type = 'button';
  open.className = 'lib-open';
  const media = document.createElement('div');
  media.className = 'lib-thumb';
  if (thumb) media.style.backgroundImage = `url("${thumb}")`;
  else media.textContent = title;
  const caption = document.createElement('div');
  caption.className = 'lib-caption';
  caption.append(
    Object.assign(document.createElement('strong'), { textContent: title }),
    Object.assign(document.createElement('span'), { textContent: subtitle }),
  );
  open.append(media, caption);
  open.addEventListener('click', onOpen);
  el.append(open);
  if (onDelete) {
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'lib-delete';
    del.setAttribute('aria-label', `Delete ${title}`);
    del.textContent = '×';
    del.addEventListener('click', onDelete);
    el.append(del);
  }
  return el;
}

function openLibrary() {
  const projects = store.loadProjects();
  els.libraryEmpty.hidden = projects.length > 0;
  els.libraryProjects.replaceChildren(...projects.map((project) => {
    const version = activeVersion(project);
    const date = new Date(project.updatedAt || project.createdAt).toLocaleDateString();
    return card({
      title: version?.title || 'Untitled',
      subtitle: `${project.settings.aspect} · ${project.settings.duration}s · ${date}`,
      thumb: project.thumb,
      onOpen: () => {
        els.libraryDialog.close();
        els.prompt.value = project.prompt;
        openProject(project);
      },
      onDelete: () => {
        if (!confirm(`Delete “${version?.title || 'Untitled'}”?`)) return;
        store.deleteProject(project.id);
        openLibrary();
      },
    });
  }));
  els.librarySamples.replaceChildren(...SAMPLES.map((sample, i) => card({
    title: sample.title,
    subtitle: `${sample.settings.aspect} · ${sample.settings.duration}s · sample`,
    onOpen: () => {
      els.libraryDialog.close();
      openProject(sampleProject(sample, i));
    },
  })));
  if (!els.libraryDialog.open) els.libraryDialog.showModal();
}

// ───────────────────────── Events ─────────────────────────

function formatTime(t) {
  return t.toFixed(1);
}

function updateTransport(time) {
  const duration = canvasSettings().duration;
  if (!state.scrubbing) els.scrubber.value = String(Math.round((time / duration) * 1000));
  els.timeLabel.textContent = `${formatTime(time)} / ${formatTime(duration)} s`;
}

player.addEventListener('time', (e) => updateTransport(e.detail.time));
player.addEventListener('state', (e) => {
  els.playBtn.classList.toggle('playing', e.detail.playing);
  els.playBtn.setAttribute('aria-label', e.detail.playing ? 'Pause' : 'Play');
  updateTransport(e.detail.time);
});
player.addEventListener('error', (e) => showProgramError(e.detail));

els.playBtn.addEventListener('click', () => {
  if (state.error) return;
  player.toggle();
});
els.restartBtn.addEventListener('click', () => {
  if (state.error) return;
  player.seek(0);
  player.play();
});
els.scrubber.addEventListener('input', () => {
  state.scrubbing = true;
  player.pause();
  player.seek((Number(els.scrubber.value) / 1000) * canvasSettings().duration);
});
els.scrubber.addEventListener('change', () => { state.scrubbing = false; });
els.loopBtn.addEventListener('click', () => {
  const on = !els.loopBtn.classList.contains('active');
  els.loopBtn.classList.toggle('active', on);
  els.loopBtn.setAttribute('aria-pressed', String(on));
  player.setLoop(on);
});

els.generateBtn.addEventListener('click', () => runGeneration('create'));
els.prompt.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    runGeneration('create');
  }
});

function refine(instruction) {
  instruction = instruction.trim();
  if (!instruction) {
    els.refineInput.focus();
    return;
  }
  runGeneration('refine', { instruction });
}
els.refineBtn.addEventListener('click', () => refine(els.refineInput.value));
els.refineInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    refine(els.refineInput.value);
  }
});
els.refineIdeas.replaceChildren(...REFINE_IDEAS.map((idea) => {
  const chip = Object.assign(document.createElement('button'), { type: 'button', className: 'chip', textContent: idea });
  chip.addEventListener('click', () => { els.refineInput.value = idea; els.refineInput.focus(); });
  return chip;
}));

els.ideas.replaceChildren(...PROMPT_IDEAS.map((idea) => {
  const chip = Object.assign(document.createElement('button'), { type: 'button', className: 'chip', textContent: idea.label });
  chip.title = idea.prompt;
  chip.addEventListener('click', () => {
    els.prompt.value = idea.prompt;
    if (!state.busy && idea.aspect !== state.settings.aspect) {
      els.aspect.value = idea.aspect;
      els.aspect.dispatchEvent(new Event('change'));
    }
    els.prompt.focus();
  });
  return chip;
}));

els.stopBtn.addEventListener('click', () => state.busy?.controller.abort());
els.overlayCancel.addEventListener('click', () => state.busy?.controller.abort());
els.fixBtn.addEventListener('click', () => {
  if (state.error) runGeneration('fix', { error: state.error, fixBudget: 0 });
});
els.dismissBtn.addEventListener('click', () => { els.errorCard.hidden = true; });

function onSettingsChange() {
  state.settings = { aspect: els.aspect.value, duration: Number(els.duration.value), fps: Number(els.fps.value) };
  store.saveSettings(state.settings);
  const project = state.project;
  if (!project) return;
  // The program reads W, H and DURATION, so it adapts without regenerating.
  project.settings = { ...state.settings };
  project.thumb = null;
  openProject(project, { time: Math.min(player.time, state.settings.duration), autoplay: player.playing });
}
[els.aspect, els.duration, els.fps].forEach((el) => el.addEventListener('change', onSettingsChange));

els.tabs.forEach((tab) => tab.addEventListener('click', () => {
  const name = tab.dataset.tab;
  els.tabs.forEach((t) => {
    t.classList.toggle('active', t === tab);
    t.setAttribute('aria-selected', String(t === tab));
  });
  els.previewView.hidden = name !== 'preview';
  els.codeView.hidden = name !== 'code';
  if (name === 'preview') player.fit();
}));

els.code.addEventListener('keydown', (e) => {
  if (e.key === 'Tab' && !e.shiftKey && !els.code.readOnly) {
    e.preventDefault();
    els.code.setRangeText('  ', els.code.selectionStart, els.code.selectionEnd, 'end');
  }
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    els.runBtn.click();
  }
});
els.runBtn.addEventListener('click', () => {
  if (!state.project || state.busy) return;
  const code = els.code.value;
  const current = activeVersion();
  if (code === current.code) {
    openProject(state.project);
    return;
  }
  const project = ensureOwnProject();
  addVersion(project, { ...current, code, note: 'Edited the code by hand', createdAt: Date.now() });
  openProject(project);
  els.tabs[0].click();
});
els.copyBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(els.code.value);
    toast('Code copied.');
  } catch {
    toast('Could not copy. Select the code and copy it manually.');
  }
});

els.exportBtns.forEach((btn) => btn.addEventListener('click', () => runExport(btn.dataset.export)));

els.settingsBtn.addEventListener('click', openSettings);
els.bannerSettings.addEventListener('click', openSettings);
els.toggleKey.addEventListener('click', () => {
  const show = els.apiKey.type === 'password';
  els.apiKey.type = show ? 'text' : 'password';
  els.toggleKey.textContent = show ? 'Hide' : 'Show';
});
els.settingsDialog.addEventListener('close', () => {
  if (els.settingsDialog.returnValue !== 'save') return;
  state.apiKey = els.apiKey.value.trim();
  store.saveApiKey(state.apiKey);
  toast(state.apiKey ? 'API key saved in this browser.' : 'API key removed.');
  updateUI();
});

els.libraryBtn.addEventListener('click', openLibrary);
els.libraryClose.addEventListener('click', () => els.libraryDialog.close());
els.libraryDialog.addEventListener('click', (e) => { if (e.target === els.libraryDialog) els.libraryDialog.close(); });

document.addEventListener('keydown', (e) => {
  if (e.code !== 'Space' || e.target.closest('input, textarea, select, button, dialog')) return;
  e.preventDefault();
  if (!state.error && !state.busy) player.toggle();
});

// ───────────────────────── Start ─────────────────────────

syncSettingsUI();
updateUI();
fetchStatus()
  .then((status) => { state.status = status; updateUI(); })
  .catch(() => showError('Server not reachable', 'Could not reach the Motion Studio server. Is it still running?'));

const [latest] = store.loadProjects();
if (latest) {
  els.prompt.value = latest.prompt;
  openProject(latest, { autoplay: true });
} else {
  openProject(sampleProject(SAMPLES[0], 0));
}
