import { selectors, textOf, visible } from './dom';
import { sameQuestion, sameSelection } from './types';
import type { FillResult, Question, QuestionMedia, QuestionSnapshot, QuestionType } from './types';

const typeNames: Record<string, QuestionType> = {
  '0': 'single', '1': 'multiple', '3': 'judgement',
  single: 'single', multiple: 'multiple', judgement: 'judgement', judgment: 'judgement',
  单选题: 'single', 多选题: 'multiple', 判断题: 'judgement',
};

interface Control {
  element: HTMLElement;
  checked: boolean;
  disabled: boolean;
  type: 'radio' | 'checkbox';
}

function readControl(element: HTMLElement, expectedType: Control['type']): Control | undefined {
  const disabled = element.matches(':disabled') || Boolean(element.closest('[aria-disabled="true"], [inert]'));
  if (element.tagName === 'INPUT') {
    const input = element as HTMLInputElement;
    if (input.type === 'radio' || input.type === 'checkbox') return { element, checked: input.checked, disabled, type: input.type };
  }
  const checked = element.getAttribute('aria-checked');
  const type = element.getAttribute('role') || expectedType;
  if ((type === 'radio' || type === 'checkbox') && (checked === 'true' || checked === 'false')) {
    return { element, checked: checked === 'true', disabled, type };
  }
}

