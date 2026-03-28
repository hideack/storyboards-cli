import * as fs from 'fs';
import * as path from 'path';
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

  // SVGからbase64 PNGを抽出してPNGファイルとして保存
  log.info('SVG からバックグラウンド画像を生成しています...');
  const titleBgPng = extractPngFromSvg(options.titleSvg, 0);
  const titleLogoPng = extractPngFromSvg(options.titleSvg, 1);
  const sectionBgPng = extractPngFromSvg(options.sectionSvg, 0);
  const contentBgPng = extractPngFromSvg(options.contentSvg, 0);

  if (titleBgPng) {
    fs.writeFileSync(path.join(themeDir, 'assets', 'title_bg.png'), titleBgPng);
  }
  if (titleLogoPng) {
    fs.writeFileSync(path.join(themeDir, 'assets', 'logo.png'), titleLogoPng);
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

  // titleスライドのfixedElements (CONFIDENTIALバッジ)
  const titleFixedElements = titleLogoPng
    ? [{ type: 'image', src: 'assets/logo.png', x: 76.8, y: 2.7, w: 21.5, h: 6.8 }]
    : [];

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
        fixedElements: titleFixedElements,
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

// SVG内のbase64 PNGを抽出してPNGバイナリを返す
function extractPngFromSvg(svgPath: string, imageIndex = 0): Buffer | null {
  try {
    const content = fs.readFileSync(svgPath, 'utf-8');
    const pattern = /data:image\/png;base64,([A-Za-z0-9+/=]+)/g;
    const matches: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      matches.push(match[1]);
    }
    if (matches.length <= imageIndex) return null;
    return Buffer.from(matches[imageIndex], 'base64');
  } catch {
    return null;
  }
}

interface ExtractedLayout {
  slots: Record<string, { x: number; y: number; w: number; h: number }>;
  visualRegion?: { x: number; y: number; w: number; h: number };
}

// SVG からテキスト領域を推定する（fill-opacity="0.0" のパスから）
function extractLayoutFromSVG(svgPath: string, layoutType: 'title' | 'section' | 'content'): ExtractedLayout {
  try {
    const content = fs.readFileSync(svgPath, 'utf-8');
    const regions = extractTransparentRegions(content);

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

function buildTitleLayout(regions: Region[]): ExtractedLayout {
  // 小さい幅のリージョン (バッジ等) を除外して大きいテキスト領域だけを対象にする
  const textRegions = regions.filter(r => r.w > 30 && r.h > 5);
  // y 昇順にソート
  textRegions.sort((a, b) => a.y - b.y);

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
  // y 昇順にソート
  textRegions.sort((a, b) => a.y - b.y);

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
