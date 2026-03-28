import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Config } from './types';
import { log } from '../utils/log';
import { resolveAbsolute } from '../utils/path';

const CONFIG_DIR = path.join(os.homedir(), '.config', 'storyboards-cli');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const DEFAULT_THEME_DIR = path.join(os.homedir(), '.config', 'storyboards-cli', 'themes');

let _config: Config | null = null;

export function getConfigPath(): string {
  return CONFIG_FILE;
}

export function getDefaultThemeDir(): string {
  return DEFAULT_THEME_DIR;
}

export function loadConfig(): Config {
  if (_config) return _config;

  if (!fs.existsSync(CONFIG_FILE)) {
    const defaults: Config = {
      themeDirectory: DEFAULT_THEME_DIR,
      defaultTheme: 'simple',
    };
    _config = defaults;
    return defaults;
  }

  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<Config>;
    // 必須フィールドの存在チェック
    if (typeof parsed.themeDirectory !== 'string' || typeof parsed.defaultTheme !== 'string') {
      throw new Error('必須フィールド (themeDirectory, defaultTheme) が不正です');
    }
    _config = parsed as Config;
    return _config;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`config.json の読み込みに失敗しました (${CONFIG_FILE}): ${reason}`);
  }
}

export function saveConfig(config: Config): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
  _config = config;
}

export async function initConfig(): Promise<void> {
  if (!fs.existsSync(CONFIG_FILE)) {
    log.info('設定ファイルが見つかりません。初期設定を作成します...');

    const config: Config = {
      themeDirectory: DEFAULT_THEME_DIR,
      defaultTheme: 'simple',
    };

    if (!fs.existsSync(config.themeDirectory)) {
      fs.mkdirSync(config.themeDirectory, { recursive: true });
    }

    saveConfig(config);
    log.info(`設定ファイルを作成しました: ${CONFIG_FILE}`);

    await installBuiltinThemes(config.themeDirectory);
  } else {
    const config = loadConfig();
    if (!fs.existsSync(config.themeDirectory)) {
      fs.mkdirSync(config.themeDirectory, { recursive: true });
    }
    await installBuiltinThemes(config.themeDirectory);
  }
}

async function installBuiltinThemes(themeDir: string): Promise<void> {
  const simpleThemeTarget = path.join(themeDir, 'simple');
  if (fs.existsSync(simpleThemeTarget)) return;

  const builtinSrc = path.join(__dirname, '..', 'builtin-themes', 'simple');
  if (!fs.existsSync(builtinSrc)) {
    // dist から参照できない場合は直接生成
    fs.mkdirSync(path.join(simpleThemeTarget, 'assets'), { recursive: true });
    const themeJson = getSimpleThemeJson();
    fs.writeFileSync(
      path.join(simpleThemeTarget, 'theme.json'),
      JSON.stringify(themeJson, null, 2),
      'utf-8'
    );
    log.info(`built-in テーマ "simple" を配置しました: ${simpleThemeTarget}`);
    return;
  }

  copyDirRecursive(builtinSrc, simpleThemeTarget);
  log.info(`built-in テーマ "simple" を配置しました: ${simpleThemeTarget}`);
}

function copyDirRecursive(src: string, dest: string): void {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

export function setConfigValue(key: string, value: string): void {
  const config = loadConfig();
  if (key === 'themeDirectory') {
    config.themeDirectory = resolveAbsolute(value);
  } else if (key === 'defaultTheme') {
    config.defaultTheme = value;
  } else {
    throw new Error(`未知の設定キーです: ${key}`);
  }
  saveConfig(config);
  // saveConfig が _config を更新するので追加リセットは不要
}

function getSimpleThemeJson() {
  return {
    schemaVersion: 1,
    name: 'simple',
    version: '0.1.0',
    kind: 'builtin-theme',
    source: {
      type: 'builtin',
      fidelity: 'high',
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
      borderRadius: 12,
    },
    layouts: {
      title: {
        background: null,
        slots: {
          title: { x: 10, y: 18, w: 80, h: 20 },
          subtitle: { x: 10, y: 42, w: 80, h: 14 },
        },
        fixedElements: [],
      },
      section: {
        background: null,
        slots: {
          title: { x: 8, y: 18, w: 84, h: 40 },
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
}
