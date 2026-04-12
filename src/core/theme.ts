import * as fs from 'fs';
import * as path from 'path';
import { Resvg } from '@resvg/resvg-js';
import { Theme, ThemeInfo, SVGImportOptions, PDFImportOptions } from './types';
import { loadConfig } from './config';
import { log } from '../utils/log';

export function listThemes(): ThemeInfo[] {
  const config = loadConfig();
  const themeDir = config.themeDirectory;

  if (!fs.existsSync(themeDir)) {
    return [];
  }

  const entries = fs.readdirSync(themeDir, { withFileTypes: true });
  const themes: ThemeInfo[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const themePath = path.join(themeDir, entry.name);
    const themeJsonPath = path.join(themePath, 'theme.json');
    if (!fs.existsSync(themeJsonPath)) continue;

    try {
      const raw = fs.readFileSync(themeJsonPath, 'utf-8');
      const theme = JSON.parse(raw) as Theme;
      themes.push({ name: entry.name, theme, directory: themePath });
    } catch {
      log.warn(`テーマの読み込みに失敗しました: ${themeJsonPath}`);
    }
  }

  return themes;
}

export function loadTheme(name: string): ThemeInfo {
  const config = loadConfig();
  const themeDir = config.themeDirectory;
  const themePath = path.join(themeDir, name);
  const themeJsonPath = path.join(themePath, 'theme.json');

  if (!fs.existsSync(themeJsonPath)) {
    throw new Error(`テーマが見つかりません: ${name} (${themeJsonPath})`);
  }

  try {
    const raw = fs.readFileSync(themeJsonPath, 'utf-8');
    const theme = JSON.parse(raw) as Theme;
    return { name, theme, directory: themePath };
  } catch (err) {
    throw new Error(`theme.json の読み込みに失敗しました: ${themeJsonPath}`);
  }
}

export function validateTheme(themeInfo: ThemeInfo): string[] {
  const errors: string[] = [];
  const t = themeInfo.theme;

  if (!t.schemaVersion) errors.push('schemaVersion が未定義です');
  if (!t.name) errors.push('name が未定義です');
  if (!t.version) errors.push('version が未定義です');
  if (!t.kind) errors.push('kind が未定義です');
  if (!t.page) errors.push('page が未定義です');
  if (!t.tokens) errors.push('tokens が未定義です');
  if (!t.layouts) errors.push('layouts が未定義です');
  if (t.layouts) {
    if (!t.layouts.title) errors.push('layouts.title が未定義です');
    if (!t.layouts.section) errors.push('layouts.section が未定義です');
    if (!t.layouts.content) errors.push('layouts.content が未定義です');
  }

  return errors;
}

