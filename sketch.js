// ====== 画布 ======
let W = 1000, H = 1333;

//字体风格
let myFont;

//背景
let img;

// 最多有线的单词数量
let MAX_TETHERS = 45;

// ====== 你的“小人轮廓”贝塞尔段数据（用于缠绕取点） ======
const P0 = { x: 500, y: 492 };
let personSegs = [];


//第二部分
let brokenCount = 0;      // 已断裂数量
let CLICK_R = 40;         // 点单词的判定半径（你可调）
let UNWRAP_SPEED = 0.03; // 内部线“缩回”的速度（越大越快）

let brokenBottomTs = [];        // 记录所有已断线的底部挂点t，用来做均匀分布
let BOTTOM_T_MIN_SEP = 0.04;    // t 的最小间距（0.02~0.06 之间调）

// =================== 花朵系统 ===================

// 花朵数组
let flowers = [];

// 头部不长花（可调：580~650）
let FLOWER_HEAD_LIMIT_Y = 520;

// 花位点（用于均匀分布）
let flowerSlots = [];
let flowerSlotIdx = 0;

// 花位点最小间距（越大越分散、越不密）
let FLOWER_MIN_DIST = 36; // 建议 28~40

// 生长速度（可调）
let STEM_GROW_SPEED = 0.028; // 茎长出来速度
let BLOOM_SPEED = 0.050;     // 花开速度

// 花朵“呼吸闪烁”（可调）
let FLOWER_BREATHE_SPD = 0.1;  // 闪烁速度：越小越慢（0.008~0.02）
let FLOWER_BREATHE_AMP = 0.20;   // 闪烁幅度：越小越轻（0.08~0.22）


// 茎参数（可调）
let STEM_W = 1;       // 茎粗
let STEM_WIGGLE = 0.6;  // 茎“蜿蜒”幅度（0.6~1.8）

// 花参数（可调）
let FLOWER_SIZE_MIN = 0.15;
let FLOWER_SIZE_MAX = 0.25;
let PETAL_COUNT_MIN = 10;
let PETAL_COUNT_MAX = 15;


function preload() {
  // 加载字体文件
  myFont = loadFont('times.ttf');
  //加载背景图片
  img = loadImage('yoyo.png');
}

function buildPersonSegments() {
  const P3_1 = { x: 523, y: 570 };
  personSegs.push({ p0: P0, p1: { x: 545, y: 496 }, p2: { x: 548, y: 550 }, p3: P3_1 });

  const P3_2 = { x: 606, y: 830 };
  personSegs.push({ p0: P3_1, p1: { x: 650, y: 645 }, p2: { x: 597, y: 860 }, p3: P3_2 });

  const P3_3 = { x: 385, y: 835 };
  personSegs.push({ p0: P3_2, p1: { x: 606, y: 860 }, p2: { x: 460, y: 846 }, p3: P3_3 });

  const P3_4 = { x: 477, y: 570 };
  personSegs.push({ p0: P3_3, p1: { x: 385, y: 865 }, p2: { x: 365, y: 646 }, p3: P3_4 });

  personSegs.push({ p0: P3_4, p1: { x: 452, y: 550 }, p2: { x: 455, y: 496 }, p3: P0 });
}

let yBins = [];           // 每个 y 桶里存 {minX, maxX}
let yBinStep = 2;         // 2px 一个桶（越小越精细，越耗）
let yMin = 999999, yMax = -999999;

function buildPersonYBins() {
  // 初始化
  yBins = [];
  yMin = 999999; yMax = -999999;

  // 1) 先密集采样轮廓点
  let samples = 2000; // 越大越准
  for (let i = 0; i < samples; i++) {
    let u = i / samples;
    let p = pointOnPersonOutline(u);
    yMin = min(yMin, p.y);
    yMax = max(yMax, p.y);

    let idx = floor(p.y / yBinStep);
    if (!yBins[idx]) {
      yBins[idx] = { minX: p.x, maxX: p.x };
    } else {
      yBins[idx].minX = min(yBins[idx].minX, p.x);
      yBins[idx].maxX = max(yBins[idx].maxX, p.x);
    }
  }

  // 2) 填补空洞（有些 y 可能没采到点）
  let last = null;
  for (let i = 0; i < yBins.length; i++) {
    if (yBins[i]) last = yBins[i];
    else if (last) yBins[i] = { minX: last.minX, maxX: last.maxX };
  }
}

// 给定 y，取身体在该高度的左右边界
function bodySpanAtY(y) {
  let idx = floor(y / yBinStep);
  let b = yBins[idx];
  if (!b) return null;
  return b; // {minX, maxX}
}

// ✅ 给定一个 x，返回小人底部扁弧线上的挂点（y 取 yMax 附近）
// 这样断线后，人体端那段线就“挂在底边弧线上”
function bottomArcPointAtX(x) {
  let y = yMax - 2;                 // 底边那条扁弧线附近
  let span = bodySpanAtY(y);
  if (!span) return { x: 500, y: y };

  let m = 6;                        // 离边界留一点
  let xx = constrain(x, span.minX + m, span.maxX - m);
  return { x: xx, y: y };
}


// 沿轮廓取点：u in [0,1) 表示走完整个轮廓的一圈
function pointOnPersonOutline(u) {
  u = (u % 1 + 1) % 1;
  let n = personSegs.length;
  let segFloat = u * n;
  let idx = floor(segFloat);
  let t = segFloat - idx;
  let s = personSegs[idx];

  // 【bezierPoint】用于采样轮廓点（我们已用过）
  let x = bezierPoint(s.p0.x, s.p1.x, s.p2.x, s.p3.x, t);
  let y = bezierPoint(s.p0.y, s.p1.y, s.p2.y, s.p3.y, t);
  return { x, y };
}

// ====== 底部扁弧线：严格贴合 personSegs[2] ======
function pointOnBezierSeg(seg, t) {
  return {
    x: bezierPoint(seg.p0.x, seg.p1.x, seg.p2.x, seg.p3.x, t),
    y: bezierPoint(seg.p0.y, seg.p1.y, seg.p2.y, seg.p3.y, t)
  };
}

