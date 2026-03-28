import { marked } from 'marked';
import { Slide, Theme, ThemeTokens } from './types';

export interface RenderedOutput {
  html: string;
  css: string;
  js: string;
}

export function renderPresentation(
  slides: Slide[],
  theme: Theme,
  themeDir: string,
  title: string,
  liveReload = false
): RenderedOutput {
  const css = buildCSS(theme.tokens);
  const js = buildJS();
  const slidesHtml = slides
    .map((slide, i) => renderSlide(slide, theme, themeDir, i))
    .join('\n');

  const html = buildHTML(title, slidesHtml, liveReload);

  return { html, css, js };
}

function buildHTML(title: string, slidesHtml: string, liveReload = false): string {
  const liveReloadScript = liveReload ? `
<script>
(function() {
  var last = null;
  setInterval(function() {
    fetch('reload.json?t=' + Date.now())
      .then(function(r) { return r.json(); })
      .then(function(d) {
        if (last === null) { last = d.t; return; }
        if (d.t !== last) { location.reload(); }
      })
      .catch(function() {});
  }, 1000);
})();
</script>` : '';

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
<div class="presentation">
  <div class="slide-container">
${slidesHtml}
  </div>
</div>
<div class="nav-hint">← → キーでスライドを操作</div>
<script src="app.js"></script>${liveReloadScript}
</body>
</html>`;
}

function renderSlide(slide: Slide, theme: Theme, themeDir: string, index: number): string {
  const layout = theme.layouts[slide.type];
  const slots = layout.slots;

  let content = renderBgImage(layout.background);

  if (slide.type === 'title') {
    const titleSlot = slots['title'];
    const subtitleSlot = slots['subtitle'];
    content += renderSlot(
      'slot-title',
      `<h1>${escapeHtml(slide.title)}</h1>`,
      titleSlot
    );
    if (slide.subtitle && subtitleSlot) {
      content += renderSlot(
        'slot-subtitle',
        `<p>${escapeHtml(slide.subtitle)}</p>`,
        subtitleSlot
      );
    }
  } else if (slide.type === 'section') {
    const titleSlot = slots['title'];
    const pageNumSlot = slots['pageNumber'];
    content += renderSlot(
      'slide-section-title',
      `<h2>${escapeHtml(slide.title)}</h2>`,
      titleSlot
    );
    if (slide.pageNumber !== undefined && pageNumSlot) {
      content += renderSlot(
        'slide-page-number',
        `<span>${slide.pageNumber}</span>`,
        pageNumSlot
      );
    }
  } else {
    // content
    const eyebrowSlot = slots['eyebrow'];
    const titleSlot = slots['title'];
    const bodySlot = slots['body'];
    const pageNumSlot = slots['pageNumber'];

    // visual があるときは body を縮小して visual 領域を直下から拡張する
    const hasVisual = !!(slide.visual && layout.visualRegion);
    const effectiveBodySlot = (hasVisual && bodySlot)
      ? { ...bodySlot, h: Math.min(bodySlot.h, 22) }
      : bodySlot;
    const effectiveVisualRegion = (hasVisual && bodySlot && layout.visualRegion)
      ? computeExpandedVisualRegion(effectiveBodySlot!, layout.visualRegion, pageNumSlot?.y)
      : layout.visualRegion;

    if (slide.eyebrow && eyebrowSlot) {
      content += renderSlot(
        'slide-eyebrow',
        `<span>${escapeHtml(slide.eyebrow)}</span>`,
        eyebrowSlot
      );
    }
    if (titleSlot) {
      content += renderSlot(
        'slide-content-title',
        `<h2>${escapeHtml(slide.title)}</h2>`,
        titleSlot
      );
    }
    if (slide.body && effectiveBodySlot) {
      const bodyHtml = marked.parse(slide.body) as string;
      const bodyExtra: Record<string, string> = {};
      if (slide.textAlign === 'center') bodyExtra['style'] = 'text-align:center;';
      if (slide.textFill) bodyExtra['data-fill'] = 'true';
      if (slide.fontScale !== undefined && slide.fontScale !== 1) bodyExtra['data-scale'] = String(slide.fontScale);
      content += renderSlot('slide-body', bodyHtml, effectiveBodySlot, bodyExtra);
    }
    if (slide.pageNumber !== undefined && pageNumSlot) {
      content += renderSlot(
        'slide-page-number',
        `<span>${slide.pageNumber}</span>`,
        pageNumSlot
      );
    }

    // visual
    if (slide.visual) {
      if (effectiveVisualRegion && slide.visual._renderedContent) {
        // SVG に width="100%" height="100%" を付与してコンテナいっぱいに表示する
        const visualHtml = fitSvgToContainer(slide.visual._renderedContent);
        content += renderSlot(
          'slide-visual',
          visualHtml,
          effectiveVisualRegion
        );
      } else if (effectiveVisualRegion && slide.visual._fallbackContent) {
        content += renderSlot(
          'slide-visual visual-fallback-wrapper',
          slide.visual._fallbackContent,
          effectiveVisualRegion
        );
      }
    }
  }

  // fixedElements
  for (const fe of layout.fixedElements) {
    if (fe.type === 'image' && fe.src) {
      content += `  <img class="fixed-element fixed-image" src="${fe.src}" alt="" style="position:absolute; left:${fe.x}%; top:${fe.y}%; width:${fe.w}%; height:${fe.h}%; z-index:20; object-fit:contain;">\n`;
    } else {
      content += `  <div class="fixed-element fixed-${fe.type}" style="position:absolute; left:${fe.x}%; top:${fe.y}%; width:${fe.w}%; height:${fe.h}%; z-index:10;">${fe.content ? escapeHtml(fe.content) : ''}</div>\n`;
    }
  }

  const dataAttrs = `data-slide-index="${index}" data-slide-type="${slide.type}"`;

  return `<section class="slide slide-${slide.type}" ${dataAttrs}>
${content}</section>`;
}

function renderBgImage(background: string | null): string {
  if (!background) return '';
  return `  <img class="slide-bg" src="${background}" alt="">\n`;
}

function renderSlot(
  className: string,
  innerHtml: string,
  slot: { x: number; y: number; w: number; h: number },
  extra: Record<string, string> = {}
): string {
  const baseStyle = `position:absolute; left:${slot.x}%; top:${slot.y}%; width:${slot.w}%; height:${slot.h}%; z-index:10; overflow:hidden;`;
  const style = extra['style'] ? `${baseStyle} ${extra['style']}` : baseStyle;
  const extraAttrs = Object.entries(extra)
    .filter(([k]) => k !== 'style')
    .map(([k, v]) => ` ${k}="${v}"`)
    .join('');
  return `  <div class="${className}" style="${style}"${extraAttrs}>
${innerHtml}
  </div>\n`;
}

function buildCSS(tokens: ThemeTokens): string {
  return `/* storyboards-cli generated styles */
:root {
  --font-family: ${tokens.fontFamily};
  --text-color: ${tokens.textColor};
  --muted-color: ${tokens.mutedColor};
  --accent-color: ${tokens.accentColor};
  --background-color: ${tokens.backgroundColor};
  --border-radius: ${tokens.borderRadius}px;
}

*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html, body {
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #1a1a1a;
  font-family: var(--font-family);
  color: var(--text-color);
}

/* 16:9 プレゼンテーションコンテナ */
.presentation {
  width: 100vw;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

/* 16:9 スライドコンテナ: アスペクト比 16:9 を維持しつつ画面に収める */
.slide-container {
  position: relative;
  width:  min(100vw, calc(100vh * 16 / 9));
  height: min(100vh, calc(100vw *  9 / 16));
}

.slide {
  position: absolute;
  inset: 0;
  background-color: var(--background-color);
  display: none;
  overflow: hidden;
}

.slide.active {
  display: block;
}

/* 背景画像 */
.slide-bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: fill;
  z-index: 0;
  pointer-events: none;
}

/* スロット共通: 座標は % でスライド全体に対して絶対配置 */
.slide > div {
  position: absolute;
  overflow: hidden;
  z-index: 10;
}

/* title スライド */
.slide-title .slot-title h1 {
  font-size: clamp(2rem, 5vw, 3.5rem);
  font-weight: 700;
  color: var(--text-color);
  line-height: 1.2;
}

.slide-title .slot-subtitle p {
  font-size: clamp(1.3rem, 3vw, 2.2rem);
  color: var(--muted-color);
  line-height: 1.4;
}

/* section スライド */
.slide-section {
  border-left: 6px solid var(--accent-color);
}

.slide-section .slide-section-title h2 {
  font-size: clamp(2rem, 4.5vw, 3rem);
  font-weight: 700;
  color: var(--text-color);
  line-height: 1.3;
}

/* content スライド */
.slide-content .slide-eyebrow span {
  font-size: clamp(0.8rem, 1.4vw, 1.1rem);
  color: var(--accent-color);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.slide-content .slide-content-title h2 {
  font-size: clamp(1.5rem, 3vw, 2.5rem);
  font-weight: 700;
  color: var(--text-color);
  line-height: 1.3;
  border-bottom: 2px solid var(--accent-color);
  padding-bottom: 0.3em;
}

.slide-body {
  font-size: clamp(1.1rem, 2vw, 1.8rem);
  line-height: 1.6;
  color: var(--text-color);
}

.slide-body ul,
.slide-body ol {
  padding-left: 1.5em;
}

.slide-body li {
  margin-bottom: 0.4em;
}

.slide-body p {
  margin-bottom: 0.8em;
}

.slide-body strong {
  color: var(--accent-color);
}

.slide-body table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 0.6em;
}

.slide-body th {
  background-color: var(--accent-color);
  color: #fff;
  font-weight: 600;
  text-align: left;
  padding: 0.3em 0.6em;
  border: 1px solid var(--accent-color);
}

.slide-body td {
  padding: 0.25em 0.6em;
  border: 1px solid #ddd;
  vertical-align: middle;
}

.slide-body tr:nth-child(even) td {
  background-color: rgba(0, 0, 0, 0.04);
}

/* page number */
.slide-page-number {
  font-size: clamp(0.6rem, 1vw, 0.9rem);
  color: var(--muted-color);
  display: flex;
  align-items: flex-end;
}

/* visual */
.slide-visual,
.visual-fallback-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
}