export async function importSVGTheme(options: SVGImportOptions): Promise<void> {
  const config = loadConfig();
  const themeDir = path.join(config.themeDirectory, options.name);

  if (fs.existsSync(themeDir)) {
    throw new Error(`テーマ "${options.name}" は既に存在します: ${themeDir}`);
  }

  fs.mkdirSync(path.join(themeDir, 'assets'), { recursive: true });
  fs.mkdirSync(path.join(themeDir, 'source'), { recursive: true });

  // SVGファイルをコピー
  const titleSvgDest = path.join(themeDir, 'source', 'title.svg');
  const sectionSvgDest = path.join(themeDir, 'source', 'section.svg');
  const contentSvgDest = path.join(themeDir, 'source', 'content.svg');

  fs.copyFileSync(options.titleSvg, titleSvgDest);
  fs.copyFileSync(options.sectionSvg, sectionSvgDest);
  fs.copyFileSync(options.contentSvg, contentSvgDest);

  log.info('SVG ファイルをコピーしました');

  // SVG全体をPNGにレンダリングして背景画像として保存
  log.info('SVG からバックグラウンド画像を生成しています...');
  const titleBgPng = renderSvgToPng(options.titleSvg);
  const sectionBgPng = renderSvgToPng(options.sectionSvg);
  const contentBgPng = renderSvgToPng(options.contentSvg);

  if (titleBgPng) {
    fs.writeFileSync(path.join(themeDir, 'assets', 'title_bg.png'), titleBgPng);
  }
  if (sectionBgPng) {
    fs.writeFileSync(path.join(themeDir, 'assets', 'section_bg.png'), sectionBgPng);
  }
  if (contentBgPng) {
    fs.writeFileSync(path.join(themeDir, 'assets', 'content_bg.png'), contentBgPng);
  }

  // SVGからテキスト領域座標を推定
  log.info('レイアウトを推定しています...');
  const titleLayout = extractLayoutFromSVG(options.titleSvg, 'title');
  const sectionLayout = extractLayoutFromSVG(options.sectionSvg, 'section');
  const contentLayout = extractLayoutFromSVG(options.contentSvg, 'content');

  const themeJson = {
    schemaVersion: 1,
    name: options.name,
    version: '0.1.0',
    kind: 'imported-svg-theme',
    source: {
      type: 'svg',
      fidelity: 'medium',
    },
    page: {
      width: 1600,
      height: 900,
      aspectRatio: '16:9',
    },
    tokens: {
      fontFamily: "Arial, 'Hiragino Sans', 'Yu Gothic', sans-serif",
      textColor: '#111111',
      mutedColor: '#666666',
      accentColor: '#2255aa',
      backgroundColor: '#ffffff',
      borderRadius: 0,
    },
    layouts: {
      title: {
        background: titleBgPng ? 'assets/title_bg.png' : null,
        slots: titleLayout.slots,
        fixedElements: [],
      },
      section: {
        background: sectionBgPng ? 'assets/section_bg.png' : null,
        slots: sectionLayout.slots,
        fixedElements: [],
      },
      content: {
        background: contentBgPng ? 'assets/content_bg.png' : null,
        slots: contentLayout.slots,
        visualRegion: contentLayout.visualRegion,
        fixedElements: [],
      },
    },
  };

  fs.writeFileSync(
    path.join(themeDir, 'theme.json'),
    JSON.stringify(themeJson, null, 2),
    'utf-8'
  );

  log.success(`テーマ "${options.name}" をインポートしました: ${themeDir}`);
}

export async function importPDFTheme(options: PDFImportOptions): Promise<string[]> {
  const warnings: string[] = [];
  warnings.push('[experimental] PDF import は実験的機能です。精度が低い場合があります。');

  const config = loadConfig();
  const themeDir = path.join(config.themeDirectory, options.name);

  if (fs.existsSync(themeDir)) {
    throw new Error(`テーマ "${options.name}" は既に存在します: ${themeDir}`);
  }

  fs.mkdirSync(path.join(themeDir, 'assets'), { recursive: true });
  fs.mkdirSync(path.join(themeDir, 'source'), { recursive: true });

  const pdfDest = path.join(themeDir, 'source', 'template.pdf');
  fs.copyFileSync(options.pdf, pdfDest);

  warnings.push('PDF から正確なレイアウト情報を抽出できませんでした。デフォルトのレイアウトを使用します。');

  const themeJson = {
    schemaVersion: 1,
    name: options.name,
    version: '0.1.0',
    kind: 'imported-pdf-theme',
    source: {
      type: 'pdf',
      fidelity: 'low',
    },
    page: {
      width: 1600,
      height: 900,
      aspectRatio: '16:9',
    },
    tokens: {
      fontFamily: "Arial, 'Hiragino Sans', 'Yu Gothic', sans-serif",
      textColor: '#111111',
      mutedColor: '#666666',
      accentColor: '#2255aa',
      backgroundColor: '#f8f8f8',
      borderRadius: 0,
    },
    layouts: {
      title: {
        background: null,
        slots: {
          title: { x: 10, y: 20, w: 80, h: 20 },
          subtitle: { x: 10, y: 44, w: 80, h: 14 },
        },
        fixedElements: [],
      },
      section: {
        background: null,
        slots: {
          title: { x: 8, y: 20, w: 84, h: 40 },
          pageNumber: { x: 4, y: 90, w: 8, h: 6 },
        },
        fixedElements: [],
      },
      content: {
        background: null,
        slots: {
          eyebrow: { x: 8, y: 6, w: 70, h: 6 },
          title: { x: 8, y: 14, w: 84, h: 10 },
          body: { x: 8, y: 28, w: 84, h: 42 },
          pageNumber: { x: 4, y: 90, w: 8, h: 6 },
        },
        visualRegion: {
          x: 8,
          y: 58,
          w: 84,
          h: 24,
        },
        fixedElements: [],
      },
    },
  };

  fs.writeFileSync(
    path.join(themeDir, 'theme.json'),
    JSON.stringify(themeJson, null, 2),
    'utf-8'
  );

  log.success(`テーマ "${options.name}" を PDF から生成しました (experimental): ${themeDir}`);
  return warnings;
}

