import * as fs from 'fs';
import * as path from 'path';
import { parseMarkdown } from './markdown';
import { loadTheme } from './theme';
import { renderPresentation } from './renderer';
import { generateVisual, buildVisualFallback } from './visual';
import { loadConfig } from './config';
import { BuildOptions, BuildResult, Slide, ThemeInfo, VisualGenerationInput } from './types';
import { log } from '../utils/log';

export async function runBuild(inputFile: string, options: BuildOptions): Promise<BuildResult> {
  const warnings: string[] = [];
  const errors: string[] = [];

  // --- 入力ファイルの確認 ---
  if (!fs.existsSync(inputFile)) {
    return {
      success: false,
      warnings,
      errors: [`入力ファイルが見つかりません: ${inputFile}`],
      outputDir: options.out,
    };
  }

  // --- Markdown パース ---
  log.info(`Markdown を解析しています: ${inputFile}`);
  const content = fs.readFileSync(inputFile, 'utf-8');
  const doc = parseMarkdown(content);

  // --- テーマ解決 ---
  const config = loadConfig();
  const themeName =
    options.theme ||
    (doc.frontmatter['theme'] as string | undefined) ||
    config.defaultTheme;

  let themeInfo: ThemeInfo;
  try {
    themeInfo = loadTheme(themeName);
    log.info(`テーマを読み込みました: ${themeName}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, warnings, errors: [msg], outputDir: options.out };
  }

  // --- 出力ディレクトリ ---
  const outDir = path.resolve(options.out);
  try {
    fs.mkdirSync(path.join(outDir, 'assets'), { recursive: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, warnings, errors: [`出力ディレクトリの作成に失敗しました: ${msg}`], outputDir: outDir };
  }

  // --- Visual 生成 ---
  const useAI = options.ai === 'visual';
  if (useAI) {
    log.info('AI visual 生成モードを有効化しました');
  }

  // globalFontScale をスライド個別設定のないスライドに適用
  if (doc.globalFontScale !== undefined) {
    for (const slide of doc.slides) {
      if (slide.fontScale === undefined) {
        slide.fontScale = doc.globalFontScale;
      }
    }
  }

  const slides = doc.slides;
  let slideNum = 1;
  for (const slide of slides) {
    if (!slide.visual) {
      if (slide.type !== 'title') slideNum++;
      continue;
    }

    const layout = themeInfo.theme.layouts[slide.type];
    const rawVisualRegion = layout.visualRegion ?? { x: 8, y: 58, w: 84, h: 24 };

    // renderer と同じロジックで body 縮小後の visual 領域を計算する
    const bodySlot = layout.slots['body'];
    const pageNumY = layout.slots['pageNumber']?.y ?? 90;
    const visualRegion = bodySlot
      ? (() => {
          const compactBodyH = Math.min(bodySlot.h, 22);
          const visualStartY = bodySlot.y + compactBodyH + 2;
          const visualEndY = pageNumY - 2;
          return {
            x: rawVisualRegion.x,
            y: visualStartY,
            w: rawVisualRegion.w,
            h: Math.max(visualEndY - visualStartY, 20),
          };
        })()
      : rawVisualRegion;

    // mermaid タイプは AI 不要: コードを直接 _renderedContent に設定
    if (slide.visual.type === 'mermaid') {
      slide.visual._renderedContent = `<div class="mermaid">\n${slide.visual.prompt}\n</div>`;
      if (slide.type !== 'title') slideNum++;
      continue;
    }

    if (useAI) {
      log.info(`Visual 生成中: スライド "${slide.title}"`);

      const genInput: VisualGenerationInput = {
        slideTitle: slide.title,
        slideBody: slide.body,
        visualType: slide.visual.type,
        visualPrompt: slide.visual.prompt,
        themeTokens: themeInfo.theme.tokens,
        visualRegion,
        preferredFormat: 'svg',
      };

      const result = await generateVisual(genInput, true);

      if (result.success && result.content) {
        const assetName = `slide-${String(slideNum).padStart(2, '0')}-visual.${result.format ?? 'svg'}`;
        const assetPath = path.join(outDir, 'assets', assetName);
        fs.writeFileSync(assetPath, result.content, 'utf-8');
        slide.visual._renderedContent = result.format === 'svg'
          ? result.content
          : result.content;
        if (result.cached) {
          log.info(`  キャッシュを使用: ${assetName}`);
        } else {
          log.info(`  生成完了: ${assetName}`);
        }
      } else {
        const warn = `Visual 生成失敗 (スライド "${slide.title}"): ${result.error}`;
        warnings.push(warn);
        log.warn(warn);
        slide.visual._fallbackContent = buildVisualFallback(slide.visual.prompt);
      }
    } else {
      // AI なしの場合はフォールバック
      slide.visual._fallbackContent = buildVisualFallback(slide.visual.prompt);
    }

    if (slide.type !== 'title') slideNum++;
  }

  // --- レンダリング ---
  const docTitle =
    (doc.frontmatter['title'] as string | undefined) ||
    slides.find((s) => s.type === 'title')?.title ||
    'Presentation';

  const themeCssPath = path.join(themeInfo.directory, 'theme.css');
  const customCss = fs.existsSync(themeCssPath)
    ? fs.readFileSync(themeCssPath, 'utf-8')
    : '';

  log.info('HTML を生成しています...');
  const output = renderPresentation(slides, themeInfo.theme, themeInfo.directory, docTitle, options.liveReload, customCss);

  // --- ファイル書き出し ---
  fs.writeFileSync(path.join(outDir, 'index.html'), output.html, 'utf-8');
  fs.writeFileSync(path.join(outDir, 'styles.css'), output.css, 'utf-8');
  fs.writeFileSync(path.join(outDir, 'app.js'), output.js, 'utf-8');
  if (options.liveReload) {
    fs.writeFileSync(path.join(outDir, 'reload.json'), JSON.stringify({ t: Date.now() }), 'utf-8');
  }

  // テーマの assets をコピー (PNG, SVG, 全拡張子対応)
  const themeAssetsDir = path.join(themeInfo.directory, 'assets');
  if (fs.existsSync(themeAssetsDir)) {
    const assetEntries = fs.readdirSync(themeAssetsDir, { withFileTypes: true });
    for (const entry of assetEntries) {
      if (entry.isFile()) {
        fs.copyFileSync(
          path.join(themeAssetsDir, entry.name),
          path.join(outDir, 'assets', entry.name)
        );
      }
    }
  }

  log.success(`ビルド完了: ${outDir}/index.html`);
  log.info(`  スライド数: ${slides.length}`);

  if (warnings.length > 0) {
    log.warn(`  警告: ${warnings.length} 件`);
  }

  // --- strict モード ---
  if (options.strict && warnings.length > 0) {
    return {
      success: false,
      warnings,
      errors: [...errors, 'strict モード: warning があるためビルドを失敗扱いにしました'],
      outputDir: outDir,
    };
  }

  // --- open ---
  if (options.open) {
    const indexPath = path.join(outDir, 'index.html');
    openBrowser(indexPath);
  }

  return { success: true, warnings, errors, outputDir: outDir };
}

function openBrowser(filePath: string): void {
  const { spawn } = require('child_process');
  const platform = process.platform;
  const url = `file://${filePath}`;

  if (platform === 'darwin') {
    spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
  } else if (platform === 'win32') {
    spawn('cmd', ['/c', 'start', url], { detached: true, stdio: 'ignore' }).unref();
  } else {
    spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
  }
}
