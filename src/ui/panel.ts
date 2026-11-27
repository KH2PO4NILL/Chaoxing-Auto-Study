import type { StudySession, StudyView } from '../session/study';
import type { QuestionMedia, QuestionSnapshot } from '../platform/chaoxing/types';
import type { ChatMessage } from '../ai/client';
import { chatTextLimit } from '../chat/task';
import { PageCapture } from './page-capture';

const template = `
<style>
  :host {
    all: initial;
    --ink: #23243a;
    --secondary: #565d74;
    --accent: #4f42a9;
    --accent-soft: #efedfc;
    --line: #e1e3ee;
    color-scheme: light;
    position: fixed;
    z-index: 2147483647;
    inset: 0 0 0 auto;
    width: 0;
    overflow: visible;
    font: 14px/1.55 system-ui, sans-serif;
    color: var(--ink);
  }
  :host([hidden]), [hidden] { display: none !important; }
  :host([data-capturing]) #panel, :host([data-capturing]) #toggle { visibility: hidden; }
  *, *::before, *::after { box-sizing: border-box; }
  button, input, select, textarea { font: inherit; }
  button, select, input:not([type=checkbox]) {
    min-height: 36px;
    border: 1px solid #cdd0e0;
    border-radius: 8px;
    color: var(--ink);
    background: #fff;
    padding: 6px 11px;
  }
  button { cursor: pointer; }
  button:disabled { color: #60657a; border-color: var(--line); background: #f0f1f6; cursor: default; }
  button:not(:disabled):hover { border-color: var(--accent); }
  :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .primary:not(:disabled), #toggle { background: var(--accent); color: #fff; border-color: var(--accent); }
  #toggle {
    position: absolute;
    inset: 50% 0 auto auto;
    transform: translateY(-50%);
    display: grid;
    justify-items: center;
    gap: 8px;
    width: 42px;
    padding: 12px 5px;
    border-radius: 12px 0 0 12px;
    box-shadow: 0 4px 20px #2d245141;
  }
  #toggle:focus-visible { outline-offset: -4px; outline-color: #fff; }
  .vertical { writing-mode: vertical-rl; letter-spacing: .08em; }
  #toggle-status { color: #f0eafd; font-size: 11px; }
  .chevron {
    display: block;
    width: 8px;
    height: 8px;
    border: solid currentColor;
    border-width: 0 2px 2px 0;
    transform: rotate(-45deg);
  }
  #toggle .chevron { transform: rotate(135deg); }
  .panel {
    position: absolute;
    inset: 0 0 0 auto;
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr);
    width: min(392px, calc(100vw - 32px));
    overflow: hidden;
    background: #f6f7fb;
    border-left: 1px solid var(--line);
    box-shadow: -10px 0 36px #22244226;
  }
  .panel-header {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    padding: 20px 18px 14px;
    background: linear-gradient(150deg, #f1eefc, #fafaff 77%);
  }
  .mark {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border-radius: 10px;
    background: var(--accent);
    color: white;
  }
  .mark::before, .mark::after { content: ""; grid-area: 1 / 1; }
  .mark::before { width: 15px; height: 18px; border: 2px solid currentColor; border-radius: 3px; }
  .mark::after { width: 6px; height: 5px; border-block: 1px solid currentColor; }
  #close { display: grid; place-items: center; width: 36px; padding: 0; color: var(--accent); }
  h2 { font-size: 18px; line-height: 1.3; margin: 0; }
  h3 { font-size: 14px; margin: 0 0 7px; }
  p { margin: 0 0 10px; }
  #sidebar-status { font-size: 12px; color: var(--accent); margin: 2px 0 0; }
  #location {
    grid-column: 1 / -1;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    overflow: hidden;
    margin: 0;
  }
  .secondary { color: var(--secondary); font-size: 13px; }
  .actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .tabs {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 5px;
    padding: 5px;
    margin: 0 16px 12px;
    border: 1px solid var(--line);
    border-radius: 11px;
    background: #fff;
  }
  [role=tab] { border-color: transparent; color: var(--secondary); font-weight: 600; padding-inline: 3px; }
  [role=tab][aria-selected=true] { color: var(--accent); background: var(--accent-soft); }
  .content {
    min-height: 0;
    overflow: auto;
    overscroll-behavior: contain;
    scrollbar-color: #bcb9d6 transparent;
    padding: 2px 16px 24px;
  }
  .content:has(#chat:not([hidden])) { display: grid; grid-template-rows: minmax(0, 1fr); overflow: hidden; padding-bottom: 14px; }
  #chat { display: grid; grid-template-rows: minmax(0, 1fr) auto; min-height: 0; gap: 10px; }
  #chat-thread { overflow-y: auto; overscroll-behavior: contain; padding: 2px 4px 8px 0; }
  #chat-empty { color: var(--secondary); margin: 16px 4px; }
  #chat-messages { list-style: none; margin: 0; padding: 0; }
  #chat-messages li {
    max-width: 94%;
    margin-bottom: 12px;
    padding: 10px 12px;
    border-radius: 11px;
    background: #fff;
    border: 1px solid var(--line);
    overflow-wrap: anywhere;
  }
  #chat-messages li[data-role=user] { margin-left: auto; background: var(--accent-soft); border-color: transparent; }
  #chat-messages p { margin: 0; white-space: pre-wrap; }
  #chat-messages .message-label { margin-bottom: 4px; color: var(--secondary); font-size: 12px; font-weight: 600; }
  #chat-messages img, #chat-attachment img {
    display: block;
    max-width: 100%;
    max-height: 152px;
    object-fit: contain;
    border: 1px solid var(--line);
    border-radius: 7px;
  }
  #chat-messages img { margin-top: 7px; }
  #chat-compose { border: 1px solid var(--line); border-radius: 12px; padding: 10px; background: #fff; max-height: 65vh; overflow: auto; }
  #chat-attachment { display: flex; align-items: flex-start; gap: 8px; margin: 0 0 8px; }
  #chat-attachment img { max-width: calc(100% - 90px); max-height: 82px; }
  #chat-input {
    display: block;
    width: 100%;
    min-height: 70px;
    resize: vertical;
    border: 1px solid #cdd0e0;
    border-radius: 8px;
    padding: 8px;
    margin-bottom: 8px;
    color: var(--ink);
  }
  #chat-compose .actions { gap: 5px; }
  #chat-compose button { padding: 5px 7px; }
  #chat-send, #chat-stop { margin-left: auto; }
  #chat-destination { overflow-wrap: anywhere; margin: 7px 0 0; }
  #chat-clear { min-height: 28px; margin-bottom: 8px; }
  .capture {
    position: fixed;
    inset: 0;
    cursor: crosshair;
    user-select: none;
    touch-action: none;
    overflow: hidden;
    background: #161829;
  }
  .capture:focus { outline: none; }
  .capture-image { display: block; width: 100%; height: 100%; pointer-events: none; }
  .capture-outline { position: absolute; border: 2px solid #8a77fa; box-shadow: 0 0 0 200vmax #12102372; pointer-events: none; }
  .capture-toolbar {
    position: absolute;
    inset: 12px auto auto 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 10px;
    max-width: calc(100vw - 24px);
    border-radius: 10px;
    padding: 6px 8px 6px 12px;
    background: #fff;
    box-shadow: 0 3px 16px #18162e5e;
  }
  #video-controls, #pdf, #practice, #service {
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 14px;
    background: #fff;
  }
  #video-controls + #pdf, #progress, #practice > .actions + p, #service + p { margin-top: 10px; }
  .status, #preview, #suggestion { background: #f1f0fa; padding: 10px; border-radius: 8px; overflow-wrap: anywhere; }
  .status { margin: 10px 0 0; }
  .status:empty { display: none; }
  #preview, #suggestion { margin-top: 10px; }
  #preview p, #suggestion p { white-space: pre-wrap; }
  #preview ol, #suggestion ul { margin: 6px 0; padding-left: 24px; }
  #destination { color: var(--accent); font-weight: 600; }
  #screenshot-input { margin: 8px 0; }
  #screenshot-preview {
    display: block;
    max-width: 100%;
    max-height: 230px;
    object-fit: contain;
    margin-top: 8px;
    border: 1px solid var(--line);
    border-radius: 8px;
  }
  #screenshot-loading { margin-top: 8px; }
  label.field { display: block; margin-bottom: 10px; }
  label.field input { display: block; margin-top: 3px; width: 100%; }
  #stem, #location { overflow-wrap: anywhere; }
  #stem { max-height: 8em; overflow: auto; }
  select { margin-left: 6px; max-width: 100%; }
  @media (max-width: 500px), (max-height: 480px) {
    .panel-header { padding: 12px 12px 9px; gap: 7px; }
    .tabs { margin: 0 10px 8px; }
    .content { padding: 2px 10px 14px; }
    #video-controls, #pdf, #practice, #service { padding: 10px; }
  }
  @media (max-width: 460px) { .panel { width: 100vw; } }
</style>
<aside id="panel" class="panel" aria-labelledby="name" hidden>
  <header class="panel-header">
    <span class="mark" aria-hidden="true"></span>
    <div>
      <h2 id="name">学习助手</h2>
      <p id="sidebar-status" role="status"></p>
    </div>
    <button id="close" type="button" aria-label="收起学习助手" title="收起学习助手"><span class="chevron" aria-hidden="true"></span></button>
    <p id="location" class="secondary"></p>
  </header>
  <div class="tabs" role="tablist" aria-label="助手功能">
    <button id="tab-chat" role="tab" aria-controls="chat" aria-selected="true">AI 聊天</button>
    <button id="tab-play" role="tab" aria-controls="play" aria-selected="false" tabindex="-1">播放</button>
    <button id="tab-practice" role="tab" aria-controls="practice" aria-selected="false" tabindex="-1">练习</button>
    <button id="tab-settings" role="tab" aria-controls="settings" aria-selected="false" tabindex="-1">设置</button>
  </div>
  <div id="sidebar-content" class="content">
  <div id="chat" role="tabpanel" aria-labelledby="tab-chat">
    <div id="chat-thread">
      <p id="chat-empty">可以输入问题、读取当前题面，或框选截图。</p>
      <ul id="chat-messages" role="log" aria-label="对话"></ul>
    </div>
    <form id="chat-compose">
      <button id="chat-clear" type="button" hidden>清空对话</button>
      <div id="chat-attachment" hidden>
        <img id="chat-image" alt="待发送的截图">
        <button id="chat-remove" type="button">移除截图</button>
      </div>
      <textarea id="chat-input" aria-label="聊天消息" placeholder="输入你的问题…" rows="2" maxlength="${chatTextLimit}"></textarea>
      <div class="actions">
        <button id="chat-read" type="button">读取本题</button>
        <button id="chat-capture" type="button" title="在浏览器弹窗选择当前学习通标签页">框选截图</button>
        <button id="chat-configure" type="button" hidden>配置服务</button>
        <button id="chat-send" class="primary" type="submit">发送</button>
        <button id="chat-stop" type="button" hidden>停止生成</button>
      </div>
      <p id="chat-destination" class="secondary"></p>
      <p id="chat-status" class="status" role="status"></p>
    </form>
  </div>
  <div id="play" role="tabpanel" aria-labelledby="tab-play" hidden>
    <div id="video-controls">
      <p id="position"></p>
      <p><label>播放模式<select id="mode"><option value="section">仅本节</option><option value="chapter">连续播放本章</option></select></label></p>
      <div class="actions"><button id="start" class="primary">开始</button><button id="pause">暂停</button><button id="stop">停止</button></div>
      <p id="play-status" class="status" role="status"></p>
    </div>
    <section id="pdf" aria-labelledby="pdf-heading" hidden>
      <h3 id="pdf-heading">PDF 阅读</h3>
      <p id="pdf-position" class="secondary" hidden></p>
      <div class="actions"><button id="pdf-start" class="primary">开始阅读</button><button id="pdf-pause">暂停阅读</button></div>
      <p id="pdf-status" class="status" role="status"></p>
    </section>
    <p id="progress" class="secondary"></p>
  </div>
  <div id="practice" role="tabpanel" aria-labelledby="tab-practice" hidden>
    <h3 id="question-type"></h3><p id="stem"></p>
    <div class="actions"><button id="query" class="primary">查询答案</button><button id="query-screenshot">截图查询</button><button id="cancel" hidden>取消查询</button><button id="fill" hidden>填入本题</button></div>
    <p id="screenshot-hint" class="secondary" hidden>框选并复制后，点「截图查询」并按 Ctrl+V，或选择截图文件。</p>
    <p id="practice-status" class="status" role="status"></p>
    <section id="preview" aria-labelledby="preview-heading" hidden>
      <h3 id="preview-heading">确认发送给模型</h3>
      <p id="destination"></p><p id="send-stem"></p><ol id="send-options"></ol><p id="send-media" class="secondary" hidden></p>
      <div id="screenshot-input" tabindex="0" role="group" aria-label="题目截图" aria-describedby="screenshot-guide" hidden>
        <p id="screenshot-guide" class="secondary"></p>
        <button id="pick-screenshot" type="button">选择截图文件</button>
        <input id="screenshot-file" type="file" aria-label="选择截图文件" accept="image/png,image/jpeg,image/webp" hidden>
        <p id="screenshot-loading" role="status" hidden>正在读取截图。</p>
        <img id="screenshot-preview" alt="待发送的题目截图" hidden>
      </div>
      <div class="actions"><button id="send" class="primary">确认查询</button><button id="dismiss">返回</button></div>
    </section>
    <section id="suggestion" aria-labelledby="suggestion-heading" hidden>
      <h3 id="suggestion-heading">模型建议</h3><ul id="suggested-options"></ul><p id="explanation"></p>
    </section>
    <p id="filled" class="secondary"></p>
  </div>
  <div id="settings" role="tabpanel" aria-labelledby="tab-settings" hidden>
    <p id="warning" class="status" role="status"></p>
    <form id="service" autocomplete="off">
      <label class="field">HTTPS API 基础地址（含版本前缀）<input id="base" type="url" required placeholder="https://api.example.com/v1"></label>
      <label class="field">模型名称<input id="model" type="text" required placeholder="服务提供的模型 ID"></label>
      <label class="field">服务密钥<input id="key" type="password" spellcheck="false" autocomplete="new-password"></label>
      <p id="key-state" class="secondary"></p>
      <p><label><input id="remember" type="checkbox"> 记住密钥</label></p>
      <div class="actions"><button id="save" class="primary" type="submit">保存设置</button><button id="test" type="button">测试连接</button><button id="clear" type="button">清除密钥</button></div>
    </form>
    <p class="secondary">测试连接会向已保存的服务发送一条短文本，可能产生费用。</p>
    <p id="settings-status" class="status" role="status"></p>
  </div>
  </div>
</aside>
<button id="toggle" type="button" aria-controls="panel" aria-expanded="false">
  <span class="chevron" aria-hidden="true"></span>
  <span class="vertical">学习助手</span>
  <span id="toggle-status" class="vertical"></span>
</button>
<div id="capture" class="capture" role="dialog" aria-modal="true" aria-labelledby="capture-title" tabindex="-1" hidden>
  <div id="capture-outline" class="capture-outline" hidden></div>
  <div class="capture-toolbar">
    <span id="capture-title">拖动框选截图</span>
    <button id="capture-cancel" type="button">取消截图</button>
  </div>
</div>`;

