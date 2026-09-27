// Frame-accurate exports. Every frame is rendered at its exact timestamp by the
// sandbox and handed back as an ImageBitmap, so exports never drop frames even
// when the scene is too heavy to play back in real time.

import {
  Output, Mp4OutputFormat, WebMOutputFormat, BufferTarget, CanvasSource,
  QUALITY_VERY_HIGH, getFirstEncodableVideoCodec,
} from 'mediabunny';
import { GIFEncoder, quantize, applyPalette } from 'gifenc';

const abortError = () => new DOMException('Export cancelled', 'AbortError');

function frameCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return { canvas, ctx: canvas.getContext('2d', { alpha: false, willReadFrequently: true }) };
}

/** Encodes the animation to MP4 (H.264), or WebM when the browser can't encode H.264. */
export async function exportVideo(player, { width, height, duration, fps }, { onProgress, signal } = {}) {
  if (typeof VideoEncoder === 'undefined') {
    throw new Error('This browser cannot encode video. Use a recent Chrome, Edge, Safari or Firefox.');
  }
  const codec = await getFirstEncodableVideoCodec(['avc', 'vp9', 'av1', 'vp8'], { width, height, quality: QUALITY_VERY_HIGH });
  if (!codec) throw new Error(`This browser cannot encode ${width}×${height} video.`);

  const mp4 = codec === 'avc';
  const { canvas, ctx } = frameCanvas(width, height);
  const output = new Output({
    format: mp4 ? new Mp4OutputFormat({ fastStart: 'in-memory' }) : new WebMOutputFormat(),
    target: new BufferTarget(),
  });
  const source = new CanvasSource(canvas, { codec, quality: QUALITY_VERY_HIGH });
  output.addVideoTrack(source, { frameRate: fps });
  await output.start();

  const total = Math.max(1, Math.round(duration * fps));
  try {
    for (let i = 0; i < total; i++) {
      if (signal?.aborted) throw abortError();
      const bitmap = await player.captureFrame(i / fps);
      ctx.drawImage(bitmap, 0, 0, width, height);
      bitmap.close();
      await source.add(i / fps, 1 / fps);
      onProgress?.((i + 1) / total);
    }
    await output.finalize();
  } catch (error) {
    if (output.state !== 'finalized') await output.cancel().catch(() => {});
    throw error;
  }
  return { blob: new Blob([output.target.buffer], { type: output.format.mimeType }), extension: mp4 ? 'mp4' : 'webm' };
}

/** Encodes an animated GIF, scaled down to keep the file a reasonable size. */
export async function exportGif(player, { width, height, duration }, { maxSize = 640, fps = 20, onProgress, signal } = {}) {
  const scale = Math.min(1, maxSize / Math.max(width, height));
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);
  const { ctx } = frameCanvas(w, h);
  ctx.imageSmoothingQuality = 'high';

  const gif = GIFEncoder();
  const delay = Math.round(1000 / fps);
  const total = Math.max(1, Math.round(duration * fps));
  for (let i = 0; i < total; i++) {
    if (signal?.aborted) throw abortError();
    const bitmap = await player.captureFrame(i / fps);
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const { data } = ctx.getImageData(0, 0, w, h);
    const palette = quantize(data, 256);
    gif.writeFrame(applyPalette(data, palette), w, h, { palette, delay });
    onProgress?.((i + 1) / total);
    // Quantizing is CPU-heavy; yield so the progress bar can repaint.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  gif.finish();
  return { blob: new Blob([gif.bytes()], { type: 'image/gif' }), extension: 'gif' };
}

/** Renders a single full-resolution frame as PNG. */
export async function exportPng(player, { width, height }, time) {
  const bitmap = await player.captureFrame(time);
  const { canvas, ctx } = frameCanvas(width, height);
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  return { blob, extension: 'png' };
}

/** Small JPEG data URL for the library. */
export async function captureThumbnail(player, { width, height }, time, maxSize = 320) {
  const bitmap = await player.captureFrame(time);
  const scale = maxSize / Math.max(width, height);
  const { canvas, ctx } = frameCanvas(Math.round(width * scale), Math.round(height * scale));
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.75);
}

/**
 * A single self-contained HTML file that plays the animation in any browser.
 * It reuses the sandbox runtime with the program embedded.
 */
export async function exportHtml({ code, title, width, height, duration, fps }) {
  const runtime = await (await fetch('/sandbox.html')).text();
  const config = JSON.stringify({ code, width, height, duration, fps }).replace(/</g, '\\u003c');
  const safeTitle = (title || 'Animation').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]);
  const html = runtime
    .replace('<title>Motion Studio animation</title>', `<title>${safeTitle}</title>`)
    .replace('<head>', `<head>\n<script>window.__STANDALONE__ = ${config};</script>`);
  return { blob: new Blob([html], { type: 'text/html' }), extension: 'html' };
}

export function download({ blob, extension }, name) {
  const slug = (name || 'animation').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'animation';
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${slug}.${extension}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
