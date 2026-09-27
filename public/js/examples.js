// Prompt ideas shown as chips under the prompt box.
export const PROMPT_IDEAS = [
  {
    label: 'Neon logo reveal',
    prompt: 'A neon logo reveal for "NOVA": glowing particles swirl in from the edges and converge into the letters, then a light sweep glints across the finished logo. Dark background, cyan and magenta neon.',
    aspect: '16:9',
  },
  {
    label: 'Kinetic typography',
    prompt: 'Bold kinetic typography that says "Dream. Build. Launch." Each word slams in with a different energetic transition on a bright color block, then all three lock up together at the end.',
    aspect: '16:9',
  },
  {
    label: 'Solar system',
    prompt: 'A stylized solar system: the sun glows in the center, planets with different colors and sizes orbit on elliptical paths, a starfield twinkles behind, and the camera slowly pushes in.',
    aspect: '16:9',
  },
  {
    label: 'Bar chart race',
    prompt: 'An animated bar chart showing yearly revenue growing from 2019 to 2025 (1.2M, 1.8M, 2.1M, 3.4M, 4.0M, 5.6M, 7.9M). Bars grow in one by one with counting numbers, clean corporate style with a title "Revenue Growth".',
    aspect: '16:9',
  },
  {
    label: 'Story sale promo',
    prompt: 'An Instagram story promo: "SUMMER SALE" and "50% OFF" pop in with springy motion over a sunny gradient, with confetti bursting and a "Shop now" button pulsing at the end.',
    aspect: '9:16',
  },
  {
    label: 'Synthwave loop',
    prompt: 'A seamless looping retro synthwave scene: a striped setting sun, a neon grid scrolling toward the viewer, distant mountains and palm silhouettes, with subtle scanlines.',
    aspect: '16:9',
  },
  {
    label: 'Liquid blobs',
    prompt: 'Soft liquid gradient blobs morphing slowly behind a frosted glass card with the text "Hello, world". Pastel colors, calm and elegant, seamless loop.',
    aspect: '1:1',
  },
  {
    label: 'Loading spinner',
    prompt: 'A playful loading spinner: 8 colorful dots chase each other around a circle with elastic squash and stretch. Seamless loop on a white background.',
    aspect: '1:1',
  },
];