// SVG全体をPNGにレンダリングして返す（テキスト要素は除去して背景デザインのみ）
function renderSvgToPng(svgPath: string): Buffer | null {
  try {
    const svgContent = stripContentFromSvg(fs.readFileSync(svgPath, 'utf-8'));
    const resvg = new Resvg(Buffer.from(svgContent), {
      fitTo: { mode: 'width', value: 1600 },
    });
    const pngData = resvg.render();
    return Buffer.from(pngData.asPng());
  } catch {
    return null;
  }
}

// SVGからテンプレートのプレースホルダー文字を除去する（背景デザインのみ残す）
//
// Google スライド等のSVGには以下のコンテンツ要素が混在する:
//   - <text>要素: SVGテキスト
//   - <path>要素(clipPath外): vectorize されたテキスト or 背景の白ボックス
//   - <image>要素: 背景PNG / ロゴ / コンテンツPNG
//
// 保持するもの:
//   - <clipPath> 内の <path>（構造的・クリッピング用）
//   - fill="#ffffff" の <path>（白背景・白ボックス）
//   - fill-opacity="0.0" の <path>（不可視のレイアウトマーカー）
//   - ty ≈ 0 の <image>（全画面背景PNG）
//   - 0 < ty < svgH の <image>（viewBox内に配置されたロゴ等）
//
// 除去するもの:
//   - <text>要素
//   - fill が白・透明以外の <path>（vectorize されたテキスト）
//   - ty ≥ svgH の <image> を含む <g>（viewBox外に配置されたバリアント画像等）
function stripContentFromSvg(svgContent: string): string {
  // viewBox高を取得
  const viewBoxMatch = svgContent.match(/viewBox="[^"]*?\s+([\d.]+)\s+([\d.]+)"/);
  const svgH = viewBoxMatch ? parseFloat(viewBoxMatch[2]) : 540;

  // <text>要素を除去
  let result = svgContent.replace(/<text\b[^>]*>[\s\S]*?<\/text>/g, '');

  // <clipPath> ブロックを一時退避して path の処理対象から外す
  const clipPathBlocks: string[] = [];
  result = result.replace(/<clipPath\b[\s\S]*?<\/clipPath>/g, (m) => {
    clipPathBlocks.push(m);
    return `__CLIPPATH_${clipPathBlocks.length - 1}__`;
  });

  // clipPath外の <path> で白・透明以外のfillを持つものを除去
  result = result.replace(/<path\b[^>]*\/>/g, (match) => {
    const fillMatch = match.match(/\bfill\s*=\s*"([^"]*)"/);
    const fill = fillMatch ? fillMatch[1].toLowerCase() : '';
    const isWhite = fill === '#ffffff' || fill === 'white';
    const isTransparent = match.includes('fill-opacity="0.0"') || fill === 'none' || fill === 'transparent';
    if (isWhite || isTransparent) return match;
    return '';
  });

  // <clipPath> を復元
  result = result.replace(/__CLIPPATH_(\d+)__/g, (_, i) => clipPathBlocks[parseInt(i)]);

  // viewBox外（ty ≥ svgH）に配置された <image> を含む <g> ブロックを除去
  result = result.replace(
    /<g\s[^>]*transform\s*=\s*"matrix\(([^)]+)\)"[^>]*>([\s\S]*?)<\/g>/g,
    (match, matrixArgs, content) => {
      if (!content.includes('<image')) return match;
      const parts = matrixArgs.trim().split(/[\s,]+/);
      if (parts.length < 6) return match;
      const ty = parseFloat(parts[5]);
      // viewBox外（ty ≥ svgH）は除去
      if (ty >= svgH) return '';
      return match;
    }
  );

  return result;
}