// 在底部弧线（personSegs[2]）上找“离目标点最近”的点
function closestPointOnBottomArc(tx, ty) {
  let seg = personSegs[2];          // ✅ 底部扁弧线段
  let bestT = 0;
  let bestD = 1e9;
  let bestP = null;

  // 采样越多越贴合（80~160 都行）
  let N = 120;
  for (let i = 0; i <= N; i++) {
    let t = i / N;
    let p = pointOnBezierSeg(seg, t);
    let d = dist(tx, ty, p.x, p.y);
    if (d < bestD) {
      bestD = d;
      bestT = t;
      bestP = p;
    }
  }
  return { t: bestT, p: bestP };
}

// ✅ 按“x 方向”在底部弧线上找最近点（比用 bx/by 更不容易跑到端点）
function closestPointOnBottomArcByX(targetX) {
  let seg = personSegs[2];
  let bestT = 0;
  let bestD = 1e9;
  let bestP = null;

  let N = 160; // 采样密一点更贴合
  for (let i = 0; i <= N; i++) {
    let t = i / N;
    let p = pointOnBezierSeg(seg, t);
    let d = abs(p.x - targetX);
    if (d < bestD) {
      bestD = d;
      bestT = t;
      bestP = p;
    }
  }
  return { t: bestT, p: bestP };
}

// ✅ 选择一个更均匀的底部挂点 t：避开两端 + 避开已占用区域
function pickBottomT(preferX, seed) {
  // 先用 x 投影拿一个“合理的中心值”
  let base = closestPointOnBottomArcByX(preferX).t;

  // 避开两端（关键！）
  base = constrain(base, 0.08, 0.92);

  // 拒绝采样：让它别总挤在同一个 t 段
  let tries = 0;
  let t = base;

  while (tries < 40) {
    tries++;

    // 在 base 附近小范围扰动（让分布更自然）
    let jitter = (noise(seed + tries * 0.37) - 0.5) * 0.18; // 扰动范围 ±0.09
    t = constrain(base + jitter, 0.08, 0.92);

    // 检查与已断线挂点的距离
    let ok = true;
    for (let j = 0; j < brokenBottomTs.length; j++) {
      if (abs(t - brokenBottomTs[j]) < BOTTOM_T_MIN_SEP) {
        ok = false;
        break;
      }
    }
    if (ok) {
      brokenBottomTs.push(t);
      return t;
    }
  }

  // 实在挤就放宽：直接用 base（仍然避开两端）
  brokenBottomTs.push(base);
  return base;
}


// 取底部弧线上的点（给定 t）
function pointOnBottomArc(t) {
  return pointOnBezierSeg(personSegs[2], constrain(t, 0, 1));
}

// ====== 人区：只用于“单词别生成在小人上” ======
let PERSON_PAD = 40;
let personLeft = 365 - PERSON_PAD;
let personRight = 650 + PERSON_PAD;
let personTop = 492 - PERSON_PAD;
let personBottom = 865 + PERSON_PAD;

function insidePersonZone(x, y) {
  return x > personLeft && x < personRight && y > personTop && y < personBottom;
}

// ====== 单词池 ======
const WORD_POOL = [
  "Grade", "Student Union", "Internship", "Competition", "Portfolio", "Networking",
  "GPA", "Deadline", "Feedback", "Approval", "Comparison", "Expectation", "Performance",
  "Plan", "Future", "Relationship", "Social", "Confidence", "Pressure", "Anxiety",
  "Opportunity", "Growth", "Choice", "Uncertainty", "Success", "GPA", "Ranking", "Deadline", "Requirement",
  "Assessment", "Submission", "Evaluation", "Comparison", "Expectation", "Validation", "Approval",
  "Standards", "Achievement", "Choice", "Direction", "Uncertainty"
];

// ====== 系统参数（你之后主要调这些） ======
let words = [];
let MAX_WORDS = 100;

// 单词“逐渐变多”的速度：每隔多少帧允许多一个
let ADD_WORD_EVERY = 18;

// 线生长速度（越小越慢）
let GROW_SPEED = 0.01;

// 缠绕生长速度（越小越慢）
let WRAP_SPEED = 0.005;

// 缠绕圈数范围
let TURNS_MIN = 1;
let TURNS_MAX = 2.5;

// 外连线粗细（你说要细）
let CONNECT_W = 2;
// 缠绕线粗细（略粗一点更有“缠住”感）
let WRAP_W = 1;

function setup() {
  createCanvas(W, H);
  textAlign(CENTER, CENTER);
  textFont(myFont); // ← 这一行是关键
  strokeJoin(ROUND);
  strokeCap(ROUND);
  buildPersonSegments();
  buildPersonYBins();

  buildFlowerSlots(); // ✅ 预生成“均匀分散”的花位点




  // 初始先少量（比如 6 个）
  for (let i = 0; i < 6; i++) words.push(makeWordAndTether());
}

function draw() {
  background(255);
  image(img, 0, 0, width, height);
  // 1) 单词数量逐渐增加（外界越来越多）
  graduallyAddWords();

  // 2) 画小人
  drawPerson();
  // 3) 先画线（也可以后画，看你想线压在人上还是在人后）
  drawTethers();

  updateFlowers();
  drawFlowers();


  // 4) 画单词（单词可淡入淡出，但线不断）
  for (let i = 0; i < words.length; i++) {
    updateWord(words[i]);
    drawWord(words[i]);
  }
}

// ====== 逐渐增加单词 ======
function graduallyAddWords() {
  if (words.length >= MAX_WORDS) return;
  if (frameCount % ADD_WORD_EVERY !== 0) return;

  words.push(makeWordAndTether());
}

