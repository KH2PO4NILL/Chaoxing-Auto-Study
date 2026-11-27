import { nextSection, readCatalog } from './catalog';
import { selectors, studyUrl, textOf, urlParam, visible } from './dom';
import { readPdf } from './pdf';
import { Questions } from './questions';
import type { CourseContext, FillResult, NextSection, Question, QuestionSnapshot, SectionIdentity } from './types';

interface PageDocuments {
  documents: Document[];
  blockedMedia: boolean;
  assessment: boolean;
}

const examPath = /\/(?:exam|exam-ans)(?:\/|$)/i;

export class Chaoxing {
  private readonly questions = new Questions();
  private automatedEntry?: HTMLElement;

  constructor(private readonly window: Window) {}

  private available(sectionId: string): PageDocuments {
    const documents = [this.window.document];
    let blockedMedia = false;
    let assessment = false;
    for (const document of documents) {
      for (const frame of document.querySelectorAll<HTMLIFrameElement>('iframe')) {
        if (!visible(frame) || frame.closest(selectors.question)) continue;
        let frameUrl: URL;
        try { frameUrl = new URL(frame.getAttribute('src') || 'about:blank', document.baseURI); } catch { continue; }
        if (examPath.test(frameUrl.pathname)) { assessment = true; continue; }
        const isTask = !frame.matches(selectors.pdfFrame) && (frame.matches('#iframe, [data-study-frame]')
          || /\/knowledge\/cards|\/ananas\/modules\/video/i.test(frameUrl.pathname));
        const requestedSection = /\/knowledge\/cards/i.test(frameUrl.pathname) ? urlParam(frameUrl, 'knowledgeid', 'chapterid') : '';
        const requestedCard = /\/knowledge\/cards/i.test(frameUrl.pathname) ? urlParam(frameUrl, 'num') : '';
        if (requestedSection && sectionId && requestedSection !== sectionId) continue;
        let child: Document | null;
        try { child = frame.contentDocument; } catch { child = null; }
        if (!child) {
          blockedMedia ||= isTask;
          continue;
        }
        const url = new URL(child.URL);
        if (examPath.test(url.pathname)) { assessment = true; continue; }
        const loadedSection = /\/knowledge\/cards/i.test(url.pathname) ? urlParam(url, 'knowledgeid', 'chapterid') : '';
        if (requestedSection && requestedSection !== loadedSection) continue;
        if (requestedCard && requestedCard !== urlParam(url, 'num')) continue;
        if (loadedSection && sectionId && loadedSection !== sectionId) continue;
        if (!documents.includes(child)) documents.push(child);
      }
    }
    return { documents, blockedMedia, assessment: assessment || documents.some((doc) => Boolean(doc.querySelector(selectors.assessment))) };
  }

  context(): CourseContext | undefined {
    const document = this.window.document;
    const url = new URL(document.URL);
    if (!studyUrl(url) || url.searchParams.has('examsystem') || document.querySelector(selectors.assessment)) return undefined;
    const catalog = readCatalog(document);
    const { documents, blockedMedia, assessment } = this.available(catalog.currentId);
    const videos = documents.flatMap((doc) => Array.from(doc.querySelectorAll<HTMLVideoElement>('video'))
      .filter((video) => visible(video) && !video.closest(selectors.question)));
    const pdf = readPdf(documents);
    const tab = document.querySelector(selectors.tab);
    const tabLabel = tab?.getAttribute('data-study-tab') || textOf(tab);
    const tabType = /^(?:practice|章节测验|章节练习|测验|练习)$/i.test(tabLabel) ? 'practice'
      : /^(?:video|视频|视频课)$/i.test(tabLabel) ? 'video'
      : /^(?:pdf|文档|阅读)$/i.test(tabLabel) ? 'pdf' : undefined;
    const practice = documents.some((doc) => Array.from(doc.querySelectorAll(selectors.question)).some(visible));
    const media = videos.length === 1 && tabType !== 'practice' && tabType !== 'pdf' ? videos[0] : undefined;
    const sectionType = catalog.current?.dataset.sectionType || catalog.current?.dataset.type;
    const kind = tabType || (media ? 'video' : practice ? 'practice'
      : pdf || /^(?:pdf|文档|阅读)$/i.test(sectionType ?? '') ? 'pdf'
      : /^(?:practice|quiz|work)$/i.test(sectionType ?? '') ? 'practice'
      : sectionType && !/^(?:video|视频)$/i.test(sectionType) ? 'other' : 'unknown');
    return {
      identity: catalog.identity,
      scopeKey: JSON.stringify([url.origin, url.pathname, catalog.courseId, catalog.chapterId, catalog.currentId,
        urlParam(url, 'clazzid', 'classid'), tab?.getAttribute('cardid') || tab?.id || tabLabel]),
      courseName: catalog.courseName,
      chapterName: catalog.chapterName,
      sectionName: catalog.sectionName,
      progress: catalog.progress,
      kind,
      media,
      pdf,
      hasPractice: practice,
      questionAvailable: Boolean(catalog.courseId && catalog.currentId && !assessment),
      screenshotAvailable: !assessment,
      blockedMedia: blockedMedia || videos.length > 1,
      interaction: documents.some((doc) => Array.from(doc.querySelectorAll(selectors.interaction)).some(visible)),
    };
  }

