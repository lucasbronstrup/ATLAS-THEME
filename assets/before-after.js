(() => {
  if (window.AtlasBeforeAfter) { window.AtlasBeforeAfter.init(document); return; }
  const states = new Map();
  const initialize = (element) => {
    if (states.has(element)) return;
    const input = element.querySelector('[data-comparison-input]');
    const output = element.parentElement.querySelector('[data-comparison-output]');
    if (!input) return;
    const update = () => {
      const number = Number(input.value);
      const value = Math.min(100, Math.max(0, Number.isFinite(number) ? number : 50));
      element.style.setProperty('--before-after-position', `${value}%`);
      input.setAttribute('aria-valuetext', `${value}% ${element.dataset.beforeLabel || ''}, ${100 - value}% ${element.dataset.afterLabel || ''}`);
      if (output) output.textContent = `${value}%`;
    };
    input.addEventListener('input', update);
    input.addEventListener('change', update);
    states.set(element, () => { input.removeEventListener('input', update); input.removeEventListener('change', update); states.delete(element); });
    update();
  };
  const init = (root = document) => [...(root.matches?.('[data-before-after]') ? [root] : []), ...root.querySelectorAll('[data-before-after]')].forEach(initialize);
  window.AtlasBeforeAfter = { init };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => init(), { once: true });
  else init();
  document.addEventListener('shopify:section:load', (event) => init(event.target));
  document.addEventListener('shopify:section:unload', (event) => { for (const [element, dispose] of states) if (event.target.contains(element)) dispose(); });
})();
