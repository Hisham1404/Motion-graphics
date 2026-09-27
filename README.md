# Motion Studio

Describe an animation in plain words and get a motion graphics video.

Motion Studio is a small web app. You type a prompt such as *"A neon logo reveal for NOVA with glowing particles"*. Claude writes the animation as JavaScript canvas code, and the app plays it right away. You can refine it with follow-up instructions and export it as a video, GIF, image or standalone HTML file.

## Features

- **Prompt to animation.** Pick a format (16:9, 9:16, 1:1, 4:5), a length and a frame rate, then describe what you want.
- **Live progress.** You can watch Claude's thinking and the code as they stream in.
- **Refine.** Ask for changes like "make the text bigger" or "warmer colors". Every change is saved as a new version, so you can go back.
- **Automatic fixes.** If the generated code throws an error, the app sends the error and line number back to Claude once, automatically. After that, a **Fix with Claude** button appears.
- **Frame-accurate export.** You can export:
  - **MP4** (H.264). Browsers that can't encode H.264 get WebM instead.
  - **GIF**.
  - **PNG** of the current frame.
  - **HTML**: a single file that plays the animation in any browser.

  Exports render every frame at its exact timestamp, so they never drop frames.
- **Code editor.** You can edit the generated code yourself and run it.
- **Library.** Your animations are saved in your browser. It also includes three built-in samples that work without an API key.

## Getting started

You need [Node.js](https://nodejs.org) 20 or newer, and an Anthropic API key from [console.anthropic.com](https://console.anthropic.com/settings/keys).

```bash
npm install
cp .env.example .env     # then paste your key into .env
npm start
```

Open **http://localhost:3000** in Chrome, Edge, Safari or Firefox.

Don't want to edit `.env`? Start the app anyway, click **Settings**, and paste your key there. The key is stored only in your browser and sent to your own Motion Studio server.

## Tips for good prompts

- Name the on-screen text exactly, in quotes: `"SUMMER SALE"`.
- Mention colors, mood and pace: *"dark background, cyan and magenta neon, energetic"*.
- Say *"seamless loop"* if you want the animation to loop.
- Describe the story in beats: *"particles swirl in, form the logo, then a light sweep glints across it"*.

## How it works

```
Browser                                  Server (server.js)            Anthropic API
───────                                  ──────────────────            ─────────────
prompt + format ──── POST /api/generate ─▶ builds the prompt ─────────▶ Claude
code streams in ◀──── Server-Sent Events ─ streams text back ◀─────────┘
      │
      ▼
sandboxed <iframe> (public/sandbox.html)
  runs render(ctx, t) for every frame on a <canvas>
```

- **`server.js`** is an Express server. It serves the app and forwards generation requests to Claude with the official `@anthropic-ai/sdk`, streaming the reply back to the browser. It uses `claude-opus-5` with adaptive thinking. Server-side refusal fallbacks are turned on: if the model declines a request, the API retries it on a fallback model instead of failing.
- **`lib/prompt.js`** holds the instructions Claude follows: the animation contract, the helper library, motion-design guidance and the output format.
- **`public/sandbox.html`** is the animation runtime. It provides helpers for easing, springs, seeded randomness, noise, text layout, shapes and film grain. Generated code runs inside an iframe sandboxed **without** `allow-same-origin`, and a Content Security Policy blocks network access. This means animation code can't touch the app, your API key, or the internet.
- Each animation is a *pure function of time*: `render(ctx, t)` draws the frame at `t` seconds. That's what makes scrubbing and frame-perfect export possible.
- **`public/js/exporter.js`** encodes video with WebCodecs and [Mediabunny](https://mediabunny.dev), and GIFs with [gifenc](https://github.com/mattdesl/gifenc).

## Configuration

All settings are optional environment variables. You can put them in `.env`:

| Variable | Default | What it does |
|---|---|---|
| `ANTHROPIC_API_KEY` | none | Your API key. You can also enter it in the app's Settings instead. |
| `PORT` | `3000` | Port for the web server. |
| `HOST` | `127.0.0.1` | Set to `0.0.0.0` to open the app to other devices on your network. |
| `MOTION_STUDIO_MODEL` | `claude-opus-5` | The Claude model to use. |
| `MOTION_STUDIO_EFFORT` | `high` | How hard Claude thinks: `low`, `medium`, `high`, `xhigh` or `max`. Higher is slower but usually more polished. |
| `MOTION_STUDIO_FALLBACKS` | on | Set to `off` to disable automatic retry on a fallback model. |

> **Security note:** the server spends the API key in `.env` on behalf of anyone who can reach it. Keep the default `HOST=127.0.0.1` unless you trust your network. Don't put the server on the public internet with your key configured.

## Project layout

```
server.js              Express server + Claude streaming endpoint
lib/prompt.js          System prompt and request builder
public/index.html      App shell
public/styles.css      Styles
public/sandbox.html    Sandboxed animation runtime and helper library
public/js/app.js       UI logic
public/js/player.js    Talks to the sandbox iframe (play, seek, capture frames)
public/js/api.js       Streaming client and reply parser
public/js/exporter.js  MP4/WebM, GIF, PNG and HTML export
public/js/storage.js   Library storage (localStorage)
public/js/examples.js  Prompt ideas and built-in sample animations
```