function readMedia(root: Element | null): QuestionMedia[] | undefined {
  const media: QuestionMedia[] = [];
  for (const node of root?.querySelectorAll<HTMLImageElement | HTMLVideoElement | HTMLIFrameElement>(selectors.questionMedia) ?? []) {
    if (!visible(node)) continue;
    let element: HTMLImageElement | HTMLVideoElement;
    if (node.tagName === 'IFRAME') {
      const frame = node as HTMLIFrameElement;
      const child = frame.contentDocument;
      if (!child || !/^\/ananas\/modules\/video\//i.test(new URL(child.URL).pathname)) return undefined;
      const videos = Array.from(child.querySelectorAll('video')).filter(visible);
      if (videos.length !== 1 || !videos[0]) return undefined;
      element = videos[0];
    } else element = node as HTMLImageElement | HTMLVideoElement;
    const container = element.closest('picture') ?? element;
    const sources = Array.from(container.querySelectorAll('source'), (source) => [source.getAttribute('src'), source.getAttribute('srcset')]);
    const explicit = element.getAttribute('src');
    const source = (element.hasAttribute('srcset') || !explicit || container !== element ? element.currentSrc : explicit)
      || explicit || sources[0]?.[0];
    if (!source) return undefined;
    let url: URL;
    try { url = new URL(source, element.baseURI); } catch { return undefined; }
    if (!['https:', 'blob:', 'data:'].includes(url.protocol) || url.username || url.password) return undefined;
    const declaration = JSON.stringify([node.getAttribute('src'), explicit, element.getAttribute('srcset'), sources]);
    if (element.tagName === 'IMG') media.push({ kind: 'image', element: element as HTMLImageElement, source: url.href, declaration });
    else media.push({ kind: 'video', element: element as HTMLVideoElement, source: url.href, declaration });
  }
  return media;
}

export class Questions {
  private selected?: Element;
  private serial = 0;
  private readonly documentIds = new WeakMap<Document, number>();
  private readonly questionIds = new WeakMap<Element, number>();

  focus(target: Element): void {
    const question = target.closest(selectors.question);
    if (question) this.selected = question;
  }

  reset(): void { this.selected = undefined; }

  private root(documents: readonly Document[]): Element | undefined {
    const available = documents.flatMap((doc) => {
      if (/\/(?:exam|exam-ans)(?:\/|$)/i.test(new URL(doc.URL).pathname) || doc.querySelector(selectors.assessment)) return [];
      return Array.from(doc.querySelectorAll(selectors.question)).filter(visible);
    });
    const active = available.filter((element) => element.matches(selectors.activeQuestion));
    if (active.length === 1) return active[0];
    if (this.selected && available.includes(this.selected)) return this.selected;
    if (available.length === 1) return available[0];
  }

  private read(documents: readonly Document[]): (Question & { controls?: Control[] }) {
    const root = this.root(documents);
    if (!root) return { reason: '请在章节练习中点击要查询的题目。' };
    const typeInput = root.querySelector<HTMLInputElement>('input[id^="answertype"]');
    const stemNode = root.querySelector(selectors.stem);
    const rawType = root.getAttribute('data-question-type') || typeInput?.value
      || textOf(root.querySelector('[data-question-type-label]'));
    const type = Object.hasOwn(typeNames, rawType) ? typeNames[rawType] : undefined;
    if (!type) return { reason: '此题型不适用。请选择单选、多选或判断题。' };
    const requiresScreenshot = Boolean(root.closest(selectors.encodedQuestionText))
      || Array.from(root.querySelectorAll(selectors.encodedQuestionText)).some(visible);
    if (!requiresScreenshot && Array.from(root.querySelectorAll(selectors.unsupportedQuestionContent)).some(visible)) {
      return { reason: '这道题包含暂不支持的嵌入媒体或公式，请在学习通处理。' };
    }
    const rows = Array.from(root.querySelectorAll<HTMLElement>(selectors.option)).filter((row) => {
      const parentOption = row.parentElement?.closest(selectors.option);
      return (!parentOption || !root.contains(parentOption)) && visible(row);
    });
    const stemMedia = requiresScreenshot ? [] : readMedia(stemNode?.closest('.Zy_TItle') ?? stemNode);
    if (!stemMedia) return { reason: '题干包含图片或视频，但浏览器尚无法读取其来源。' };
    const stem = { text: textOf(stemNode), media: stemMedia };
    if ((!stem.text && !stem.media.length) || rows.length < 2 || (type === 'judgement' && rows.length !== 2)) {
      return { reason: '题干或选项不完整。' };
    }
    const controls: Control[] = [];
    const options: QuestionSnapshot['options'] = [];
    const selected: string[] = [];
    for (const row of rows) {
      const nodes = row.matches(selectors.control) ? [row] : Array.from(row.querySelectorAll<HTMLElement>(selectors.control));
      // A styled control may expose a role around the native input. Use the native input when present.
      const native = nodes.filter((element) => element.tagName === 'INPUT');
      const candidates = native.length ? native : nodes;
      const controlType = type === 'multiple' ? 'checkbox' : 'radio';
      const control = candidates.length === 1 && candidates[0] ? readControl(candidates[0], controlType) : undefined;
      const text = textOf(row.querySelector(selectors.optionText) ?? row);
      const media = requiresScreenshot ? [] : readMedia(row);
      if (!media) return { reason: '选项包含图片或视频，但浏览器尚无法读取其来源。' };
      if (!control || (!text && !media.length) || control.type !== controlType) {
        return { reason: '选项内容或控件不完整。' };
      }
      const id = `opt${options.length + 1}`;
      const identity = row.dataset.optionId || control.element.getAttribute('value') || control.element.id || text;
      options.push({ id, identity, text, media });
      if (control.checked) selected.push(id);
      controls.push(control);
    }
    const attached = [...stem.media, ...options.flatMap((option) => option.media)];
    if (!requiresScreenshot && attached.length !== Array.from(root.querySelectorAll(selectors.questionMedia)).filter(visible).length) {
      return { reason: '无法判断图片或视频属于题干还是选项，请在学习通处理。' };
    }
    if (attached.reduce((count, item) => count + (item.kind === 'video' ? 3 : 1), 0) > 12) {
      return { reason: '这道题的图片和视频较多，超过单次查询范围，请在学习通处理。' };
    }
    if (new Set(options.map(({ identity, text, media }) => JSON.stringify([identity, text, media.map((item) => item.source)]))).size !== options.length
      || (type !== 'multiple' && selected.length > 1)) return { reason: '选项无法唯一对应。' };
    let documentId = this.documentIds.get(root.ownerDocument);
    if (documentId === undefined) {
      documentId = ++this.serial;
      this.documentIds.set(root.ownerDocument, documentId);
    }
    let rootId = root.getAttribute('data-question-id') || root.id || typeInput?.id;
    if (!rootId) {
      let id = this.questionIds.get(root);
      if (id === undefined) {
        id = ++this.serial;
        this.questionIds.set(root, id);
      }
      rootId = `element-${id}`;
    }
    return { snapshot: { id: `${documentId}:${rootId}`, type, requiresScreenshot: requiresScreenshot ? true : undefined,
      stem, options, selected }, controls };
  }

  snapshot(documents: readonly Document[]): Question {
    const result = this.read(documents);
    return 'snapshot' in result ? { snapshot: result.snapshot } : { reason: result.reason };
  }

  fill(documents: () => readonly Document[], original: QuestionSnapshot, ids: string[]): FillResult {
    const initial = this.read(documents());
    if (!('snapshot' in initial) || !initial.controls || !sameQuestion(original, initial.snapshot)
      || !sameSelection(original.selected, initial.snapshot.selected)) {
      return { message: '题目、选项或当前选择已变化，请重新查询。' };
    }
    const controls = initial.controls;
    const changes = initial.snapshot.options.flatMap(({ id }, index) => {
      const control = controls[index];
      const checked = ids.includes(id);
      return control && control.checked !== checked && (original.type === 'multiple' || checked) ? [{ control, id, checked }] : [];
    });
    if (controls.some((control) => control.disabled || !control.element.isConnected)
      || ids.some((id) => !initial.snapshot.options.some((option) => option.id === id))) {
      return { message: '选项当前不可操作，请在学习通页面检查。', selected: initial.snapshot.selected };
    }
    let expected = [...original.selected];
    for (const { control, id, checked } of changes) {
      const live = this.read(documents());
      if (!('snapshot' in live) || !sameQuestion(original, live.snapshot) || !sameSelection(expected, live.snapshot.selected)
        || live.controls?.some((item, index) => item.disabled || item.element !== controls[index]?.element)) break;
      control.element.click();
      expected = original.type === 'multiple'
        ? checked ? [...expected, id] : expected.filter((existing) => existing !== id)
        : [id];
    }
    const current = this.read(documents());
    const same = 'snapshot' in current && sameQuestion(original, current.snapshot);
    const selected = same ? current.snapshot.selected : undefined;
    return selected && sameSelection(selected, ids)
      ? { message: '已填入本题。请在学习通检查，确认后自行提交。', selected }
      : { message: '页面发生变化，可能只填入了一部分，请在学习通检查当前选择。', selected };
  }
}