// ====== 创建单词 + 对应的线（线会慢慢长出来） ======
function makeWordAndTether() {
  let txt = WORD_POOL[int(random(WORD_POOL.length))];

  let tetherCount = 0;
  for (let j = 0; j < words.length; j++) {
    if (words[j].tether !== null) tetherCount++;
  }
  let hasTether = tetherCount < MAX_TETHERS && random() < 0.6;

  // 出生点：人区外
  let x, y, safety = 0;
  do {
    x = random(width);
    y = random(height);
    safety++;
    if (safety > 2000) break;
  } while (insidePersonZone(x, y));

  // 颜色深浅随机：用 alphaBase 控制“深/浅”
  let baseR = random(40, 220);
  let baseG = random(40, 220);
  let baseB = random(40, 220);
  let alphaBase = random(150, 210); // 深浅不一

  // 选一个人体锚点位置（轮廓上的某个 u0）
  let u0 = random();
  let anchor = pointOnPersonOutline(u0);

  // 线对象（绑在这个单词上）
  let tether = null;
  if (hasTether) {
    tether = {
      u0: u0,
      turns: int(random(TURNS_MIN, TURNS_MAX)),
      du: 0.01,
      grow: 0,
      wrap: 0,
      r: baseR, g: baseG, b: baseB,
      aBase: alphaBase,
      flickerSeed: random(1000),

      wrapPts: null,
      ang: 0,
      stepLen: random(6, 10),
      wiggleAmt: random(0.10, 0.22),
      drift: random(-0.06, 0.06),
      maxPts: int(random(120, 220)),

      // 第二部分断线用到的字段（最好提前给默认值，避免 undefined）
      broken: false,
      breaking: false,
      unwind: 0,
      unwinding: false
    };
  }

  return {
    txt,
    x, y,
    vx: random(-0.35, 0.35),
    vy: random(-0.35, 0.35),
    size: random(20, 35),

    // 单词自身也有深浅
    r: baseR, g: baseG, b: baseB,
    aBase: alphaBase,

    // 单词“出现/消失”不是删除对象，而是自己波动
    // 这样线可以一直保留，且以后你点击也能找到它（只要它可见时）
    phase: random(TWO_PI),

    tether: tether
  };
}

// ====== 更新单词漂浮 + 可见度波动 ======
function updateWord(w) {
  w.x += w.vx;
  w.y += w.vy;

  if (w.x < 10 || w.x > width - 10) w.vx *= -1;
  if (w.y < 10 || w.y > height - 10) w.vy *= -1;

  // 避免漂进人区：推出来
  if (insidePersonZone(w.x, w.y)) {
    let dx = w.x - 500;
    let dy = w.y - 700;
    let d = sqrt(dx * dx + dy * dy) + 0.0001;
    w.x += (dx / d) * 1.2;
    w.y += (dy / d) * 1.2;
  }

  // 单词可见度轻微闪烁/出现消失：用 sin 做“呼吸”
  w.phase += 0.01;

  if (!w.tether) return;  // ✅ 没线的词只漂浮/闪烁，不做后续线逻辑

  // 线生长进度推进
  if (w.tether.grow < 1) {
    w.tether.grow += GROW_SPEED;
    if (w.tether.grow > 1) w.tether.grow = 1;
  } else {
    // 外连线长满后再开始缠绕（更像“先抓住，再绕上去”）
    if (w.tether.grow < 1) {
      w.tether.grow += GROW_SPEED;
      if (w.tether.grow > 1) w.tether.grow = 1;
    } else {
      // ✅ 触碰到人：开始从触点生长“缠绕路径”
      growWrapPath(w, w.tether);
    }
  }

  // ✅ 如果断裂了，就让内部线逐渐缩回
  if (w.tether.broken && w.tether.unwinding) {
    w.tether.unwind += UNWRAP_SPEED;
    if (w.tether.unwind >= 1) {
      w.tether.unwind = 1;
      w.tether.unwinding = false;

      // 缩回结束：彻底移除这根内部线（“减少对应一根”）
      w.tether.wrapPts = null;
    }
  }
}

function growWrapPath(w, t) {
  // 取锚点（触点）
  let anchor = pointOnPersonOutline(t.u0);

  // 第一次触碰：初始化 wrapPts 和方向
  if (t.wrapPts === null) {
    t.wrapPts = [];
    t.wrapPts.push({ x: anchor.x, y: anchor.y });

    // 初始方向：沿入射方向（单词 -> 锚点）
    let dx = anchor.x - w.x;
    let dy = anchor.y - w.y;
    t.ang = atan2(dy, dx);
  }

  // 每帧长出几段（数字越大缠得越快）
  let addPerFrame = 1;
  if (frameCount % 2 !== 0) return; // 每两帧长一次

  for (let k = 0; k < addPerFrame; k++) {
    if (t.wrapPts.length >= t.maxPts) return;

    let last = t.wrapPts[t.wrapPts.length - 1];

    // 方向：轻微随机抖动 + 一个持续偏置 drift（形成斜向绕的趋势）
    t.ang = t.ang + sin(frameCount * 0.06 + t.flickerSeed) * 0.02;

    // 走一步
    let nx = last.x + cos(t.ang) * t.stepLen;
    let ny = last.y + sin(t.ang) * t.stepLen;

    // —— 边界约束：把点限制在身体内部（松松垮垮但不能飞出去）——
    let span = bodySpanAtY(ny);
    if (!span) {
      // y 超界：反弹
      t.ang = -t.ang;
      ny = constrain(ny, yMin + 2, yMax - 2);
      span = bodySpanAtY(ny);
      if (!span) break;
    }

    // 如果撞到左右边界：反弹 x 方向（像绳子碰到身体侧面滑回去）
    let margin = 8;
    let xL = span.minX + margin;
    let xR = span.maxX - margin;

    if (nx < xL) {
      nx = xL;
      t.ang = PI - t.ang; // 水平反弹
    } else if (nx > xR) {
      nx = xR;
      t.ang = PI - t.ang;
    }

    // y 也限制在身体上下范围
    if (ny < yMin + 2) {
      ny = yMin + 2;
      t.ang = -t.ang;
    } else if (ny > yMax - 2) {
      ny = yMax - 2;
      t.ang = -t.ang;
    }

    t.wrapPts.push({ x: nx, y: ny });
  }
}

function wordVisibleAlpha(w) {
  // 0..1 呼吸
  let breathe = (sin(w.phase) + 1) / 2;
  // 把呼吸幅度压小一点，避免过于闪烁
  let a = w.aBase * (0.35 + 0.65 * breathe);
  return a;
}

