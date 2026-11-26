import { AiClient } from './ai/client';
import { Chaoxing } from './platform/chaoxing/adapter';
import { studyUrl } from './platform/chaoxing/dom';
import { StudySession } from './session/study';
import { credentialKey, Settings, settingsKey } from './settings/store';
import { Panel } from './ui/panel';

declare const GM_getValue: (key: string) => unknown;
declare const GM_setValue: (key: string, value: unknown) => void;
declare const GM_deleteValue: (key: string) => void;
declare const GM_addValueChangeListener: (key: string, callback: (key: string, oldValue: unknown, newValue: unknown, remote: boolean) => void) => number;
declare const GM_removeValueChangeListener: (id: number) => void;

const hostId = 'chaoxing-auto-study-host';

if (window.top === window && studyUrl(new URL(window.location.href)) && !document.getElementById(hostId)) {
  const host = document.createElement('div');
  host.id = hostId;
  host.hidden = true;
  document.body.append(host);
  const settings = new Settings({ get: GM_getValue, set: GM_setValue, remove: GM_deleteValue });
  const page = new Chaoxing(window);
  const client = new AiClient(settings, window.fetch.bind(window));
  const panel = new Panel(host, () => session);
  const session = new StudySession(window, page, settings, client, (view) => panel.render(view));
  let subscriptions: number[] = [];
  const mount = () => {
    subscriptions = [settingsKey, credentialKey].map((key) => GM_addValueChangeListener(key, (changed, _old, _new, remote) => {
      if (remote) session.storageChanged(changed);
    }));
    session.mount();
  };
  window.addEventListener('pagehide', () => {
    session.suspend();
    subscriptions.forEach(GM_removeValueChangeListener);
    subscriptions = [];
  });
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
      settings.refresh(settingsKey);
      mount();
    }
  });
  mount();
}
