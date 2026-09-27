import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { SYSTEM_PROMPT, buildUserMessage } from './lib/prompt.js';

const here = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1';
const MODEL = process.env.MOTION_STUDIO_MODEL || 'claude-opus-5';
const EFFORT = process.env.MOTION_STUDIO_EFFORT || 'high';
// Server-side refusal fallbacks: if Claude declines a request, the API retries it on
// Anthropic's recommended fallback model instead of returning the refusal.
const FALLBACKS = process.env.MOTION_STUDIO_FALLBACKS !== 'off';

const MODES = new Set(['create', 'refine', 'fix']);
const ASPECTS = new Set(['16:9', '9:16', '1:1', '4:5']);
const MAX_TEXT = 4000;
const MAX_CODE = 200_000;

const hasServerCredentials = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
const defaultClient = new Anthropic();

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(here, 'public')));

// Browser builds of the export libraries, served straight from node_modules.
const vendor = {
  'mediabunny.mjs': 'node_modules/mediabunny/dist/bundles/mediabunny.min.mjs',
  'gifenc.mjs': 'node_modules/gifenc/dist/gifenc.esm.js',
};
app.get('/vendor/:file', (req, res, next) => {
  const file = vendor[req.params.file];
  if (!file) return next();
  res.type('text/javascript');
  res.sendFile(path.join(here, file));
});

app.get('/api/status', (req, res) => {
  res.json({ model: MODEL, serverKey: hasServerCredentials });
});

function validate(body) {
  const { mode, prompt = '', instruction = '', code = '', error, settings, changes = [] } = body ?? {};
  if (!MODES.has(mode)) return 'Unknown mode.';
  if (typeof prompt !== 'string' || prompt.length > MAX_TEXT) return 'Prompt is too long.';
  if (mode === 'create' && !prompt.trim()) return 'Describe the animation you want.';
  if (typeof instruction !== 'string' || instruction.length > MAX_TEXT) return 'Instruction is too long.';
  if (mode === 'refine' && !instruction.trim()) return 'Describe the change you want.';
  if (mode !== 'create' && (typeof code !== 'string' || !code.trim() || code.length > MAX_CODE)) {
    return 'Missing or oversized code.';
  }
  if (mode === 'fix' && (typeof error?.message !== 'string' || !error.message)) return 'Missing error details.';
  if (!Array.isArray(changes) || changes.length > 50 || changes.some((c) => typeof c !== 'string' || c.length > MAX_TEXT)) {
    return 'Invalid change history.';
  }
  const { width, height, aspect, duration, fps } = settings ?? {};
  const validNumber = (n, min, max) => Number.isFinite(n) && n >= min && n <= max;
  if (!ASPECTS.has(aspect) || !validNumber(width, 16, 4096) || !validNumber(height, 16, 4096)
    || !validNumber(duration, 1, 60) || !validNumber(fps, 12, 60)) {
    return 'Invalid canvas settings.';
  }
  return null;
}

function friendlyError(err) {
  if (err instanceof Anthropic.AuthenticationError) {
    return 'Your Anthropic API key was rejected. Check it in Settings or in the .env file.';
  }
  if (err instanceof Anthropic.PermissionDeniedError) {
    return `This API key can't use ${MODEL}. (${err.message})`;
  }
  if (err instanceof Anthropic.RateLimitError) {
    return 'Rate limited by the Anthropic API. Wait a moment and try again.';
  }
  if (err instanceof Anthropic.BadRequestError) {
    return `The API rejected the request: ${err.message}`;
  }
  if (err instanceof Anthropic.InternalServerError) {
    return 'The Anthropic API is having trouble (server error or overloaded). Try again shortly.';
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return 'Could not reach the Anthropic API. Check your internet connection.';
  }
  if (err instanceof Anthropic.APIError) {
    return `Anthropic API error${err.status ? ` ${err.status}` : ''}: ${err.message}`;
  }
  return err?.message || 'Something went wrong.';
}

app.post('/api/generate', async (req, res) => {
  const problem = validate(req.body);
  if (problem) return res.status(400).json({ error: problem });

  const userKey = req.get('x-anthropic-key')?.trim();
  const client = userKey ? new Anthropic({ apiKey: userKey, authToken: null }) : defaultClient;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  const params = {
    model: MODEL,
    max_tokens: 64000,
    thinking: { type: 'adaptive', display: 'summarized' },
    output_config: { effort: EFFORT },
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: buildUserMessage(req.body) }],
  };
  if (FALLBACKS) {
    params.betas = ['server-side-fallback-2026-07-01'];
    params.fallbacks = 'default';
  }

  const stream = client.beta.messages.stream(params);
  res.on('close', () => {
    if (!res.writableEnded) stream.abort();
  });

  try {
    for await (const event of stream) {
      if (event.type === 'content_block_start' && event.content_block.type === 'fallback') {
        // A refusal on the requested model was retried on a fallback model. Any text
        // already streamed is kept by the API as continuation context.
        send('status', { message: `Continuing on ${event.content_block.to.model}` });
      } else if (event.type === 'content_block_delta') {
        if (event.delta.type === 'thinking_delta') send('thinking', { text: event.delta.thinking });
        else if (event.delta.type === 'text_delta') send('text', { text: event.delta.text });
      }
    }
    const message = await stream.finalMessage();
    if (message.stop_reason === 'refusal') {
      send('error', { message: 'Claude declined this request. Try rephrasing the brief.' });
    } else if (message.stop_reason === 'max_tokens') {
      send('error', { message: 'The response was cut off before the code was finished. Try a simpler brief.' });
    } else {
      send('done', {
        model: message.model,
        usage: {
          input: message.usage.input_tokens,
          output: message.usage.output_tokens,
          cacheRead: message.usage.cache_read_input_tokens ?? 0,
        },
      });
    }
  } catch (err) {
    if (err instanceof Anthropic.APIUserAbortError) return; // browser went away
    console.error('[generate]', err);
    const noCredentials = !userKey && !hasServerCredentials && !(err instanceof Anthropic.APIError);
    send('error', {
      message: noCredentials
        ? 'No Anthropic API key found. Add one in Settings or in the .env file.'
        : friendlyError(err),
    });
  }
  res.end();
});

app.listen(PORT, HOST, () => {
  console.log(`\n  Motion Studio is running at http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}\n`);
  console.log(`  Model: ${MODEL} · effort: ${EFFORT}`);
  if (!hasServerCredentials) {
    console.log('  No ANTHROPIC_API_KEY found: add it to .env, or paste a key in the app\'s Settings.\n');
  }
});
