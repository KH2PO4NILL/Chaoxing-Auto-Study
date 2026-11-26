import type { StudySession, StudyView } from '../session/study';

const template = `
<style>
  :host { all: initial; color-scheme: light; position: fixed; z-index: 2147483647; right: 16px; bottom: 16px; font: 14px/1.5 system-ui, sans-serif; color: #172533; }
  :host([hidden]), [hidden] { display: none !important; }
  *, *::before, *::after { box-sizing: border-box; }
  button, input, select { font: inherit; }
  button, select, input:not([type=checkbox]) { border: 1px solid #b9c7d5; border-radius: 6px; color: #172533; background: #fff; padding: 6px 9px; }
  button { cursor: pointer; }
  button:disabled { color: #5b6977; background: #ecf0f4; cursor: default; }
  button:not(:disabled):hover { border-color: #275d74; }
  :focus-visible { outline: 3px solid #1b718f; outline-offset: 2px; }
  .primary:not(:disabled), #toggle { background: #1c526a; color: #fff; border-color: #1c526a; }
  #toggle { display: block; margin-left: auto; padding: 8px 13px; }
  .panel { width: min(370px, calc(100vw - 32px)); max-height: min(620px, calc(100vh - 82px)); overflow: auto; margin-bottom: 8px; padding: 16px; background: #fff; border: 1px solid #b9c7d5; border-radius: 12px; box-shadow: 0 8px 35px #16273833; }
  h2 { font-size: 17px; margin: 0 0 5px; }
  h3 { font-size: 14px; margin: 10px 0 4px; }
  p { margin: 7px 0; }
  .secondary { color: #506273; font-size: 13px; }
  .tabs, .actions { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
  .tabs { border-bottom: 1px solid #d6e0e8; margin: 12px 0; padding-bottom: 8px; }
  [aria-selected=true] { color: #164f67; background: #e4f1f7; border-color: #6b9fb2; }
  .status, #preview, #suggestion { background: #f0f5f8; padding: 9px; border-radius: 6px; overflow-wrap: anywhere; }
  .status:empty { display: none; }
  #preview, #suggestion { margin-top: 10px; }
  #preview p, #suggestion p { white-space: pre-wrap; }
  #preview ol, #suggestion ul { margin: 6px 0; padding-left: 24px; }
  label.field { display: block; margin-bottom: 10px; }
  label.field input { display: block; margin-top: 3px; width: 100%; }
  #stem, #location { overflow-wrap: anywhere; }
  #stem { max-height: 8em; overflow: auto; }
  select { margin-left: 6px; max-width: 100%; }
</style>
<section id="panel" class="panel" aria-labelledby="name" hidden>
  <h2 id="name">超级超星 · 学习助手</h2>
  <p id="location" class="secondary"></p>
  <div class="tabs" role="tablist" aria-label="助手功能">
    <button id="tab-play" role="tab" aria-controls="play" aria-selected="true">播放</button>
    <button id="tab-practice" role="tab" aria-controls="practice" aria-selected="false" tabindex="-1">练习</button>
    <button id="tab-settings" role="tab" aria-controls="settings" aria-selected="false" tabindex="-1">设置</button>
  </div>
  <div id="play" role="tabpanel" aria-labelledby="tab-play">
    <p id="position"></p><p id="progress" class="secondary"></p>
    <p><label>播放模式<select id="mode"><option value="section">仅本节</option><option value="chapter">连续播放本章</option></select></label></p>
    <div class="actions"><button id="start" class="primary">开始</button><button id="pause">暂停</button><button id="stop">停止</button></div>
    <p id="play-status" class="status" role="status"></p>
  </div>
  <div id="practice" role="tabpanel" aria-labelledby="tab-practice" hidden>
    <h3 id="question-type"></h3><p id="stem"></p>
    <div class="actions"><button id="query" class="primary">查询答案</button><button id="cancel" hidden>取消查询</button><button id="fill" hidden>填入本题</button></div>
    <p id="practice-status" class="status" role="status"></p>
    <section id="preview" aria-labelledby="preview-heading" hidden>
      <h3 id="preview-heading">确认发送给模型</h3>
      <p id="destination"></p><p id="send-stem"></p><ol id="send-options"></ol>
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
</section>
<button id="toggle" aria-controls="panel" aria-expanded="false">学习助手</button>`;

