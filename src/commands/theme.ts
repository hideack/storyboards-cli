import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { listThemes, loadTheme, validateTheme, importSVGTheme, importPDFTheme } from '../core/theme';
import { loadConfig, saveConfig } from '../core/config';
import { log } from '../utils/log';

export function themeCommand(): Command {
  const cmd = new Command('theme');
  cmd.description('テーマの管理');

  // theme list
  cmd
    .command('list')
    .description('利用可能なテーマ一覧を表示')
    .action(() => {
      const config = loadConfig();
      const themes = listThemes();

      if (themes.length === 0) {
        log.plain('テーマが見つかりません。');
        log.plain(`テーマディレクトリ: ${config.themeDirectory}`);
        return;
      }

      log.plain(`\n利用可能なテーマ (${themes.length} 件):`);
      log.plain(`テーマディレクトリ: ${config.themeDirectory}\n`);

      for (const t of themes) {
        const isDefault = t.name === config.defaultTheme;
        const marker = isDefault ? ' *' : '  ';
        log.plain(`${marker} ${t.name}  [${t.theme.kind}]  v${t.theme.version}`);
      }

      log.plain('\n* = デフォルトテーマ');
    });

  // theme use
  cmd
    .command('use <name>')
    .description('デフォルトテーマを変更する')
    .action((name: string) => {
      const themes = listThemes();
      const found = themes.find((t) => t.name === name);

      if (!found) {
        log.error(`テーマが見つかりません: ${name}`);
        log.plain('利用可能なテーマを確認するには: storyboards theme list');
        process.exit(1);
      }

      const config = loadConfig();
      config.defaultTheme = name;
      saveConfig(config);
      log.success(`デフォルトテーマを "${name}" に設定しました`);
    });

  // theme show
  cmd
    .command('show <name>')
    .description('テーマの詳細を表示する')
    .action((name: string) => {
      let themeInfo;
      try {
        themeInfo = loadTheme(name);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.error(msg);
        process.exit(1);
      }

      const t = themeInfo.theme;
      log.plain(`\nテーマ: ${t.name}`);
      log.plain(`  バージョン    : ${t.version}`);
      log.plain(`  種別          : ${t.kind}`);
      log.plain(`  ソース        : ${t.source.type} (fidelity: ${t.source.fidelity})`);
      log.plain(`  ページサイズ  : ${t.page.width}x${t.page.height} (${t.page.aspectRatio})`);
      log.plain(`  ディレクトリ  : ${themeInfo.directory}`);
      log.plain('\n  レイアウト:');
      for (const [layoutName, layout] of Object.entries(t.layouts)) {
        const slotNames = Object.keys(layout.slots).join(', ');
        log.plain(`    ${layoutName}: [${slotNames}]`);
      }
    });

  // theme validate
  cmd
    .command('validate <name>')
    .description('テーマの設定を検証する')
    .action((name: string) => {
      let themeInfo;
      try {
        themeInfo = loadTheme(name);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.error(msg);
        process.exit(1);
      }

      const errors = validateTheme(themeInfo);

      if (errors.length === 0) {
        log.success(`テーマ "${name}" の検証が完了しました。問題は見つかりませんでした。`);
      } else {
        log.error(`テーマ "${name}" の検証で ${errors.length} 件の問題が見つかりました:`);
        for (const e of errors) {
          log.plain(`  - ${e}`);
        }
        process.exit(1);
      }
    });

  // theme import
  const importCmd = cmd
    .command('import')
    .description('SVG または PDF からテーマをインポートする');

  importCmd
    .requiredOption('--name <name>', 'テーマ名')
    .option('--title <file>', 'タイトルスライド用 SVG ファイル')
    .option('--section <file>', 'セクションスライド用 SVG ファイル')
    .option('--content <file>', 'コンテンツスライド用 SVG ファイル')
    .option('--pdf <file>', 'PDF テンプレートファイル (experimental)')
    .action(async (opts: {
      name: string;
      title?: string;
      section?: string;
      content?: string;
      pdf?: string;
    }) => {
      if (opts.pdf) {
        // PDF import
        log.warn('PDF import は experimental 機能です。精度が低い場合があります。');

        if (!fs.existsSync(opts.pdf)) {
          log.error(`PDF ファイルが見つかりません: ${opts.pdf}`);
          process.exit(1);
        }

        try {
          const warnings = await importPDFTheme({
            name: opts.name,
            pdf: path.resolve(opts.pdf),
          });
          for (const w of warnings) {
            log.warn(w);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          log.error(msg);
          process.exit(1);
        }
      } else if (opts.title && opts.section && opts.content) {
        // SVG import
        for (const [label, file] of [['--title', opts.title], ['--section', opts.section], ['--content', opts.content]] as [string, string][]) {
          if (!fs.existsSync(file)) {
            log.error(`${label} で指定したファイルが見つかりません: ${file}`);
            process.exit(1);
          }
        }

        try {
          await importSVGTheme({
            name: opts.name,
            titleSvg: path.resolve(opts.title),
            sectionSvg: path.resolve(opts.section),
            contentSvg: path.resolve(opts.content),
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          log.error(msg);
          process.exit(1);
        }
      } else {
        log.error('SVG import には --title, --section, --content が必要です。');
        log.error('PDF import には --pdf が必要です。');
        importCmd.help();
        process.exit(1);
      }
    });

  return cmd;
}
