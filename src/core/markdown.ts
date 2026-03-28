import matter from 'gray-matter';
import { ParsedDocument, Slide, SlideType, VisualNode, VisualType } from './types';

export function parseMarkdown(content: string): ParsedDocument {
  const { data: frontmatter, content: body } = matter(content);

  const slides = parseSlides(body);

  const globalFontScale = frontmatter['fontSize'] !== undefined
    ? parseFontScale(String(frontmatter['fontSize']))
    : undefined;

  return {
    frontmatter: frontmatter as Record<string, unknown>,
    slides,
    globalFontScale,
  };
}

function parseSlides(body: string): Slide[] {
  const lines = body.split('\n');
  const slides: Slide[] = [];
  let currentLines: string[] = [];
  let h1Count = 0;

  function flushSlide() {
    if (currentLines.length === 0) return;
    const text = currentLines.join('\n').trim();
    if (!text) return;
    const slide = parseSlideBlock(text, h1Count);
    if (slide) slides.push(slide);
    currentLines = [];
  }

  for (const line of lines) {
    if (line.startsWith('# ')) {
      flushSlide();
      h1Count++;
      currentLines = [line];
    } else if (line.startsWith('## ')) {
      flushSlide();
      currentLines = [line];
    } else {
      currentLines.push(line);
    }
  }
  flushSlide();

  // ページ番号をセクション/コンテンツに付与
  let pageNum = 1;
  for (const slide of slides) {
    if (slide.type !== 'title') {
      slide.pageNumber = pageNum++;
    }
  }

  return slides;
}

function parseSlideBlock(block: string, h1Count: number): Slide | null {
  const lines = block.split('\n');
  const firstLine = lines[0] ?? '';

  if (firstLine.startsWith('# ')) {
    const title = firstLine.slice(2).trim();
    const restLines = lines.slice(1);
    const subtitle = extractSubtitle(restLines);
    const type: SlideType = h1Count <= 1 ? 'title' : 'section';
    return {
      type,
      title,
      subtitle,
      body: '',
    };
  }

  if (firstLine.startsWith('## ')) {
    const { text: titleText, attrs, fontScale } = extractAttrs(firstLine.slice(3).trim());
    const restLines = lines.slice(1);
    const { eyebrow, body, visual } = extractContentParts(restLines);
    return {
      type: 'content',
      title: titleText,
      eyebrow,
      body,
      visual,
      textAlign: attrs.includes('center') ? 'center' : undefined,
      textFill: attrs.includes('fill') ? true : undefined,
      fontScale,
    };
  }

  return null;
}

function extractSubtitle(lines: string[]): string | undefined {
  const nonEmpty = lines.find((l) => l.trim().length > 0 && !l.startsWith('#'));
  return nonEmpty?.trim() || undefined;
}

function extractContentParts(lines: string[]): {
  eyebrow?: string;
  body: string;
  visual?: VisualNode;
} {
  let eyebrow: string | undefined;
  const bodyLines: string[] = [];
  let visual: VisualNode | undefined;

  let i = 0;

  // eyebrow: > で始まる行
  if (lines[0]?.startsWith('> ')) {
    eyebrow = lines[0].slice(2).trim();
    i = 1;
  }

  let inVisualBlock = false;
  let visualBlockLines: string[] = [];
  let visualBlockType: VisualType = 'auto';

  for (; i < lines.length; i++) {
    const line = lines[i];

    // ブロック形式 :::visual type=xxx
    if (line.startsWith(':::visual')) {
      inVisualBlock = true;
      const typeMatch = line.match(/type=(\w+)/);
      visualBlockType = typeMatch ? (typeMatch[1] as VisualType) : 'auto';
      continue;
    }

    if (inVisualBlock) {
      if (line.trimEnd() === ':::') {
        inVisualBlock = false;
        const prompt = visualBlockLines.join('\n').trim();
        visual = {
          type: resolveVisualType(visualBlockType, prompt),
          prompt,
        };
        visualBlockLines = [];
      } else {
        visualBlockLines.push(line);
      }
      continue;
    }

    // 1行形式 !visual: ...
    if (line.startsWith('!visual:')) {
      const prompt = line.slice('!visual:'.length).trim();
      visual = {
        type: inferVisualType(prompt),
        prompt,
      };
      continue;
    }

    bodyLines.push(line);
  }

  return {
    eyebrow,
    body: bodyLines.join('\n').trim(),
    visual,
  };
}

function extractAttrs(raw: string): { text: string; attrs: string[]; fontScale?: number } {
  const match = raw.match(/\{([^}]*)\}\s*$/);
  if (!match) return { text: raw, attrs: [] };
  const text = raw.slice(0, match.index).trim();
  const parts = match[1].trim().split(/\s+/).filter(Boolean);

  let fontScale: number | undefined;
  const attrs: string[] = [];
  for (const part of parts) {
    if (part.startsWith('size=')) {
      fontScale = parseFontScale(part.slice(5));
    } else {
      attrs.push(part);
    }
  }
  return { text, attrs, fontScale };
}

function parseFontScale(value: string): number {
  const named: Record<string, number> = { small: 0.8, large: 1.25, xlarge: 1.5 };
  if (named[value] !== undefined) return named[value];
  const n = parseFloat(value);
  return isNaN(n) ? 1.0 : Math.min(Math.max(n, 0.5), 3.0);
}

function resolveVisualType(type: VisualType, prompt: string): VisualType {
  if (type !== 'auto') return type;
  return inferVisualType(prompt);
}

function inferVisualType(prompt: string): VisualType {
  if (/関係|構造|ループ/.test(prompt)) return 'diagram';
  if (/流れ|ステップ|フロー/.test(prompt)) return 'flow';
  if (/比較|違い/.test(prompt)) return 'compare';
  if (/推移|割合|グラフ/.test(prompt)) return 'chart';
  return 'auto';
}