function drawWord(w) {
  let a = wordVisibleAlpha(w);
  noStroke();
  fill(w.r, w.g, w.b, a);
  textSize(w.size);
  text(w.txt, w.x, w.y);
}

// ====== 画线：外连线“长出来” + 身上缠绕“长出来” + 微闪烁 ======
function drawTethers() {
  for (let i = 0; i < words.length; i++) {
    let w = words[i];
    if (!w.tether) continue;  // ✅ 没线的词跳过
    let t = w.tether;

    // 线的微闪烁（深浅波动）
    let flick = (sin(frameCount * 0.06 + t.flickerSeed) + 1) / 2; // 0..1
    let aLine = t.aBase * (0.25 + 0.25 * flick);

    // 重新取锚点（如果你未来想锚点随缠绕略动，这里也能做）
    let anchor = pointOnPersonOutline(t.u0);

    // Part A：外连线从单词“慢慢长出来”
    stroke(t.r, t.g, t.b, aLine);
    strokeWeight(CONNECT_W);
    noFill();

    let endX = lerp(w.x, anchor.x, t.grow);
    let endY = lerp(w.y, anchor.y, t.grow);

    // 主线（稍实）
    if (!t.broken) {
      // ✅ 未断：正常画完整外连线
      drawSoftThread(w.x, w.y, endX, endY, t, aLine * 0.70, 0);
      for (let side = -2; side <= 2; side++) {
        if (side === 0) continue;
        drawSoftThread(w.x, w.y, endX, endY, t, aLine * 0.18, side);
      }
    } else {
      // ✅ 已断：确保挂点存在（防止 undefined）
      if (!t.wordHang || !t.bodyHang) continue;

      // ✅ 底部弧线挂点：严格贴合 personSegs[2]
      if (t.bottomT === undefined) {
        // 保险：如果老数据没有 bottomT，就用断点补算
        let hit = closestPointOnBottomArc(t.breakPoint.x, t.breakPoint.y);
        t.bottomT = hit.t;
      }
      let bottom = pointOnBottomArc(t.bottomT);

      // 更新两端“弹力挂点”
      updateHangPoint(t.wordHang, w.x, w.y);           // 单词端照旧
      updateHangPoint(t.bodyHang, bottom.x, bottom.y); // ✅ 人体端改为底部弧线点

      // 画单词端挂线（单词 -> wordHang）
      drawSoftThread(w.x, w.y, t.wordHang.x, t.wordHang.y, t, aLine * 0.65, 0);
      for (let side = -2; side <= 2; side++) {
        if (side === 0) continue;
        drawSoftThread(w.x, w.y, t.wordHang.x, t.wordHang.y, t, aLine * 0.16, side);
      }

      // 画人体端挂线（底部弧线点 -> bodyHang）
      drawSoftThread(bottom.x, bottom.y, t.bodyHang.x, t.bodyHang.y, t, aLine * 0.65, 0);
      for (let side = -2; side <= 2; side++) {
        if (side === 0) continue;
        drawSoftThread(bottom.x, bottom.y, t.bodyHang.x, t.bodyHang.y, t, aLine * 0.16, side);
      }

      // ====== ✅ 线须：静态“死线”（不再用 drawSoftThread）======
      // 单词端线须（整体跟着 wordHang 平移，但形状固定）
      if (t.wordTailPts && t.wordTailOrigin) {
        let dx = t.wordHang.x - t.wordTailOrigin.x;
        let dy = t.wordHang.y - t.wordTailOrigin.y;

        // 不改变形状，只平移
        stroke(t.r, t.g, t.b, aLine * 0.70);
        strokeWeight(CONNECT_W);
        noFill();
        beginShape();
        for (let p of t.wordTailPts) vertex(p.x + dx, p.y + dy);
        endShape();

        stroke(t.r, t.g, t.b, aLine * 0.22);
        beginShape();
        for (let p of t.wordTailPts) vertex(p.x + dx + 1.6, p.y + dy);
        endShape();

        beginShape();
        for (let p of t.wordTailPts) vertex(p.x + dx - 1.6, p.y + dy);
        endShape();
      }


      // 底部端线须（整体跟着 bodyHang 平移 + 微微左右摆动，形状固定）
      if (t.bottomTailPts && t.bottomTailOrigin) {
        let dx = t.bodyHang.x - t.bottomTailOrigin.x;
        let dy = t.bodyHang.y - t.bottomTailOrigin.y;

        // ✅ 微微左右摆动：只加在 x 上
        // 摆动幅度（1.5~4 之间都自然）
        let swayAmp = 7;
        // 摆动速度（0.015~0.05）
        let swaySpd = 0.03;
        // 每根线的相位不同
        let swayPhase = t.flickerSeed * 9.7;

        strokeWeight(CONNECT_W);
        noFill();

        // 主线
        stroke(t.r, t.g, t.b, aLine * 0.70);
        beginShape();
        for (let i = 0; i < t.bottomTailPts.length; i++) {
          let p = t.bottomTailPts[i];

          // 越往下摆得越明显：0(顶端) -> 1(底端)
          let k = i / (t.bottomTailPts.length - 1);
          let swayX = sin(frameCount * swaySpd + swayPhase) * swayAmp * k;

          vertex(p.x + dx + swayX, p.y + dy);
        }
        endShape();

        // 毛边 1
        stroke(t.r, t.g, t.b, aLine * 0.22);
        beginShape();
        for (let i = 0; i < t.bottomTailPts.length; i++) {
          let p = t.bottomTailPts[i];
          let k = i / (t.bottomTailPts.length - 1);
          let swayX = sin(frameCount * swaySpd + swayPhase) * swayAmp * k;

          vertex(p.x + dx + swayX + 1.6, p.y + dy);
        }
        endShape();

        // 毛边 2
        beginShape();
        for (let i = 0; i < t.bottomTailPts.length; i++) {
          let p = t.bottomTailPts[i];
          let k = i / (t.bottomTailPts.length - 1);
          let swayX = sin(frameCount * swaySpd + swayPhase) * swayAmp * k;

          vertex(p.x + dx + swayX - 1.6, p.y + dy);
        }
        endShape();
      }

    }

    // Part B：从触点开始生长的一条“松垮毛线缠绕路径”
    if (t.wrapPts && t.wrapPts.length > 1) {
      // 断裂后逐渐减少可见点数
      let n = t.wrapPts.length;
      let k = t.unwind ? t.unwind : 0;         // 0..1
      let nNow = floor(n * (1 - k));           // 从 n -> 0
      nNow = constrain(nNow, 0, n);

      if (nNow > 1) {
        // 只画前 nNow 个点（不要 slice，直接传数量进去）
        drawSoftPolylineCount(t.wrapPts, nNow, t, t.aBase, 0);
        drawSoftPolylineCount(t.wrapPts, nNow, t, t.aBase * 0.40, 1);
        drawSoftPolylineCount(t.wrapPts, nNow, t, t.aBase * 0.30, -1);
      }
    }
  }
}

