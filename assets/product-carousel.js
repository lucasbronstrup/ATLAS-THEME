(() => {
  if (window.AtlasProductCarousel) { window.AtlasProductCarousel.init(document); return; }
  const states = new Map();
  const find = (root) => [...(root.matches?.('[data-product-carousel]') ? [root] : []), ...root.querySelectorAll('[data-product-carousel]')];
  const attach = (element) => {
    const track = element.querySelector('[data-carousel-track]');
    if (!track) return;
    if (states.get(element)?.track === track) { states.get(element).update(); return; }
    states.get(element)?.dispose();
    const previous = element.querySelector('[data-carousel-prev]');
    const next = element.querySelector('[data-carousel-next]');
    const controls = element.querySelector('[data-carousel-controls]');
    const status = element.querySelector('[data-carousel-status]');
    let frame = 0;
    const direction = () => getComputedStyle(track).direction === 'rtl' ? -1 : 1;
    const maximum = () => Math.max(0, track.scrollWidth - track.clientWidth);
    const position = () => Math.min(maximum(), Math.max(0, track.scrollLeft * direction()));
    const behavior = () => matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    const update = () => {
      frame = 0;
      const max = maximum();
      const current = position();
      if (previous) previous.disabled = current <= 2;
      if (next) next.disabled = max - current <= 2;
      if (controls) controls.hidden = max <= 2;
      if (status) {
        const cards = [...track.children];
        const step = cards.length > 1 ? Math.abs(cards[1].offsetLeft - cards[0].offsetLeft) : track.clientWidth;
        const index = Math.min(cards.length, Math.floor((current + 2) / Math.max(1, step)) + 1);
        status.textContent = (element.dataset.carouselStatusFormat || '{current} / {total}').replace('{current}', String(cards.length ? index : 0)).replace('{total}', String(cards.length));
      }
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    const scrollTo = (value) => track.scrollTo({ left: Math.min(maximum(), Math.max(0, value)) * direction(), behavior: behavior() });
    const click = (event) => {
      if (event.target.closest('[data-carousel-prev]')) scrollTo(position() - track.clientWidth);
      if (event.target.closest('[data-carousel-next]')) scrollTo(position() + track.clientWidth);
    };
    const keyboard = (event) => {
      if (event.target !== track || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      if (event.key === 'Home') scrollTo(0);
      else if (event.key === 'End') scrollTo(maximum());
      else scrollTo(position() + (event.key === 'ArrowRight' ? 1 : -1) * direction() * track.clientWidth);
    };
    element.addEventListener('click', click);
    track.addEventListener('keydown', keyboard);
    track.addEventListener('scroll', schedule, { passive: true });
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
    observer?.observe(track);
    if (!observer) window.addEventListener('resize', schedule);
    const dispose = () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', schedule);
      element.removeEventListener('click', click);
      track.removeEventListener('keydown', keyboard);
      track.removeEventListener('scroll', schedule);
      states.delete(element);
    };
    states.set(element, { track, dispose, update });
    update();
  };
  const init = (root = document) => find(root).forEach(attach);
  window.AtlasProductCarousel = { init };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => init(), { once: true });
  else init();
  document.addEventListener('atlas:products-rendered', (event) => init(event.target));
  document.addEventListener('shopify:section:load', (event) => init(event.target));
  document.addEventListener('shopify:section:unload', (event) => { for (const [element, state] of states) if (event.target.contains(element)) state.dispose(); });
})();
