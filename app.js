/* ==========================================================================
   CHIMYON — app.js
   Full-screen frame navigation with cinematic transitions + a deliberate
   pause between frames (trackpad inertia can't skip several frames at once).
   ========================================================================== */
(function () {
  'use strict';

  var root = document.documentElement;
  if (typeof gsap === 'undefined') { root.classList.remove('js'); return; }

  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine = matchMedia('(hover:hover) and (pointer:fine)').matches;

  var DUR = reduce ? 0.01 : 1.35;     // transition length (s)
  var PAUSE = reduce ? 0 : 650;       // rest after each transition (ms)
  var GESTURE_GAP = 220;              // ms of silence that starts a new wheel gesture
  var WHEEL_THRESHOLD = 34;
  var SWIPE_THRESHOLD = 48;

  var panels = [].slice.call(document.querySelectorAll('.panel'));
  var N = panels.length;
  var cur = 0, busy = true, needFresh = false, lastWheel = 0, wheelAcc = 0;

  /* ---------------- helpers ---------------- */
  function $(s, c) { return (c || document).querySelector(s); }
  function $$(s, c) { return [].slice.call((c || document).querySelectorAll(s)); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  /* ---------------- pager + counter ---------------- */
  var pager = $('#pager');
  panels.forEach(function (p, i) {
    var b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-label', p.dataset.title);
    b.innerHTML = '<span>' + pad(i + 1) + ' ' + p.dataset.title + '</span>';
    b.addEventListener('click', function () { go(i); });
    pager.appendChild(b);
  });
  $('#counterTotal').textContent = pad(N);
  var counter = $('#counter');

  function syncUI(i) {
    $$('.pager button').forEach(function (b, k) { b.classList.toggle('is-active', k === i); });
    $$('.nav a').forEach(function (a) { a.classList.toggle('is-active', +a.dataset.go === i); });
    $('#counterCur').textContent = pad(i + 1);
    counter.style.setProperty('--p', (i + 1) / N);
    var id = panels[i].id;
    if (history.replaceState) history.replaceState(null, '', i === 0 ? location.pathname : '#' + id);
  }

  /* ---------------- per-panel entrance animations ---------------- */
  function resetPanel(p) {
    gsap.killTweensOf($$('[data-a], [data-a] *', p));
    $$('[data-a="up"]', p).forEach(function (el) { gsap.set(el, { opacity: 0, y: 36 }); });
    $$('[data-a="fade"]', p).forEach(function (el) { gsap.set(el, { opacity: 0 }); });
    $$('[data-a="line"] .line > span', p).forEach(function (el) { gsap.set(el, { yPercent: 110 }); });
    $$('[data-a="img"]', p).forEach(function (el) {
      gsap.set(el, { clipPath: 'inset(100% 0% 0% 0%)' });
      gsap.set($('img', el), { scale: 1.25 });
    });
    $$('[data-count]', p).forEach(function (el) { el.textContent = '0'; });
    $$('[data-scramble]', p).forEach(function (el) { el.textContent = ' '; });
  }

  function enterPanel(p, delay) {
    var tl = gsap.timeline({ delay: delay || 0 });
    var lines = $$('[data-a="line"] .line > span', p);
    var imgs = $$('[data-a="img"]', p);
    var ups = $$('[data-a="up"]', p);
    var fades = $$('[data-a="fade"]', p);

    if (lines.length) tl.to(lines, { yPercent: 0, duration: 1.3, stagger: 0.1, ease: 'expo.out' }, 0);
    if (imgs.length) {
      tl.to(imgs, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.4, stagger: 0.09, ease: 'expo.inOut' }, 0.05);
      tl.to(imgs.map(function (el) { return $('img', el); }), { scale: 1, duration: 1.9, stagger: 0.09, ease: 'expo.out' }, 0.05);
    }
    if (ups.length) tl.to(ups, { opacity: 1, y: 0, duration: 1.1, stagger: 0.06, ease: 'expo.out' }, 0.15);
    if (fades.length) tl.to(fades, { opacity: 1, duration: 1.2, ease: 'power2.out' }, 0.5);

    $$('[data-count]', p).forEach(function (el) {
      var o = { v: 0 }, n = +el.dataset.count;
      tl.to(o, { v: n, duration: 2, ease: 'power3.out', onUpdate: function () { el.textContent = Math.round(o.v); } }, 0.3);
    });
    $$('[data-scramble]', p).forEach(function (el) { tl.add(function () { scramble(el); }, 0.05); });

    var hook = scenes[p.id];
    if (hook && hook.enter) hook.enter(tl);
    return tl;
  }

  function scramble(el) {
    var target = el.dataset.scramble;
    var chars = 'АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЩЭЮЯØ#%&';
    var o = { v: 0 };
    gsap.to(o, {
      v: 1, duration: 1.5, ease: 'power2.out',
      onUpdate: function () {
        var k = Math.floor(o.v * target.length), s = target.slice(0, k);
        for (var i = k; i < target.length; i++) {
          s += target[i] === ' ' ? ' ' : (Math.random() < 0.35 + o.v ? chars[(Math.random() * chars.length) | 0] : '');
        }
        el.textContent = s || ' ';
      },
      onComplete: function () { el.textContent = target; }
    });
  }

  /* ---------------- scene-specific hooks ---------------- */
  var gl = null;
  var scenes = {
    arrival: {
      enter: function (tl) {
        var m = $('#arrivalMedia');
        tl.fromTo(m, { clipPath: 'inset(16% 20% 16% 20% round 18px)' }, { clipPath: 'inset(0% 0% 0% 0% round 0px)', duration: 1.7, ease: 'expo.inOut' }, 0);
        tl.fromTo($('img', m), { scale: 1.35 }, { scale: 1.04, duration: 2.2, ease: 'expo.out' }, 0);
      },
      reset: function () {
        var m = $('#arrivalMedia');
        gsap.set(m, { clipPath: 'inset(16% 20% 16% 20% round 18px)' });
        gsap.set($('img', m), { scale: 1.35 });
      }
    }
  };

  /* ---------------- the transition ---------------- */
  function go(i, instant) {
    if (i < 0 || i >= N || i === cur) return;
    if (busy && !instant) return;
    closeMenu();
    busy = true; needFresh = true; wheelAcc = 0;

    var from = panels[cur], to = panels[i], dir = i > cur ? 1 : -1;
    var fromInner = $('.panel__inner', from), toInner = $('.panel__inner', to);
    var fromShade = $('.panel__shade', from);

    resetPanel(to);
    if (scenes[to.id] && scenes[to.id].reset) scenes[to.id].reset();
    toInner.scrollTop = 0;
    syncUI(i);

    if (instant || reduce) {
      from.classList.remove('is-active');
      to.classList.add('is-active');
      gsap.set([from, to], { clearProps: 'clipPath,transform' });
      if (gl) gl.u.progress = i === 0 ? 0 : 1;
      cur = i;
      enterPanel(to, 0);
      setTimeout(function () { busy = false; }, PAUSE);
      return;
    }

    to.classList.add('is-next');
    var tl = gsap.timeline({
      defaults: { ease: 'expo.inOut', duration: DUR },
      onComplete: function () {
        from.classList.remove('is-active');
        to.classList.remove('is-next');
        to.classList.add('is-active');
        gsap.set([from, fromInner, fromShade, to, toInner], { clearProps: 'all' });
        resetPanel(from);
        if (scenes[from.id] && scenes[from.id].reset) scenes[from.id].reset();
        cur = i;
        setTimeout(function () { busy = false; }, PAUSE);
      }
    });

    if (dir > 0) {
      // next frame rises from below like a curtain, previous sinks back into shadow
      tl.fromTo(to, { clipPath: 'inset(100% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)' }, 0)
        .fromTo(toInner, { yPercent: 14 }, { yPercent: 0 }, 0)
        .to(fromInner, { yPercent: -10 }, 0)
        .to(fromShade, { opacity: 0.75 }, 0);
    } else {
      // previous frame is revealed from above
      tl.fromTo(to, { clipPath: 'inset(0% 0% 100% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)' }, 0)
        .fromTo(toInner, { yPercent: -14 }, { yPercent: 0 }, 0)
        .to(fromInner, { yPercent: 10 }, 0)
        .to(fromShade, { opacity: 0.75 }, 0);
    }

    // hero: liquid WebGL dissolve rides along with the transition
    if (gl) {
      if (from.id === 'hero') { gl.active = true; tl.to(gl.u, { progress: 1, duration: DUR, ease: 'power2.in' }, 0); }
      if (to.id === 'hero') { gl.active = true; gl.u.progress = 1; tl.to(gl.u, { progress: 0, duration: DUR * 1.1, ease: 'expo.out' }, DUR * 0.25); }
    }
    if (from.id === 'hero') tl.to($$('.hero__title, .hero__foot, .hero__lead, .scroll-hint'), { y: -60, opacity: 0, duration: DUR * 0.7, ease: 'power3.in' }, 0);
    if (to.id === 'hero') {
      gsap.set($$('.hero__title, .hero__foot, .hero__lead, .scroll-hint'), { y: 0, opacity: 1 });
      gsap.set('.hero .line > span', { yPercent: 0 });
    }

    enterPanel(to, DUR * 0.42);
  }

  function next() { go(cur + 1); }
  function prev() { go(cur - 1); }

  /* ---------------- input: wheel / touch / keys ---------------- */
  function scrollableInside(dir) {
    var el = $('.panel__inner', panels[cur]);
    if (!el || el.scrollHeight <= el.clientHeight + 40) return false;
    if (dir > 0) return el.scrollTop + el.clientHeight < el.scrollHeight - 2;
    return el.scrollTop > 2;
  }

  window.addEventListener('wheel', function (e) {
    var now = performance.now(), gap = now - lastWheel;
    lastWheel = now;
    if (document.body.classList.contains('menu-open')) return;
    var dy = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : 0;
    if (!dy) return;
    var dir = dy > 0 ? 1 : -1;
    if (scrollableInside(dir)) return;      // let the panel scroll its own overflow first
    e.preventDefault();
    if (busy) return;
    if (needFresh) {                        // swallow trackpad inertia from the last gesture
      if (gap < GESTURE_GAP) return;
      needFresh = false;
    }
    if (gap > GESTURE_GAP) wheelAcc = 0;
    wheelAcc += dy;
    if (Math.abs(wheelAcc) >= WHEEL_THRESHOLD) { wheelAcc = 0; dir > 0 ? next() : prev(); }
  }, { passive: false });

  var t0 = null;
  window.addEventListener('touchstart', function (e) {
    var t = e.touches[0];
    t0 = { x: t.clientX, y: t.clientY, time: Date.now(), inCards: !!e.target.closest('.cards'), field: !!e.target.closest('input,select,textarea') };
  }, { passive: true });
  window.addEventListener('touchmove', function (e) {
    if (!t0 || document.body.classList.contains('menu-open')) return;
    var t = e.touches[0], dx = t.clientX - t0.x, dy = t.clientY - t0.y;
    if (t0.inCards && Math.abs(dx) > Math.abs(dy)) return;
    if (scrollableInside(dy < 0 ? 1 : -1)) return;
    if (e.cancelable) e.preventDefault();
  }, { passive: false });
  window.addEventListener('touchend', function (e) {
    if (!t0 || document.body.classList.contains('menu-open')) { t0 = null; return; }
    var t = e.changedTouches[0], dx = t.clientX - t0.x, dy = t.clientY - t0.y;
    var start = t0; t0 = null;
    if (Math.abs(dy) < SWIPE_THRESHOLD || Math.abs(dy) < Math.abs(dx) * 1.2) return;
    var dir = dy < 0 ? 1 : -1;
    if (scrollableInside(dir)) return;
    if (start.field && Date.now() - start.time > 600) return;
    dir > 0 ? next() : prev();
  }, { passive: true });

  window.addEventListener('keydown', function (e) {
    if (e.target.closest && e.target.closest('input,select,textarea')) return;
    var k = e.key;
    if (k === 'ArrowDown' || k === 'PageDown' || (k === ' ' && !e.shiftKey)) { e.preventDefault(); next(); }
    else if (k === 'ArrowUp' || k === 'PageUp' || (k === ' ' && e.shiftKey)) { e.preventDefault(); prev(); }
    else if (k === 'Home') { e.preventDefault(); go(0); }
    else if (k === 'End') { e.preventDefault(); go(N - 1); }
    else if (k === 'Escape') closeMenu();
  });

  $$('[data-go]').forEach(function (a) {
    a.addEventListener('click', function (e) { e.preventDefault(); var i = +a.dataset.go; if (i === cur) { closeMenu(); return; } go(i); });
  });

  /* ---------------- menu ---------------- */
  var menu = $('#menu');
  function closeMenu() { document.body.classList.remove('menu-open'); menu.setAttribute('aria-hidden', 'true'); }
  $('#burger').addEventListener('click', function () {
    var open = document.body.classList.toggle('menu-open');
    menu.setAttribute('aria-hidden', open ? 'false' : 'true');
  });

  /* ---------------- cursor ---------------- */
  var mouse = { nx: 0.5, ny: 0.5 };
  if (fine) {
    var dot = $('#cursor'), ring = $('#cursorRing');
    var dx = gsap.quickTo(dot, 'x', { duration: 0.12 }), dyq = gsap.quickTo(dot, 'y', { duration: 0.12 });
    var rx = gsap.quickTo(ring, 'x', { duration: 0.5, ease: 'power3' }), ry = gsap.quickTo(ring, 'y', { duration: 0.5, ease: 'power3' });
    window.addEventListener('mousemove', function (e) {
      dx(e.clientX); dyq(e.clientY); rx(e.clientX); ry(e.clientY);
      mouse.nx = e.clientX / innerWidth; mouse.ny = e.clientY / innerHeight;
      dot.style.opacity = 1; ring.style.opacity = 1;
    });
    $$('a, button, [data-cursor-big], input, select').forEach(function (el) {
      el.addEventListener('mouseenter', function () { ring.classList.add('is-big'); });
      el.addEventListener('mouseleave', function () { ring.classList.remove('is-big'); });
    });
  }

  /* ---------------- residences carousel progress (touch sizes) ---------------- */
  var cards = $('#cards'), hint = $('#swipeHint');
  function syncCards() {
    var max = cards.scrollWidth - cards.clientWidth;
    var w = cards.clientWidth / cards.scrollWidth;
    hint.style.setProperty('--sw', (w * 100) + '%');
    hint.style.setProperty('--sx', (max > 0 ? (cards.scrollLeft / max) * ((1 / w) - 1) * 100 : 0) + '%');
  }
  cards.addEventListener('scroll', syncCards, { passive: true });
  window.addEventListener('resize', syncCards);

  /* ---------------- form ---------------- */
  var form = $('#form');
  form.addEventListener('submit', function (e) { e.preventDefault(); form.classList.add('is-sent'); });
  var today = new Date().toISOString().slice(0, 10);
  $('#in').min = today; $('#out').min = today;
  $('#in').addEventListener('change', function () { $('#out').min = this.value; });

  /* ---------------- initial state ---------------- */
  panels.forEach(function (p) { resetPanel(p); });
  gsap.set('.hero .line > span', { yPercent: 110 });
  if (scenes.arrival) scenes.arrival.reset();
  var startIdx = 0;
  if (location.hash) {
    var target = $(location.hash);
    if (target && target.classList.contains('panel')) startIdx = panels.indexOf(target);
    else if (location.hash === '#booking') startIdx = 5;
  }
  panels[startIdx].classList.add('is-active');
  cur = startIdx;
  syncUI(startIdx);

  /* ---------------- WebGL hero ---------------- */
  gl = initGL();
  if (gl && startIdx !== 0) gl.u.progress = 1;

  /* ---------------- preloader -> intro ---------------- */
  var count = $('#count'), bar = $('#bar'), o = { v: 0 };
  gsap.timeline()
    .to('.loader__word span', { y: 0, duration: 1, stagger: 0.06, ease: 'expo.out' })
    .to(o, { v: 100, duration: reduce ? 0.2 : 1.7, ease: 'power2.inOut', onUpdate: function () { count.textContent = Math.round(o.v); bar.style.width = o.v + '%'; } }, 0)
    .to('.loader__word span', { y: '-105%', duration: 0.7, stagger: 0.04, ease: 'expo.in' }, '+=.1')
    .to('#loader', { clipPath: 'inset(0% 0% 100% 0%)', duration: 1.1, ease: 'expo.inOut' }, '-=.2')
    .add(intro, '-=.45')
    .add(function () { $('#loader').remove(); });

  function intro() {
    var tl = gsap.timeline({ onComplete: function () { busy = false; } });
    tl.to('.header', { opacity: 1, duration: 1.2, ease: 'power2.out' }, 0.2)
      .to('#pager', { opacity: 1, duration: 1.2 }, 0.6);
    if (startIdx === 0) {
      tl.to('.hero .line > span', { yPercent: 0, duration: 1.5, stagger: 0.12, ease: 'expo.out' }, 0)
        .to('.hero__lead, .hero__sub, .glass, .scroll-hint', { opacity: 1, duration: 1.4, stagger: 0.1, ease: 'power2.out' }, 0.4);
      if (gl) tl.fromTo(gl.u, { intro: 1 }, { intro: 0, duration: 2.6, ease: 'expo.out' }, 0);
    } else {
      gsap.set('.hero .line > span', { yPercent: 0 });
      gsap.set('.hero__lead, .hero__sub, .glass, .scroll-hint', { opacity: 1 });
      if (gl) gl.u.intro = 0;
      tl.add(enterPanel(panels[startIdx], 0), 0);
    }
  }

  function initGL() {
    if (reduce) return null;
    var canvas = $('#gl');
    var g = canvas.getContext('webgl', { antialias: false, premultipliedAlpha: false });
    if (!g) return null;
    var vs = 'attribute vec2 p;varying vec2 v;void main(){v=p*.5+.5;gl_Position=vec4(p,0.,1.);}';
    var fs = [
      'precision highp float;',
      'varying vec2 v;uniform sampler2D t;uniform vec2 res,img,mouse;uniform float time,progress,intro,hover;',
      'float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}',
      'float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);',
      ' return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}',
      'float fbm(vec2 p){float s=0.,a=.5;for(int i=0;i<5;i++){s+=a*noise(p);p*=2.02;a*=.5;}return s;}',
      'vec2 cover(vec2 uv){float rs=res.x/res.y,ri=img.x/img.y;vec2 s=rs<ri?vec2(rs/ri,1.):vec2(1.,ri/rs);return (uv-.5)*s+.5;}',
      'vec3 grade(vec3 c){float l=dot(c,vec3(.299,.587,.114));c=mix(vec3(l),c,.42);c=(c-.5)*1.12+.5;c*=vec3(1.04,.98,.9);return c*.64;}',
      'void main(){',
      ' vec2 uv=v;uv.y=1.-uv.y;',
      ' float pr=progress;',
      ' float z=1.+.1*pr+.12*intro;',
      ' vec2 cuv=(uv-.5)/z+.5;',
      ' cuv+=(mouse-.5)*vec2(-.014,.01);',
      ' float n=fbm(vec2(uv.x*3.,uv.y*6.-time*.25));',
      ' float st=(pr*.16+intro*.08)*(.4+n);',
      ' cuv.x+=sin(uv.y*26.+time*1.6+n*6.)*st*.35;',
      ' cuv.y+=(n-.5)*st;',
      ' vec2 md=uv-mouse;md.x*=res.x/res.y;float dm=length(md);',
      ' cuv+=normalize(md+1e-5)*sin(dm*40.-time*4.)*.004*smoothstep(.25,0.,dm)*hover;',
      ' vec2 tuv=cover(cuv);',
      ' float rgb=.003+pr*.025+intro*.012;',
      ' vec3 col=vec3(texture2D(t,tuv+vec2(rgb,0.)).r,texture2D(t,tuv).g,texture2D(t,tuv-vec2(rgb,0.)).b);',
      ' col=grade(col);',
      ' float edge=fbm(uv*vec2(4.,8.)+time*.1);',
      ' float dis=smoothstep(pr*1.3-.15,pr*1.3+.05,1.-uv.y+edge*.3);',
      ' col*=mix(1.,dis,step(.001,pr));',
      ' col+=vec3(.9,.85,.75)*pow(n,6.)*pr*(1.-pr)*1.6;',
      ' float vig=smoothstep(1.2,.3,length(uv-.5));col*=mix(.55,1.,vig);',
      ' col+=(h(uv*res+time)-.5)*.04;',
      ' col*=1.-intro*.6;',
      ' gl_FragColor=vec4(col,1.);',
      '}'
    ].join('\n');
    function sh(type, src) {
      var s = g.createShader(type); g.shaderSource(s, src); g.compileShader(s);
      if (!g.getShaderParameter(s, g.COMPILE_STATUS)) { console.warn(g.getShaderInfoLog(s)); return null; }
      return s;
    }
    var a = sh(g.VERTEX_SHADER, vs), b = sh(g.FRAGMENT_SHADER, fs);
    if (!a || !b) return null;
    var prog = g.createProgram();
    g.attachShader(prog, a); g.attachShader(prog, b); g.linkProgram(prog); g.useProgram(prog);
    var buf = g.createBuffer(); g.bindBuffer(g.ARRAY_BUFFER, buf);
    g.bufferData(g.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), g.STATIC_DRAW);
    var loc = g.getAttribLocation(prog, 'p'); g.enableVertexAttribArray(loc); g.vertexAttribPointer(loc, 2, g.FLOAT, false, 0, 0);
    var U = function (n) { return g.getUniformLocation(prog, n); };
    var L = { res: U('res'), img: U('img'), mouse: U('mouse'), time: U('time'), progress: U('progress'), intro: U('intro'), hover: U('hover') };
    var u = { progress: 0, intro: 1, hover: 0, mx: 0.5, my: 0.5 };
    var api = { u: u, active: true };
    var tex = g.createTexture(), ready = false;
    var im = new Image(); im.crossOrigin = 'anonymous';
    im.onload = function () {
      g.bindTexture(g.TEXTURE_2D, tex);
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE); g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR); g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
      g.texImage2D(g.TEXTURE_2D, 0, g.RGB, g.RGB, g.UNSIGNED_BYTE, im);
      g.uniform2f(L.img, im.naturalWidth, im.naturalHeight);
      ready = true; $('#hero').classList.add('gl-ready');
    };
    im.src = $('.hero__fallback').currentSrc || $('.hero__fallback').src;
    function resize() {
      var d = Math.min(devicePixelRatio || 1, 1.75);
      canvas.width = Math.max(1, canvas.clientWidth * d); canvas.height = Math.max(1, canvas.clientHeight * d);
      g.viewport(0, 0, canvas.width, canvas.height); g.uniform2f(L.res, canvas.width, canvas.height);
    }
    window.addEventListener('resize', resize); resize();
    gsap.ticker.add(function (time) {
      var heroVisible = panels[cur].id === 'hero' || $('#hero').classList.contains('is-next') || busy;
      if (!ready || !heroVisible) return;
      u.mx += (mouse.nx - u.mx) * 0.06; u.my += (mouse.ny - u.my) * 0.06;
      u.hover += ((fine ? 1 : 0) - u.hover) * 0.05;
      g.uniform1f(L.time, time); g.uniform1f(L.progress, u.progress); g.uniform1f(L.intro, u.intro); g.uniform1f(L.hover, u.hover);
      g.uniform2f(L.mouse, u.mx, u.my);
      g.drawArrays(g.TRIANGLES, 0, 6);
    });
    return api;
  }
})();
