/* =========================================================
   赚钱钱 · coin.js
   - 点一下存钱罐：一枚金币落进去 + 金属撞击声
   - 金币声用 Web Audio 现场合成，没有音频文件（断网也能响）
   - 进度从 20% 起，每存一枚 +1%，到 100% 就满了
   - 纯原生 JS，无任何外部依赖
   ========================================================= */
(function () {
  'use strict';

  var START = 20;          // 起始进度（图纸要求写 20%）
  var COUNTED = 5;         // 记作「已存 5 枚」，凑满之后不再加
  var bankBtn = document.getElementById('bankBtn');
  var bank = document.getElementById('bank');
  var originEl = document.getElementById('coinOrigin');
  var pctText = document.getElementById('pctText');
  var pctInline = document.getElementById('pctInline');
  var countText = document.getElementById('countText');
  var soundBtn = document.getElementById('soundBtn');
  var soundBtnText = document.getElementById('soundBtnText');
  var resetBtn = document.getElementById('resetBtn');
  var hint = document.getElementById('soundHint');

  var pct = START;
  var count = COUNTED;
  var soundOn = true;
  var busy = false;

  var TIPS = [
    '叮！存进去一枚',
    '又赚到一点钱钱',
    '攒钱钱，慢慢来',
    '这一枚是给小叮当的',
    '钱钱 +1',
    '存钱罐有点沉了',
    '努力就有回响'
  ];

  /* ============ 一、金币声（Web Audio 合成金属撞击） ============
     构成：两个高频正弦做「叮」的基音（带轻微失谐产生金属拍频），
     一个短的噪声脉冲做撞击的「脆」，再挂一个带通把噪声雕成金属味。
     最后让滤波器频率下滑，模拟硬币在罐里回弹。 */
  var actx = null;

  function audio() {
    if (!actx) {
      var C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      actx = new C();
    }
    if (actx.state === 'suspended') actx.resume();
    return actx;
  }

  function noiseBuffer(ctx, seconds) {
    var len = Math.floor(ctx.sampleRate * seconds);
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) {
      // 前 2ms 更响，模拟撞击瞬间
      var decay = Math.pow(1 - i / len, 3);
      d[i] = (Math.random() * 2 - 1) * decay;
    }
    return buf;
  }

  function clink(gainScale, detune) {
    var ctx = audio();
    if (!ctx) return;
    var t = ctx.currentTime;
    var out = ctx.createGain();
    out.gain.value = (gainScale === undefined ? 1 : gainScale);
    out.connect(ctx.destination);

    // 两个基音（金属的双音特征）
    var partials = [
      { f: 2350, g: 0.16, dur: 0.42 },
      { f: 3480, g: 0.10, dur: 0.34 },
      { f: 5120, g: 0.05, dur: 0.22 }
    ];
    partials.forEach(function (p) {
      var osc = ctx.createOscillator();
      var g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = p.f * (detune ? 1 + detune : 1);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(p.g, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + p.dur);
      osc.connect(g); g.connect(out);
      osc.start(t); osc.stop(t + p.dur + 0.02);
    });

    // 撞击噪声（带通塑形成金属质感）
    var src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, 0.09);
    var bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(4600, t);
    bp.frequency.exponentialRampToValueAtTime(1500, t + 0.09);
    bp.Q.value = 2.2;
    var ng = ctx.createGain();
    ng.gain.setValueAtTime(0.55, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    src.connect(bp); bp.connect(ng); ng.connect(out);
    src.start(t); src.stop(t + 0.1);

    // 一点低频「咚」，让金币落罐有分量
    var low = ctx.createOscillator();
    var lg = ctx.createGain();
    low.type = 'triangle';
    low.frequency.setValueAtTime(320, t);
    low.frequency.exponentialRampToValueAtTime(150, t + 0.14);
    lg.gain.setValueAtTime(0.16, t);
    lg.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    low.connect(lg); lg.connect(out);
    low.start(t); low.stop(t + 0.18);
  }

  /* ============ 二、金币掉落动画 ============ */
  var falling = [];

  function dropCoin() {
    if (!bank || !originEl) return;
    var bankRect = bank.getBoundingClientRect();
    var oRect = originEl.getBoundingClientRect();

    var size = Math.max(24, Math.min(46, bankRect.width * 0.11));
    var fromX = oRect.left + oRect.width / 2 - size / 2;
    var fromY = oRect.top + oRect.height / 2 - size / 2;
    var landY = bankRect.top + bankRect.height * 0.30;   // 落到投币口位置
    var toY = landY - size / 2;
    var dist = Math.max(40, toY - fromY);

    var coin = document.createElement('div');
    coin.className = 'coinfall';
    coin.setAttribute('aria-hidden', 'true');
    coin.style.width = size + 'px';
    coin.style.height = size + 'px';
    coin.style.left = fromX + 'px';
    coin.style.top = fromY + 'px';
    coin.innerHTML =
      '<svg viewBox="0 0 40 40">' +
      '<circle cx="20" cy="20" r="18" fill="#F5B942" stroke="#E0A32F" stroke-width="3"/>' +
      '<circle cx="20" cy="20" r="12.5" fill="none" stroke="#E0A32F" stroke-width="2" opacity=".8"/>' +
      '<text x="20" y="27" text-anchor="middle" font-size="17" font-weight="700" fill="#4A3B32"' +
      ' font-family="PingFang SC,Microsoft YaHei,sans-serif">¥</text>' +
      '</svg>';
    document.body.appendChild(coin);

    var spin = (Math.random() < 0.5 ? -1 : 1) * (260 + Math.random() * 200);
    var wobble = (Math.random() - 0.5) * size * 0.9;
    var item = {
      el: coin, fromY: fromY, dist: dist, wobble: wobble, spin: spin,
      started: performance.now(), dur: 460, landed: false, life: 340
    };
    falling.push(item);
    requestAnimationFrame(tick);
  }

  function tick(now) {
    var alive = false;
    for (var i = 0; i < falling.length; i++) {
      var c = falling[i];
      var t = (now - c.started) / c.dur;

      if (t < 1) {
        alive = true;
        var e = t * t;                                    // 加速下落
        var y = e * c.dist;
        var bounce = t > 0.86 ? Math.sin((t - 0.86) / 0.14 * Math.PI) * c.dist * 0.07 : 0;
        var x = Math.sin(t * Math.PI) * c.wobble;
        c.el.style.transform = 'translate(' + x.toFixed(1) + 'px,' + (y - bounce).toFixed(1) + 'px) rotate(' +
          (t * c.spin).toFixed(0) + 'deg)';
      } else if (!c.landed) {
        // 落罐：换成小金币从罐口滑进去，同时响一声
        c.landed = true;
        c.el.classList.add('is-landed');
        c.el.style.transform = 'translate(0,0) scale(.5)';
        if (soundOn) clink(1, (Math.random() - 0.5) * 0.02);
        alive = true;
      } else {
        c.life -= 16;
        c.el.style.opacity = Math.max(0, c.life / 340);
        if (c.life <= 0) {
          if (c.el.parentNode) c.el.parentNode.removeChild(c.el);
          falling.splice(i, 1); i--;
        } else {
          alive = true;
        }
      }
    }
    if (alive) requestAnimationFrame(tick);
  }

  /* ============ 三、进度与文案 ============ */
  function render() {
    if (pctText) pctText.textContent = pct + '%';
    if (pctInline) pctInline.textContent = pct + '%';
    if (countText) countText.textContent = String(count);
  }

  function store() {
    if (busy) return;
    busy = true;
    setTimeout(function () { busy = false; }, 90);

    dropCoin();

    if (pct < 100) {
      pct += 1;
      count += 1;
    } else if (count < 50) {
      count += 1;                                       // 满了以后只继续数金币
    }
    render();

    if (hint) {
      hint.textContent = pct >= 100 ? '存满啦！赚钱钱大王' : TIPS[Math.floor(Math.random() * TIPS.length)];
    }
    // 罐子被点一下轻轻晃
    if (bank) {
      bank.classList.remove('is-poked');
      void bank.offsetWidth;
      bank.classList.add('is-poked');
    }
  }

  if (bankBtn) {
    bankBtn.addEventListener('click', store);
    bankBtn.addEventListener('keydown', function (e) {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); store(); }
    });
  }

  if (soundBtn) {
    soundBtn.addEventListener('click', function () {
      soundOn = !soundOn;
      soundBtn.setAttribute('aria-pressed', soundOn ? 'true' : 'false');
      if (soundBtnText) soundBtnText.textContent = '金币声：' + (soundOn ? '开' : '关');
      if (soundOn) clink(0.7);                          // 开启时给一声反馈
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', function () {
      pct = START; count = COUNTED;
      render();
      if (hint) hint.textContent = '清零了，从头再存';
    });
  }

  /* 金币用 fixed 定位，所以要保证进页面时在顶部，否则起点会错位 */
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.scrollTo(0, 0);

  render();
})();