.slide-visual svg {
  display: block;
  width: 100%;
  height: 100%;
}

.visual-fallback {
  background: #f0f4ff;
  border: 2px dashed var(--accent-color);
  border-radius: var(--border-radius);
  padding: 1em;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5em;
  width: 100%;
  height: 100%;
}

.visual-fallback strong {
  color: var(--accent-color);
  font-size: clamp(0.7rem, 1.2vw, 1rem);
}

.visual-fallback p {
  color: var(--muted-color);
  font-size: clamp(0.6rem, 1vw, 0.9rem);
  text-align: center;
}

/* nav hint */
.nav-hint {
  position: fixed;
  bottom: 1rem;
  right: 1rem;
  font-size: 0.75rem;
  color: #888;
  font-family: sans-serif;
  pointer-events: none;
  opacity: 0.6;
}
`;
}

function buildJS(): string {
  return `// storyboards-cli generated app.js
(function() {
  'use strict';

  const slides = document.querySelectorAll('.slide');
  let current = 0;

  function getFontScale(el) {
    var s = parseFloat(el.dataset.scale);
    return isNaN(s) ? 1.0 : s;
  }

  // スライドボディのフォントサイズを文量に合わせて調整する
  function fitBodyText(slide) {
    var body = slide.querySelector('.slide-body');
    if (!body) return;
    body.style.fontSize = '';
    var cssBase = parseFloat(window.getComputedStyle(body).fontSize);
    var scale = getFontScale(body);
    var base = cssBase * scale;
    body.style.fontSize = base + 'px';
    if (body.dataset.fill === 'true') {
      // fill モード: できる限り大きく表示
      var size = cssBase * 2.5;
      body.style.fontSize = size + 'px';
      while (body.scrollHeight > body.clientHeight + 2 && size > base) {
        size -= 2;
        body.style.fontSize = size + 'px';
      }
    } else {
      // 通常モード: オーバーフロー時のみ縮小
      // scale>=1 のときは cssBase を下限にしてスケール効果を保つ
      var minSize = scale >= 1 ? cssBase : cssBase * scale * 0.6;
      while (body.scrollHeight > body.clientHeight + 2 && base > minSize) {
        base -= 1;
        body.style.fontSize = base + 'px';
      }
    }
  }

  // テーブルをスロットの残り高さいっぱいに拡張する
  function fitTable(slide) {
    var body = slide.querySelector('.slide-body');
    if (!body) return;
    var table = body.querySelector('table');
    if (!table) return;

    // 1. すべてリセット
    body.style.fontSize = '';
    table.style.fontSize = '';
    table.style.height = '';
    table.querySelectorAll('tr').forEach(function(tr) { tr.style.height = ''; });

    var cssBase = parseFloat(window.getComputedStyle(body).fontSize);
    var scale = getFontScale(body);

    // 2. body 本文にスケールを適用し、テーブルの実際の top 位置から availH を算出
    //    offsetHeight はマージンを含まないため getBoundingClientRect で計測する
    body.style.fontSize = (cssBase * scale) + 'px';
    var bodyH = body.clientHeight;
    var bodyRect = body.getBoundingClientRect();
    var tableRect = table.getBoundingClientRect();
    var tableTop = tableRect.top - bodyRect.top;
    var availH = bodyH - tableTop - 2;

    // 3. テーブルのフォントサイズを設定し、自然な高さが availH に収まるまで縮小
    //    <table>/<tr> の height は min-height 相当のため、先にフォントを確定する
    var thead = table.querySelector('thead');
    var fontSize = cssBase * scale;
    table.style.fontSize = fontSize + 'px';
    while (table.offsetHeight > availH && fontSize > 12) {
      fontSize -= 1;
      table.style.fontSize = fontSize + 'px';
    }

    // 4. 行を均等分配して availH いっぱいに拡張
    table.style.height = availH + 'px';
    var rows = table.querySelectorAll('tbody tr');
    if (rows.length === 0) return;
    var theadH = thead ? thead.offsetHeight : 0;
    var rowH = Math.floor((availH - theadH) / rows.length);
    rows.forEach(function(tr) { tr.style.height = rowH + 'px'; });

    // 丸め誤差・border によるオーバーフローを末尾行で補正
    var overflow = table.offsetHeight - availH;
    if (overflow > 0 && rows.length > 0) {
      var lastRow = rows[rows.length - 1];
      lastRow.style.height = Math.max(rowH - overflow, 16) + 'px';
    }
  }

  function showSlide(index) {
    slides.forEach(function(s) { s.classList.remove('active'); });
    if (slides[index]) {
      slides[index].classList.add('active');
      var hasTable = !!slides[index].querySelector('.slide-body table');
      if (hasTable) {
        fitTable(slides[index]);
      } else {
        fitBodyText(slides[index]);
      }
    }
  }

  function next() {
    if (current < slides.length - 1) {
      current++;
      showSlide(current);
    }
  }

  function prev() {
    if (current > 0) {
      current--;
      showSlide(current);
    }
  }

  document.addEventListener('keydown', function(e) {
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
      case ' ':
        e.preventDefault();
        next();
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault();
        prev();
        break;
      case 'Home':
        current = 0;
        showSlide(current);
        break;
      case 'End':
        current = slides.length - 1;
        showSlide(current);
        break;
    }
  });

  // タッチ操作
  var touchStartX = 0;
  document.addEventListener('touchstart', function(e) {
    touchStartX = e.touches[0].clientX;
  }, { passive: true });

  document.addEventListener('touchend', function(e) {
    var dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) > 50) {
      if (dx < 0) next();
      else prev();
    }
  }, { passive: true });

  showSlide(0);
})();
`;
}

// visual がある場合: body を縮小した直下から page number 手前まで visual 領域を拡張する
function computeExpandedVisualRegion(
  compactBody: { x: number; y: number; w: number; h: number },
  originalVisual: { x: number; y: number; w: number; h: number },
  pageNumY = 90
): { x: number; y: number; w: number; h: number } {
  const visualStartY = compactBody.y + compactBody.h + 2;
  const visualEndY = pageNumY - 2;
  return {
    x: originalVisual.x,
    y: visualStartY,
    w: originalVisual.w,
    h: Math.max(visualEndY - visualStartY, 20),
  };
}

// SVG をコンテナいっぱいに広げる: width/height を 100% に上書き
function fitSvgToContainer(svgContent: string): string {
  return svgContent.replace(
    /<svg([^>]*)>/,
    (_, attrs) => {
      // 既存の width/height 属性を除去して 100% に設定
      const cleaned = attrs
        .replace(/\s+width="[^"]*"/, '')
        .replace(/\s+height="[^"]*"/, '');
      return `<svg${cleaned} width="100%" height="100%" preserveAspectRatio="xMidYMid meet">`;
    }
  );
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

