(() => {
  if (window.AtlasRecentlyViewed) { window.AtlasRecentlyViewed.init(document); return; }
  const key = 'atlas:recently-viewed:v1';
  const lifetime = 30 * 24 * 60 * 60 * 1000;
  const states = new Map();
  let privacyReady;
  const allowed = () => {
    try { return window.Shopify?.customerPrivacy?.preferencesProcessingAllowed() === true; }
    catch { return false; }
  };
  const loadPrivacy = () => {
    if (window.Shopify?.customerPrivacy) return Promise.resolve();
    if (!window.Shopify?.loadFeatures) return Promise.resolve();
    if (!privacyReady) privacyReady = new Promise((resolve) => {
      try { window.Shopify.loadFeatures([{ name: 'consent-tracking-api', version: '0.1' }], () => resolve()); }
      catch { resolve(); }
    });
    return privacyReady.finally(() => { if (!window.Shopify?.customerPrivacy) privacyReady = undefined; });
  };
  const validHandle = (value) => typeof value === 'string' && value.length > 0 && value.length <= 255 && !/[\s/?#\\]/u.test(value) && value !== '.' && value !== '..';
  const history = () => {
    try {
      const stored = JSON.parse(localStorage.getItem(key) || '[]');
      if (!Array.isArray(stored)) return [];
      const now = Date.now();
      const seen = new Set();
      return stored.filter((entry) => entry && validHandle(entry.handle) && Number.isFinite(entry.viewedAt) && entry.viewedAt <= now && now - entry.viewedAt < lifetime).sort((a, b) => b.viewedAt - a.viewedAt).filter((entry) => { if (seen.has(entry.handle)) return false; seen.add(entry.handle); return true; }).slice(0, 20);
    } catch { return []; }
  };
  const purge = () => { try { localStorage.removeItem(key); } catch {} };
  const markViewed = (items, handle) => {
    if (!validHandle(handle)) return;
    try { localStorage.setItem(key, JSON.stringify([{ handle, viewedAt: Date.now() }, ...items.filter((entry) => entry.handle !== handle)].slice(0, 20))); } catch {}
  };
  const uniqueCardIds = (card, prefix) => {
    const identifiers = new Map();
    if (card.id) identifiers.set(card.id, `${prefix}-${card.id}`);
    card.querySelectorAll('[id]').forEach((node) => identifiers.set(node.id, `${prefix}-${node.id}`));
    for (const node of [card, ...card.querySelectorAll('*')]) {
      if (node.id) node.id = identifiers.get(node.id);
      for (const attribute of ['for', 'form', 'aria-labelledby', 'aria-describedby', 'aria-controls']) {
        if (node.hasAttribute(attribute)) node.setAttribute(attribute, node.getAttribute(attribute).split(/\s+/).map((value) => identifiers.get(value) || value).join(' '));
      }
    }
  };
  const initialize = (element) => {
    if (states.has(element)) return;
    const track = element.querySelector('[data-carousel-track]');
    if (!track) return;
    if (element.dataset.designMode === 'true') { element.hidden = false; return; }
    let generation = 0;
    let request;
    let disposed = false;
    const clearDisplay = () => {
      request?.abort();
      generation += 1;
      track.replaceChildren();
      element.hidden = true;
      element.removeAttribute('aria-busy');
      const clear = element.querySelector('[data-recent-clear]');
      if (clear) clear.hidden = true;
    };
    const refresh = async (consentEvent) => {
      clearDisplay();
      const activeGeneration = generation;
      await loadPrivacy();
      if (disposed || generation !== activeGeneration) return;
      if (consentEvent?.detail?.preferencesAllowed === false || !allowed()) { if (window.Shopify?.customerPrivacy) purge(); return; }
      const items = history();
      markViewed(items, element.dataset.currentHandle);
      const limit = Math.min(10, Math.max(2, Number(element.dataset.limit) || 8));
      const handles = items.filter((entry) => entry.handle !== element.dataset.currentHandle).slice(0, limit).map((entry) => entry.handle);
      if (!handles.length) return;
      const controller = new AbortController();
      request = controller;
      element.setAttribute('aria-busy', 'true');
      const cards = new Array(handles.length);
      let nextIndex = 0;
      const worker = async () => {
        while (!controller.signal.aborted && nextIndex < handles.length) {
          const index = nextIndex++;
          const root = (element.dataset.root || '/').replace(/\/?$/, '/');
          const url = new URL(`${root}products/${encodeURIComponent(handles[index])}`, location.origin);
          url.searchParams.set('section_id', 'recently-viewed');
          try {
            const response = await fetch(url, { signal: controller.signal, credentials: 'same-origin', headers: { Accept: 'text/html' } });
            if (!response.ok) continue;
            const html = new DOMParser().parseFromString(await response.text(), 'text/html');
            const source = html.querySelector('template[data-recent-product-card]')?.content.querySelector('.product-card');
            if (!source) continue;
            const card = document.importNode(source, true);
            uniqueCardIds(card, track.id || 'Recent');
            const cell = document.createElement('div');
            cell.className = 'atlas-carousel-cell';
            cell.append(card);
            cards[index] = cell;
          } catch (error) { if (error.name === 'AbortError') return; }
        }
      };
      await Promise.all(Array.from({ length: Math.min(4, handles.length) }, worker));
      if (disposed || controller.signal.aborted || generation !== activeGeneration || !allowed()) return;
      const availableCards = cards.filter(Boolean);
      track.replaceChildren(...availableCards);
      element.hidden = availableCards.length === 0;
      element.removeAttribute('aria-busy');
      const clear = element.querySelector('[data-recent-clear]');
      if (clear) clear.hidden = availableCards.length === 0;
      element.dispatchEvent(new CustomEvent('atlas:products-rendered', { bubbles: true }));
      window.AtlasProductCarousel?.init(element);
    };
    const clear = (event) => {
      if (!event.target.closest('[data-recent-clear]')) return;
      purge();
      for (const state of states.values()) state.clearDisplay();
    };
    element.addEventListener('click', clear);
    document.addEventListener('visitorConsentCollected', refresh);
    states.set(element, { clearDisplay, dispose: () => { disposed = true; clearDisplay(); element.removeEventListener('click', clear); document.removeEventListener('visitorConsentCollected', refresh); states.delete(element); } });
    refresh();
  };
  const init = (root = document) => [...(root.matches?.('[data-recently-viewed]') ? [root] : []), ...root.querySelectorAll('[data-recently-viewed]')].forEach(initialize);
  window.AtlasRecentlyViewed = { init };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => init(), { once: true });
  else init();
  document.addEventListener('shopify:section:load', (event) => init(event.target));
  document.addEventListener('shopify:section:unload', (event) => { for (const [element, state] of states) if (event.target.contains(element)) state.dispose(); });
})();
