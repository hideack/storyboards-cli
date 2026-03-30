import * as fs from 'fs';
import * as path from 'path';
import { Command } from 'commander';
import { runBuild } from '../core/build';
import { BuildOptions } from '../core/types';
import { log } from '../utils/log';

export function buildCommand(): Command {
  const cmd = new Command('build');

  cmd
    .description('Markdown ファイルから HTML プレゼンテーションを生成します')
    .argument('<file>', '入力 Markdown ファイル')
    .option('-t, --theme <name>', '使用するテーマ名')
    .option('-o, --out <dir>', '出力ディレクトリ', 'storyboards-dist')
    .option('--open', 'ビルド後にブラウザで開く', false)
    .option('--strict', 'warning を error 扱いにする', false)
    .option('--ai <mode>', 'AI 補助モード (例: visual)')
    .option('--ai-timeout <seconds>', 'AI visual タイムアウト秒数 (0 = 無制限、デフォルト: 300)')
    .option('--watch', 'ファイルを監視して変更時に自動リビルドする', false)
    .action(async (file: string, opts: {
      theme?: string;
      out: string;
      open: boolean;
      strict: boolean;
      ai?: string;
      aiTimeout?: string;
      watch: boolean;
    }) => {
      const aiTimeout = opts.aiTimeout !== undefined ? parseInt(opts.aiTimeout, 10) : undefined;
      if (opts.watch) {
        await runWatch(file, { ...opts, aiTimeout });
      } else {
        const buildOptions: BuildOptions = {
          theme: opts.theme,
          out: opts.out,
          open: opts.open,
          strict: opts.strict,
          ai: opts.ai,
          aiTimeout,
        };

        const result = await runBuild(file, buildOptions);

        for (const w of result.warnings) log.warn(w);
        for (const e of result.errors) log.error(e);

        if (!result.success) process.exit(1);
      }
    });

  return cmd;
}

async function runWatch(
  file: string,
  opts: { theme?: string; out: string; open: boolean; strict: boolean; ai?: string; aiTimeout?: number }
): Promise<void> {
  const absFile = path.resolve(file);

  const buildOptions: BuildOptions = {
    theme: opts.theme,
    out: opts.out,
    open: opts.open,   // 初回のみ open
    strict: false,     // watch 中は strict 無効
    ai: opts.ai,       // 初回はオプション通り
    aiTimeout: opts.aiTimeout,
    liveReload: true,
  };

  log.info(`watch モードで起動しました: ${absFile}`);

  // 初回ビルド
  await execBuild(file, buildOptions);

  // 2回目以降は open/AI なし
  const watchOptions: BuildOptions = {
    ...buildOptions,
    open: false,
    ai: undefined,
  };

  const watchDir = path.dirname(absFile);
  const watchFile = path.basename(absFile);
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  fs.watch(watchDir, (_, filename) => {
    if (filename !== watchFile) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      log.info(`変更を検知しました: ${absFile}`);
      await execBuild(file, watchOptions);
    }, 200);
  });

  log.info('Ctrl+C で終了します');

  // プロセスを終了させずに待機
  await new Promise<void>(() => {});
}

async function execBuild(file: string, options: BuildOptions): Promise<void> {
  const result = await runBuild(file, options);
  for (const w of result.warnings) log.warn(w);
  for (const e of result.errors) log.error(e);
  if (!result.success) {
    log.warn('ビルドに失敗しました (watch は継続します)');
  }
}
