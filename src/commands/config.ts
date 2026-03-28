import { Command } from 'commander';
import { loadConfig, setConfigValue, getConfigPath } from '../core/config';
import { log } from '../utils/log';

export function configCommand(): Command {
  const cmd = new Command('config');
  cmd.description('設定の管理');

  // config show
  cmd
    .command('show')
    .description('現在の設定を表示する')
    .action(() => {
      const config = loadConfig();
      const configPath = getConfigPath();

      log.plain(`\n設定ファイル: ${configPath}`);
      log.plain(`\n現在の設定:`);
      log.plain(`  themeDirectory : ${config.themeDirectory}`);
      log.plain(`  defaultTheme   : ${config.defaultTheme}`);
      log.plain('');
    });

  // config set
  cmd
    .command('set <key> <value>')
    .description('設定値を更新する (key: themeDirectory | defaultTheme)')
    .action((key: string, value: string) => {
      try {
        setConfigValue(key, value);
        log.success(`設定を更新しました: ${key} = ${value}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.error(msg);
        process.exit(1);
      }
    });

  return cmd;
}