// Hand-written samples, so the app shows something (and can be tried out)
// before any API key is set up.
export const SAMPLES = [
  {
    title: 'Welcome to Motion Studio',
    description: 'The title assembles letter by letter inside drawing orbit rings over a drifting starfield.',
    prompt: 'An elegant intro for "MOTION STUDIO" with orbit rings, a starfield and a gradient underline.',
    settings: { aspect: '16:9', duration: 6, fps: 60 },
    code: `const palette = { bg1: '#0b0620', bg2: '#1a0f3d', violet: '#8b5cf6', pink: '#ec4899', cyan: '#22d3ee' };
const ringColors = [palette.violet, palette.pink, palette.cyan];
let stars = [];

function setup() {
  const r = rng(11);
  stars = Array.from({ length: 240 }, () => ({ x: r(), y: r(), depth: 0.2 + r() * 0.8, twinkle: r() * TAU }));
}

function render(ctx, t) {
  const s = Math.min(W, H);
  const cx = W / 2, cy = H / 2;

  // Deep gradient background with slowly drifting color glows
  ctx.fillStyle = linearGradient(ctx, 0, 0, W, H, [palette.bg1, palette.bg2, palette.bg1]);
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'lighter';
  ringColors.forEach((color, i) => {
    const gx = cx + noise(i * 3.1, t * 0.12) * W * 0.4;
    const gy = cy + noise(i * 3.1 + 20, t * 0.12) * H * 0.4;
    ctx.fillStyle = radialGradient(ctx, gx, gy, s * 0.65, [[0, withAlpha(color, 0.22)], [1, withAlpha(color, 0)]]);
    ctx.fillRect(0, 0, W, H);
  });

  // Parallax starfield
  for (const star of stars) {
    const x = wrap(star.x * W - t * 24 * star.depth, 0, W);
    const glow = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 2.2 + star.twinkle));
    ctx.fillStyle = withAlpha('#ffffff', glow * star.depth * 0.8);
    circle(ctx, x, star.y * H, star.depth * s * 0.0022);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';

  // Orbit rings draw on, each with a traveling dot
  ringColors.forEach((color, i) => {
    const p = ease.inOutCubic(stagger(t, i, 0.1, 0.18, 1.8));
    if (p <= 0) return;
    const r = s * (0.3 + i * 0.075);
    withTransform(ctx, { x: cx, y: cy, rotate: -PI / 2 + t * 0.25 * (i % 2 ? -1 : 1), scaleY: 0.92 }, () => {
      ctx.strokeStyle = withAlpha(color, 0.45);
      ctx.lineWidth = s * 0.0025;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TAU * p);
      ctx.stroke();
      const a = TAU * p;
      ctx.fillStyle = radialGradient(ctx, Math.cos(a) * r, Math.sin(a) * r, s * 0.03, [color, withAlpha(color, 0)]);
      circle(ctx, Math.cos(a) * r, Math.sin(a) * r, s * 0.03);
      ctx.fill();
      ctx.fillStyle = '#fff';
      circle(ctx, Math.cos(a) * r, Math.sin(a) * r, s * 0.006);
      ctx.fill();
    });
  });

  // Title: letters rise and spring into place one after another
  const size = fitText(ctx, 'MOTION STUDIO', W * 0.84, { size: s * 0.13, font: 'Bebas Neue', weight: 400, letterSpacing: s * 0.0104 });
  const font = { size, font: 'Bebas Neue', weight: 400 };
  const layout = layoutText(ctx, 'MOTION STUDIO', { ...font, letterSpacing: size * 0.08 });
  const left = cx - layout.width / 2;
  const push = lerp(1, 1.04, ease.inOutSine(progress(t, 0, DURATION)));
  withTransform(ctx, { x: cx, y: cy, scale: push }, () => {
    layout.chars.forEach((c, i) => {
      const p = stagger(t, i, 0.7, 0.055, 0.9);
      if (p <= 0) return;
      withTransform(ctx, {
        x: left - cx + c.x + c.w / 2,
        y: (1 - ease.outExpo(p)) * size * 0.9,
        scale: lerp(0.5, 1, spring(p, 0.45)),
        alpha: ease.outCubic(p),
      }, () => text(ctx, c.ch, 0, 0, font));
    });

    // Gradient underline sweeps across
    const u = ease.inOutQuart(progress(t, 1.9, 2.8));
    if (u > 0) {
      ctx.fillStyle = linearGradient(ctx, -layout.width / 2, 0, layout.width / 2, 0, ringColors);
      roundRect(ctx, -layout.width / 2, size * 0.6, layout.width * u, s * 0.006, s * 0.003);
      ctx.fill();
    }

    // Tagline
    const tp = progress(t, 2.5, 3.4);
    text(ctx, 'Type a prompt. Get motion.', 0, size * 1.05 + (1 - ease.outCubic(tp)) * s * 0.025, {
      size: size * 0.28, weight: 400, color: '#d8ccff', alpha: ease.outCubic(tp), letterSpacing: size * 0.023,
    });
  });

  vignette(ctx, 0.55);
  grain(ctx, t, 0.05);
}
`,
  },
  {
    title: 'Dream Build Launch',
    description: 'Three words punch in on sliding color panels, then lock up together.',
    prompt: 'Kinetic typography "DREAM. BUILD. LAUNCH." on sliding color panels with a final lockup.',
    settings: { aspect: '16:9', duration: 6, fps: 60 },
    code: `const words = ['DREAM.', 'BUILD.', 'LAUNCH.'];
const colors = ['#ff5a5f', '#ffb400', '#00c2a8'];
const ink = '#111014';

function render(ctx, t) {
  const s = Math.min(W, H);
  const cx = W / 2, cy = H / 2;
  ctx.fillStyle = ink;
  ctx.fillRect(0, 0, W, H);

  const slot = (DURATION * 0.66) / words.length;
  const finale = slot * words.length;

  words.forEach((word, i) => {
    const start = i * slot, end = start + slot;
    if (t < start || t > end + 0.5) return;
    // Panel wipes in from the left, then out to the right
    const enter = ease.inOutExpo(progress(t, start, start + 0.45));
    const exit = ease.inOutExpo(progress(t, end - 0.1, end + 0.4));
    const left = lerp(-W, 0, enter) + W * exit;
    ctx.fillStyle = colors[i];
    ctx.fillRect(left, 0, W, H);

    // Letters rise through a mask, slightly staggered
    const size = fitText(ctx, word, W * 0.84, { size: s * 0.3, font: 'Bebas Neue', weight: 400 });
    const font = { size, font: 'Bebas Neue', weight: 400, color: ink };
    const layout = layoutText(ctx, word, font);
    const zoom = lerp(1.08, 1, ease.outCubic(progress(t, start + 0.2, end)));
    ctx.save();
    ctx.beginPath();
    ctx.rect(left, cy - size * 0.55, W, size * 1.05);
    ctx.clip();
    withTransform(ctx, { x: cx, y: cy, scale: zoom }, () => {
      layout.chars.forEach((c, j) => {
        const p = stagger(t, j, start + 0.2, 0.035, 0.55);
        const y = (1 - ease.outExpo(p)) * size;
        text(ctx, c.ch, -layout.width / 2 + c.x, y, { ...font, align: 'left' });
      });
    });
    ctx.restore();
  });

  // Final lockup: all three words stack up in their colors
  if (t >= finale) {
    const size = s * 0.14;
    words.forEach((word, i) => {
      const p = stagger(t, i, finale + 0.15, 0.12, 0.8);
      const y = cy + (i - 1) * size * 0.92 + (1 - ease.outExpo(p)) * size * 0.5;
      withTransform(ctx, { x: cx, y, scale: lerp(0.8, 1, spring(p, 0.35)), alpha: ease.outCubic(p) }, () => {
        text(ctx, word, 0, 0, { size, font: 'Bebas Neue', weight: 400, color: colors[i], letterSpacing: size * 0.05 });
      });
    });
    const line = ease.inOutCubic(progress(t, finale + 0.7, finale + 1.3));
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, cx - s * 0.12 * line, cy + size * 1.55, s * 0.24 * line, s * 0.005, s * 0.0025);
    ctx.fill();
  }

  grain(ctx, t, 0.07);
}
`,
  },
  {
    title: 'Chasing Dots Loader',
    description: 'A seamless loop of dots that swell and shift color as a wave travels around the ring.',
    prompt: 'A seamless looping loader: twelve dots in a ring pulse in a traveling wave with shifting colors.',
    settings: { aspect: '1:1', duration: 4, fps: 60 },
    code: `const COUNT = 12;
const palette = { from: '#6d28d9', to: '#f472b6', text: '#3b0764' };

function render(ctx, t) {
  const s = Math.min(W, H);
  const cx = W / 2, cy = H * 0.46;
  ctx.fillStyle = radialGradient(ctx, W / 2, H / 2, Math.hypot(W, H) / 2, ['#ffffff', '#f5f3ff', '#e4dcff']);
  ctx.fillRect(0, 0, W, H);

  // Two wave cycles and one full turn per loop, so the last frame matches the first
  const phase = loop(t, DURATION / 2);
  const R = s * 0.2;
  withTransform(ctx, { x: cx, y: cy, rotate: TAU * loop(t, DURATION) }, () => {
    for (let i = 0; i < COUNT; i++) {
      const a = (i / COUNT) * TAU;
      const wave = ease.inOutSine(0.5 + 0.5 * Math.sin(TAU * (phase - i / COUNT)));
      const d = R * (0.86 + 0.14 * wave);
      const x = Math.cos(a) * d, y = Math.sin(a) * d;
      ctx.fillStyle = radialGradient(ctx, x, y, s * 0.07, [withAlpha(palette.to, 0.25 * wave), withAlpha(palette.to, 0)]);
      circle(ctx, x, y, s * 0.07);
      ctx.fill();
      ctx.fillStyle = mixColor(palette.from, palette.to, wave);
      circle(ctx, x, y, s * (0.014 + 0.024 * wave));
      ctx.fill();
    }
  });

  const dots = '.'.repeat(1 + Math.floor(loop(t, DURATION / 2) * 4) % 4);
  const label = 'Loading';
  const size = s * 0.055;
  const w = textWidth(ctx, label, { size, font: 'Poppins', weight: 600, letterSpacing: s * 0.004 });
  text(ctx, label, cx - w / 2, cy + R + s * 0.16, { size, font: 'Poppins', weight: 600, color: palette.text, align: 'left', letterSpacing: s * 0.004 });
  text(ctx, dots, cx + w / 2 + s * 0.005, cy + R + s * 0.16, { size, font: 'Poppins', weight: 600, color: palette.text, align: 'left' });
}
`,
  },
];
