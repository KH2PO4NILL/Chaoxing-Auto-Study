import renderMathInElement from 'katex/contrib/auto-render';

const source = new WeakMap<HTMLElement, string>();

export function renderModelText(element: HTMLElement, text: string): void {
  if (source.get(element) === text) return;
  source.set(element, text);
  element.textContent = text;
  if (text.length > 60_000) return;
  renderMathInElement(element, {
    delimiters: [
      { left: '$$', right: '$$', display: true },
      { left: '\\[', right: '\\]', display: true },
      { left: '\\(', right: '\\)', display: false },
      { left: '$', right: '$', display: false },
    ],
    output: 'mathml',
    trust: false,
    maxExpand: 300,
    maxSize: 12,
    errorCallback: () => {},
  });
}
