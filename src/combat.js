const EPSILON = 1e-8

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback
}

function point(value, fallbackY = 0) {
  return {
    x: finite(value?.x),
    y: finite(value?.y, fallbackY),
    z: finite(value?.z),
  }
}

function normalizeDirection(value, horizontalOnly = false) {
  const x = finite(value?.x)
  const y = horizontalOnly ? 0 : finite(value?.y)
  const z = finite(value?.z)
  const length = Math.hypot(x, y, z)
  if (length < EPSILON) return null
  return { x: x / length, y: y / length, z: z / length }
}

function aimPointFor(target, defaultAimHeight) {
  const explicit = target?.aimPoint ?? target?.center
  if (explicit) return point(explicit)

  // A bare vector is already an aim point. Entity objects normally expose a
  // feet/root position through `p` or `position`, so lift those to the torso.
  const base = target?.p ?? target?.position
  if (!base && Number.isFinite(target?.x) && Number.isFinite(target?.z)) return point(target)
  const position = point(base)
  position.y += finite(target?.aimHeight, defaultAimHeight)
  return position
}

function targetRadiusFor(target, fallback) {
  const radius = target?.hitRadius ?? target?.radius ?? fallback
  return Math.max(0, finite(radius, fallback))
}

function canHitTarget(target, index, filter) {
  if (!target || target.a === false || target.alive === false || target.active === false) return false
  return !filter || filter(target, index)
}

function obstacleBounds(obstacle, padding) {
  const rawX1 = obstacle?.x1 ?? obstacle?.minX
  const rawX2 = obstacle?.x2 ?? obstacle?.maxX
  const rawZ1 = obstacle?.z1 ?? obstacle?.minZ
  const rawZ2 = obstacle?.z2 ?? obstacle?.maxZ
  if (![rawX1, rawX2, rawZ1, rawZ2].every(Number.isFinite)) return null

  const bounds = {
    minX: Math.min(rawX1, rawX2) - padding,
    maxX: Math.max(rawX1, rawX2) + padding,
    minZ: Math.min(rawZ1, rawZ2) - padding,
    maxZ: Math.max(rawZ1, rawZ2) + padding,
    minY: -Infinity,
    maxY: Infinity,
  }
  const rawY1 = obstacle?.y1 ?? obstacle?.minY ?? obstacle?.bottom
  const rawY2 = obstacle?.y2 ?? obstacle?.maxY ?? obstacle?.top
  if (Number.isFinite(rawY1) && Number.isFinite(rawY2)) {
    bounds.minY = Math.min(rawY1, rawY2) - padding
    bounds.maxY = Math.max(rawY1, rawY2) + padding
  }
  return bounds
}

function rayBoundsDistance(origin, direction, bounds, range) {
  let entry = 0
  let exit = range

  const clip = (position, velocity, minimum, maximum) => {
    if (Math.abs(velocity) < EPSILON) return position >= minimum && position <= maximum
    let near = (minimum - position) / velocity
    let far = (maximum - position) / velocity
    if (near > far) [near, far] = [far, near]
    entry = Math.max(entry, near)
    exit = Math.min(exit, far)
    return entry <= exit
  }

  if (!clip(origin.x, direction.x, bounds.minX, bounds.maxX)) return null
  if (!clip(origin.z, direction.z, bounds.minZ, bounds.maxZ)) return null
  if (Number.isFinite(bounds.minY) && !clip(origin.y, direction.y, bounds.minY, bounds.maxY)) return null
  // A ray exactly on a face and pointing out of the box has no positive
  // travel through the obstacle. Treating that contact as a distance-zero hit
  // makes shots self-block when collision correction snaps a player to a wall.
  if (exit <= EPSILON) return null
  return entry <= range ? Math.max(0, entry) : null
}

function atDistance(origin, direction, distance) {
  return {
    x: origin.x + direction.x * distance,
    y: origin.y + direction.y * distance,
    z: origin.z + direction.z * distance,
  }
}

/**
 * Return the first AABB hit by a ray. Game buildings may use the existing
 * `{x1, x2, z1, z2}` format; adding y bounds makes the check fully 3D.
 */
export function firstObstacleHit({
  origin,
  direction,
  obstacles = [],
  range = Infinity,
  padding = 0,
} = {}) {
  const start = point(origin)
  const ray = normalizeDirection(direction)
  const maxDistance = Math.max(0, finite(range, Infinity))
  if (!ray || maxDistance <= 0) return null

  let nearest = null
  for (let index = 0; index < obstacles.length; index++) {
    const bounds = obstacleBounds(obstacles[index], Math.max(0, padding))
    if (!bounds) continue
    const distance = rayBoundsDistance(start, ray, bounds, maxDistance)
    if (distance === null || (nearest && distance >= nearest.distance)) continue
    nearest = {
      obstacle: obstacles[index],
      obstacleIndex: index,
      distance,
      point: atDistance(start, ray, distance),
    }
  }
  return nearest
}

