/* Shared by the website and Cart Studio: one interruptible spatial selector. */
(() => {
  function init(root, selector, key) {
    if (!root || root.classList.contains('slot-selector')) return;
    const links = [...root.querySelectorAll(selector)];
    if (!links.length) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const surface = document.createElement('span');
    surface.className = 'selector-surface';
    surface.setAttribute('aria-hidden', 'true');
    root.classList.add('slot-selector');
    links.forEach(link => link.classList.add('selector-link'));
    root.prepend(surface);
    let hovered = null;
    const visible = link => link && link.getBoundingClientRect().height > 0;
    function geometry(rect) {
      for (const name of ['x','y','width','height']) surface.style.setProperty(`--selector-${name}`, `${rect[name]}px`);
    }
    function place() {
      const focus = links.find(link => link.contains(document.activeElement));
      const active = links.find(link => visible(link) && (link.matches('[aria-current="page"],.md-nav__link--active') || link.closest('.md-tabs__item--active')));
      const target = [hovered, focus, active].find(visible);
      surface.style.opacity = target ? '1' : '0';
      if (!target) return;
      const box = root.getBoundingClientRect(), rect = target.getBoundingClientRect();
      geometry({x:rect.left-box.left+root.scrollLeft,y:rect.top-box.top+root.scrollTop,width:rect.width,height:rect.height});
    }
    function remember() {
      if (!key || surface.style.opacity !== '1') return;
      const box = root.getBoundingClientRect(), rect = surface.getBoundingClientRect();
      try { sessionStorage.setItem(key, JSON.stringify({x:rect.left-box.left+root.scrollLeft,y:rect.top-box.top+root.scrollTop,width:rect.width,height:rect.height})); } catch {}
    }
    place();
    if (!reduced.matches && key) {
      try {
        const previous = JSON.parse(sessionStorage.getItem(key));
        if (previous && Object.values(previous).every(Number.isFinite) && previous.width > 0 && previous.height > 0 && previous.x >= 0 && previous.y >= 0 && previous.x+previous.width <= root.clientWidth+2 && previous.y+previous.height <= root.scrollHeight+2) geometry(previous);
      } catch {}
    }
    requestAnimationFrame(() => {
      root.setAttribute('data-selector-ready', '');
      requestAnimationFrame(place);
    });
    root.addEventListener('pointerover', event => { hovered = links.find(link => link.contains(event.target)) || null; place(); });
    root.addEventListener('pointerleave', () => { hovered = null; place(); });
    root.addEventListener('focusin', place);
    root.addEventListener('focusout', () => requestAnimationFrame(place));
    root.addEventListener('click', remember);
    window.addEventListener('pagehide', remember);
    window.addEventListener('pageshow', place);
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(place).observe(root);
    else window.addEventListener('resize', place);
    document.fonts?.ready.then(place);
    reduced.addEventListener('change', place);
  }
  function start() {
    const header = document.querySelector('.md-header,.mast');
    if (header) {
      const measure = () => {
        const height = `${header.getBoundingClientRect().height}px`;
        document.documentElement.style.setProperty('--site-header-height', height);
        if (header.classList.contains('mast')) document.documentElement.style.setProperty('--mast-h', height);
      };
      measure();
      if (typeof ResizeObserver !== 'undefined') new ResizeObserver(measure).observe(header);
      else window.addEventListener('resize', measure);
    }
    init(document.querySelector('.mast-tabs'), 'a.md-tabs__link', 'slot-header-selector');
    init(document.querySelector('.mast-links'), 'a', 'slot-header-selector');
    init(document.querySelector('.md-sidebar--primary .md-nav--primary'), 'a.md-nav__link[href]', 'slot-guide-selector');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once:true});
  else start();
})();