interface ExtractedLayout {
  slots: Record<string, { x: number; y: number; w: number; h: number }>;
  visualRegion?: { x: number; y: number; w: number; h: number };
}

// SVG からテキスト領域を推定する（透明パス → テキスト要素 → デフォルトのフォールバックチェーン）
function extractLayoutFromSVG(svgPath: string, layoutType: 'title' | 'section' | 'content'): ExtractedLayout {
  try {
    const content = fs.readFileSync(svgPath, 'utf-8');

    // まず透明パス方式を試みる（手動作成SVG向け）
    let regions = extractTransparentRegions(content);

    // 透明パスが見つからない場合はテキスト要素解析にフォールバック（Google スライド等向け）
    if (regions.length === 0) {
      regions = extractTextBasedRegions(content);
    }

    if (layoutType === 'title') {
      return buildTitleLayout(regions);
    } else if (layoutType === 'section') {
      return buildSectionLayout(regions);
    } else {
      return buildContentLayout(regions);
    }
  } catch {
    return getDefaultLayout(layoutType);
  }
}

interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
  fontSize?: number;
}

// fill-opacity="0.0" の path 要素から領域を抽出
function extractTransparentRegions(svgContent: string): Region[] {
  const regions: Region[] = [];

  // SVGのviewBox を取得 (デフォルトは960×540)
  const viewBoxMatch = svgContent.match(/viewBox="([^"]+)"/);
  let svgW = 960;
  let svgH = 540;

  if (viewBoxMatch) {
    const parts = viewBoxMatch[1].split(/\s+/);
    if (parts.length >= 4) {
      svgW = parseFloat(parts[2]) || 960;
      svgH = parseFloat(parts[3]) || 540;
    }
  }

  // <path fill="#000000" fill-opacity="0.0" d="m x yl w 0l0 h のパターンを探す
  const pathPattern = /<path fill="#000000" fill-opacity="0\.0" d="m([\d.]+) ([\d.]+)l([\d.]+) 0l0 ([\d.]+)/g;
  let match: RegExpExecArray | null;

  while ((match = pathPattern.exec(svgContent)) !== null) {
    const rx = parseFloat(match[1]);
    const ry = parseFloat(match[2]);
    const rw = parseFloat(match[3]);
    const rh = parseFloat(match[4]);

    if (isNaN(rx) || isNaN(ry) || isNaN(rw) || isNaN(rh)) continue;
    if (rw < 1 || rh < 1) continue;
    // 全画面サイズ(viewBox全体)に相当するものは除外
    if (rw >= svgW * 0.95 && rh >= svgH * 0.95) continue;

    regions.push({
      x: parseFloat(((rx / svgW) * 100).toFixed(1)),
      y: parseFloat(((ry / svgH) * 100).toFixed(1)),
      w: parseFloat(((rw / svgW) * 100).toFixed(1)),
      h: parseFloat(((rh / svgH) * 100).toFixed(1)),
    });
  }

  // 上から下にソート
  regions.sort((a, b) => a.y - b.y);
  return regions;
}

// ---------- テキスト要素ベースの領域抽出（Google スライド等向け） ----------

interface RawTextElement {
  x: number;   // SVG座標系での絶対X
  y: number;   // SVG座標系での絶対Y
  fontSize: number;  // px換算
  lineCount: number;
}