function drawSoftPolylineCount(pts, count, t, alpha, side) {
  stroke(t.r, t.g, t.b, alpha);
  strokeWeight(WRAP_W);
  noFill();

  beginShape();

  for (let i = 0; i < count; i++) {   // ✅ 注意：只循环到 count
    let p = pts[i];

    let wob = sin(frameCount * 0.08 + t.flickerSeed + i * 0.35) * 1.6;

    let nx = 0, ny = 0;
    if (i > 0) {
      let p0 = pts[i - 1];
      let dx = p.x - p0.x;
      let dy = p.y - p0.y;
      let len = sqrt(dx * dx + dy * dy) + 0.0001;
      nx = -dy / len;
      ny = dx / len;
    }

    let offset = side * 2.0;
    vertex(p.x + nx * offset, p.y + ny * offset + wob);
  }

  endShape();
}

function drawSoftPolyline(pts, t, alpha, side) {
  stroke(t.r, t.g, t.b, alpha);
  strokeWeight(WRAP_W);
  noFill();

  beginShape();

  for (let i = 0; i < pts.length; i++) {
    let p = pts[i];

    // 给路径点一点点“毛线抖动”
    let wob = sin(frameCount * 0.08 + t.flickerSeed + i * 0.35) * 1.6;

    // 用相邻点估法线方向做毛边偏移
    let nx = 0, ny = 0;
    if (i > 0) {
      let p0 = pts[i - 1];
      let dx = p.x - p0.x;
      let dy = p.y - p0.y;
      let len = sqrt(dx * dx + dy * dy) + 0.0001;
      nx = -dy / len;
      ny = dx / len;
    }

    let offset = side * 2.0; // 毛边幅度（可调）
    vertex(p.x + nx * offset, p.y + ny * offset + wob);
  }

  endShape();
}

function drawSoftWrapBand(xL, xR, y, t) {
  let steps = 24;
  beginShape();
  for (let i = 0; i <= steps; i++) {
    let s = i / steps;
    let x = lerp(xL, xR, s);

    // “毛线纹理”：中段抖动更明显，两端收一点
    let belly = sin(s * PI); // 0..1..0
    let wiggle = sin(frameCount * 0.09 + t.flickerSeed + s * 10.0) * 3.0;

    let yy = y + wiggle * belly;

    vertex(x, yy);
  }
  endShape();
}

function drawSoftThread(x1, y1, x2, y2, t, alpha, side) {
  stroke(t.r, t.g, t.b, alpha);
  strokeWeight(CONNECT_W);
  noFill();

  let steps = 18;
  beginShape();

  // 法线方向（用于偏移/毛边）
  let dx = x2 - x1;
  let dy = y2 - y1;
  let len = sqrt(dx * dx + dy * dy) + 0.0001;
  let nx = -dy / len;
  let ny = dx / len;

  // 每股线的基础偏移（side 可以是 -2..2 都行）
  let baseOffset = side * 1.6;

  for (let s = 0; s <= steps; s++) {
    let p = s / steps;

    // 基础插值点
    let x = lerp(x1, x2, p);
    let y = lerp(y1, y2, p);

    // 中段更明显，两端收住
    let belly = sin(p * PI);

    // ✅ 波动幅度（你说想更大）——这里的 6.0 可以再加
    let wiggle = sin(frameCount * 0.08 + t.flickerSeed + p * 8.0) * 6.0;

    // ✅ 毛边更“乱”：每一段都变，而且每股线都不一样（side 参与相位）
    let jitterOffset =
      sin(frameCount * 0.12 + t.flickerSeed * 3 + p * 12.0 + side * 1.7) * 1.4;

    // 合成偏移
    let offset = baseOffset + jitterOffset;

    // 最终偏移：法线方向 + 波动（乘 belly）
    x += nx * (wiggle * belly + offset);
    y += ny * (wiggle * belly + offset);

    vertex(x, y);
  }

  endShape();
}

function buildDeadHangingPts(x1, y1, x2, y2, seed) {
  let pts = [];
  let steps = 18; // 越大越细腻
  let dx = x2 - x1;
  let dy = y2 - y1;

  // 基础法线方向（用于给曲线一个侧向“垂坠感”）
  let len = sqrt(dx * dx + dy * dy) + 0.0001;
  let nx = -dy / len;
  let ny = dx / len;

  for (let i = 0; i <= steps; i++) {
    let p = i / steps;
    let x = lerp(x1, x2, p);
    let y = lerp(y1, y2, p);

    // 中间最弯，两端收
    let belly = sin(p * PI);

    // ✅ 关键：不用 frameCount，用 noise(seed + i) 固定造型
    let n = noise(seed + i * 0.35);
    let side = map(n, 0, 1, -1, 1);

    // 弯曲幅度：可调（想更“死而垂”就加大）
    let amp = 6.0;

    x += nx * side * amp * belly;
    y += ny * side * amp * belly;

    pts.push({ x, y });
  }
  return pts;
}

function mousePressed() {
  // 找最近的单词（且当前可见度不要太低）
  let best = -1;
  let bestD = 1e9;

  for (let i = 0; i < words.length; i++) {
    let w = words[i];
    let t = w.tether;

    if (!w.tether) continue;

    // 已断的不再断
    if (t.broken) continue;

    // 可见度太低的不算（避免你点到“几乎消失”的词）
    if (wordVisibleAlpha(w) < 30) continue;

    let d = dist(mouseX, mouseY, w.x, w.y);
    if (d < CLICK_R && d < bestD) {
      bestD = d;
      best = i;
    }
  }

  if (best !== -1) breakTether(words[best]);
}

