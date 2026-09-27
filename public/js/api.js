// Talks to the server's /api/generate endpoint, which streams Server-Sent Events.

export async function fetchStatus() {
  const res = await fetch('/api/status');
  if (!res.ok) throw new Error('Could not reach the Motion Studio server.');
  return res.json();
}

/**
 * Streams a generation. Callbacks receive text deltas as they arrive.
 * Resolves with { model, usage } when Claude finishes; rejects on error or abort.
 */
export async function generate(body, { apiKey, signal, onThinking, onText, onStatus } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers['x-anthropic-key'] = apiKey;

  const res = await fetch('/api/generate', { method: 'POST', headers, body: JSON.stringify(body), signal });
  if (!res.ok) {
    let message = `Request failed (${res.status}).`;
    try { message = (await res.json()).error || message; } catch { /* not JSON */ }
    throw new Error(message);
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  let result = null;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let boundary;
    while ((boundary = buffer.indexOf('\n\n')) !== -1) {
      const raw = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const event = /^event: (.*)$/m.exec(raw)?.[1];
      const dataLine = /^data: (.*)$/m.exec(raw)?.[1];
      if (!event || dataLine === undefined) continue;
      const data = JSON.parse(dataLine);
      if (event === 'thinking') onThinking?.(data.text);
      else if (event === 'text') onText?.(data.text);
      else if (event === 'status') onStatus?.(data.message);
      else if (event === 'error') throw new Error(data.message);
      else if (event === 'done') result = data;
    }
  }
  if (!result) throw new Error('The connection closed before the animation was finished.');
  return result;
}

/**
 * Splits Claude's reply into title, description and code. Works on partial
 * (still-streaming) text too; `complete` tells whether the code block has closed.
 */
export function parseResponse(text) {
  const title = /^#\s+(.+)$/m.exec(text)?.[1]?.trim() ?? '';
  const open = /```(?:js|javascript)?[^\n]*\n/.exec(text);
  if (!open) {
    const description = text.split('\n').filter((l) => l.trim() && !l.startsWith('#')).join(' ').trim();
    return { title, description, code: '', complete: false };
  }
  const body = text.slice(open.index + open[0].length);
  const close = body.lastIndexOf('\n```');
  const code = close === -1 ? body : body.slice(0, close);
  const description = text
    .slice(0, open.index)
    .split('\n')
    .filter((l) => l.trim() && !l.startsWith('#'))
    .join(' ')
    .trim();
  return { title, description, code: code.trimEnd() + '\n', complete: close !== -1 };
}
