import { expect, test } from '@playwright/test';
import { AiClient } from '../src/ai/client';
import { credentialKey, settingsKey, Settings } from '../src/settings/store';

function store(initial: Record<string, unknown> = {}) {
  const values = new Map(Object.entries(initial));
  return { values, get: (key: string) => values.get(key), set: (key: string, value: unknown) => { values.set(key, value); },
    remove: (key: string) => { values.delete(key); } };
}

test('A6 · timeout aborts the transport and a subsequent connection test succeeds', async () => {
  const settings = new Settings(store());
  settings.saveService({ baseUrl: 'https://host.example/v1', model: 'demo', key: 'sample', remember: false });
  let call = 0;
  let requestSignal: AbortSignal | null | undefined;
  const client = new AiClient(settings, async (_url, options) => {
    requestSignal = options?.signal;
    if (++call === 1) return new Promise<Response>((_, reject) => {
      requestSignal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    });
    return Response.json({ choices: [{ message: { content: 'OK' } }] });
  }, 30);
  const config = settings.service()!;
  await expect(client.test(config, new AbortController().signal)).rejects.toMatchObject({ kind: 'timeout' });
  expect(requestSignal?.aborted).toBe(true);
  await expect(client.test(config, new AbortController().signal)).resolves.toBeUndefined();
});

test('A7 · invalid legacy fields preserve valid preferences, and future settings stay untouched', () => {
  const legacy = store({ [settingsKey]: { schemaVersion: 0, playbackMode: 'chapter', panelCollapsed: false,
    apiBaseUrl: 'http://insecure.example', model: ' demo ' } });
  const migrated = new Settings(legacy);
  expect(migrated.view()).toMatchObject({ mode: 'chapter', collapsed: false, baseUrl: '', model: 'demo' });
  expect(migrated.view().warning).toContain('无法读取');
  const futureConfig = { schemaVersion: 99, mode: 'chapter', collapsed: false, extras: ['keep'] };
  const futureStorage = store({ [settingsKey]: futureConfig });
  const future = new Settings(futureStorage);
  future.setPlaybackMode('section');
  future.setCollapsed(true);
  expect(future.view()).toMatchObject({ mode: 'chapter', collapsed: false, readOnly: true });
  expect(futureStorage.get(settingsKey)).toEqual(futureConfig);
});

test('A7 · temporary credentials are not stored, and a change of port clears the old binding', () => {
  const storage = store();
  const settings = new Settings(storage);
  settings.saveService({ baseUrl: 'https://host.example/v1', model: 'demo', key: 'first-key', remember: true });
  expect(settings.keyFor('https://host.example')).toBe('first-key');
  settings.saveService({ baseUrl: 'https://host.example:8443/v1', model: 'demo', key: '', remember: false });
  expect(settings.keyFor('https://host.example:8443')).toBeUndefined();
  expect(settings.keyFor('https://host.example')).toBeUndefined();
  settings.saveService({ baseUrl: 'https://host.example:8443/v1', model: 'demo', key: 'new-key', remember: false });
  expect(settings.keyFor('https://host.example:8443')).toBe('new-key');
  expect(storage.get(credentialKey)).toBeUndefined();
  expect(new Settings(storage).view().hasKey).toBe(false);
});
