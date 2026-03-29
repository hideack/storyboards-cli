// ===== Config =====
export interface Config {
  themeDirectory: string;
  defaultTheme: string;
}

// ===== Theme =====
export type ThemeKind = 'builtin-theme' | 'imported-svg-theme' | 'imported-pdf-theme';
export type SourceType = 'builtin' | 'svg' | 'pdf';
export type Fidelity = 'high' | 'medium' | 'low';

export interface ThemeSource {
  type: SourceType;
  fidelity: Fidelity;
}

export interface PageSpec {
  width: number;
  height: number;
  aspectRatio: string;
}

export interface ThemeTokens {
  fontFamily: string;
  textColor: string;
  mutedColor: string;
  accentColor: string;
  backgroundColor: string;
  borderRadius: number;
}

export interface SlotSpec {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface VisualRegion {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LayoutSpec {
  background: string | null;
  slots: Record<string, SlotSpec>;
  visualRegion?: VisualRegion;
  fixedElements: FixedElement[];
}

export interface FixedElement {
  type: string;
  src?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  content?: string;
}

export interface Theme {
  schemaVersion: number;
  name: string;
  version: string;
  kind: ThemeKind;
  source: ThemeSource;
  page: PageSpec;
  tokens: ThemeTokens;
  layouts: {
    title: LayoutSpec;
    section: LayoutSpec;
    content: LayoutSpec;
  };
}

export interface ThemeInfo {
  name: string;
  theme: Theme;
  directory: string;
}

// ===== Markdown / Slides =====
export type SlideType = 'title' | 'section' | 'content';

export type VisualType = 'auto' | 'diagram' | 'flow' | 'compare' | 'chart' | 'mermaid';

export interface VisualNode {
  type: VisualType;
  prompt: string;
  /** レンダリング済みコンテンツ（build 時に付与） */
  _renderedContent?: string;
  /** フォールバック HTML（build 時に付与） */
  _fallbackContent?: string;
}

export interface Slide {
  type: SlideType;
  title: string;
  subtitle?: string;
  eyebrow?: string;
  body: string;
  visual?: VisualNode;
  pageNumber?: number;
  textAlign?: 'center' | 'left';
  textFill?: boolean;
  fontScale?: number;
}

export interface ParsedDocument {
  frontmatter: Record<string, unknown>;
  slides: Slide[];
  globalFontScale?: number;
}

// ===== Build =====
export interface BuildOptions {
  theme?: string;
  out: string;
  open: boolean;
  strict: boolean;
  ai?: string;
  liveReload?: boolean;
}

export interface BuildResult {
  success: boolean;
  warnings: string[];
  errors: string[];
  outputDir: string;
}

// ===== Visual Generation =====
export interface VisualGenerationInput {
  slideTitle: string;
  slideBody: string;
  visualType: VisualType;
  visualPrompt: string;
  themeTokens: ThemeTokens;
  visualRegion: VisualRegion;
  preferredFormat: 'svg' | 'html';
}

export interface VisualGenerationResult {
  success: boolean;
  content?: string;
  format?: 'svg' | 'html';
  error?: string;
  cached?: boolean;
}

// ===== Theme Import =====
export interface SVGImportOptions {
  name: string;
  titleSvg: string;
  sectionSvg: string;
  contentSvg: string;
}

export interface PDFImportOptions {
  name: string;
  pdf: string;
}