function parseFontSizeFromAttrs(styleAttr: string, fontSizeAttr: string): number {
  // style="...font-size: Xpt/px..." を優先
  if (styleAttr) {
    const m = styleAttr.match(/font-size\s*:\s*([\d.]+)(pt|px)?/i);
    if (m) {
      const v = parseFloat(m[1]);
      const unit = (m[2] || 'px').toLowerCase();
      return unit === 'pt' ? Math.round(v * 1.333) : v;
    }
  }
  // font-size="X" 属性
  if (fontSizeAttr) {
    const v = parseFloat(fontSizeAttr);
    if (!isNaN(v) && v > 0) return v;
  }
  return 0;
}

function parseTranslateFromTransform(transform: string): [number, number] {
  const m = transform.match(/translate\(\s*([\d.\-]+)[\s,]+([\d.\-]+)\s*\)/);
  return m ? [parseFloat(m[1]), parseFloat(m[2])] : [0, 0];
}

// SVG を文字スキャンして <text> 要素の絶対座標とフォントサイズを収集する
function collectTextElements(svgContent: string): RawTextElement[] {
  const results: RawTextElement[] = [];
  // translate の累積スタック [tx, ty]
  const stack: Array<[number, number]> = [[0, 0]];

  let i = 0;
  const len = svgContent.length;

  while (i < len) {
    // '<' を探す
    if (svgContent[i] !== '<') { i++; continue; }

    // タグ終端を探す（引用符内の '>' は無視）
    let j = i + 1;
    let inQuote = false;
    let quoteChar = '';
    while (j < len) {
      const c = svgContent[j];
      if (inQuote) {
        if (c === quoteChar) inQuote = false;
      } else {
        if (c === '"' || c === "'") { inQuote = true; quoteChar = c; }
        else if (c === '>') break;
      }
      j++;
    }
    if (j >= len) break;

    const tagStr = svgContent.slice(i, j + 1);
    i = j + 1;

    const isClosing = tagStr[1] === '/';
    const isSelfClosing = tagStr[tagStr.length - 2] === '/';
    const nameMatch = tagStr.match(/^<\/?([A-Za-z][A-Za-z0-9:]*)/);
    if (!nameMatch) continue;

    const tagName = nameMatch[1].toLowerCase();

    if (tagName === 'g' && !isSelfClosing) {
      if (isClosing) {
        if (stack.length > 1) stack.pop();
      } else {
        const tAttr = tagStr.match(/transform\s*=\s*"([^"]*)"/);
        const parent = stack[stack.length - 1];
        if (tAttr) {
          const [tx, ty] = parseTranslateFromTransform(tAttr[1]);
          stack.push([parent[0] + tx, parent[1] + ty]);
        } else {
          stack.push([parent[0], parent[1]]);
        }
      }
    } else if (tagName === 'text' && !isClosing && !isSelfClosing) {
      // </text> までの内容を取得
      const closeIdx = svgContent.indexOf('</text>', i);
      const inner = closeIdx > i ? svgContent.slice(i, closeIdx) : '';
      if (closeIdx > i) i = closeIdx + 7;

      // テキスト内容が空なら無視
      const textContent = inner.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      if (!textContent) continue;

      // フォントサイズ取得
      const styleAttr = (tagStr.match(/style\s*=\s*"([^"]*)"/) || [])[1] || '';
      const fontSizeAttr = (tagStr.match(/font-size\s*=\s*"([^"]*)"/) || [])[1] || '';
      const fontSize = parseFontSizeFromAttrs(styleAttr, fontSizeAttr) || 16;

      // 行数（tspan の数）
      const tspanCount = (inner.match(/<tspan/g) || []).length;
      const lineCount = Math.max(1, tspanCount);

      // 絶対座標
      const current = stack[stack.length - 1];
      const xAttr = (tagStr.match(/\bx\s*=\s*"([\d.\-]+)"/) || [])[1];
      const yAttr = (tagStr.match(/\by\s*=\s*"([\d.\-]+)"/) || [])[1];
      const elemX = current[0] + (xAttr ? parseFloat(xAttr) : 0);
      const elemY = current[1] + (yAttr ? parseFloat(yAttr) : 0);

      // y座標が不明（0かつtransformもゼロ）なものは除外
      if (elemY === 0 && current[1] === 0) continue;

      results.push({ x: elemX, y: elemY, fontSize, lineCount });
    }
  }

  return results;
}

