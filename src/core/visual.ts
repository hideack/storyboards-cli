import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as os from 'os';
import { spawn } from 'child_process';
import {
  VisualGenerationInput,
  VisualGenerationResult,
} from './types';
import { log } from '../utils/log';

const CACHE_DIR = path.join(os.homedir(), '.cache', 'storyboards-cli', 'visuals');
const AI_TIMEOUT_MS = 300000;

export async function generateVisual(
  input: VisualGenerationInput,
  useAI: boolean
): Promise<VisualGenerationResult> {
  if (!useAI) {
    return { success: false, error: 'AI モードが無効です' };
  }

  const cacheKey = buildCacheKey(input);
  const cached = readCache(cacheKey);
  if (cached) {
    log.info(`キャッシュから visual を読み込みました (${cacheKey.slice(0, 8)}...)`);
    return { success: true, content: cached.content, format: cached.format, cached: true };
  }

  const prompt = buildPrompt(input);

  try {
    const result = await callClaudeCode(prompt);

    if (!result.success || !result.content) {
      return { success: false, error: result.error };
    }

    const content = result.content.trim();
    const format: 'svg' | 'html' = content.startsWith('<svg') ? 'svg' : 'html';

    writeCache(cacheKey, { content, format });

    return { success: true, content, format };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

function buildCacheKey(input: VisualGenerationInput): string {
  const data = JSON.stringify({
    title: input.slideTitle,
    type: input.visualType,
    prompt: input.visualPrompt,
    tokens: input.themeTokens,
  });
  return crypto.createHash('sha256').update(data).digest('hex');
}

function buildPrompt(input: VisualGenerationInput): string {
  // コンテナのアスペクト比に合わせた viewBox を計算
  // visualRegion の w/h は % 単位で 16:9 スライド上の割合
  const containerRatio = (input.visualRegion.w * 16) / (input.visualRegion.h * 9);
  const svgW = 800;
  const svgH = Math.round(svgW / containerRatio);
  // フォントサイズはコンテナ高さに比例してスケール（800×210 基準の 11-13pt を換算）
  const fontMin = Math.max(9, Math.round(11 * svgH / 210));
  const fontMax = Math.max(11, Math.round(14 * svgH / 210));

  const t = input.themeTokens;

  return `プレゼンテーションスライド用の図解SVGを生成してください。

## 図解の指示
- タイプ: ${input.visualType}
- 内容: ${input.visualPrompt}
- スライドタイトル: ${input.slideTitle}

## 出力サイズ
viewBox="0 0 ${svgW} ${svgH}" で固定してください。
（コンテナのアスペクト比: 幅${svgW}px × 高さ${svgH}px）

## 色のガイドライン
基本カラーパレット（優先して使う）:
- テキスト・線: ${t.textColor}
- メインアクセント: ${t.accentColor}
- 背景: ${t.backgroundColor}
- 補助テキスト: ${t.mutedColor}
図解の内容が特定の色（青・緑・橙など）を要求する場合はそれに従ってよい。
ただし彩度を抑えた落ち着いたトーンにすること。

## フォント・テキスト
- font-family="${t.fontFamily}"
- font-size は ${fontMin}〜${fontMax} を基本とする（このコンテナのサイズ基準）

## シンプルさの原則
- SVG 要素数は 60 以内に抑える
- 複雑なループや曲線パスは避け、矩形・楕円・直線・折れ線矢印で表現する
- 円弧ループは楕円 + ラベルで代替可

## 出力ルール
- <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgW} ${svgH}"> で始める
- コードフェンス禁止
- 説明文禁止
- SVG のみ出力`;
}

async function callClaudeCode(prompt: string): Promise<{ success: boolean; content?: string; error?: string }> {
  return new Promise((resolve) => {
    const claudeArgs = ['--print', '--output-format', 'text'];

    const child = spawn('claude', claudeArgs, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // プロンプトを stdin 経由で渡す（CLI引数渡しだとハングする）
    child.stdin.write(prompt, 'utf-8');
    child.stdin.end();

    let stdout = '';
    let stderr = '';

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      resolve({ success: false, error: `タイムアウト (${AI_TIMEOUT_MS}ms)` });
    }, AI_TIMEOUT_MS);

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      const content = stdout.trim();

      if (code !== 0) {
        resolve({ success: false, error: `claude コマンドが失敗しました (code=${code}): ${stderr.slice(0, 200)}` });
        return;
      }

      if (!content) {
        resolve({ success: false, error: 'claude コマンドの出力が空でした' });
        return;
      }

      // SVG または HTML(<div, <figure 等) を有効な出力として受け付ける
      const isSvg = content.startsWith('<svg');
      const isHtml = content.startsWith('<') && !content.startsWith('<?xml');
      if (!isSvg && !isHtml) {
        resolve({ success: false, error: `有効な SVG/HTML が返されませんでした: ${content.slice(0, 100)}` });
        return;
      }

      resolve({ success: true, content });
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ success: false, error: `claude コマンドの起動に失敗しました: ${err.message}` });
    });
  });
}

interface CacheEntry {
  content: string;
  format: 'svg' | 'html';
}

function readCache(key: string): CacheEntry | null {
  const cachePath = path.join(CACHE_DIR, `${key}.json`);
  if (!fs.existsSync(cachePath)) return null;
  try {
    const raw = fs.readFileSync(cachePath, 'utf-8');
    return JSON.parse(raw) as CacheEntry;
  } catch {
    return null;
  }
}

function writeCache(key: string, entry: CacheEntry): void {
  try {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
    fs.writeFileSync(path.join(CACHE_DIR, `${key}.json`), JSON.stringify(entry), 'utf-8');
  } catch {
    // キャッシュ書き込み失敗は無視
  }
}

export function buildVisualFallback(prompt: string): string {
  return `<div class="visual-fallback">
  <strong>図解生成未完了</strong>
  <p>${escapeHtml(prompt)}</p>
</div>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