function breakTether(w) {
  let t = w.tether;
  t.broken = true;

  // 当前锚点
  let anchor = pointOnPersonOutline(t.u0);

  // 当前外连线的“实际末端”（可能还没长满）
  let endX = lerp(w.x, anchor.x, t.grow);
  let endY = lerp(w.y, anchor.y, t.grow);

  // 断裂点：取当前线段上的某个比例（别太靠近两端）
  let bp = random(0.55, 0.80);
  let bx = lerp(w.x, endX, bp);
  let by = lerp(w.y, endY, bp);

  // 两端“挂线点”各自一个小弹簧
  t.breakPoint = { x: bx, y: by };

  let kick = 6;
  // 挂在单词那端：从断点开始，向单词回弹
  t.wordHang = { x: bx, y: by, vx: random(-kick, kick), vy: random(-kick, kick) };

  // 挂在人那端：从断点开始，向触点回弹
  t.bodyHang = { x: bx, y: by, vx: random(-kick, kick), vy: random(-kick, kick) };

  // ✅ 让底部挂点更均匀：用“更均匀的参考X”去找底部弧线挂点
  // 推荐优先用 anchor.x（人体触点的 x 更均匀），其次也可以用 endX
  let preferX = anchor.x; // 或者试试：let preferX = endX;
  t.bottomT = pickBottomT(preferX, t.flickerSeed + brokenCount * 13.7);


  // ====== ✅ 线须（静态“死线”）只在断裂时生成一次 ======
  t.wordTailLen = random(18, 45);
  t.bottomTailLen = random(20, 65);

  // 生成点集时的“起点”（后续挂点会抖动，我们用它来整体平移点集）
  t.wordTailOrigin = { x: t.wordHang.x, y: t.wordHang.y };
  t.bottomTailOrigin = { x: t.bodyHang.x, y: t.bodyHang.y };

  // 静态曲线点（一次生成，之后形状不变）
  t.wordTailPts = buildDeadHangingPts(
    t.wordHang.x, t.wordHang.y,
    t.wordHang.x, t.wordHang.y + t.wordTailLen,
    t.flickerSeed + 101
  );

  t.bottomTailPts = buildDeadHangingPts(
    t.bodyHang.x, t.bodyHang.y,
    t.bodyHang.x, t.bodyHang.y + t.bottomTailLen,
    t.flickerSeed + 202
  );

  // 记录断裂时刻
  t.brokenFrame = frameCount;

  brokenCount++;

  // 断裂后：让内部缠绕开始“缩回”
  t.unwind = 0;       // 0 -> 1
  t.unwinding = true; // 开始缩回

  // ✅ 每断一根线：从底部弧线往上长茎，然后开花
  spawnFlowerFromBreak(t);

}

function updateHangPoint(p, tx, ty) {
  let k = 0.08;     // 弹簧强度
  let damp = 0.78;  // 阻尼

  let ax = (tx - p.x) * k;
  let ay = (ty - p.y) * k;

  p.vx = (p.vx + ax) * damp;
  p.vy = (p.vy + ay) * damp;

  p.x += p.vx;
  p.y += p.vy;
}

function updateHangPointWithGravity(p, tx, ty, g) {
  // 先走原来的弹簧
  updateHangPoint(p, tx, ty);
  // 再加一点“往下坠”的重力感
  p.vy += g;
}


// ====== 画你的小人轮廓（原样） ======
// =================== 铅笔轮廓版小人 ===================

// 可调参数（你想更“铅笔”就调这些）
let PENCIL_PASSES = 10;       // 叠几笔（5~10）
let PENCIL_JITTER = 7;     // 抖动幅度（1.2~3.2）
let PENCIL_ALPHA = 80;      // 基础透明度（70~160）
let PENCIL_W = 1;          // 线粗（0.8~1.8）
let OUTLINE_SAMPLES = 300;   // 轮廓采样密度（220~520，越大越细但更耗）

function drawPerson() {
  noFill(); // 只画轮廓，不填充
  strokeCap(ROUND);
  strokeJoin(ROUND);

  // 每帧固定一组种子，让轮廓“稳定”但又有铅笔感
  // 如果你希望轮廓也轻微“呼吸抖动”，把 frameCount*0.01 加进去
  let baseSeed = 1000;

  // 采样轮廓点
  let pts = [];
  for (let i = 0; i <= OUTLINE_SAMPLES; i++) {
    let u = i / OUTLINE_SAMPLES;
    pts.push(pointOnPersonOutline(u));
  }

  // 多次叠画 = 铅笔的“多根线”
  for (let p = 0; p < PENCIL_PASSES; p++) {
    // 每一笔的透明度/粗细都略不同
    let a = PENCIL_ALPHA * random(0.55, 1.0);
    let w = PENCIL_W * random(0.85, 1.25);

    stroke(20, a);
    strokeWeight(w);

    beginShape();
    for (let i = 0; i < pts.length; i++) {
      let pt = pts[i];

      // 计算切线方向 -> 法线方向（让抖动沿着“垂直轮廓”的方向更像手绘）
      let p0 = pts[max(0, i - 1)];
      let p1 = pts[min(pts.length - 1, i + 1)];
      let dx = p1.x - p0.x;
      let dy = p1.y - p0.y;
      let len = sqrt(dx * dx + dy * dy) + 0.0001;
      let nx = -dy / len;
      let ny = dx / len;

      // 噪声：每一笔不同、每个点不同（稳定、不跳）
      let n = noise(baseSeed + p * 10.3 + i * 0.06);
      let jitter = (n - 0.5) * 2.0 * PENCIL_JITTER;

      // 让抖动在局部更有“铅笔颗粒”的感觉
      let grain = (noise(baseSeed + 999 + p * 3.7 + i * 0.18) - 0.5) * 0.8;

      let x = pt.x + nx * jitter + grain;
      let y = pt.y + ny * jitter + grain;

      vertex(x, y);
    }
    endShape(CLOSE);
  }
}