// 近接するテキスト要素をクラスタリングして Region[] に変換
function clusterTextElements(elements: RawTextElement[], svgW: number, svgH: number): Region[] {
  if (elements.length === 0) return [];

  // y昇順にソート
  const sorted = [...elements].sort((a, b) => a.y - b.y);
  const clusters: RawTextElement[][] = [];
  let current: RawTextElement[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prev = current[current.length - 1];
    const gap = sorted[i].y - (prev.y + prev.fontSize * prev.lineCount * 1.4);
    // 前クラスタの末尾との縦ギャップが fontSize の1.5倍以内なら同一クラスタ
    if (gap <= prev.fontSize * 1.5) {
      current.push(sorted[i]);
    } else {
      clusters.push(current);
      current = [sorted[i]];
    }
  }
  clusters.push(current);

  return clusters.map(cluster => {
    const minX = Math.min(...cluster.map(e => e.x));
    const minY = Math.min(...cluster.map(e => e.y));
    const maxX = Math.max(...cluster.map(e => e.x + svgW * 0.85 - e.x)); // 右端を推定
    const totalH = cluster.reduce((sum, e) => sum + e.fontSize * e.lineCount * 1.4, 0);
    const dominantFontSize = Math.max(...cluster.map(e => e.fontSize));

    // 幅は minX から 85% 地点まで（テキストボックスの典型的な幅）
    const estimatedW = Math.min(svgW * 0.85, svgW - minX - svgW * 0.05);

    return {
      x: parseFloat(((minX / svgW) * 100).toFixed(1)),
      y: parseFloat(((minY / svgH) * 100).toFixed(1)),
      w: parseFloat(((estimatedW / svgW) * 100).toFixed(1)),
      h: parseFloat(((totalH / svgH) * 100).toFixed(1)),
      fontSize: dominantFontSize,
    };
  }).filter(r => r.w > 5 && r.h > 1);
}

// テキスト要素ベースの領域抽出エントリポイント
function extractTextBasedRegions(svgContent: string): Region[] {
  const viewBoxMatch = svgContent.match(/viewBox="([^"]+)"/);
  let svgW = 960;
  let svgH = 540;
  if (viewBoxMatch) {
    const parts = viewBoxMatch[1].split(/\s+/);
    if (parts.length >= 4) {
      svgW = parseFloat(parts[2]) || 960;
      svgH = parseFloat(parts[3]) || 540;
    }
  }

  const elements = collectTextElements(svgContent);
  // フォントサイズが極端に小さいもの（装飾的テキスト）を除外
  const meaningful = elements.filter(e => e.fontSize >= 8);
  return clusterTextElements(meaningful, svgW, svgH);
}

// ---------- ここまでテキスト要素ベース ----------

function buildTitleLayout(regions: Region[]): ExtractedLayout {
  // 小さい幅のリージョン (バッジ等) を除外して大きいテキスト領域だけを対象にする
  const textRegions = regions.filter(r => r.w > 30 && r.h > 5);

  // fontSize 情報があれば大きい順（title → subtitle）、なければ y 昇順
  const hasFontSize = textRegions.some(r => r.fontSize !== undefined);
  if (hasFontSize) {
    textRegions.sort((a, b) => (b.fontSize ?? 0) - (a.fontSize ?? 0));
  } else {
    textRegions.sort((a, b) => a.y - b.y);
  }

  if (textRegions.length >= 2) {
    return {
      slots: {
        title: textRegions[0],
        subtitle: textRegions[1],
      },
    };
  } else if (textRegions.length === 1) {
    return {
      slots: {
        title: textRegions[0],
        subtitle: { x: textRegions[0].x, y: textRegions[0].y + textRegions[0].h + 4, w: textRegions[0].w, h: 12 },
      },
    };
  }
  return getDefaultLayout('title');
}

