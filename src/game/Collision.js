/** Geometry helpers shared by the simulation. */

export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

export function dist(ax, ay, bx, by) {
  return Math.sqrt(dist2(ax, ay, bx, by));
}

export function circleCircle(ax, ay, ar, bx, by, br) {
  const r = ar + br;
  return dist2(ax, ay, bx, by) <= r * r;
}

export function pointInRect(x, y, rect) {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

export function circleRect(cx, cy, r, rect) {
  const nx = clamp(cx, rect.x, rect.x + rect.w);
  const ny = clamp(cy, rect.y, rect.y + rect.h);
  return dist2(cx, cy, nx, ny) <= r * r;
}

/**
 * Push a circular entity out of an axis-aligned rectangle.
 * Returns true if a correction happened.
 */
export function resolveCircleRect(entity, rect) {
  const r = entity.radius;
  const left = rect.x;
  const right = rect.x + rect.w;
  const top = rect.y;
  const bottom = rect.y + rect.h;
  const nx = clamp(entity.x, left, right);
  const ny = clamp(entity.y, top, bottom);
  const dx = entity.x - nx;
  const dy = entity.y - ny;
  const d2 = dx * dx + dy * dy;

  if (d2 > r * r) return false;

  if (d2 > 0.0001) {
    const d = Math.sqrt(d2);
    const push = r - d;
    entity.x += (dx / d) * push;
    entity.y += (dy / d) * push;
    return true;
  }

  // Center is inside the rectangle: push out along the nearest edge.
  const toLeft = entity.x - left;
  const toRight = right - entity.x;
  const toTop = entity.y - top;
  const toBottom = bottom - entity.y;
  const min = Math.min(toLeft, toRight, toTop, toBottom);

  if (min === toLeft) entity.x = left - r;
  else if (min === toRight) entity.x = right + r;
  else if (min === toTop) entity.y = top - r;
  else entity.y = bottom + r;
  return true;
}

export function resolveCircleRectWithVelocity(entity, rect) {
  const changed = resolveCircleRect(entity, rect);
  if (changed) {
    const nx = clamp(entity.x, rect.x, rect.x + rect.w);
    const ny = clamp(entity.y, rect.y, rect.y + rect.h);
    if (Math.abs(entity.x - nx) > Math.abs(entity.y - ny)) entity.vx *= -0.1;
    else entity.vy *= -0.1;
  }
  return changed;
}

export function normalize(x, y) {
  const len = Math.hypot(x, y);
  if (len < 0.0001) return { x: 0, y: 0, len: 0 };
  return { x: x / len, y: y / len, len };
}

export function formatTime(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function formatNumber(n) {
  return Math.floor(n).toLocaleString('en-US');
}
