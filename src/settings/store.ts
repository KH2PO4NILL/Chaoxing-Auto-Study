export type PlaybackMode = 'section' | 'chapter';

export interface Storage {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
  remove(key: string): void;
}

export const settingsKey = 'study.settings';
export const credentialKey = 'study.credential';
const schemaVersion = 1;

interface Preferences {
  schemaVersion: number;
  mode: PlaybackMode;
  collapsed: boolean;
  baseUrl: string;
  model: string;
}

export interface SettingsView extends Preferences {
  warning: string;
  readOnly: boolean;
  hasKey: boolean;
  remembered: boolean;
  origin: string;
}

interface Credential {
  origin: string;
  key: string;
}

export interface ServiceInput {
  baseUrl: string;
  model: string;
  key: string;
  remember: boolean;
}

export interface ServiceConfig {
  baseUrl: string;
  origin: string;
  model: string;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

export function normalizeBaseUrl(value: string): string {
  const url = new URL(value.trim());
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('请填写无账户、查询参数或片段的 HTTPS API 基础地址。');
  }
  const path = url.pathname.replace(/\/+$/, '').replace(/(?:\/chat\/completions)+$/, '');
  return `${url.origin}${path}`;
}

function readPreferences(raw: unknown) {
  const value = record(raw);
  const readOnly = typeof value.schemaVersion === 'number' && value.schemaVersion > schemaVersion;
  let warning = readOnly ? '设置来自较新版本，请升级脚本后再修改。' : '';
  const legacy = value.schemaVersion === 0 || value.schemaVersion === undefined;
  const mode = value.mode ?? (legacy ? value.playbackMode : undefined);
  const collapsed = value.collapsed ?? (legacy ? value.panelCollapsed : undefined);
  const address = value.baseUrl ?? (legacy ? value.apiBaseUrl : undefined);
  let baseUrl = '';
  let invalidAddress = false;
  if (typeof address === 'string' && address.trim()) {
    try { baseUrl = normalizeBaseUrl(address); } catch { invalidAddress = true; }
  }
  const invalid = (raw !== undefined && Object.keys(value).length === 0)
    || (mode !== undefined && mode !== 'section' && mode !== 'chapter')
    || (collapsed !== undefined && typeof collapsed !== 'boolean')
    || (address !== undefined && typeof address !== 'string') || invalidAddress
    || (value.model !== undefined && typeof value.model !== 'string')
    || (!legacy && value.schemaVersion !== schemaVersion && !readOnly);
  if (invalid && !warning) warning = '部分旧设置无法读取，请检查播放偏好和服务配置。';
  const preferences: Preferences = {
    schemaVersion,
    mode: mode === 'chapter' ? 'chapter' : 'section',
    collapsed: typeof collapsed === 'boolean' ? collapsed : true,
    baseUrl,
    model: typeof value.model === 'string' ? value.model.trim() : '',
  };
  return { preferences, readOnly, warning };
}

export class Settings {
  private preferences: Preferences;
  private readOnly: boolean;
  private warning: string;
  private temporary?: Credential;

  constructor(private readonly storage: Storage) {
    const raw = storage.get(settingsKey);
    const { preferences, readOnly, warning } = readPreferences(raw);
    this.preferences = preferences;
    this.readOnly = readOnly;
    this.warning = warning;
    if (raw !== undefined && !readOnly && !warning && record(raw).schemaVersion !== schemaVersion) {
      storage.set(settingsKey, preferences);
    }
  }

  private get origin(): string {
    return this.preferences.baseUrl ? new URL(this.preferences.baseUrl).origin : '';
  }

  private storedCredential(): Credential | undefined {
    const value = record(this.storage.get(credentialKey));
    if (this.origin && value.origin === this.origin && typeof value.key === 'string' && value.key.trim()) {
      return { origin: this.origin, key: value.key };
    }
  }

  view(): SettingsView {
    const remembered = Boolean(this.storedCredential());
    return { ...this.preferences, readOnly: this.readOnly, warning: this.warning,
      hasKey: this.temporary?.origin === this.origin || remembered, remembered, origin: this.origin };
  }

  setPlaybackMode(mode: PlaybackMode): void {
    this.updatePreferences({ mode });
  }

  setCollapsed(collapsed: boolean): void {
    this.updatePreferences({ collapsed });
  }

  private updatePreferences(changes: Partial<Preferences>): void {
    if (this.readOnly) return;
    const next = { ...this.preferences, ...changes };
    this.storage.set(settingsKey, next);
    this.preferences = next;
  }

  refresh(key: string): boolean {
    if (key === credentialKey) return true;
    const old = this.preferences;
    const oldOrigin = this.origin;
    const oldReadOnly = this.readOnly;
    const next = readPreferences(this.storage.get(settingsKey));
    this.preferences = next.preferences;
    this.readOnly = next.readOnly;
    this.warning = next.warning;
    if (oldOrigin !== this.origin) this.temporary = undefined;
    return old.baseUrl !== next.preferences.baseUrl || old.model !== next.preferences.model || oldReadOnly !== this.readOnly;
  }

  saveService(input: ServiceInput): void {
    if (this.readOnly) throw new Error(this.warning);
    let baseUrl: string;
    try { baseUrl = normalizeBaseUrl(input.baseUrl); } catch {
      throw new Error('请检查 HTTPS API 基础地址，填写服务所需的版本前缀。');
    }
    const model = input.model.trim();
    if (!model) throw new Error('请填写模型名称。');
    const origin = new URL(baseUrl).origin;
    const key = input.key.trim() || (origin === this.origin ? this.keyFor(origin) : undefined);
    if (key && /[^\x21-\x7e]/.test(key)) throw new Error('请检查密钥，密钥应为无空格的 ASCII 字符。');
    if (!key || !input.remember || origin !== this.origin) this.storage.remove(credentialKey);
    this.updatePreferences({ baseUrl, model });
    this.temporary = key && !input.remember ? { origin, key } : undefined;
    if (key && input.remember) this.storage.set(credentialKey, { origin, key });
    this.warning = '';
  }

  clearKey(): void {
    this.storage.remove(credentialKey);
    this.temporary = undefined;
  }

  service(): ServiceConfig | undefined {
    if (this.readOnly || !this.origin || !this.preferences.model) return undefined;
    return { baseUrl: this.preferences.baseUrl, origin: this.origin, model: this.preferences.model };
  }

  keyFor(origin: string): string | undefined {
    if (!origin || origin !== this.origin || this.readOnly) return undefined;
    return this.temporary?.origin === origin ? this.temporary.key : this.storedCredential()?.key;
  }
}