const tabs = ['chat', 'play', 'practice', 'settings'] as const;
const questionTypes = { single: '单选题', multiple: '多选题', judgement: '判断题' };
const playbackStates = { idle: '待命', starting: '启动中', playing: '播放中', paused: '已暂停',
  waiting: '等待操作', ended: '已结束', stopped: '已停止', navigating: '正在进入下一节' };

function contentLabel({ text, media }: { text: string; media: QuestionMedia[] }): string {
  const images = media.filter((item) => item.kind === 'image').length;
  const videos = media.length - images;
  const attachments = [images ? `${images} 张图片` : '', videos ? `${videos} 段视频` : ''].filter(Boolean).join('、');
  return [text, attachments ? `［${attachments}］` : ''].filter(Boolean).join(' ');
}

function visibleOption(question: QuestionSnapshot, index: number): string {
  const option = question.options[index]!;
  if (question.requiresScreenshot) return `第 ${index + 1} 项（按截图从上到下）`;
  return option.media.length ? `第 ${index + 1} 项 ${contentLabel(option)}` : option.text;
}

function clock(time: number): string {
  if (!Number.isFinite(time)) return '—';
  const seconds = Math.max(0, Math.floor(time));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

export class Panel {
  private readonly shadow: ShadowRoot;
  private readonly capture: PageCapture;
  private view?: StudyView;
  private localCollapsed?: boolean;
  private serviceView = '';
  private draft = false;
  private readonly listValues = new Map<string, string>();
  private chatMessages: readonly ChatMessage[] = [];

  constructor(private readonly host: HTMLElement, private readonly session: () => StudySession) {
    this.shadow = host.attachShadow({ mode: 'closed' });
    this.shadow.innerHTML = template;
    this.capture = new PageCapture(this.el('capture'), this.el('capture-outline'), this.el<HTMLButtonElement>('capture-cancel'));
    this.bind();
  }

  private el<T extends HTMLElement = HTMLElement>(id: string): T {
    return this.shadow.getElementById(id) as T;
  }

  private text(id: string, value: string): void {
    const node = this.el(id);
    if (node.textContent !== value) node.textContent = value;
  }

  private list(id: string, values: string[]): void {
    const serialized = JSON.stringify(values);
    if (serialized === this.listValues.get(id)) return;
    this.listValues.set(id, serialized);
    const items = values.map((value) => {
      const element = this.host.ownerDocument.createElement('li');
      element.textContent = value;
      return element;
    });
    this.el(id).replaceChildren(...items);
  }

  private button(id: string, handler: () => void): void { this.el(id).addEventListener('click', handler); }
  private disable(id: string, disabled: boolean): void { this.el<HTMLButtonElement>(id).disabled = disabled; }

  private activateTab(selected: typeof tabs[number]): void {
    if (this.el(`tab-${selected}`).getAttribute('aria-selected') !== 'true') this.el('sidebar-content').scrollTop = 0;
    for (const tab of tabs) {
      const trigger = this.el(`tab-${tab}`);
      trigger.setAttribute('aria-selected', String(tab === selected));
      trigger.tabIndex = tab === selected ? 0 : -1;
      this.el(tab).hidden = tab !== selected;
    }
  }

  private setCollapsed(collapsed: boolean): void {
    if (!this.view) return;
    if (this.view.settings.readOnly) {
      this.localCollapsed = collapsed;
      this.render(this.view);
    } else this.session().setCollapsed(collapsed);
    if (collapsed) this.el('toggle').focus();
    else this.shadow.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus();
  }

  private bind(): void {
    this.button('toggle', () => this.setCollapsed(false));
    this.button('close', () => this.setCollapsed(true));
    this.el('panel').addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      this.setCollapsed(true);
    });
    for (const [index, tab] of tabs.entries()) {
      const trigger = this.el(`tab-${tab}`);
      trigger.addEventListener('click', () => this.activateTab(tab));
      trigger.addEventListener('keydown', (event) => {
        const next = event.key === 'ArrowRight' ? tabs[(index + 1) % tabs.length]
          : event.key === 'ArrowLeft' ? tabs[(index + tabs.length - 1) % tabs.length]
          : event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs[tabs.length - 1] : undefined;
        if (!next) return;
        event.preventDefault();
        this.activateTab(next);
        this.el(`tab-${next}`).focus();
      });
    }
    const chatInput = this.el<HTMLTextAreaElement>('chat-input');
    const chatForm = this.el<HTMLFormElement>('chat-compose');
    chatInput.addEventListener('input', () => this.session().writeChat(chatInput.value));
    chatInput.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || !(event.ctrlKey || event.metaKey) || event.isComposing) return;
      event.preventDefault();
      chatForm.requestSubmit();
    });
    chatForm.addEventListener('submit', (event) => {
      event.preventDefault();
      this.session().sendChat();
    });
    this.button('chat-read', () => { this.session().includeChatQuestion(); chatInput.focus(); });
    this.button('chat-capture', () => this.session().captureChat((signal) => this.capture.run(signal)));
    this.button('chat-remove', () => { this.session().removeChatImage(); chatInput.focus(); });
    this.button('chat-stop', () => { this.session().stopChat(); chatInput.focus(); });
    this.button('chat-clear', () => { this.session().clearChat(); chatInput.focus(); });
    this.button('chat-configure', () => { this.activateTab('settings'); this.el('base').focus(); });
    this.el<HTMLSelectElement>('mode').addEventListener('change', (event) => {
      this.session().setMode((event.target as HTMLSelectElement).value === 'chapter' ? 'chapter' : 'section');
    });
    this.button('start', () => this.session().start());
    this.button('pause', () => this.session().pause());
    this.button('stop', () => this.session().stop());
    this.button('pdf-start', () => this.session().readPdf());
    this.button('pdf-pause', () => this.session().pausePdf());
    this.button('query', () => {
      this.session().prepare();
      if (!this.el('preview').hidden) this.el(this.el('screenshot-input').hidden ? 'send' : 'screenshot-input').focus();
    });
    this.button('query-screenshot', () => {
      this.session().prepare(true);
      if (!this.el('preview').hidden) this.el('screenshot-input').focus();
    });
    const screenshot = this.el<HTMLInputElement>('screenshot-file');
    this.button('pick-screenshot', () => screenshot.click());
    screenshot.addEventListener('change', () => {
      const file = screenshot.files?.[0];
      if (file) this.session().attachScreenshot(file);
      screenshot.value = '';
    });
    this.el('panel').addEventListener('paste', (event) => {
      if (!this.view?.context.screenshotAvailable) return;
      const file = event.clipboardData?.files[0];
      if (!file) return;
      if (!this.el('chat').hidden && !this.view.chat.busy && !this.view.chat.attaching) {
        event.preventDefault();
        this.session().attachChatFile(file);
      } else if (!this.el('practice').hidden && !this.view.practice.busy) {
        event.preventDefault();
        this.session().attachScreenshot(file);
      }
    });
    this.button('send', () => this.session().send());
    const cancel = () => {
      const screenshot = this.view?.practice.review?.screenshotMode || this.el('query').hidden || this.el<HTMLButtonElement>('query').disabled;
      this.session().cancel();
      this.el(screenshot ? 'query-screenshot' : 'query').focus();
    };
    this.button('cancel', cancel);
    this.button('dismiss', cancel);
    this.button('fill', () => this.session().fill());
    this.button('clear', () => {
      this.el<HTMLInputElement>('key').value = '';
      this.el<HTMLInputElement>('remember').checked = false;
      this.session().clearKey();
    });
    this.button('test', () => { void this.session().testService(); });
    const form = this.el<HTMLFormElement>('service');
    form.addEventListener('input', () => { this.draft = true; });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const key = this.el<HTMLInputElement>('key');
      const remember = this.el<HTMLInputElement>('remember');
      if (this.session().saveService({ baseUrl: this.el<HTMLInputElement>('base').value,
        model: this.el<HTMLInputElement>('model').value, key: key.value, remember: remember.checked })) {
        this.draft = false;
        this.serviceView = '';
        key.value = '';
        this.render(this.view);
      }
    });
  }

  render(view?: StudyView): void {
    const wasCapturing = this.view?.chat.capturing;
    this.view = view;
    if (this.host.hidden !== !view) this.host.hidden = !view;
    this.host.toggleAttribute('data-capturing', Boolean(view?.chat.capturing));
    if (!view) return;
    if (!this.host.isConnected) this.host.ownerDocument.body?.append(this.host);
    const { context, playback, reading, practice, chat, settings } = view;
    const collapsed = settings.readOnly ? this.localCollapsed ?? settings.collapsed : settings.collapsed;
    const toggle = this.el('toggle');
    this.el('panel').hidden = collapsed;
    toggle.hidden = !collapsed;
    toggle.setAttribute('aria-expanded', String(!collapsed));
    const status = reading.running ? '阅读中' : practice.busy || chat.busy ? '查询中' : playbackStates[playback.state];
    this.text('toggle-status', status);
    this.text('sidebar-status', status);
    const location = [context.courseName, context.chapterName, context.sectionName].join(' / ');
    if (this.el('location').title !== location) this.el('location').title = location;
    this.text('location', location);
    this.text('position', context.media ? `视频位置 ${clock(playback.time)} / ${clock(playback.duration)}` : '视频位置 —');
    this.text('progress', `学习通完成标记 ${context.progress}`);
    const mode = this.el<HTMLSelectElement>('mode');
    mode.value = settings.mode;
    mode.disabled = settings.readOnly || ['playing', 'starting', 'paused', 'waiting', 'navigating'].includes(playback.state);
    this.text('start', ['paused', 'waiting'].includes(playback.state) ? '继续' : '开始');
    this.disable('start', !playback.canStart || ['playing', 'starting', 'navigating'].includes(playback.state));
    this.disable('pause', !['playing', 'starting'].includes(playback.state));
    this.disable('stop', !['playing', 'starting', 'paused', 'waiting', 'navigating'].includes(playback.state));
    this.text('play-status', playback.message);
    this.el('video-controls').hidden = context.kind === 'pdf' && !context.media;
    this.el('pdf').hidden = !reading.visible;
    this.el('pdf-position').hidden = reading.percent === undefined;
    this.text('pdf-position', reading.percent === undefined ? '' : `PDF 滚动位置 ${reading.percent}%`);
    this.disable('pdf-start', !reading.canStart);
    this.disable('pdf-pause', !reading.running);
    this.text('pdf-status', reading.message);
    this.renderChat(chat, context.screenshotAvailable);
    this.renderPractice(practice, context.screenshotAvailable);
    this.renderSettings(view);
    if (wasCapturing && !chat.capturing && !collapsed && !this.el('chat').hidden) this.el('chat-input').focus();
  }

  private renderChat(chat: StudyView['chat'], screenshotAvailable: boolean): void {
    const input = this.el<HTMLTextAreaElement>('chat-input');
    if (input.value !== chat.draft) input.value = chat.draft;
    input.readOnly = chat.busy;
    this.el('chat-empty').hidden = chat.messages.length > 0;
    this.el('chat-clear').hidden = !chat.messages.length;
    this.el('chat-stop').hidden = !chat.busy;
    this.el('chat-send').hidden = chat.busy;
    this.el('chat-configure').hidden = chat.canSend;
    this.el('chat-capture').hidden = !screenshotAvailable;
    this.el('chat-attachment').hidden = !chat.image || chat.busy;
    const image = this.el<HTMLImageElement>('chat-image');
    if (chat.image && image.getAttribute('src') !== chat.image) image.src = chat.image;
    if (!chat.image && image.hasAttribute('src')) image.removeAttribute('src');
    this.disable('chat-read', chat.busy || chat.attaching);
    this.disable('chat-capture', chat.busy || chat.attaching);
    this.disable('chat-clear', chat.attaching);
    this.disable('chat-send', !chat.canSend || chat.busy || chat.attaching || (!chat.draft.trim() && !chat.image));
    this.text('chat-destination', chat.canSend ? `将发送至 ${chat.origin}` : '请配置 AI 服务后发送。');
    this.text('chat-status', chat.status);
    this.renderChatMessages(chat.messages);
  }

  private renderChatMessages(messages: readonly ChatMessage[]): void {
    let shared = 0;
    while (shared < messages.length && messages[shared] === this.chatMessages[shared]) shared++;
    if (shared === messages.length && shared === this.chatMessages.length) return;
    const list = this.el('chat-messages');
    while (list.children.length > shared) list.lastElementChild?.remove();
    const document = this.host.ownerDocument;
    for (const message of messages.slice(shared)) {
      const item = document.createElement('li');
      const label = document.createElement('p');
      const body = document.createElement('p');
      item.dataset.role = message.role;
      label.className = 'message-label';
      label.textContent = message.role === 'user' ? '你' : 'AI';
      body.textContent = message.text;
      item.append(label, body);
      if (message.image) {
        const img = document.createElement('img');
        img.alt = '已发送的截图';
        img.src = message.image;
        item.append(img);
      }
      list.append(item);
    }
    this.chatMessages = messages;
    const thread = this.el('chat-thread');
    thread.scrollTop = thread.scrollHeight;
  }

  private renderPractice(practice: StudyView['practice'], screenshotAvailable: boolean): void {
    const current = 'snapshot' in practice.question ? practice.question.snapshot : undefined;
    this.text('question-type', current ? questionTypes[current.type] : '当前题目');
    this.text('stem', current?.requiresScreenshot ? '页面文字使用特殊字体。可截图查询这道题。'
      : current ? contentLabel(current.stem) : ('reason' in practice.question ? practice.question.reason : ''));
    this.text('query', current && (practice.suggestion || practice.message) ? '重新查询' : '查询答案');
    this.el('query').hidden = Boolean(current?.requiresScreenshot);
    this.disable('query', !current || practice.busy || Boolean(practice.review));
    this.el('query-screenshot').hidden = !screenshotAvailable;
    this.disable('query-screenshot', practice.busy || Boolean(practice.review?.screenshotMode));
    this.el('screenshot-hint').hidden = !screenshotAvailable || Boolean(practice.review?.screenshotMode) || practice.busy;
    this.el('cancel').hidden = !practice.busy;
    this.el('fill').hidden = !practice.canFill;
    this.text('practice-status', practice.message);
    const review = practice.review;
    this.el('preview').hidden = !review;
    this.text('destination', review?.config.origin ?? '');
    const screenshotMode = Boolean(review?.screenshotMode);
    this.text('send-stem', review?.question && !screenshotMode ? contentLabel(review.question.stem) : '');
    this.list('send-options', screenshotMode ? [] : review?.question?.options.map(contentLabel) ?? []);
    this.el('screenshot-input').hidden = !screenshotMode;
    this.text('screenshot-guide', '按 Ctrl+V 粘贴截图，或选择图片文件。请只截一道题，保留完整题干和全部选项。');
    this.el('screenshot-loading').hidden = !practice.loadingScreenshot;
    this.text('pick-screenshot', review?.screenshot ? '更换截图' : '选择截图文件');
    const preview = this.el<HTMLImageElement>('screenshot-preview');
    preview.hidden = !review?.screenshot;
    if (review?.screenshot && preview.getAttribute('src') !== review.screenshot) preview.src = review.screenshot;
    if (!review?.screenshot && preview.hasAttribute('src')) preview.removeAttribute('src');
    this.disable('send', screenshotMode && !review?.screenshot);
    const media = review?.question && !screenshotMode ? [review.question.stem, ...review.question.options].flatMap((item) => item.media) : [];
    this.el('send-media').hidden = !screenshotMode && !media.length;
    this.text('send-media', screenshotMode ? '截图查询需要支持图片输入的模型。' : media.some((item) => item.kind === 'video')
      ? '将随文字发送题目图片及每段视频的 3 张静帧。视频音频不发送。请使用支持图片输入的模型。'
      : '将随文字发送题目图片。请使用支持图片输入的模型。');
    const suggestion = practice.suggestion;
    this.el('suggestion').hidden = !suggestion;
    this.list('suggested-options', suggestion && 'answer' in suggestion ? [suggestion.answer]
      : current?.options.flatMap(({ id }, index) => suggestion?.optionIds.includes(id) ? [visibleOption(current, index)] : []) ?? []);
    this.text('explanation', suggestion?.explanation ?? '');
    const selected = current?.options.flatMap(({ id }, index) =>
      practice.filled?.includes(id) ? [visibleOption(current, index)] : []) ?? [];
    this.text('filled', practice.filled ? `读回的选择 ${selected.join('、') || '无'}` : '');
  }

  private renderSettings(view: StudyView): void {
    const { settings } = view;
    const key = this.el<HTMLInputElement>('key');
    const remember = this.el<HTMLInputElement>('remember');
    const marker = JSON.stringify([settings.baseUrl, settings.model, settings.remembered]);
    if (!this.draft && marker !== this.serviceView) {
      this.serviceView = marker;
      this.el<HTMLInputElement>('base').value = settings.baseUrl;
      this.el<HTMLInputElement>('model').value = settings.model;
      key.value = '';
      remember.checked = settings.remembered;
    }
    key.placeholder = settings.hasKey ? '••••••••' : '';
    this.text('key-state', settings.remembered ? '已记住此服务的密钥。' : settings.hasKey ? '此服务的密钥仅存于当前页面会话。' : '当前服务未配置密钥。');
    this.text('warning', settings.warning);
    this.text('settings-status', view.settingsMessage);
    for (const id of ['base', 'model', 'key', 'remember', 'save']) this.disable(id, settings.readOnly);
    this.disable('test', settings.readOnly || view.checking);
  }
}