  question(): Question {
    return this.questions.snapshot(this.questionDocuments());
  }

  private questionDocuments(): Document[] {
    const document = this.window.document;
    if (!studyUrl(new URL(document.URL)) || document.querySelector(selectors.assessment)) return [];
    const { documents } = this.available(readCatalog(document).currentId);
    return documents.filter((doc) => doc === document || !/\/(?:mooc2\/work\/dowork|work\/dohomeworknew)(?:\/|$)/i.test(new URL(doc.URL).pathname)
      || Boolean(doc.querySelector(selectors.question)));
  }

  fill(question: QuestionSnapshot, ids: string[]): FillResult {
    return this.questions.fill(() => this.questionDocuments(), question, ids);
  }

  next(identity: SectionIdentity): NextSection { return nextSection(this.window.document, identity); }

  enter(action: HTMLElement): void {
    this.automatedEntry = action;
    try { action.click(); } finally { this.automatedEntry = undefined; }
  }

  resetQuestion(): void { this.questions.reset(); }

  watch(onChange: () => void, onManualNavigation: () => void): () => void {
    const window = this.window;
    const root = window.document;
    const observers = new Map<Document, { observer: MutationObserver; events: AbortController }>();
    let scheduled: number | undefined;
    const queue = () => { scheduled ??= window.setTimeout(refresh, 0); };
    const onPageAction = (event: Event) => {
      const target = event.target;
      if (!target || (target as Node).nodeType !== Node.ELEMENT_NODE) return;
      const element = target as Element;
      if (event.type === 'click' && element.ownerDocument === root && !this.automatedEntry?.contains(element)) {
        const navigation = element.closest(`${selectors.row}, ${selectors.tab}, [data-study-tab], #prev_tab .prev_ul li`);
        if (navigation && !navigation.matches(selectors.shell)) onManualNavigation();
      }
      this.questions.focus(element);
      onChange();
    };
    const refresh = () => {
      if (scheduled !== undefined) window.clearTimeout(scheduled);
      scheduled = undefined;
      const { documents } = this.available(readCatalog(root).currentId);
      for (const [doc, { observer, events }] of observers) {
        if (documents.includes(doc)) continue;
        observer.disconnect();
        events.abort();
        observers.delete(doc);
      }
      for (const doc of documents) {
        if (observers.has(doc)) continue;
        const observer = new MutationObserver(queue);
        observer.observe(doc, { subtree: true, childList: true, attributes: true, characterData: true });
        const events = new AbortController();
        const capture = { capture: true, signal: events.signal };
        for (const type of ['click', 'focusin', 'change']) doc.addEventListener(type, onPageAction, capture);
        doc.addEventListener('load', queue, capture);
        observers.set(doc, { observer, events });
      }
      onChange();
    };
    const interval = window.setInterval(refresh, 500);
    const onHistory = () => { onManualNavigation(); queue(); };
    window.addEventListener('popstate', onHistory);
    window.addEventListener('hashchange', queue);
    queue();
    return () => {
      window.clearInterval(interval);
      if (scheduled !== undefined) window.clearTimeout(scheduled);
      window.removeEventListener('popstate', onHistory);
      window.removeEventListener('hashchange', queue);
      for (const { observer, events } of observers.values()) {
        observer.disconnect();
        events.abort();
      }
    };
  }
}