const tabs = ['play', 'practice', 'settings'] as const;
const questionTypes = { single: '单选题', multiple: '多选题', judgement: '判断题' };
const playbackStates = { idle: '待命', starting: '启动中', playing: '播放中', paused: '已暂停',
  waiting: '等待操作', ended: '已结束', stopped: '已停止', navigating: '正在进入下一节' };

function clock(time: number): string {
  if (!Number.isFinite(time)) return '—';
  const seconds = Math.max(0, Math.floor(time));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

export class Panel {
  private readonly shadow: ShadowRoot;
  private view?: StudyView;
  private localCollapsed?: boolean;
  private serviceView = '';
  private draft = false;
  private readonly listValues = new Map<string, string>();

  constructor(private readonly host: HTMLElement, private readonly session: () => StudySession) {
    this.shadow = host.attachShadow({ mode: 'closed' });
    this.shadow.innerHTML = template;
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
    for (const tab of tabs) {
      const trigger = this.el(`tab-${tab}`);
      trigger.setAttribute('aria-selected', String(tab === selected));
      trigger.tabIndex = tab === selected ? 0 : -1;
      this.el(tab).hidden = tab !== selected;
    }
  }

  private bind(): void {
    this.button('toggle', () => {
      if (!this.view) return;
      const value = !this.el('panel').hidden;
      if (this.view.settings.readOnly) {
        this.localCollapsed = value;
        this.render(this.view);
      } else this.session().setCollapsed(value);
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
    this.el<HTMLSelectElement>('mode').addEventListener('change', (event) => {
      this.session().setMode((event.target as HTMLSelectElement).value === 'chapter' ? 'chapter' : 'section');
    });
    this.button('start', () => this.session().start());
    this.button('pause', () => this.session().pause());
    this.button('stop', () => this.session().stop());
    this.button('query', () => {
      this.session().prepare();
      if (!this.el('preview').hidden) this.el('send').focus();
    });
    this.button('send', () => this.session().send());
    this.button('cancel', () => { this.session().cancel(); this.el('query').focus(); });
    this.button('dismiss', () => { this.session().cancel(); this.el('query').focus(); });
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
    this.view = view;
    if (this.host.hidden !== !view) this.host.hidden = !view;
    if (!view) return;
    if (!this.host.isConnected) this.host.ownerDocument.body?.append(this.host);
    const { context, playback, practice, settings } = view;
    const collapsed = settings.readOnly ? this.localCollapsed ?? settings.collapsed : settings.collapsed;
    this.el('panel').hidden = collapsed;
    this.el('toggle').setAttribute('aria-expanded', String(!collapsed));
    this.text('toggle', `学习助手 · ${playbackStates[playback.state]}`);
    this.text('location', [context.courseName, context.chapterName, context.sectionName].join(' / '));
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
    this.renderPractice(practice);
    this.renderSettings(view);
  }

  private renderPractice(practice: StudyView['practice']): void {
    const current = 'snapshot' in practice.question ? practice.question.snapshot : undefined;
    this.text('question-type', current ? questionTypes[current.type] : '当前题目');
    this.text('stem', current?.stem ?? ('reason' in practice.question ? practice.question.reason : ''));
    this.text('query', practice.suggestion || practice.message ? '重新查询' : '查询答案');
    this.disable('query', !current || practice.busy || Boolean(practice.review));
    this.el('cancel').hidden = !practice.busy;
    this.el('fill').hidden = !practice.canFill;
    this.text('practice-status', practice.message);
    const review = practice.review;
    this.el('preview').hidden = !review;
    this.text('destination', review?.config.origin ?? '');
    this.text('send-stem', review?.question.stem ?? '');
    this.list('send-options', review?.question.options.map(({ text }) => text) ?? []);
    const suggestion = practice.suggestion;
    this.el('suggestion').hidden = !suggestion;
    this.list('suggested-options', current?.options.filter(({ id }) => suggestion?.optionIds.includes(id)).map(({ text }) => text) ?? []);
    this.text('explanation', suggestion?.explanation ?? '');
    const selected = current?.options.filter(({ id }) => practice.filled?.includes(id)).map(({ text }) => text) ?? [];
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