function buildSectionLayout(regions: Region[]): ExtractedLayout {
  const pageNumberRegion = regions.find(r => r.w < 15 && r.h < 15 && r.y > 80);
  const textRegions = regions.filter(r => !(r.w < 15 && r.h < 15 && r.y > 80));
  textRegions.sort((a, b) => a.y - b.y);

  const pageNumber = pageNumberRegion
    ? pageNumberRegion
    : { x: 2.4, y: 89.5, w: 6.0, h: 7.7 };

  if (textRegions.length >= 1) {
    return {
      slots: {
        title: textRegions[0],
        pageNumber,
      },
    };
  }
  return getDefaultLayout('section');
}

function buildContentLayout(regions: Region[]): ExtractedLayout {
  // pageNumber 候補 (小さい幅・高さ) とテキスト領域を分離
  const pageNumberRegion = regions.find(r => r.w < 15 && r.h < 15 && r.y > 80);
  const textRegions = regions.filter(r => !(r.w < 15 && r.h < 15 && r.y > 80));

  // fontSize 情報がある場合: title(最大) → eyebrow(2番目) → body(最小) で割り当て後、y昇順に並び替え
  // fontSize 情報がない場合: y 昇順のまま
  const hasFontSize = textRegions.some(r => r.fontSize !== undefined);
  if (hasFontSize && textRegions.length >= 3) {
    textRegions.sort((a, b) => (b.fontSize ?? 0) - (a.fontSize ?? 0));
    // title=最大, eyebrow=2番目, body=3番目 を確定してから y 昇順に並べ直す
    const [titleR, eyebrowR, bodyR] = textRegions;
    const ordered = [titleR, eyebrowR, bodyR].sort((a, b) => a.y - b.y);
    // 並び直した順で eyebrow/title/body を再マッピング
    textRegions.splice(0, textRegions.length, ...ordered);
  } else {
    textRegions.sort((a, b) => a.y - b.y);
  }

  const pageNumber = pageNumberRegion
    ? pageNumberRegion
    : { x: 2.4, y: 89.5, w: 6.0, h: 7.7 };

  if (textRegions.length >= 3) {
    return {
      slots: {
        eyebrow: textRegions[0],
        title: textRegions[1],
        body: textRegions[2],
        pageNumber,
      },
      visualRegion: {
        x: textRegions[2].x,
        y: textRegions[2].y + textRegions[2].h + 2,
        w: textRegions[2].w,
        h: 20,
      },
    };
  } else if (textRegions.length === 2) {
    return {
      slots: {
        title: textRegions[0],
        body: textRegions[1],
        pageNumber,
      },
      visualRegion: {
        x: textRegions[1].x,
        y: textRegions[1].y + textRegions[1].h + 2,
        w: textRegions[1].w,
        h: 20,
      },
    };
  }
  return getDefaultLayout('content');
}

function getDefaultLayout(type: 'title' | 'section' | 'content'): ExtractedLayout {
  if (type === 'title') {
    return {
      slots: {
        title: { x: 15.4, y: 11.7, w: 69.3, h: 39.9 },
        subtitle: { x: 15.4, y: 55.9, w: 69.3, h: 18.0 },
      },
    };
  } else if (type === 'section') {
    return {
      slots: {
        title: { x: 3.4, y: 8.8, w: 69.6, h: 79.5 },
        pageNumber: { x: 2.4, y: 89.5, w: 6.0, h: 7.7 },
      },
    };
  } else {
    return {
      slots: {
        eyebrow: { x: 3.4, y: 5.8, w: 80.5, h: 7.2 },
        title: { x: 3.4, y: 14.1, w: 90.2, h: 9.0 },
        body: { x: 3.4, y: 27.5, w: 91.1, h: 45.2 },
        pageNumber: { x: 2.4, y: 89.5, w: 6.0, h: 7.7 },
      },
      visualRegion: { x: 3.4, y: 27.5, w: 91.1, h: 45.2 },
    };
  }
}
