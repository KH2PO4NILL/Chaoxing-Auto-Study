export type QuestionType = 'single' | 'multiple' | 'judgement';

export interface QuestionSnapshot {
  id: string;
  type: QuestionType;
  stem: string;
  options: { id: string; identity: string; text: string }[];
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
  kind: 'video' | 'practice' | 'other' | 'unknown';
  media?: HTMLVideoElement;
  blockedMedia: boolean;
  interaction: boolean;
}

export type NextSection = { target: SectionIdentity; action: HTMLElement } | { reason: string };

export interface FillResult {
  message: string;
  selected?: string[];
}

export function sameSection(a?: SectionIdentity, b?: SectionIdentity): boolean {
  return Boolean(a && b && a.courseId === b.courseId && a.chapterId === b.chapterId && a.sectionId === b.sectionId);
}

export function sameQuestion(a: QuestionSnapshot, b: QuestionSnapshot): boolean {
  return a.id === b.id && a.type === b.type && a.stem === b.stem
    && a.options.length === b.options.length
    && a.options.every((option, index) => {
      const other = b.options[index];
      return other?.id === option.id && other.identity === option.identity && other.text === option.text;
    });
}

export function sameSelection(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id) => b.includes(id));
}
