import { sameSection } from '../platform/chaoxing/types';
import type { SectionIdentity } from '../platform/chaoxing/types';

const key = 'chaoxing-auto-study.next';
export const continuationMs = 12_000;

interface Handoff {
  from: SectionIdentity;
  target: SectionIdentity;
  mode: 'chapter';
  expiresAt: number;
}

export class Continuation {
  constructor(private readonly window: Window) {}

  write(from: SectionIdentity, target: SectionIdentity): boolean {
    try {
      const value: Handoff = { from, target, mode: 'chapter', expiresAt: Date.now() + continuationMs };
      this.window.sessionStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch { return false; }
  }

  clear(): void {
    try { this.window.sessionStorage.removeItem(key); } catch { /* Storage can be blocked by the browser. */ }
  }

  take(target: SectionIdentity | undefined, previous?: SectionIdentity): boolean {
    try {
      const raw = this.window.sessionStorage.getItem(key);
      this.clear();
      if (!raw || !target) return false;
      const value = JSON.parse(raw) as Partial<Handoff>;
      const navigation = this.window.performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
      const validSource = previous ? sameSection(previous, value.from) : navigation?.type === 'navigate';
      return Boolean(validSource && value.expiresAt && value.expiresAt > Date.now()
        && value.expiresAt <= Date.now() + continuationMs && value.mode === 'chapter'
        && value.from?.courseId === target.courseId && value.from?.chapterId === target.chapterId
        && value.from?.sectionId !== target.sectionId && sameSection(value.target, target));
    } catch { return false; }
  }
}
