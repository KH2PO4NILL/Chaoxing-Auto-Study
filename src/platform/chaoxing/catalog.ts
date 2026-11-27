import { selectors, studyUrl, textOf, urlParam, valueOf, visible } from './dom';
import type { NextSection, SectionIdentity } from './types';

function identifier(value: string | null | undefined): string {
  return value?.trim().match(/^[\w-]+$/)?.[0] ?? '';
}

function sectionId(row?: Element | null): string {
  return identifier(row?.getAttribute('data-section-id') || row?.getAttribute('data-knowledgeid')
    || row?.id.match(/^cur([\w-]+)$/)?.[1]);
}

function label(row?: Element | null): string {
  return row?.getAttribute('data-title')?.trim()
    || textOf(row?.querySelector('.posCatalog_name, .catalog_name, a.clicktitle')) || textOf(row);
}

export function readCatalog(document: Document) {
  const url = new URL(document.URL);
  const shell = document.querySelector<HTMLElement>(selectors.shell);
  const courseId = identifier(shell?.dataset.courseId || valueOf(document, '#curCourseId') || urlParam(url, 'courseid'));
  const declaredSection = identifier(shell?.dataset.sectionId || valueOf(document, '#curChapterId') || urlParam(url, 'chapterid', 'knowledgeid'));
  const catalog = document.getElementById('coursetree') ?? document.querySelector(selectors.catalog) ?? document;
  const rows = Array.from(catalog.querySelectorAll<HTMLElement>(selectors.row)).filter((row) => {
    if (row === shell) return false;
    const parentRow = row.parentElement?.closest(selectors.row);
    return !parentRow || parentRow === shell || parentRow.matches(selectors.heading);
  });
  const active = rows.filter((row) => row.matches(selectors.current) && !row.matches(selectors.heading));
  const matching = rows.filter((row) => sectionId(row) === declaredSection && declaredSection);
  const current = active.length === 1 ? active[0] : active.length === 0 && matching.length === 1 ? matching[0] : undefined;
  const currentId = sectionId(current) || declaredSection;
  const group = current?.closest(selectors.chapter);
  const index = current ? rows.indexOf(current) : -1;
  // The legacy catalog places chapter headings and their sections in the same ordered list.
  const heading = rows.slice(0, Math.max(index, 0)).findLast((row) => row.matches(selectors.heading));
  const chapterId = identifier(group?.getAttribute('data-chapter-id') || current?.dataset.chapterId || shell?.dataset.chapterId
    || heading?.getAttribute('data-chapter-id') || sectionId(heading) || heading?.id || urlParam(url, 'parentchapterid'));
  const identity = courseId && chapterId && currentId && active.length < 2
    ? { courseId, chapterId, sectionId: currentId } : undefined;
  const marker = current?.querySelector(selectors.progress);
  const progress = current?.dataset.progress || marker?.getAttribute('data-progress')
    || (marker?.matches('.icon_Completed, .icon_yiwanc') ? '已完成' : marker ? '有待完成任务' : '未知');
  return {
    identity, courseId, currentId, chapterId, rows, index, current, group, heading, progress,
    courseName: shell?.dataset.courseName || textOf(document.querySelector(selectors.courseName)) || '当前课程',
    chapterName: label(group?.querySelector('[data-chapter-title]') ?? heading) || shell?.dataset.chapterName || '章节未识别',
    sectionName: label(current) || shell?.dataset.sectionName || '小节未识别',
  };
}

export function nextSection(document: Document, identity: SectionIdentity): NextSection {
  const catalog = readCatalog(document);
  const { current, index, rows, group, heading } = catalog;
  if (!current || !catalog.identity || catalog.identity.courseId !== identity.courseId
    || catalog.identity.sectionId !== identity.sectionId || catalog.identity.chapterId !== identity.chapterId
    || (!group && !heading && !current.dataset.chapterId)) return { reason: '目录顺序或当前章无法确认，请从课程目录选择下一节。' };
  const next = rows[index + 1];
  if (!next || next.matches(selectors.heading) || next.closest(selectors.chapter) !== group
    || (next.dataset.chapterId && next.dataset.chapterId !== identity.chapterId)) return { reason: '已到本章末尾。' };
  const id = sectionId(next);
  if (!id || id === identity.sectionId || rows.filter((row) => sectionId(row) === id).length !== 1
    || (!group && !heading && next.dataset.chapterId !== identity.chapterId)) return { reason: '下一项目录信息无法确认。' };
  if (!visible(next) || next.matches(selectors.locked) || next.querySelector(selectors.locked)
    || /未开放|未解锁|已锁定/.test(textOf(next))) return { reason: '下一节未开放或已锁定。' };
  const badge = next.querySelector('[data-task-type], .task-type, .catalog_type, [title="视频"], [aria-label="视频"], [title="章节测验"], [aria-label="章节测验"], [title="PDF" i], [title="文档"]');
  const type = (next.dataset.sectionType || next.dataset.type || badge?.getAttribute('data-task-type')
    || badge?.getAttribute('aria-label') || badge?.getAttribute('title') || textOf(badge)).trim();
  if (/^(?:practice|quiz|work|章节测验|章节练习|练习|测验)$/i.test(type)) return { reason: '下一项是练习，请手动处理。' };
  if (/^(?:pdf|文档|阅读)$/i.test(type)) return { reason: '下一项是 PDF 阅读，请从课程目录打开。' };
  if (!/^(?:video|视频|视频课)$/i.test(type)) return { reason: '下一项未明确标记为视频，请从课程目录选择。' };
  const action = next.matches('a, button') ? next : next.querySelector<HTMLElement>(selectors.action);
  if (!action || !visible(action) || action.matches(':disabled') || action.hasAttribute('download')
    || (action.getAttribute('target') && action.getAttribute('target') !== '_self')) return { reason: '下一节没有可用的课程入口。' };
  const href = action.getAttribute('href');
  if (href && !href.startsWith('#') && !/^javascript:\s*void\(0\);?$/i.test(href)) {
    let target: URL;
    try { target = new URL(href, document.baseURI); } catch { return { reason: '下一节的入口地址无法识别。' }; }
    const course = urlParam(target, 'courseid');
    if (!studyUrl(target) || target.origin !== new URL(document.URL).origin
      || urlParam(target, 'chapterid', 'knowledgeid') !== id || (course && course !== identity.courseId)) {
      return { reason: '下一节的入口与当前课程目录不一致。' };
    }
  }
  return { target: { ...identity, sectionId: id }, action };
}
