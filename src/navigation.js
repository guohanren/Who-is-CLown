function pointBlocked(x, z, obstacles, padding = .08) {
  return obstacles.some(obstacle => (
    x > obstacle.x1 - padding
    && x < obstacle.x2 + padding
    && z > obstacle.z1 - padding
    && z < obstacle.z2 + padding
  ))
}

function segmentHitT(from, to, obstacle, padding = .12) {
  const minX = obstacle.x1 - padding
  const maxX = obstacle.x2 + padding
  const minZ = obstacle.z1 - padding
  const maxZ = obstacle.z2 + padding
  const dx = to.x - from.x
  const dz = to.z - from.z
  let tMin = 0
  let tMax = 1

  const clip = (origin, delta, min, max) => {
    if (Math.abs(delta) < 1e-6) return origin >= min && origin <= max
    let a = (min - origin) / delta
    let b = (max - origin) / delta
    if (a > b) [a, b] = [b, a]
    tMin = Math.max(tMin, a)
    tMax = Math.min(tMax, b)
    return tMin <= tMax
  }

  if (!clip(from.x, dx, minX, maxX)) return null
  if (!clip(from.z, dz, minZ, maxZ)) return null
  return tMin >= 0 && tMin <= 1 ? tMin : null
}

function firstBlockingObstacle(from, to, obstacles, padding = .12) {
  let result = null
  let nearestT = Infinity
  for (const obstacle of obstacles) {
    const t = segmentHitT(from, to, obstacle, padding)
    if (t !== null && t < nearestT) {
      nearestT = t
      result = obstacle
    }
  }
  return result
}

export function hasLineOfSight(from, to, obstacles, padding = .08) {
  return firstBlockingObstacle(from, to, obstacles, padding) === null
}

function chooseDetour(from, target, obstacles, mapHalf, radius) {
  const blocker = firstBlockingObstacle(from, target, obstacles, radius)
  if (!blocker) return null
  const gap = .55 + radius
  const candidates = [
    { x: blocker.x1 - gap, z: blocker.z1 - gap },
    { x: blocker.x1 - gap, z: blocker.z2 + gap },
    { x: blocker.x2 + gap, z: blocker.z1 - gap },
    { x: blocker.x2 + gap, z: blocker.z2 + gap },
  ]

  let best = null
  let bestScore = Infinity
  for (const candidate of candidates) {
    candidate.x = Math.max(-mapHalf, Math.min(mapHalf, candidate.x))
    candidate.z = Math.max(-mapHalf, Math.min(mapHalf, candidate.z))
    if (pointBlocked(candidate.x, candidate.z, obstacles, radius)) continue

    const firstLegBlocked = !hasLineOfSight(from, candidate, obstacles, .03)
    const secondLegBlocked = !hasLineOfSight(candidate, target, obstacles, .03)
    const firstDistance = Math.hypot(candidate.x - from.x, candidate.z - from.z)
    const secondDistance = Math.hypot(target.x - candidate.x, target.z - candidate.z)
    // Once an agent reaches a corner, picking that same corner again creates a
    // zero-distance waypoint loop and bypasses stuck recovery entirely.
    if (firstDistance < .72) continue
    const score = firstDistance + secondDistance + (firstLegBlocked ? 80 : 0) + (secondLegBlocked ? 6 : 0)
    if (score < bestScore) {
      bestScore = score
      best = candidate
    }
  }
  return best
}

function buildCornerRoute(from, target, obstacles, mapHalf, radius) {
  const gap = .48 + radius
  const nodes = [
    { x: from.x, z: from.z },
    { x: target.x, z: target.z },
  ]
  for (const obstacle of obstacles) {
    const corners = [
      { x: obstacle.x1 - gap, z: obstacle.z1 - gap },
      { x: obstacle.x1 - gap, z: obstacle.z2 + gap },
      { x: obstacle.x2 + gap, z: obstacle.z1 - gap },
      { x: obstacle.x2 + gap, z: obstacle.z2 + gap },
    ]
    for (const corner of corners) {
      corner.x = Math.max(-mapHalf, Math.min(mapHalf, corner.x))
      corner.z = Math.max(-mapHalf, Math.min(mapHalf, corner.z))
      const fromDistance = Math.hypot(corner.x - from.x, corner.z - from.z)
      if (fromDistance >= .72 && !pointBlocked(corner.x, corner.z, obstacles, .04)) nodes.push(corner)
    }
  }

  const distances = Array(nodes.length).fill(Infinity)
  const previous = Array(nodes.length).fill(-1)
  const visited = Array(nodes.length).fill(false)
  distances[0] = 0

  for (let step = 0; step < nodes.length; step++) {
    let current = -1
    for (let i = 0; i < nodes.length; i++) {
      if (!visited[i] && (current < 0 || distances[i] < distances[current])) current = i
    }
    if (current < 0 || !Number.isFinite(distances[current])) break
    if (current === 1) break
    visited[current] = true

    for (let next = 0; next < nodes.length; next++) {
      if (visited[next] || next === current || !hasLineOfSight(nodes[current], nodes[next], obstacles, radius)) continue
      const edge = Math.hypot(nodes[next].x - nodes[current].x, nodes[next].z - nodes[current].z)
      const candidate = distances[current] + edge
      if (candidate < distances[next]) {
        distances[next] = candidate
        previous[next] = current
      }
    }
  }

  if (!Number.isFinite(distances[1])) return null
  const path = []
  for (let cursor = 1; cursor >= 0; cursor = previous[cursor]) {
    path.push(nodes[cursor])
    if (cursor === 0) break
  }
  if (path[path.length - 1] !== nodes[0]) return null
  path.reverse()
  // The live target is used directly after the last corner, so moving targets
  // do not leave agents following a stale final coordinate.
  return path.slice(1, -1).map(point => ({ x: point.x, z: point.z }))
}

