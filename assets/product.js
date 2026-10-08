(() => {
  const initializeProduct = (product) => {
    if (product.dataset.productInitialized) return;
    product.dataset.productInitialized = 'true';
    let activeRequest;
    let pickupRequest;
    let stickyObserver;
    let lastChangedInput;
    const gallery = product.querySelector('[data-product-gallery]');
    if (gallery) gallery.classList.add('is-enhanced');
    const models = product.querySelector('[data-product-models]');
    if (models && window.Shopify?.loadFeatures) {
      const setupXR = () => {
        if (!window.ShopifyXR) { document.addEventListener('shopify_xr_initialized', setupXR, { once: true }); return; }
        window.ShopifyXR.addModels(JSON.parse(models.textContent));
        window.ShopifyXR.setupXRElements();
      };
      window.Shopify.loadFeatures([
        { name: 'shopify-xr', version: '1.0', onLoad: setupXR },
        { name: 'model-viewer-ui', version: '1.0', onLoad: (error) => { if (!error && window.Shopify.ModelViewerUI) product.querySelectorAll('model-viewer').forEach((model) => { model.atlasViewer = new window.Shopify.ModelViewerUI(model); }); } }
      ]);
    }
    const activateMedia = (mediaId) => {
      if (!mediaId || !gallery) return;
      const selected = gallery.querySelector(`[data-product-media="${CSS.escape(mediaId)}"]`);
      if (!selected) return;
      gallery.querySelectorAll('[data-product-media]').forEach((item) => {
        const isActive = item === selected;
        if (!isActive && item.classList.contains('is-active')) {
          item.querySelectorAll('video').forEach((video) => video.pause());
          item.querySelectorAll('iframe').forEach((iframe) => { iframe.src = iframe.src; });
          item.querySelectorAll('model-viewer').forEach((model) => { model.atlasViewer?.pause(); model.pause?.(); });
        }
        item.classList.toggle('is-active', isActive);
      });
      gallery.querySelectorAll('[data-media-target]').forEach((button) => button.setAttribute('aria-current', String(button.dataset.mediaTarget === mediaId)));
      const thumbnail = gallery.querySelector(`[data-media-target="${CSS.escape(mediaId)}"]`);
      const strip = gallery.querySelector('[data-media-thumbnails]');
      if (thumbnail && strip) {
        const itemRect = thumbnail.getBoundingClientRect();
        const stripRect = strip.getBoundingClientRect();
        if (itemRect.left < stripRect.left) strip.scrollBy({ left: itemRect.left - stripRect.left, behavior: 'instant' });
        else if (itemRect.right > stripRect.right) strip.scrollBy({ left: itemRect.right - stripRect.right, behavior: 'instant' });
      }
    };
    const updateSticky = () => {
      const sticky = product.querySelector('[data-sticky-purchase]');
      const purchase = product.querySelector('[data-purchase-region]');
      if (!sticky || !purchase) return;
      const purchaseRect = purchase.getBoundingClientRect();
      sticky.hidden = !(purchaseRect.bottom < 0);
    };
    const observePurchase = () => {
      stickyObserver?.disconnect();
      const purchase = product.querySelector('[data-purchase-region]');
      if (purchase && product.querySelector('[data-sticky-purchase]')) {
        stickyObserver = new IntersectionObserver(updateSticky, { threshold: 0 });
        stickyObserver.observe(purchase);
        updateSticky();
      }
    };
    const updatePickup = async () => {
      pickupRequest?.abort();
      const container = product.querySelector('[data-pickup-container]');
      const variantId = product.dataset.variantId;
      if (!container || !variantId) return;
      const controller = new AbortController();
      pickupRequest = controller;
      try {
        const root = container.dataset.root || '/';
        const response = await fetch(`${root.replace(/\/?$/, '/')}variants/${encodeURIComponent(variantId)}/?section_id=pickup-availability`, { signal: controller.signal });
        if (!response.ok) return;
        const html = new DOMParser().parseFromString(await response.text(), 'text/html');
        if (pickupRequest !== controller) return;
        const content = html.querySelector('[data-pickup-content]');
        if (content && variantId === product.dataset.variantId) container.innerHTML = content.innerHTML;
      } catch { }
    };
    const updateVariant = async (target) => {
      lastChangedInput = target;
      const optionValues = [...product.querySelectorAll('[data-option-input]:checked, [data-option-select]')].map((input) => input.value).filter(Boolean);
      const linkedUrl = target.matches('[data-option-select]') ? target.selectedOptions[0]?.dataset.productUrl : target.dataset.productUrl;
      const currentUrl = new URL(product.dataset.productUrl, location.origin);
      const nextUrl = new URL(linkedUrl || currentUrl, location.origin);
      if (nextUrl.pathname !== currentUrl.pathname) {
        nextUrl.searchParams.set('option_values', optionValues.join(','));
        location.assign(nextUrl.href);
        return;
      }
      nextUrl.searchParams.set('section_id', product.dataset.sectionId);
      if (optionValues.length) nextUrl.searchParams.set('option_values', optionValues.join(','));
      else if (product.dataset.variantId) nextUrl.searchParams.set('variant', product.dataset.variantId);
      const sellingPlan = product.querySelector('[data-selling-plan]')?.value;
      if (sellingPlan) nextUrl.searchParams.set('selling_plan', sellingPlan);
      activeRequest?.abort();
      const controller = new AbortController();
      activeRequest = controller;
      const quantity = product.querySelector('[name="quantity"]')?.value;
      const focusId = target.id;
      const optionIndex = [...product.querySelectorAll('[data-option-select]')].indexOf(target);
      const purchase = product.querySelector('[data-purchase-region]');
      product.querySelectorAll('[data-variant-error], [data-retry-variant]').forEach((element) => { element.hidden = true; });
      if (purchase) purchase.inert = true;
      product.setAttribute('aria-busy', 'true');
      product.querySelectorAll('[data-add-button], [data-sticky-submit]').forEach((button) => { button.disabled = true; });
      try {
        const response = await fetch(nextUrl.href, { signal: controller.signal, headers: { 'X-Requested-With': 'XMLHttpRequest' } });
        if (!response.ok) throw new Error('Product update failed');
        const html = new DOMParser().parseFromString(await response.text(), 'text/html');
        if (activeRequest !== controller) return;
        const nextProduct = html.querySelector('[data-atlas-product]');
        if (!nextProduct) throw new Error('Product section not found');
        product.querySelectorAll('[data-variant-region]').forEach((region) => {
          const nextRegion = nextProduct.querySelector(`[data-variant-region="${CSS.escape(region.dataset.variantRegion)}"]`);
          if (nextRegion) region.replaceWith(document.importNode(nextRegion, true));
        });
        product.dataset.variantId = nextProduct.dataset.variantId || '';
        product.dataset.featuredMedia = nextProduct.dataset.featuredMedia || '';
        const quantityInput = product.querySelector('[name="quantity"]');
        if (quantityInput && quantity) {
          const minimum = Number(quantityInput.min) || 1;
          const maximum = quantityInput.max ? Number(quantityInput.max) : Infinity;
          const step = Number(quantityInput.step) || 1;
          const boundedQuantity = Math.min(Number(quantity) || minimum, maximum);
          quantityInput.value = String(minimum + Math.max(0, Math.floor((boundedQuantity - minimum) / step)) * step);
        }
        const pageUrl = new URL(location.href);
        pageUrl.searchParams.delete('option_values');
        if (product.dataset.variantId) pageUrl.searchParams.set('variant', product.dataset.variantId);
        else { pageUrl.searchParams.delete('variant'); pageUrl.searchParams.set('option_values', optionValues.join(',')); }
        if (sellingPlan && product.querySelector('[data-selling-plan]')?.value === sellingPlan) pageUrl.searchParams.set('selling_plan', sellingPlan);
        else pageUrl.searchParams.delete('selling_plan');
        history.replaceState({}, '', pageUrl.href);
        const focused = focusId ? product.querySelector(`#${CSS.escape(focusId)}`) : product.querySelectorAll('[data-option-select]')[optionIndex];
        focused?.focus({ preventScroll: true });
        activateMedia(product.dataset.featuredMedia);
        observePurchase();
        updatePickup();
        window.Shopify?.PaymentButton?.init();
        const status = product.querySelector('[data-variant-status]');
        if (status) status.textContent = product.querySelector('.product-pricing')?.textContent.trim() || '';
        product.dispatchEvent(new CustomEvent('atlas:variant-change', { bubbles: true, detail: { variantId: product.dataset.variantId } }));
      } catch (error) {
        if (error.name === 'AbortError') return;
        const variantInput = product.querySelector('input[name="id"]');
        if (variantInput) variantInput.disabled = true;
        const errorElement = product.querySelector('[data-variant-error]');
        if (errorElement) { errorElement.textContent = product.dataset.updateError; errorElement.hidden = false; }
        const retryButton = product.querySelector('[data-retry-variant]');
        if (retryButton) retryButton.hidden = false;
        product.querySelector('.product-form__express')?.setAttribute('hidden', '');
      } finally {
        if (activeRequest === controller) {
          product.removeAttribute('aria-busy');
          const currentPurchase = product.querySelector('[data-purchase-region]');
          if (currentPurchase) currentPurchase.inert = false;
        }
      }
    };
    product.addEventListener('change', (event) => {
      if (event.target.matches('[data-option-input], [data-option-select], [data-selling-plan]')) updateVariant(event.target);
    });
    product.addEventListener('click', async (event) => {
      if (event.target.closest('[data-retry-variant]')) {
        const input = lastChangedInput?.isConnected ? lastChangedInput : product.querySelector('[data-option-input]:checked, [data-option-select], [data-selling-plan]');
        if (input) updateVariant(input);
      }
      const thumbnail = event.target.closest('[data-media-target]');
      if (thumbnail) activateMedia(thumbnail.dataset.mediaTarget);
      const quantityButton = event.target.closest('[data-product-quantity-step]');
      if (quantityButton) {
        const input = quantityButton.closest('.product-quantity')?.querySelector('input');
        if (input) { if (!input.value) input.value = input.min || '1'; Number(quantityButton.dataset.productQuantityStep) > 0 ? input.stepUp() : input.stepDown(); input.dispatchEvent(new Event('change', { bubbles: true })); }
      }
      const stickyButton = event.target.closest('[data-sticky-submit]');
      if (stickyButton) {
        const form = product.querySelector('[data-product-form]');
        const button = form?.querySelector('[data-add-button]');
        if (form && button && !button.disabled) form.requestSubmit(button);
      }
      const zoomButton = event.target.closest('[data-media-zoom]');
      const dialog = product.querySelector('[data-image-dialog]');
      if (zoomButton && dialog?.showModal) {
        const image = dialog.querySelector('[data-zoom-image]');
        image.src = zoomButton.dataset.imageUrl;
        image.alt = zoomButton.dataset.imageAlt || '';
        dialog.showModal();
      }
      if (event.target.closest('[data-close-image]') || event.target === dialog) dialog?.close();
      const share = event.target.closest('[data-share-product]');
      if (share) {
        const status = product.querySelector('[data-share-status]');
        const url = new URL(location.href);
        url.searchParams.delete('section_id');
        try {
          if (navigator.share) await navigator.share({ title: share.dataset.shareTitle, url: url.href });
          else if (navigator.clipboard) { await navigator.clipboard.writeText(url.href); if (status) status.textContent = share.dataset.shareSuccess; }
          else if (status) status.textContent = url.href;
        } catch (error) { if (error.name !== 'AbortError' && status) status.textContent = url.href; }
      }
    });
    product.addEventListener('keydown', (event) => {
      const thumbnail = event.target.closest('[data-media-target]');
      if (!thumbnail || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      const thumbnails = [...gallery.querySelectorAll('[data-media-target]')];
      let index = thumbnails.indexOf(thumbnail);
      if (event.key === 'Home') index = 0;
      else if (event.key === 'End') index = thumbnails.length - 1;
      else index = (index + (event.key === 'ArrowRight' ? 1 : -1) + thumbnails.length) % thumbnails.length;
      event.preventDefault();
      thumbnails[index].focus({ preventScroll: true });
      activateMedia(thumbnails[index].dataset.mediaTarget);
    });
    observePurchase();
    updatePickup();
    document.addEventListener('shopify:section:unload', (event) => {
      if (event.target.contains(product)) { activeRequest?.abort(); pickupRequest?.abort(); stickyObserver?.disconnect(); }
    });
  };
  const initializeRecommendations = async (recommendations) => {
    if (recommendations.dataset.loaded) return;
    recommendations.dataset.loaded = 'true';
    try {
      const response = await fetch(recommendations.dataset.url);
      if (!response.ok) return;
      const html = new DOMParser().parseFromString(await response.text(), 'text/html');
      const updated = html.querySelector('[data-product-recommendations]');
      if (updated && !updated.hidden && updated.querySelector('.product-card')) {
        recommendations.innerHTML = updated.innerHTML;
        recommendations.hidden = false;
        recommendations.dispatchEvent(new CustomEvent('atlas:products-rendered', { bubbles: true }));
        window.AtlasProductCarousel?.init(recommendations);
      }
    } catch { if (!window.Shopify?.designMode) recommendations.hidden = true; }
  };
  const initialize = (root = document) => {
    root.querySelectorAll('[data-atlas-product]').forEach(initializeProduct);
    root.querySelectorAll('[data-product-recommendations]').forEach(initializeRecommendations);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => initialize(), { once: true });
  else initialize();
  document.addEventListener('shopify:section:load', (event) => initialize(event.target));
})();