/** Check a direct segment against the obstacle AABBs. */
export function hasCombatLineOfSight(from, to, obstacles = [], padding = 0) {
  const start = point(from)
  const end = point(to)
  const delta = {
    x: end.x - start.x,
    y: end.y - start.y,
    z: end.z - start.z,
  }
  const distance = Math.hypot(delta.x, delta.y, delta.z)
  if (distance < EPSILON) return true
  const blocker = firstObstacleHit({
    origin: start,
    direction: delta,
    obstacles,
    range: distance,
    padding,
  })
  // An AABB touching the target point should still count as cover, while tiny
  // floating-point contact exactly beyond the segment should not.
  return !blocker || blocker.distance > distance - 1e-6
}

/**
 * Resolve one horizontal melee swing. The angle is a half-angle in radians,
 * so `Math.PI / 4` produces a 90-degree attack arc.
 */
export function resolveMeleeAttack({
  origin,
  direction,
  targets = [],
  obstacles = [],
  range = 3.5,
  halfAngle = Math.PI / 4,
  targetHeight = 1,
  obstaclePadding = .04,
  filter,
} = {}) {
  const start = point(origin)
  const forward = normalizeDirection(direction, true)
  const maxDistance = Math.max(0, finite(range, 0))
  const maxAngle = Math.max(0, Math.min(Math.PI, finite(halfAngle, Math.PI / 4)))
  if (!forward || maxDistance <= 0) return { type: 'miss', reason: 'invalid-attack' }

  let best = null
  for (let index = 0; index < targets.length; index++) {
    const target = targets[index]
    if (!canHitTarget(target, index, filter)) continue
    const targetPoint = aimPointFor(target, targetHeight)
    const dx = targetPoint.x - start.x
    const dz = targetPoint.z - start.z
    const distance = Math.hypot(dx, dz)
    if (distance > maxDistance + EPSILON) continue

    const cosine = distance < EPSILON
      ? 1
      : Math.max(-1, Math.min(1, (dx * forward.x + dz * forward.z) / distance))
    const angle = Math.acos(cosine)
    if (angle > maxAngle + EPSILON) continue
    if (!hasCombatLineOfSight(start, targetPoint, obstacles, obstaclePadding)) continue

    if (!best || distance < best.distance - EPSILON || (
      Math.abs(distance - best.distance) <= EPSILON && angle < best.angle
    )) {
      best = {
        type: 'target',
        target,
        targetIndex: index,
        distance,
        angle,
        point: targetPoint,
      }
    }
  }
  return best ?? { type: 'miss', reason: 'no-target' }
}

/**
 * Trace a shot through a small spherical hit volume around each target torso.
 * Candidates must intersect the actual sight ray. The first physical body on
 * that ray wins, with angular alignment used only as a deterministic tie-breaker.
 * The nearest building hit is calculated first and excludes targets behind it.
 */
export function traceGunshot({
  origin,
  direction,
  targets = [],
  obstacles = [],
  range = 9,
  targetRadius = .62,
  targetHeight = 1.15,
  obstaclePadding = 0,
  filter,
} = {}) {
  const start = point(origin)
  const ray = normalizeDirection(direction)
  const maxDistance = Math.max(0, finite(range, 0))
  if (!ray || maxDistance <= 0) {
    return { type: 'miss', reason: 'invalid-shot', distance: 0, point: start }
  }

  const obstacleHit = firstObstacleHit({
    origin: start,
    direction: ray,
    obstacles,
    range: maxDistance,
    padding: obstaclePadding,
  })
  const coverDistance = obstacleHit?.distance ?? Infinity
  let best = null

  for (let index = 0; index < targets.length; index++) {
    const target = targets[index]
    if (!canHitTarget(target, index, filter)) continue
    const center = aimPointFor(target, targetHeight)
    const radius = targetRadiusFor(target, targetRadius)
    if (radius <= 0) continue

    const offset = {
      x: center.x - start.x,
      y: center.y - start.y,
      z: center.z - start.z,
    }
    const projection = offset.x * ray.x + offset.y * ray.y + offset.z * ray.z
    if (projection < -radius || projection > maxDistance + radius) continue
    const centerDistanceSq = offset.x ** 2 + offset.y ** 2 + offset.z ** 2
    const lateralSq = Math.max(0, centerDistanceSq - projection ** 2)
    if (lateralSq > radius ** 2 + EPSILON) continue

    const halfChord = Math.sqrt(Math.max(0, radius ** 2 - lateralSq))
    const exitDistance = projection + halfChord
    const hitDistance = Math.max(0, projection - halfChord)
    if (exitDistance < 0 || hitDistance > maxDistance + EPSILON) continue
    // Cover wins ties too, preventing shots along a wall face from leaking
    // through because of floating point noise.
    if (coverDistance <= hitDistance + 1e-6) continue

    const crosshairOffset = Math.sqrt(lateralSq) / Math.max(projection, EPSILON)
    if (!best || hitDistance < best.distance - EPSILON || (
      Math.abs(hitDistance - best.distance) <= EPSILON
      && crosshairOffset < best.crosshairOffset
    )) {
      best = {
        type: 'target',
        target,
        targetIndex: index,
        distance: hitDistance,
        centerDistance: Math.sqrt(centerDistanceSq),
        crosshairOffset,
        point: atDistance(start, ray, hitDistance),
        aimPoint: center,
      }
    }
  }

  if (best) return best
  if (obstacleHit) return { type: 'obstacle', ...obstacleHit }
  return {
    type: 'miss',
    reason: 'no-target',
    distance: maxDistance,
    point: atDistance(start, ray, maxDistance),
  }
}
