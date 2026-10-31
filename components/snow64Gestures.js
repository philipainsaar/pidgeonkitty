/**
 * Touch gesture recognition for PidgeonKitty SNOW 64.
 * Pure JS; safe to test without WebGL or a browser.
 * Points are local pixel coordinates: [{x, y}, ...].
 */
const SAMPLES = 32;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function resample(input, count = SAMPLES) {
  if (input.length < 2) return input;
  const pts = input.filter((p, i) => !i || distance(p, input[i - 1]) > 0.00001);
  if (pts.length < 2) return [input[0]];
  const cumulative = [0];
  for (let i = 1; i < pts.length; i++) cumulative.push(cumulative[i - 1] + distance(pts[i], pts[i - 1]));
  const length = cumulative[cumulative.length - 1];
  if (length < 0.01) return [pts[0]];
  const result = [];
  let j = 1;
  for (let i = 0; i < count; i++) {
    const at = (i / (count - 1)) * length;
    while (j < cumulative.length - 1 && cumulative[j] < at) j++;
    const span = cumulative[j] - cumulative[j - 1];
    const t = span ? (at - cumulative[j - 1]) / span : 0;
    result.push({x: pts[j - 1].x + (pts[j].x - pts[j - 1].x) * t,
      y: pts[j - 1].y + (pts[j].y - pts[j - 1].y) * t});
  }
  return result;
}

function normalize(points) {
  const pts = resample(points);
  if (pts.length < 2) return pts;
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const midx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const midy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const scale = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 0.001);
  return pts.map(p => ({x: (p.x - midx) / scale, y: (p.y - midy) / scale}));
}
function makeTemplate(key, label, points) {return {key, label, data: normalize(points)};}
const samples = (pts, each = 20) => pts.flatMap((p, i) => {
  if (!i) return [p];
  const prev = pts[i - 1];
  return Array.from({length: each}, (_, j) => ({x: prev.x + (p.x - prev.x) * (j + 1) / each,
    y: prev.y + (p.y - prev.y) * (j + 1) / each}));
});
const TEMPLATES = [
  makeTemplate('8', 'CORK 720', samples([{x:0,y:0},{x:1,y:0},{x:0,y:1},{x:1,y:1}])),
  makeTemplate('5', 'METHOD', samples([{x:0,y:0},{x:.5,y:1},{x:1,y:0}])),
  makeTemplate('7', 'BACKFLIP', samples([{x:0,y:0},{x:0,y:1},{x:1,y:1},{x:1,y:0}])),
  // Reverse U: start bottom left, arc upward, finish bottom right.
  makeTemplate('f', 'FRONTFLIP', samples([{x:0,y:1},{x:0,y:.32},{x:.2,y:0},{x:.8,y:0},{x:1,y:.32},{x:1,y:1}],12)),
  makeTemplate('0', 'NOSE GRAB', samples([{x:0,y:1},{x:.5,y:0},{x:1,y:1}])),
];
function compareTemplate(points, template) {
  let sum = 0;
  for (let i = 0; i < SAMPLES; i++) sum += distance(points[i], template.data[i]);
  return sum / SAMPLES;
}

export function classifySnowGesture(points) {
  if (!points || points.length < 2) return null;
  const filtered = points.filter((p, i) => !i || distance(p, points[i - 1]) > 1.5);
  if (filtered.length < 2) return null;
  let length = 0;
  for (let i = 1; i < filtered.length; i++) length += distance(filtered[i], filtered[i - 1]);
  if (length < 62) return null; // Tap: ollie; tiny finger jitter isn't a trick.
  const xs = filtered.map(p => p.x), ys = filtered.map(p => p.y);
  const w = Math.max(...xs) - Math.min(...xs);
  const h = Math.max(...ys) - Math.min(...ys);
  const size = Math.max(w, h);
  if (size < 48) return null;
  const first = filtered[0], last = filtered[filtered.length - 1];
  const dx = last.x - first.x, dy = last.y - first.y;
  const direct = Math.hypot(dx, dy);

  // Winding around the stroke's center lets a single, double or triple drawn
  // circle work in either direction. Require a substantial arc and a return
  // toward the start to avoid treating an L-shaped grab as a circle.
  const center = {x: (Math.min(...xs) + Math.max(...xs)) * .5, y: (Math.min(...ys) + Math.max(...ys)) * .5};
  let winding = 0;
  for (let i = 1; i < filtered.length; i++) {
    const a = Math.atan2(filtered[i - 1].y - center.y, filtered[i - 1].x - center.x);
    const b = Math.atan2(filtered[i].y - center.y, filtered[i].x - center.x);
    winding += Math.atan2(Math.sin(b - a), Math.cos(b - a));
  }
  const turns = Math.abs(winding) / (Math.PI * 2);
  if (w > 35 && h > 35 && direct / size < .43 && turns > .91) {
    if (turns > 2.6) return {key:'4', label:'1080', shape:'TRIPLE LOOP'};
    if (turns > 1.65) return {key:'3', label:'720', shape:'DOUBLE LOOP'};
    return {key:'2', label:'360', shape:'CIRCLE'};
  }

  // Straight strokes are reliably classified before the pattern templates.
  if (direct > 64 && length / direct < 1.19) {
    if (w > h * 1.5) return {key:'1', label:'180', shape: dx > 0 ? 'RIGHT SWIPE' : 'LEFT SWIPE', direction:dx>0?1:-1};
    if (h > w * 1.5) return dy < 0 ? {key:'6', label:'INDY GRAB', shape:'UP SWIPE'} : {key:'9', label:'TAIL GRAB', shape:'DOWN SWIPE'};
    if (dx > 0 && dy < 0) return {key:'5', label:'METHOD', shape:'UP-RIGHT'};
    if (dx < 0 && dy < 0) return {key:'0', label:'NOSE GRAB', shape:'UP-LEFT'};
    if (dx > 0 && dy > 0) return {key:'6', label:'INDY GRAB', shape:'DOWN-RIGHT'};
    return {key:'9', label:'TAIL GRAB', shape:'DOWN-LEFT'};
  }

  const normalized = normalize(filtered);
  if (normalized.length !== SAMPLES) return null;
  const sorted = TEMPLATES.map(t=>({template:t, error:compareTemplate(normalized,t)})).sort((a,b)=>a.error-b.error);
  if (sorted[0].error < .17 && (!sorted[1] || sorted[1].error - sorted[0].error > .018)) {
    const {key,label}=sorted[0].template;
    return {key,label,shape:key==='8'?'ZIGZAG':key==='7'?'U SHAPE':key==='f'?'INVERTED U':key==='5'?'V SHAPE':'CHEVRON'};
  }
  // Unrecognized scribbles are NOT tricks. No automatic easy grab fallback.
  return null;
}

export const MOBILE_TRICK_GUIDE = [
  ['TAP', 'OLLIE'], ['→ / ←', '180'], ['↻', '360'], ['↻↻', '720'],
  ['↻↻↻', '1080'], ['Z', 'CORK 720'], ['V', 'METHOD'], ['∪', 'BACKFLIP'],
  ['↑', 'INDY GRAB'], ['↓', 'TAIL GRAB'], ['↖', 'NOSE GRAB'], ['∩', 'FRONTFLIP'],
];