// =================== 花朵系统函数区 ===================

// 判断点是否在身体内部（用 yBins）
function insideBody(x, y) {
  if (y < yMin || y > yMax) return false;
  if (y < FLOWER_HEAD_LIMIT_Y) return false; // 头部以上不允许
  let span = bodySpanAtY(y);
  if (!span) return false;
  return x >= span.minX && x <= span.maxX;
}

// 生成均匀分散花位点：网格+抖动+洗牌（稳定、好控）
function buildFlowerSlots() {
  flowerSlots = [];
  flowerSlotIdx = 0;

  let step = FLOWER_MIN_DIST;
  let pad = 10;
  let y1 = FLOWER_HEAD_LIMIT_Y + 10;
  let y2 = yMax - 12;

  for (let y = y1; y <= y2; y += step) {
    let span = bodySpanAtY(y);
    if (!span) continue;

    let x1 = span.minX + pad;
    let x2 = span.maxX - pad;

    for (let x = x1; x <= x2; x += step) {
      let px = x + random(-step * 0.35, step * 0.35);
      let py = y + random(-step * 0.35, step * 0.35);

      if (insideBody(px, py)) {
        flowerSlots.push({ x: px, y: py });
      }
    }
  }
  shuffleArray(flowerSlots);
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    let j = floor(random(i + 1));
    let tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
}

// 颜色：鲜艳但不过饱和（HSB 控制更稳）
function pickVividColor(alphaMin, alphaMax) {
  colorMode(HSB, 360, 100, 100, 255);
  let h = random(0, 360);
  let s = random(52, 78); // 不要过饱和
  let v = random(70, 95); // 亮但不刺
  let a = random(alphaMin, alphaMax);
  let c = color(h, s, v, a);
  colorMode(RGB, 255, 255, 255, 255);
  return { r: red(c), g: green(c), b: blue(c), a: alpha(c) };
}

function pickStemGreen(alphaMin, alphaMax) {
  colorMode(HSB, 360, 100, 100, 255);
  let h = random(95, 145);  // 绿域
  let s = random(35, 75);
  let v = random(35, 78);   // 深浅不一
  let a = random(alphaMin, alphaMax);
  let c = color(h, s, v, a);
  colorMode(RGB, 255, 255, 255, 255);
  return { r: red(c), g: green(c), b: blue(c), a: alpha(c) };
}

// 从底部弧线点 bottom 向上生成“蜿蜒根茎路径”
function buildStemPts(bottom, target, seed) {
  let pts = [];
  pts.push({ x: bottom.x, y: bottom.y });

  let steps = 140;
  let stepLen = 4.2;

  // 初始方向：向上
  let ang = -HALF_PI;

  // 关键参数（你只要调这三个）
  let WANDER = 0.10;     // 蜿蜒强度（越小越直：0.06~0.16）
  let ATTRACT = 0.20;    // 朝目标吸引力（越大越直：0.12~0.35）
  let UP_FORCE = 2.6;    // 每步至少往上走多少（越大越“往上爬”）

  for (let i = 0; i < steps; i++) {
    let last = pts[pts.length - 1];

    // 接近目标就停
    if (dist(last.x, last.y, target.x, target.y) < stepLen * 2.0) break;

    // 1) 目标方向（让茎总体朝目标）
    let toTx = target.x - last.x;
    let toTy = target.y - last.y;
    let targetAng = atan2(toTy, toTx);

    // 2) 蜿蜒噪声（小一点，不要太会拐）
    let n = noise(seed + i * 0.12);
    let turn = map(n, 0, 1, -WANDER, WANDER);

    // 3) 角度更新：部分跟随目标 + 少量蜿蜒
    ang = lerpAngle(ang, targetAng, ATTRACT) + turn;

    // 走一步
    let nx = last.x + cos(ang) * stepLen;
    let ny = last.y + sin(ang) * stepLen;

    // ✅ 强制“往上爬”但别用 random：用固定 up force 更平滑
    ny = min(ny, last.y - UP_FORCE);

    // 身体约束
    let span = bodySpanAtY(ny);
    if (!span) break;

    // ✅ 不要硬夹回去：靠近边界就温柔推回（更自然）
    let m = 12;
    let xL = span.minX + m;
    let xR = span.maxX - m;

    if (nx < xL) nx = lerp(nx, xL, 0.65);
    if (nx > xR) nx = lerp(nx, xR, 0.65);

    if (ny < FLOWER_HEAD_LIMIT_Y + 8) break;

    pts.push({ x: nx, y: ny });
  }

  // 最后一段落到目标点
  pts.push({ x: target.x, y: target.y });
  return pts;
}

// ✅ 角度 lerp（避免角度跨 PI 跳变）
function lerpAngle(a, b, t) {
  let d = (b - a + PI) % (TWO_PI) - PI;
  return a + d * t;
}


// 断线触发：生成一朵花（位置均匀分散）
function spawnFlowerFromBreak(t) {
  if (flowerSlots.length === 0 || flowerSlotIdx >= flowerSlots.length) {
    buildFlowerSlots();
  }
  let spot = flowerSlots[flowerSlotIdx++];
  if (!spot) return;

  // ✅ 起点：底部贝塞尔弧线 personSegs[2]
  // 你已经在 breakTether 里算好了 t.bottomT（很均匀），直接用它
  let bottom = pointOnBottomArc(t.bottomT);

  // 颜色：茎绿 / 花色 / 花心色
  let stemC = pickStemGreen(90, 160);
  let petalC = pickVividColor(180, 250);

  // 花心：同色系稍微偏暖/更亮（不固定黄）
  let centerC = pickVividColor(160, 230);
  // 把花心 hue 往花瓣 hue 靠近一点（简单做法：混合）
  centerC.r = (centerC.r * 0.35 + petalC.r * 0.65);
  centerC.g = (centerC.g * 0.35 + petalC.g * 0.65);
  centerC.b = (centerC.b * 0.35 + petalC.b * 0.65);

  // 花参数（像你那段“杂色花瓣”的风格）
  let petalCount = int(random(PETAL_COUNT_MIN, PETAL_COUNT_MAX));
  let size = random(FLOWER_SIZE_MIN, FLOWER_SIZE_MAX);
  let rot = random(TWO_PI);

  // 根茎路径（固定）
  let stemPts = buildStemPts(bottom, spot, t.flickerSeed + brokenCount * 9.1);

  flowers.push({
    stemPts,
    stemP: 0,     // 0..1
    bloomP: 0,    // 0..1
    x: spot.x,
    y: spot.y,

    // 色
    stemC, petalC, centerC,

    // 花形
    petalCount,
    size,
    rot,

    // 每朵花的“杂色抖动”固定种子
    seed: random(1000)
  });
}

