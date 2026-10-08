(() => {
  document.documentElement.classList.replace('no-js','js');
  const configElement=document.getElementById('AtlasConfig');
  if(!configElement)return;
  const config=JSON.parse(configElement.textContent);
  const status=document.getElementById('AtlasStatus');
  let cartQueue=Promise.resolve();
  let previousFocus;
  const say=message=>{if(status)status.textContent=message;};
  const drawer=()=>document.getElementById('CartDrawer');
  function openCart(opener){const dialog=drawer();if(!dialog)return false;if(!dialog.open){previousFocus=opener||document.activeElement;dialog.showModal();}dialog.querySelector('[data-cart-close]')?.focus();return true;}
  function closeCart(){drawer()?.close();previousFocus?.focus();}
  function closeMenu(){const panel=document.getElementById('MobileMenu');if(!panel)return;if(panel.tagName==='DIALOG'){if(panel.open)panel.close();}else panel.hidden=true;const toggle=document.querySelector('[data-mobile-menu]');toggle?.setAttribute('aria-expanded','false');toggle?.focus();}
  function toggleMenu(toggle){const panel=document.getElementById(toggle.getAttribute('aria-controls'));if(!panel)return;if(panel.tagName==='DIALOG'){if(panel.open){closeMenu();return;}panel.showModal();panel.querySelector('[data-mobile-menu-close]')?.focus();}else panel.hidden=!panel.hidden;toggle.setAttribute('aria-expanded',String(panel.tagName==='DIALOG'?panel.open:!panel.hidden));}
  async function request(url,options={}){const response=await fetch(url,{...options,headers:{Accept:'application/json',...options.headers}});let data;try{data=await response.json();}catch{throw new Error(config.strings.error);}if(!response.ok)throw new Error(data.description||data.message||config.strings.error);return data;}
  async function refreshCart(result={}){
    const focused=document.activeElement;
    const focusContext=focused?.closest('dialog,[data-main-cart]');
    const focusKey=focused?.dataset.lineKey;
    const focusWasQuantity=focused?.matches('[data-cart-change]');
    let sections=result.sections||{};
    const main=document.querySelector('[data-main-cart]');
    const mainId=main?.dataset.sectionId;
    const ids=[...(drawer()?['cart-drawer']:[]),...(mainId?[mainId]:[])];
    const missing=ids.filter(id=>!sections[id]);
    if(missing.length){try{const url=new URL(location.href);url.searchParams.set('sections',missing.join(','));sections={...sections,...await request(url.toString())};}catch{}}
    if(sections['cart-drawer']&&drawer()){
      const parsed=new DOMParser().parseFromString(sections['cart-drawer'],'text/html');
      const next=parsed.getElementById('CartDrawer');
      if(next)drawer().innerHTML=next.innerHTML;
    }
    if(mainId&&sections[mainId]){
      const parsed=new DOMParser().parseFromString(sections[mainId],'text/html');
      const next=parsed.querySelector('[data-main-cart]');
      if(next)main.replaceWith(next);
    }
    const cart=await request(config.cart+'.js');
    document.querySelectorAll('[data-cart-count]').forEach(el=>el.textContent=cart.item_count);
    if(focusContext){
      const context=focusContext.id==='CartDrawer'?drawer():document.querySelector('[data-main-cart]');
      const sameLine=focusKey?context?.querySelector(`${focusWasQuantity?'[data-cart-change]':'[data-remove-line]'}[data-line-key="${CSS.escape(focusKey)}"]`):null;
      const nextFocus=sameLine||context?.querySelector('[data-cart-close],a,button,input');
      nextFocus?.focus({preventScroll:true});
    }
    document.dispatchEvent(new CustomEvent('atlas:cart-updated',{detail:{cart}}));
    return ids.length===0||!drawer()||Boolean(sections['cart-drawer']);
  }
  function enqueue(task){cartQueue=cartQueue.then(task,task);return cartQueue;}
  document.addEventListener('submit',event=>{
    const cartForm=event.target.closest('#CartDrawerForm,[data-main-cart] form');
    if(cartForm&&!cartForm.matches('[data-product-form]')&&event.submitter?.name!=='checkout'){const field=document.activeElement;if(field?.matches('[data-cart-change]')&&cartForm.contains(field)){event.preventDefault();field.dispatchEvent(new Event('change',{bubbles:true}));}return;}
    const form=event.target.closest('[data-product-form]');
    if(!form||!config.drawer||!drawer()||event.submitter?.name==='checkout')return;
    if(!form.reportValidity())return;
    event.preventDefault();
    const button=event.submitter||form.querySelector('[data-add-button]');
    if(button?.disabled)return;
    const opener=drawer()?.contains(form)?null:(button||document.activeElement);
    const error=form.querySelector('[data-form-error]');
    if(error){error.hidden=true;error.textContent='';}
    button?.setAttribute('aria-busy','true');
    if(button)button.disabled=true;
    const formData=new FormData(form);
    formData.append('sections','cart-drawer');formData.append('sections_url',location.pathname);
    enqueue(async()=>{
      let added=false;
      try{
        const result=await request(config.cartAdd,{method:'POST',body:formData});added=true;
        const ready=await refreshCart(result);say(config.strings.added);
        if(ready)openCart(opener);else location.assign(config.cart);
      }catch(err){
        if(added){location.assign(config.cart);return;}
        if(error){error.hidden=false;error.textContent=err.message;error.setAttribute('role','alert');}
        say(err.message);
      }finally{if(button){button.disabled=false;button.removeAttribute('aria-busy');}}
    });
  });
  document.addEventListener('click',event=>{
    const cartLink=event.target.closest('[data-cart-open]');
    if(cartLink&&config.drawer&&drawer()){event.preventDefault();openCart();}
    if(event.target.closest('[data-cart-close]'))closeCart();
    if(event.target===drawer()){const rect=drawer().getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)closeCart();}
    const menu=event.target.closest('[data-mobile-menu]');
    if(menu)toggleMenu(menu);
    if(event.target.closest('[data-mobile-menu-close]'))closeMenu();
    const mobilePanel=document.getElementById('MobileMenu');if(event.target===mobilePanel&&mobilePanel?.open){const rect=mobilePanel.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)closeMenu();}
    const remove=event.target.closest('[data-remove-line]');
    if(remove){event.preventDefault();if(remove.dataset.busy)return;remove.dataset.busy='true';changeLine(remove.dataset.lineKey||remove.dataset.removeLine,0,remove);}
    const quantity=event.target.closest('[data-quantity-step]');
    if(quantity){const input=quantity.parentElement.querySelector('input[type=number]');if(input){quantity.dataset.quantityStep==='minus'?input.stepDown():input.stepUp();input.dispatchEvent(new Event('change',{bubbles:true}));}}
    const details=event.target.closest('.mega-nav');
    document.querySelectorAll('.mega-nav[open]').forEach(el=>{if(el!==details)el.open=false;});
  });
  async function changeLine(key,quantity,source){
    if(!key||!Number.isFinite(quantity)||quantity<0)return;
    const inDrawer=source.closest('dialog')?.id==='CartDrawer';
    if(source.dataset.pendingQuantity===String(quantity))return;
    source.dataset.pendingQuantity=String(quantity);
    const isField=source.matches('input');
    if(isField){source.readOnly=true;source.setAttribute('aria-busy','true');}else source.setAttribute('aria-disabled','true');
    enqueue(async()=>{
      try{await request(config.cartChange,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:key,quantity,sections:['cart-drawer',document.querySelector('[data-main-cart]')?.dataset.sectionId].filter(Boolean),sections_url:location.pathname})}).then(refreshCart);say(config.strings.updated);}
      catch(err){say(err.message);try{await refreshCart();}catch{}const context=inDrawer?drawer():document.querySelector('[data-main-cart]');const error=context?.querySelector('[data-cart-error]');if(error){error.hidden=false;error.textContent=err.message;error.setAttribute('role','alert');}}
      finally{if(isField){source.readOnly=false;source.removeAttribute('aria-busy');}else source.removeAttribute('aria-disabled');delete source.dataset.busy;delete source.dataset.pendingQuantity;}
    });
  }
  document.addEventListener('change',event=>{
    const input=event.target;
    if(input.matches('[data-search-type]'))input.closest('form')?.querySelector('[data-predictive-input]')?.dispatchEvent(new Event('input',{bubbles:true}));
    if(input.matches('[data-cart-change]'))changeLine(input.dataset.lineKey,Number(input.value),input);
    if(input.matches('[data-cart-note]')){const note=input.value;enqueue(async()=>{try{await request(config.cartUpdate,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({note})});}catch(err){say(err.message);}});}
  });
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'){
      document.querySelectorAll('.mega-nav[open]').forEach(el=>el.open=false);
      const panel=document.getElementById('MobileMenu');if(panel&&(panel.open||panel.tagName!=='DIALOG'&&!panel.hidden))closeMenu();
      const openResults=document.activeElement?.closest('[data-predictive-container]');if(openResults)openResults.closest('form')?.querySelector('[data-predictive-input]')?.focus();
      document.querySelectorAll('[data-predictive-container]').forEach(el=>el.hidden=true);
      document.querySelectorAll('[data-predictive-input]').forEach(el=>el.setAttribute('aria-expanded','false'));
    }
  });
  const searches=new WeakMap();
  document.addEventListener('input',event=>{
    const input=event.target.closest('[data-predictive-input]');
    if(!input||!config.predictive)return;
    const panel=input.closest('form')?.querySelector('[data-predictive-container]');
    if(!panel)return;
    const previous=searches.get(input);clearTimeout(previous?.timer);previous?.controller?.abort();
    const query=input.value.trim();if(query.length<2){panel.hidden=true;input.setAttribute('aria-expanded','false');return;}
    const state={controller:new AbortController()};searches.set(input,state);
    state.timer=setTimeout(async()=>{
      try{const url=new URL(config.search,location.origin);url.searchParams.set('q',query);url.searchParams.set('resources[type]',input.closest('form')?.querySelector('[data-search-type]')?.value||'product,collection,page,article');url.searchParams.set('resources[limit]','6');url.searchParams.set('section_id','predictive-search');
        const response=await fetch(url,{signal:state.controller.signal});if(!response.ok)throw new Error('Search');const html=await response.text();if(input.value.trim()!==query)return;panel.innerHTML=html;panel.hidden=false;input.setAttribute('aria-expanded','true');
      }catch(err){if(err.name!=='AbortError'){panel.hidden=true;input.setAttribute('aria-expanded','false');}}
    },220);
  });
  document.addEventListener('keydown',event=>{
    const input=event.target.closest('[data-predictive-input]');
    if(input&&event.key==='ArrowDown'){const panel=input.closest('form')?.querySelector('[data-predictive-container]');if(panel&&!panel.hidden){event.preventDefault();panel.querySelector('a')?.focus();}}
    const panel=event.target.closest('[data-predictive-container]');
    if(panel&&(event.key==='ArrowDown'||event.key==='ArrowUp')){const links=[...panel.querySelectorAll('a')];const index=links.indexOf(event.target.closest('a'));event.preventDefault();if(event.key==='ArrowUp'&&index===0)panel.closest('form').querySelector('[data-predictive-input]').focus();else links[(index+(event.key==='ArrowDown'?1:-1)+links.length)%links.length]?.focus();}
  });
  document.addEventListener('click',event=>{if(!event.target.closest('[data-search-form]'))document.querySelectorAll('[data-predictive-container]').forEach(el=>{el.hidden=true;el.closest('form')?.querySelector('[data-predictive-input]')?.setAttribute('aria-expanded','false');});});
  const timers=new WeakMap();
  function init(root=document){
    const mobilePanel=document.getElementById('MobileMenu');if(mobilePanel&&!mobilePanel.dataset.observed){mobilePanel.dataset.observed='true';mobilePanel.addEventListener('close',()=>{const toggle=document.querySelector('[data-mobile-menu]');toggle?.setAttribute('aria-expanded','false');toggle?.focus();});}
    const header=document.querySelector('[data-header]');if(header&&!header.dataset.observed){header.dataset.observed='true';new ResizeObserver(()=>document.documentElement.style.setProperty('--header-height',header.getBoundingClientRect().height+'px')).observe(header);}
    root.querySelectorAll('[data-slideshow]').forEach(section=>{
      if(section.dataset.initialized)return;section.dataset.initialized='true';const track=section.querySelector('.hero-track');
      const move=direction=>track.scrollBy({left:track.clientWidth*direction*(getComputedStyle(track).direction==='rtl'?-1:1),behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
      section.querySelector('[data-slide-prev]')?.addEventListener('click',()=>move(-1));section.querySelector('[data-slide-next]')?.addEventListener('click',()=>move(1));
      track.addEventListener('scroll',()=>{const index=Math.round(Math.abs(track.scrollLeft)/track.clientWidth)+1;const count=track.children.length;const state=section.querySelector('[data-slide-status]');if(state)state.textContent=`${index} / ${count}`;const prev=section.querySelector('[data-slide-prev]');const next=section.querySelector('[data-slide-next]');if(prev)prev.disabled=index===1;if(next)next.disabled=index===count;},{passive:true});
    });
    root.querySelectorAll('[data-countdown]').forEach(el=>{
      if(timers.has(el))return;const deadline=Date.parse(el.dataset.countdown);if(!Number.isFinite(deadline)){el.hidden=true;return;}
      const tick=()=>{if(!el.isConnected){clearInterval(timers.get(el));return;}const delta=Math.max(0,deadline-Date.now());if(!delta){el.textContent=el.dataset.expired;clearInterval(timers.get(el));return;}const days=Math.floor(delta/86400000),hours=Math.floor(delta/3600000)%24,minutes=Math.floor(delta/60000)%60,seconds=Math.floor(delta/1000)%60;el.querySelector('[data-countdown-value]').textContent=`${days}d ${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`;};timers.set(el,setInterval(tick,1000));tick();
    });
  }
  document.addEventListener('shopify:section:load',event=>init(event.target));
  document.addEventListener('shopify:section:unload',event=>event.target.querySelectorAll('[data-countdown]').forEach(el=>clearInterval(timers.get(el))));
  document.addEventListener('shopify:block:select',event=>{const slide=event.target.closest('.hero');if(slide)slide.scrollIntoView({behavior:'instant',block:'nearest',inline:'start'});const details=event.target.closest('details');if(details){if(details.matches('.mega-nav'))document.querySelectorAll('.mega-nav[open]').forEach(el=>{if(el!==details)el.open=false;});details.open=true;}});
  document.addEventListener('shopify:block:deselect',event=>{const details=event.target.closest('details.mega-nav');if(details)details.open=false;});
  document.addEventListener('shopify:section:select',event=>{if(event.target.querySelector('#CartDrawer'))openCart();});
  document.addEventListener('shopify:section:deselect',event=>{if(event.target.querySelector('#CartDrawer'))drawer()?.close();});
  drawer()?.addEventListener('close',()=>previousFocus?.focus());
  init();
})();