function rotate(x, z, angle) {
  const cosine = Math.cos(angle)
  const sine = Math.sin(angle)
  return { x: x * cosine - z * sine, z: x * sine + z * cosine }
}

function escapeExpandedObstacle(position, obstacles, padding, mapHalf) {
  for (const obstacle of obstacles) {
    const minX = obstacle.x1 - padding
    const maxX = obstacle.x2 + padding
    const minZ = obstacle.z1 - padding
    const maxZ = obstacle.z2 + padding
    if (position.x <= minX || position.x >= maxX || position.z <= minZ || position.z >= maxZ) continue
    const distances = [
      position.x - minX,
      maxX - position.x,
      position.z - minZ,
      maxZ - position.z,
    ]
    const nearest = distances.indexOf(Math.min(...distances))
    if (nearest === 0) position.x = minX - .002
    else if (nearest === 1) position.x = maxX + .002
    else if (nearest === 2) position.z = minZ - .002
    else position.z = maxZ + .002
  }
  position.x = Math.max(-mapHalf, Math.min(mapHalf, position.x))
  position.z = Math.max(-mapHalf, Math.min(mapHalf, position.z))
}

export function clearNavigation(agent) {
  if (agent) agent.navState = null
}

export function moveAgent(agent, target, speed, dt, obstacles, mapHalf, options = {}) {
  if (!agent?.p || !target || speed <= 0 || dt <= 0) {
    return { x: 0, z: 0, moved: false, arrived: true }
  }

  const radius = options.radius ?? .14
  const neighbors = options.neighbors ?? []
  const separationDistance = options.separationDistance ?? .9
  // Spawns and legacy collision correction can leave an agent a few
  // centimetres inside the navigation clearance zone. Nudge it to the nearest
  // safe edge so every candidate step is not rejected forever.
  escapeExpandedObstacle(agent.p, obstacles, radius, mapHalf)
  const safeTarget = { x: target.x, z: target.z }
  escapeExpandedObstacle(safeTarget, obstacles, radius, mapHalf)
  target = safeTarget
  const nav = agent.navState || (agent.navState = {
    waypoint: null,
    route: [],
    targetX: target.x,
    targetZ: target.z,
    stuckFor: 0,
    recoveryStage: 0,
    forceTurnFor: 0,
    forceSign: Math.random() > .5 ? 1 : -1,
  })
  if (!Array.isArray(nav.route)) nav.route = []
  if (!Number.isFinite(nav.recoveryStage)) nav.recoveryStage = 0

  if (Math.hypot(target.x - nav.targetX, target.z - nav.targetZ) > 2.2) {
    nav.waypoint = null
    nav.route = []
    nav.targetX = target.x
    nav.targetZ = target.z
  }

  const directClear = hasLineOfSight(agent.p, target, obstacles, radius)
  if (directClear) {
    nav.waypoint = null
    nav.route = []
  }
  // Do not discard a corner before the agent has actually rounded it. A wide
  // threshold makes line-of-sight fail from the near side and replans a route
  // around the opposite side, causing endless corner-to-corner ping-pong.
  if (nav.waypoint && Math.hypot(agent.p.x - nav.waypoint.x, agent.p.z - nav.waypoint.z) < .1) {
    nav.waypoint = nav.route.shift() || null
  }
  if (!nav.waypoint && !directClear) {
    nav.route = buildCornerRoute(agent.p, target, obstacles, mapHalf, radius) || []
    nav.waypoint = nav.route.shift() || chooseDetour(agent.p, target, obstacles, mapHalf, radius)
  }
  if (nav.waypoint && !hasLineOfSight(agent.p, nav.waypoint, obstacles, radius)) {
    nav.route = buildCornerRoute(agent.p, target, obstacles, mapHalf, radius) || []
    nav.waypoint = nav.route.shift() || chooseDetour(agent.p, target, obstacles, mapHalf, radius)
  }

  const destination = nav.waypoint || target
  let desiredX = destination.x - agent.p.x
  let desiredZ = destination.z - agent.p.z
  const destinationDistance = Math.hypot(desiredX, desiredZ)
  const finalDistance = Math.hypot(target.x - agent.p.x, target.z - agent.p.z)
  if (destinationDistance < .001) {
    if (finalDistance >= .7) {
      nav.waypoint = null
      nav.route = []
      nav.stuckFor += dt
    }
    return { x: 0, z: 0, moved: false, arrived: finalDistance < .7 }
  }
  desiredX /= destinationDistance
  desiredZ /= destinationDistance
  const baseDesiredX = desiredX
  const baseDesiredZ = desiredZ

  // Keep agents from forming one overlapping stack in narrow corridors.
  let separationX = 0
  let separationZ = 0
  const selfIndex = neighbors.indexOf(agent)
  for (let neighborIndex = 0; neighborIndex < neighbors.length; neighborIndex++) {
    const other = neighbors[neighborIndex]
    if (!other?.a || other === agent || !other.p) continue
    const dx = agent.p.x - other.p.x
    const dz = agent.p.z - other.p.z
    const distance = Math.hypot(dx, dz)
    if (distance <= .001) {
      const sign = selfIndex >= 0 && neighborIndex > selfIndex ? -1 : 1
      separationX += -baseDesiredZ * sign
      separationZ += baseDesiredX * sign
    } else if (distance < separationDistance) {
      const strength = (separationDistance - distance) / separationDistance
      separationX += (dx / distance) * strength
      separationZ += (dz / distance) * strength
    }
  }
  const separationLength = Math.hypot(separationX, separationZ)
  if (separationLength > .001) {
    const separationWeight = Math.min(.42, separationLength * .62)
    desiredX += (separationX / separationLength) * separationWeight
    desiredZ += (separationZ / separationLength) * separationWeight
  }
  const desiredLength = Math.hypot(desiredX, desiredZ)
  if (desiredLength < .15) {
    desiredX = baseDesiredX
    desiredZ = baseDesiredZ
  } else {
    desiredX /= desiredLength
    desiredZ /= desiredLength
  }

  nav.forceTurnFor = Math.max(0, nav.forceTurnFor - dt)
  const sign = nav.forceTurnFor > 0 ? nav.forceSign : 1
  const angles = nav.forceTurnFor > 0
    ? [sign * .55, sign * .95, -sign * .45, sign * 1.35, -sign * .9, Math.PI]
    : [0, .42, -.42, .78, -.78, 1.2, -1.2, Math.PI]

  let bestDirection = null
  let bestScore = -Infinity
  const step = Math.min(speed * dt, destinationDistance)
  for (const angle of angles) {
    const candidate = rotate(desiredX, desiredZ, angle)
    const nextX = agent.p.x + candidate.x * step
    const nextZ = agent.p.z + candidate.z * step
    if (pointBlocked(nextX, nextZ, obstacles, radius)) continue

    let clearance = 0
    for (const probe of [.38, .72, 1.05]) {
      if (!pointBlocked(agent.p.x + candidate.x * probe, agent.p.z + candidate.z * probe, obstacles, radius)) {
        clearance += 1
      }
    }
    const progress = candidate.x * desiredX + candidate.z * desiredZ
    const score = progress * 4 + clearance - Math.abs(angle) * .18
    if (score > bestScore) {
      bestScore = score
      bestDirection = candidate
    }
  }

  const oldX = agent.p.x
  const oldZ = agent.p.z
  if (bestDirection) {
    agent.p.x = Math.max(-mapHalf, Math.min(mapHalf, agent.p.x + bestDirection.x * step))
    agent.p.z = Math.max(-mapHalf, Math.min(mapHalf, agent.p.z + bestDirection.z * step))
  }

  const movedDistance = Math.hypot(agent.p.x - oldX, agent.p.z - oldZ)
  if (movedDistance < Math.max(.001, speed * dt * .12)) nav.stuckFor += dt
  else {
    nav.stuckFor = Math.max(0, nav.stuckFor - dt * 2)
    if (nav.stuckFor < .1) nav.recoveryStage = 0
  }

  if (nav.stuckFor > .42 && nav.recoveryStage < 1) {
    nav.recoveryStage = 1
    nav.waypoint = null
    nav.route = []
    nav.forceTurnFor = .8
    nav.forceSign *= -1
  }
  if (nav.stuckFor > 1.15 && nav.recoveryStage < 2) {
    nav.recoveryStage = 2
    // A prolonged block means the selected side of the obstacle is wrong.
    nav.stuckFor = 0
    nav.recoveryStage = 0
    nav.route = buildCornerRoute(agent.p, target, obstacles, mapHalf, radius + .2) || []
    nav.waypoint = nav.route.shift() || chooseDetour(agent.p, target, obstacles, mapHalf, radius + .25)
    nav.forceTurnFor = 1.1
  }

  return {
    x: bestDirection?.x ?? 0,
    z: bestDirection?.z ?? 0,
    moved: movedDistance > .001,
    arrived: finalDistance < .7,
    waypoint: nav.waypoint,
  }
}