// 更新：茎先长，后开花
function updateFlowers() {
  for (let i = 0; i < flowers.length; i++) {
    let f = flowers[i];
    if (f.stemP < 1) {
      f.stemP += STEM_GROW_SPEED;
      f.stemP = min(f.stemP, 1);
    } else {
      if (f.bloomP < 1) {
        f.bloomP += BLOOM_SPEED;
        f.bloomP = min(f.bloomP, 1);
      }
    }
  }
}

function drawFlowers() {
  for (let i = 0; i < flowers.length; i++) {
    drawOneFlower(flowers[i]);
  }
}

// 绘制：根茎（逐段显示） + 花（你的“多层花瓣”风格，颜色可变）+ 微微呼吸闪烁
function drawOneFlower(f) {
  // --------- 画根茎（逐段长出来）---------
  let pts = f.stemPts;
  if (!pts || pts.length < 2) return;

  let count = floor(lerp(2, pts.length, f.stemP));
  count = constrain(count, 2, pts.length);

  stroke(f.stemC.r, f.stemC.g, f.stemC.b, f.stemC.a);
  strokeWeight(STEM_W);
  noFill();

  beginShape();
  for (let i = 0; i < count; i++) {
    let p = pts[i];

    // 让茎看起来“蜿蜒”：只在中段略抖，顶端不抖
    let k = i / (pts.length - 1);      // 0..1
    let belly = sin(k * PI);           // 0..1..0
    let wig = (noise(f.seed + i * 0.2) - 0.5) * 2.0 * STEM_WIGGLE;

    vertex(p.x + wig * belly, p.y);
  }
  endShape();

  // --------- 画花（渐开）---------
  if (f.bloomP <= 0) return;

  // ✅ 固定随机：每帧不重新抖（更稳也更省）
  randomSeed(f.seed * 9999);

  push();
  translate(f.x, f.y);
  rotate(f.rot);

  let open = f.bloomP;

  // 基础尺寸（你原来那套）
  let petalLength = lerp(0, 86 * f.size, open);
  let petalWidth = lerp(0, 30 * f.size, open);

  noStroke();

  // =======================
  // ✅ Glow 参数（你主要调这里）
  // =======================
  let GLOW_LAYERS = 4;          // 3~6 越多越亮越柔
  let GLOW_SPREAD = 1.35;       // 外扩倍数：1.15~1.8
  let GLOW_ALPHA = 0.22;       // 发光透明度：0.12~0.35
  let GLOW_SHIFT = 10;         // glow 颜色更亮一点：6~20

  // =======================
  // 1) 先画“发光外圈”（更大更透明）
  // =======================
  for (let layer = 0; layer < GLOW_LAYERS; layer++) {
    let k = layer / max(1, (GLOW_LAYERS - 1));     // 0..1
    let spread = lerp(GLOW_SPREAD, 1.02, k);       // 外圈大，往里收
    let aMul = lerp(GLOW_ALPHA, 0.05, k);          // 外圈更亮，往里淡

    push();
    for (let i = 0; i < f.petalCount; i++) {
      rotate(TWO_PI / f.petalCount);

      // glow 颜色：在花瓣色基础上稍微提亮
      let rr = constrain(f.petalC.r + GLOW_SHIFT + random(-8, 8), 0, 255);
      let gg = constrain(f.petalC.g + GLOW_SHIFT + random(-8, 8), 0, 255);
      let bb = constrain(f.petalC.b + GLOW_SHIFT + random(-8, 8), 0, 255);

      let aa = lerp(0, 255 * aMul, open);
      fill(rr, gg, bb, aa);

      // 发光层不需要太“杂”，每瓣画 1~2 次即可
      let repeats = 2;
      for (let j = 0; j < repeats; j++) {
        ellipse(
          random(-1.5, 1.5) * open,
          (-80 * f.size + random(-5, 5)) * open,
          (petalWidth * spread + random(-4, 4)) * open,
          (petalLength * spread + random(-8, 8)) * open
        );
      }
    }
    pop();
  }

  // =======================
  // 2) 再画“真实花瓣”（你原来的多层杂色）
  // =======================
  for (let i = 0; i < f.petalCount; i++) {
    rotate(TWO_PI / f.petalCount);

    let layers = int(random(2, 4));
    for (let j = 0; j < layers; j++) {
      let rr = constrain(f.petalC.r + random(-18, 18), 0, 255);
      let gg = constrain(f.petalC.g + random(-18, 18), 0, 255);
      let bb = constrain(f.petalC.b + random(-18, 18), 0, 255);
      let aa = lerp(0, random(55, 120), open);

      fill(rr, gg, bb, aa);

      ellipse(
        random(-2, 2) * open,
        (-80 * f.size + random(-6, 6)) * open,
        (petalWidth + random(-8, 8)) * open,
        (petalLength + random(-14, 14)) * open
      );
    }
  }

  // =======================
  // 3) 花心：也给一点轻微 glow（可选）
  // =======================
  // 外圈光
  fill(
    constrain(f.centerC.r + 18, 0, 255),
    constrain(f.centerC.g + 18, 0, 255),
    constrain(f.centerC.b + 18, 0, 255),
    lerp(0, 80, open)
  );
  ellipse(0, 0, 70 * f.size * open, 70 * f.size * open);

  // 实心
  fill(f.centerC.r, f.centerC.g, f.centerC.b, lerp(0, 230, open));
  ellipse(0, 0, 48 * f.size * open, 48 * f.size * open);

  pop();

}
