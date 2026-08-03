import assert from 'node:assert/strict'
import {
  firstObstacleHit,
  hasCombatLineOfSight,
  resolveMeleeAttack,
  traceGunshot,
} from '../src/combat.js'

const origin = { x: 0, y: 1.15, z: 0 }
const forward = { x: 0, y: 0, z: -1 }
const entity = (id, x, z, extra = {}) => ({ id, p: { x, y: 0, z }, ...extra })
const wall = { x1: -1, x2: 1, z1: -4, z2: -3 }

function melee(overrides = {}) {
  return resolveMeleeAttack({
    origin,
    direction: forward,
    targets: [],
    obstacles: [],
    range: 3.5,
    halfAngle: Math.PI / 4,
    ...overrides,
  })
}

function gun(overrides = {}) {
  return traceGunshot({
    origin,
    direction: forward,
    targets: [],
    obstacles: [],
    range: 9,
    ...overrides,
  })
}

// Melee requires all three conditions: range, horizontal attack arc and LOS.
assert.equal(melee({ targets: [entity('front', 0, -3)] }).target.id, 'front')
assert.equal(melee({ targets: [entity('too-far', 0, -3.51)] }).type, 'miss')
assert.equal(melee({ targets: [entity('behind', 0, 1)] }).type, 'miss')
assert.equal(melee({ targets: [entity('wide', 2.1, -2)] }).type, 'miss')
assert.equal(melee({ targets: [entity('covered', 0, -3.2)], obstacles: [wall] }).type, 'miss')
assert.equal(melee({
  targets: [entity('near', .2, -2.8), entity('far', 0, -3.2)],
}).target.id, 'near')

// Current navigation AABBs work as combat cover, including reversed bounds.
assert.equal(hasCombatLineOfSight(origin, { x: 0, y: 1.15, z: -2 }, [wall]), true)
assert.equal(hasCombatLineOfSight(origin, { x: 0, y: 1.15, z: -6 }, [wall]), false)
const reversedWall = { x1: 1, x2: -1, z1: -3, z2: -4 }
assert.equal(firstObstacleHit({ origin, direction: forward, obstacles: [reversedWall], range: 9 }).distance, 3)

// A real sight-ray hit succeeds; the old broad dot-product cone does not.
assert.equal(gun({ targets: [entity('center', 0, -7)] }).target.id, 'center')
const oldConeFalsePositive = entity('off-crosshair', 2.2, -7)
assert.ok((7 / Math.hypot(2.2, 7)) > .65)
assert.equal(gun({ targets: [oldConeFalsePositive] }).type, 'miss')

// A nearer intersecting body physically blocks a farther, more centered body.
assert.equal(gun({
  targets: [
    entity('near-edge', .5, -4, { hitRadius: .65 }),
    entity('far-center', .03, -7, { hitRadius: .65 }),
  ],
}).target.id, 'near-edge')

// Contact with a wall face blocks inward shots, but not shots aimed away from it.
const boundaryWall = { x1: 0, x2: 1, z1: -1, z2: 1, y1: 0, y2: 3 }
assert.equal(firstObstacleHit({ origin: { x: 0, y: 1, z: 0 }, direction: { x: -1, y: 0, z: 0 }, obstacles: [boundaryWall], range: 9 }), null)
assert.equal(firstObstacleHit({ origin: { x: 0, y: 1, z: 0 }, direction: { x: 1, y: 0, z: 0 }, obstacles: [boundaryWall], range: 9 }).distance, 0)

// Buildings are resolved before targets and stop hits through walls.
const blocked = gun({ targets: [entity('behind-wall', 0, -7)], obstacles: [wall] })
assert.equal(blocked.type, 'obstacle')
assert.equal(blocked.obstacle, wall)
assert.equal(blocked.distance, 3)
assert.equal(gun({ targets: [entity('before-wall', 0, -2)], obstacles: [wall] }).target.id, 'before-wall')

// Dead targets, targets behind the shooter and targets beyond range are ignored.
assert.equal(gun({ targets: [entity('dead', 0, -5, { a: false })] }).type, 'miss')
assert.equal(gun({ targets: [entity('behind', 0, 2)] }).type, 'miss')
assert.equal(gun({ targets: [entity('too-far', 0, -10)] }).type, 'miss')

// Optional vertical bounds allow low cover to be shot over.
const lowCover = { x1: -1, x2: 1, z1: -4, z2: -3, y1: 0, y2: .7 }
assert.equal(gun({ targets: [entity('over-cover', 0, -7)], obstacles: [lowCover] }).target.id, 'over-cover')

console.log('combat regression tests passed (22 assertions)')
