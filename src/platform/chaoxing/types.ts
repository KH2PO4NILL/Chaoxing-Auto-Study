export type QuestionType = 'single' | 'multiple' | 'judgement';

export type QuestionMedia =
  | { kind: 'image'; element: HTMLImageElement; source: string; declaration: string }
  | { kind: 'video'; element: HTMLVideoElement; source: string; declaration: string };

interface QuestionContent {
  text: string;
  media: QuestionMedia[];
}

export interface QuestionSnapshot {
  id: string;
  type: QuestionType;
  requiresScreenshot?: true;
  stem: QuestionContent;
  options: (QuestionContent & { id: string; identity: string })[];
  selected: string[];
}

export type Question = { snapshot: QuestionSnapshot } | { reason: string };

export interface SectionIdentity {
  courseId: string;
  chapterId: string;
  sectionId: string;
}

export interface CourseContext {
  identity?: SectionIdentity;
  scopeKey: string;
  courseName: string;
  chapterName: string;
  sectionName: string;
  progress: string;
  kind: 'video' | 'practice' | 'pdf' | 'other' | 'unknown';
  media?: HTMLVideoElement;
  pdf?: PdfReader;
  hasPractice: boolean;
  blockedMedia: boolean;
  interaction: boolean;
}

export type PdfReader =
  | { viewport: HTMLElement; lastPage: Element; source: string }
  | { frame: HTMLIFrameElement; source: string }
  | { reason: string };

export type NextSection = { target: SectionIdentity; action: HTMLElement } | { reason: string };

export interface FillResult {
  message: string;
  selected?: string[];
}

export function sameSection(a?: SectionIdentity, b?: SectionIdentity): boolean {
  return Boolean(a && b && a.courseId === b.courseId && a.chapterId === b.chapterId && a.sectionId === b.sectionId);
}

function sameContent(a: QuestionContent, b: QuestionContent): boolean {
  return a.text === b.text && a.media.length === b.media.length
    && a.media.every((item, index) => {
      const other = b.media[index];
      return item.element === other?.element && item.source === other.source && item.declaration === other.declaration;
    });
}

export function sameQuestion(a: QuestionSnapshot, b: QuestionSnapshot): boolean {
  return a.id === b.id && a.type === b.type && a.requiresScreenshot === b.requiresScreenshot && sameContent(a.stem, b.stem)
    && a.options.length === b.options.length
    && a.options.every((option, index) => {
      const other = b.options[index];
      return other?.id === option.id && other.identity === option.identity && sameContent(option, other);
    });
}

export function sameSelection(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id) => b.includes(id));
}
