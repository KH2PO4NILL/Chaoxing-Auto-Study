export const selectors = {
  shell: '[data-course-id][data-section-id]',
  courseName: '[data-course-name], #courseName, .courseName, .course-name',
  catalog: '[data-study-catalog], #chapters, .posCatalog, .chapter-list, #chapterList',
  row: '[data-section-id], .posCatalog_select, .chapter_item, .chapter_item_first, .firstLayer',
  heading: '[data-chapter-heading], .firstLayer:not([data-section-id]), .chapter_item_first:not([id^="cur"])',
  chapter: '[data-study-chapter][data-chapter-id]',
  current: '.posCatalog_active, [aria-current="page"], [data-current="true"]',
  action: 'a.posCatalog_name, button.posCatalog_name, .posCatalog_name, a.clicktitle, a[href], button',
  progress: '[data-progress], .icon_Completed, .icon_yiwanc, .jobUnfinishCount, .catalog_points_yi',
  locked: '[data-locked="true"], [aria-disabled="true"], [disabled], .locked, .catalog_points_sa, .catalog_points_er',
  tab: '#prev_tab .prev_ul li.active, [data-study-tab][aria-selected="true"]',
  interaction: '[data-video-interaction], .ans-videoquiz, .vjs-quiz, .videoQuiz, .x-window[role="dialog"]',
  activeQuestion: '[data-current-question="true"], .TiMu[aria-current="true"]',
  question: '[data-question-id], .TiMu, .questionLi:has(.mark_name), fieldset:has(> legend):has(input[type="radio"], input[type="checkbox"])',
  stem: '[data-question-stem], .Zy_TItle .clearfix, .mark_name, legend',
  stemContainer: '.Zy_TItle',
  option: '[data-question-option], ul li[aria-checked], ul li:has(input[type="radio"], input[type="checkbox"], [aria-checked], .after, label), label:has(input[type="radio"], input[type="checkbox"]), [role="radio"], [role="checkbox"], input[type="radio"], input[type="checkbox"]',
  optionText: '[data-option-text], .after, label:not(.before)',
  control: 'input[type="radio"], input[type="checkbox"], [role="radio"], [role="checkbox"], [aria-checked]',
  encodedQuestionText: '.font-cxsecret',
  unsupportedQuestionContent: 'svg, canvas, math, audio, object, embed',
  questionMedia: 'img, video, iframe',
  pdfFrame: 'iframe[data-study-pdf], iframe[src*="/ananas/modules/pdf/" i], iframe[src*=".pdf" i]',
  pdfEmbed: 'embed[type="application/pdf"], object[type="application/pdf"]',
  assessment: '[data-assessment="exam"], [data-assessment="homework"], form[action*="/exam/"]',
} as const;

export function studyUrl(url: URL): boolean {
  return url.protocol === 'https:' && /(^|\.)chaoxing\.com$/i.test(url.hostname)
    && /^(?:\/mooc(?:2)?-ans)?\/mycourse\/studentstudy\/?$/i.test(url.pathname);
}

export function urlParam(url: URL, ...keys: string[]): string {
  for (const [key, value] of url.searchParams) if (keys.includes(key.toLowerCase())) return value.trim();
  return '';
}

export function visible(element: Element): boolean {
  const view = element.ownerDocument.defaultView;
  if (!view || !element.isConnected || view.getComputedStyle(element).visibility !== 'visible') return false;
  for (let node: Element | null = element; node; node = node.parentElement) {
    if (node.matches('[hidden], [aria-hidden="true"], [inert]') || view.getComputedStyle(node).display === 'none') return false;
  }
  return true;
}

export function textOf(node?: Element | null): string {
  if (!node) return '';
  return ((node as HTMLElement).innerText ?? node.textContent ?? '').replace(/\s+/g, ' ').trim();
}

export function valueOf(document: Document, selector: string): string {
  return document.querySelector<HTMLInputElement>(selector)?.value?.trim() ?? '';
}
