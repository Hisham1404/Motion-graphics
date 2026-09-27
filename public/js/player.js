// Controls the sandboxed iframe (public/sandbox.html) that runs animation code.
//
// Events: 'time' { time }, 'state' { playing, time }, 'error' { phase, message, line, time }

export class Player extends EventTarget {
  constructor(container) {
    super();
    this.container = container;
    this.iframe = document.createElement('iframe');
    this.iframe.className = 'stage-frame';
    this.iframe.title = 'Animation preview';
    // No allow-same-origin: generated code gets an opaque origin and can't reach the app.
    this.iframe.setAttribute('sandbox', 'allow-scripts');
    this.iframe.src = '/sandbox.html';
    container.appendChild(this.iframe);

    this.pending = new Map();
    this.nextId = 1;
    this.playing = false;
    this.time = 0;
    this.size = { width: 1920, height: 1080 };

    this.ready = new Promise((resolve) => { this.resolveReady = resolve; });
    window.addEventListener('message', (event) => this.onMessage(event));

    new ResizeObserver(() => this.fit()).observe(container);
  }

  onMessage(event) {
    if (event.source !== this.iframe.contentWindow) return;
    const msg = event.data;
    switch (msg?.type) {
      case 'ready':
        this.resolveReady();
        break;
      case 'loaded':
      case 'frame': {
        const pending = this.pending.get(msg.id);
        if (!pending) break;
        this.pending.delete(msg.id);
        pending(msg);
        break;
      }
      case 'time':
        this.time = msg.time;
        this.dispatchEvent(new CustomEvent('time', { detail: msg }));
        break;
      case 'state':
        this.playing = msg.playing;
        this.time = msg.time;
        this.dispatchEvent(new CustomEvent('state', { detail: msg }));
        break;
      case 'error':
        this.dispatchEvent(new CustomEvent('error', { detail: msg }));
        break;
    }
  }

  request(msg) {
    const id = this.nextId++;
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.iframe.contentWindow.postMessage({ ...msg, id }, '*');
    });
  }

  send(msg) {
    this.iframe.contentWindow.postMessage(msg, '*');
  }

  /** Loads a program. Resolves to null on success or to error details. */
  async load(code, { width, height, duration, fps }, { autoplay = true, time = 0, check = true } = {}) {
    await this.ready;
    this.size = { width, height };
    this.duration = duration;
    this.fit();
    const result = await this.request({ type: 'load', code, width, height, duration, fps, autoplay, time, check });
    return result.error;
  }

  play() { this.send({ type: 'play' }); }
  pause() { this.send({ type: 'pause' }); }
  toggle() { this.playing ? this.pause() : this.play(); }
  seek(time) { this.send({ type: 'seek', time }); }
  setLoop(value) { this.send({ type: 'loop', value }); }

  /** Renders the exact moment `time` and resolves to an ImageBitmap of the full-size frame. */
  async captureFrame(time) {
    const result = await this.request({ type: 'frame', time });
    if (result.error) throw new Error(result.error);
    return result.bitmap;
  }

  /** Sizes the iframe to the largest box with the animation's aspect ratio that fits. */
  fit() {
    const { clientWidth: cw, clientHeight: ch } = this.container;
    if (!cw || !ch) return;
    const ratio = this.size.width / this.size.height;
    let w = cw, h = cw / ratio;
    if (h > ch) { h = ch; w = ch * ratio; }
    this.iframe.style.width = `${Math.floor(w)}px`;
    this.iframe.style.height = `${Math.floor(h)}px`;
  }
}
