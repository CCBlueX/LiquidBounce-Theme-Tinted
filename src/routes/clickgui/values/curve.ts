// The client's curve evaluation (CurveUtil.transformNormalized with CLAMP, as CurveValue.transform calls it), so the
// editor draws what the client computes. Points must be sorted by x; y is a cubic Bezier's y at t linear in x.
import type { Vec2 } from "../../../lib/api/types";

type Point = Pick<Vec2, "x" | "y">;

export const DEFAULT_TENSION = 0.4;

export function curveY(data: Point[], x: number, tension = DEFAULT_TENSION): number {
  if (data.length === 1) return data[0].y;
  const first = data[0];
  const last = data[data.length - 1];
  if (x <= first.x) return first.y;
  if (x >= last.x) return last.y;
  if (data.length === 2) return linear(first, last, x);
  const exact = data.find((point) => point.x === x);
  if (exact) return exact.y;
  const t = Number.isFinite(tension) ? Math.min(1, Math.max(0, tension)) : 0;
  return spline(data, x, t);
}

function controlPoints(data: Point[], x: number): [Point, Point, Point] {
  const last = data.length - 1;
  const adjusted = x === data[0].x ? x + 1 : x;
  let next = data.findIndex((point) => point.x >= adjusted);
  if (next === -1 || adjusted === data[last].x) next = last;
  return [data[Math.max(0, next - 2)], data[Math.max(0, next - 1)], data[next] ?? data[last]];
}

function spline(data: Point[], x: number, tension: number): number {
  const [prev, point, next] = controlPoints(data, x);
  const t = next.x === x ? 1 : next.x === point.x ? 0 : Math.min(1, Math.max(0, (x - point.x) / (next.x - point.x)));
  const p1 = handles(prev, point, next, tension)[1];
  const p2 = secondHandle(data, next, tension);
  const mt = 1 - t;
  return mt * mt * mt * point.y + 3 * mt * mt * t * p1.y + 3 * mt * t * t * p2.y + t * t * t * next.y;
}

/** Control points before and after `point`, along the line from `prev` to `next`, scaled by distance. */
function handles(prev: Point, point: Point, next: Point, tension: number): [Point, Point] {
  const d01 = Math.hypot(point.x - prev.x, point.y - prev.y);
  const d12 = Math.hypot(next.x - point.x, next.y - point.y);
  const total = d01 + d12;
  if (total === 0) return [point, point];
  const fa = (tension * d01) / total;
  const fb = (tension * d12) / total;
  const dx = next.x - prev.x;
  const dy = next.y - prev.y;
  return [
    { x: point.x - dx * fa, y: point.y - dy * fa },
    { x: point.x + dx * fb, y: point.y + dy * fb },
  ];
}

function secondHandle(data: Point[], current: Point, tension: number): Point {
  const index = data.findIndex((point) => point.x > current.x);
  if (index === -1) return current;
  const segment = data[index - 1] ?? current;
  const after = data[index] ?? current;
  return handles(...controlPoints(data, segment.x + (after.x - segment.x)), tension)[0];
}

function linear(p0: Point, p1: Point, x: number): number {
  const dx = p1.x - p0.x;
  return dx === 0 ? p0.y : p0.y + ((p1.y - p0.y) * (x - p0.x)) / dx;
}
