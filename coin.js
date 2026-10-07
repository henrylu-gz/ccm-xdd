/* =========================================================
   赚钱钱 · coin.js
   - 点一下存钱罐：一枚金币落进去 + 金属撞击声
   - 金币声用 Web Audio 现场合成，没有音频文件（断网也能响）
   - 已存枚数记在浏览器本地（localStorage），刷新、关掉再打开都接着数，只增不减
   - 进度口径：每 10000 枚 = 1%（存满 100% 要 100 万枚），显示保留两位小数
   - 纯原生 JS，无任何外部依赖
   ========================================================= */
(function () {
  'use strict';

  var STORE_KEY = 'ccm_xdd_coin_total';  // 本地存档的键名
  var COINS_PER_PCT = 10000;             // 每 10000 枚 = 1%
  var MAX_COUNT = 1000000;               // 100 万枚 = 100%（封顶）
  var bankBtn = document.getElementById('bankBtn');
  var bank = document.getElementById('bank');
  var bankArt = document.getElementById('bankArt');
  var originEl = document.getElementById('coinOrigin');
  var pctText = document.getElementById('pctText');
  var pctInline = document.getElementById('pctInline');
  var countText = document.getElementById('countText');
  var soundBtn = document.getElementById('soundBtn');
  var soundBtnText = document.getElementById('soundBtnText');
  var hint = document.getElementById('soundHint');

  /* ---- 已存枚数：从本地存档读回来，读不到就从 0 开始 ---- */
  var count = loadCount();

  function loadCount() {
    try {
      var raw = window.localStorage.getItem(STORE_KEY);
      var n = parseInt(raw, 10);
      if (isFinite(n) && n >= 0) return n;      // 存档有效就用存档
    } catch (e) { /* 隐私模式 / 禁用了本地存储：退回只记本次 */ }
    return 0;
  }

  function saveCount() {
    try {
      window.localStorage.setItem(STORE_KEY, String(count));
    } catch (e) { /* 存不进去也不影响这一枚金币掉进罐子 */ }
  }

  var soundOn = true;
  var busy = false;
  var tipIndex = 0;        // 文案顺序走，不随机

  /* 鼓励文案：顺序固定，点一次往下一条，到末尾回到第一条 */
  var TIPS = [
    '叮！存进去一枚',
    '这一枚是给小叮当的',
    '这一枚是给聪聪明的',
    '炒股票赚了好多钱钱！',
    '发工资赚了钱钱',
    '地上捡了钱钱',
    '梦到了好多钱钱'
  ];

  /* ============ 一、金币声（Web Audio 合成金属撞击） ============
     「清脆」的做法：
       1. 基音抬高到 3.5k~7.6k（原来 2.3k 偏闷）
       2. 衰减收短（0.42s → 0.26s），尾巴短才显得利落
       3. 撞击噪声的高频比重加大、截止频率抬高
       4. 低频「咚」几乎去掉（它负责闷，清脆就不需要）
     三个高频正弦带轻微失谐，产生金属特有的拍频。 */
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

    // 高频基音（金属的「叮」，四个泛音抬高到 3.5k~7.6k，尾巴收短）
    var partials = [
      { f: 3520, g: 0.17, dur: 0.26 },
      { f: 5240, g: 0.11, dur: 0.21 },
      { f: 6900, g: 0.07, dur: 0.16 },
      { f: 8600, g: 0.04, dur: 0.11 }
    ];
    partials.forEach(function (p) {
      var osc = ctx.createOscillator();
      var g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = p.f * (detune ? 1 + detune : 1);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(p.g, t + 0.002);      // 起音更快 = 更脆
      g.gain.exponentialRampToValueAtTime(0.0001, t + p.dur);
      osc.connect(g); g.connect(out);
      osc.start(t); osc.stop(t + p.dur + 0.02);
    });

    // 撞击噪声：高频比重更大、截止更高，做出「锃」的一下
    var src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, 0.055);
    var bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(7200, t);
    bp.frequency.exponentialRampToValueAtTime(2600, t + 0.055);
    bp.Q.value = 1.4;
    var hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2200;                             // 切掉闷的低频噪声
    var ng = ctx.createGain();
    ng.gain.setValueAtTime(0.6, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.055);
    src.connect(bp); bp.connect(hp); hp.connect(ng); ng.connect(out);
    src.start(t); src.stop(t + 0.07);

    // 极轻的一点低频，只为了让声音不"飘"，量很小（原 0.16 → 0.05）
    var low = ctx.createOscillator();
    var lg = ctx.createGain();
    low.type = 'triangle';
    low.frequency.setValueAtTime(520, t);
    low.frequency.exponentialRampToValueAtTime(260, t + 0.07);
    lg.gain.setValueAtTime(0.05, t);
    lg.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    low.connect(lg); lg.connect(out);
    low.start(t); low.stop(t + 0.1);
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
    /* 投币口在 SVG viewBox(420x340) 里位于 y=86~98，取中点 92 => 约 27% 高度处。
       之前按 30% 落点，金币会压在进度标签上，这里按实际投币口位置重算。 */
    var landY = bankRect.top + bankRect.height * 0.27;
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
  /* 进度 = 枚数 ÷ 10000（%），即 10000 枚 = 1%，100 万枚 = 100%
     小数最多 4 位、末尾的 0 去掉：
       1 枚 → 0.0001%     100 枚 → 0.01%     10000 枚 → 1% */
  function pctOf(n) {
    var p = n / COINS_PER_PCT;
    if (p > 100) p = 100;
    var s = p.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
    return s + '%';
  }

  /* 枚数上千了加个千分位，好读 */
  function pretty(n) {
    var s = String(n);
    return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function render() {
    var p = pctOf(count);
    if (pctText) pctText.textContent = p;
    if (pctInline) pctInline.textContent = p;
    if (countText) countText.textContent = pretty(count);
  }

  function store() {
    if (busy) return;
    busy = true;
    setTimeout(function () { busy = false; }, 90);

    dropCoin();

    count += 1;                                          // 只增不减，没有清零
    saveCount();
    render();

    if (hint) {
      if (count >= MAX_COUNT) {
        hint.textContent = '存满啦！赚钱钱大王';
      } else {
        // 按你编好的顺序往下走，不随机
        hint.textContent = TIPS[tipIndex % TIPS.length];
        tipIndex += 1;
      }
    }
    // 罐子被点一下轻轻晃
    if (bank) {
      bank.classList.remove('is-poked');
      void bank.offsetWidth;
      bank.classList.add('is-poked');
    }
  }

  /* 整个猪猪（含罐身、耳朵、腿）都能点，不只是按钮 */
  if (bankArt) {
    bankArt.addEventListener('click', store);
    bankArt.style.cursor = 'pointer';
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

  /* 金币用 fixed 定位，所以要保证进页面时在顶部，否则起点会错位 */
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.scrollTo(0, 0);

  render();
})();
