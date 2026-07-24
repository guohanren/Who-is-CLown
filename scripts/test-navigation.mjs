import { moveAgent } from '../src/navigation.js'

const BUILDINGS = [
  [-8, -8, 6, 8], [8, -10, 8, 6], [-12, 8, 5, 5], [10, 6, 7, 7],
  [0, 15, 10, 4], [-18, -2, 4, 10], [18, -3, 5, 8], [0, -18, 12, 5],
  [-22, 16, 6, 6], [22, 14, 5, 5], [-20, -16, 7, 7], [20, -16, 6, 6],
]
const OBSTACLES = BUILDINGS.map(([x, z, width, depth]) => ({
  x1: x - width / 2 - .55,
  x2: x + width / 2 + .55,
  z1: z - depth / 2 - .55,
  z2: z + depth / 2 + .55,
}))

let seed = 0x5eedc0de
function random() {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
  return seed / 0x100000000
}

function blocked(point) {
  return OBSTACLES.some(obstacle => (
    point.x > obstacle.x1 && point.x < obstacle.x2
    && point.z > obstacle.z1 && point.z < obstacle.z2
  ))
}

function samplePoint() {
  for (;;) {
    const point = { x: (random() - .5) * 54, z: (random() - .5) * 54 }
    if (!blocked(point)) return point
  }
}

function routeReachesTarget(start, target, maxTicks = 2400) {
  const agent = { p: { ...start }, a: true }
  for (let tick = 0; tick < maxTicks; tick++) {
    moveAgent(agent, target, 2.5, .02, OBSTACLES, 29)
    if (Math.hypot(agent.p.x - target.x, agent.p.z - target.z) < .7) return true
  }
  return false
}

// Regression for the original same-corner zero-distance loop.
if (!routeReachesTarget(
  { x: -14.6949, z: -24.817 },
  { x: -4.3962, z: -4.354 },
)) {
  throw new Error('same-corner route became permanently stuck')
}

for (let index = 0; index < 1000; index++) {
  const start = samplePoint()
  const target = samplePoint()
  if (!routeReachesTarget(start, target)) {
    throw new Error(`random route ${index} failed: ${JSON.stringify({ start, target })}`)
  }
}

// Regression for separation exactly cancelling the target direction.
const crowdedAgent = { p: { x: 0, z: 0 }, a: true }
const crowd = [
  crowdedAgent,
  { p: { x: .203225806, z: 0 }, a: true },
  { p: { x: .203225806, z: 0 }, a: true },
]
for (let tick = 0; tick < 180; tick++) {
  moveAgent(crowdedAgent, { x: 10, z: 0 }, 2.5, 1 / 60, [], 29, {
    neighbors: crowd,
    separationDistance: 1.05,
  })
}
if (Math.hypot(crowdedAgent.p.x, crowdedAgent.p.z) < 5) {
  throw new Error('crowded agent failed to make forward progress')
}

console.log('navigation regression suite passed: 1001 routes + crowd separation')
