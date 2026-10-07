/* =========================================================
   聪聪明和小叮当 · main.js
   只用原生 JS，不引任何外部库（DESIGN.md 第 9 节）

   原则：内容默认可见，JS 只做「增强」。
   若这个文件加载失败、报错、或被禁用，页面依旧完整可读 ——
   因为「藏起来」这件事只挂在 html.js 上，而 .js 由 index.html 里
   紧挨着的一行内联脚本添加。
   ========================================================= */
(function () {
  'use strict';

  /* 浏览器按了「减少动效」就不做任何隐藏，内容直接显示 */
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.documentElement.classList.remove('js');
    return;
  }
  if (!('IntersectionObserver' in window)) {
    document.documentElement.classList.remove('js');
    return;
  }

  var items = Array.prototype.slice.call(
    document.querySelectorAll('.card, .daily__item')
  );
  if (!items.length) { document.documentElement.classList.remove('js'); return; }

  var pending = items.slice();

  function reveal(el) {
    el.classList.add('is-in');
    var i = pending.indexOf(el);
    if (i > -1) pending.splice(i, 1);
  }

  /* ---- 观察器：滚进来的元素浮现 ---- */
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      reveal(entry.target);
      io.unobserve(entry.target);
    });
  }, { threshold: 0.05, rootMargin: '0px 0px -24px 0px' });

  items.forEach(function (el) { io.observe(el); });

  /* ---- 兜底一：首屏内已经能看见的，立刻浮现（不依赖 IO 回调） ---- */
  requestAnimationFrame(function () {
    pending.slice().forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (r.top < window.innerHeight && r.bottom > 0) reveal(el);
    });
  });

  /* ---- 兜底二：2 秒后，凡是在视口里的都显示 ---- */
  setTimeout(function () {
    pending.slice().forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (r.top < window.innerHeight && r.bottom > 0) reveal(el);
    });
  }, 2000);

  /* ---- 兜底三：4 秒后无条件全部显示，绝不留下空白 ---- */
  setTimeout(function () {
    pending.slice().forEach(reveal);
  }, 4000);

  /* 用户一滚动就顺手清一遍（万一 IO 失灵） */
  var onScroll = function () {
    pending.slice().forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (r.top < window.innerHeight && r.bottom > 0) reveal(el);
    });
    if (!pending.length) window.removeEventListener('scroll', onScroll);
  };
  window.addEventListener('scroll', onScroll, { passive: true });

  /* ---- 回到前台时重播一次心跳（小惊喜） ---- */
  var heart = document.querySelector('.heart');
  if (heart) {
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState !== 'visible') return;
      heart.style.animation = 'none';
      void heart.offsetWidth; // 强制重排，重启 CSS 动画
      heart.style.animation = '';
    });
  }
})();
