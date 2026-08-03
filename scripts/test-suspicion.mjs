import assert from 'node:assert/strict'
import {
  SUSPICION_STAGE,
  createSuspicionMemory,
  createSuspicionState,
  decayUnobservedSuspicion,
  getMostSuspiciousTarget,
  observeAgentBehavior,
  updateSuspicion,
  updateTargetSuspicion,
} from '../src/suspicion.js'

const step = (state, observation, seconds, dt = 1 / 60) => {
  for (let elapsed = 0; elapsed < seconds - 1e-9; elapsed += dt) {
    updateSuspicion(state, observation, Math.min(dt, seconds - elapsed))
  }
  return state
}

// The adapter must never inspect the secret identity, even accidentally.
const guardedAgent = new Proxy(
  { beh: 'capturing', spr: false, p: { x: 3, z: -2 } },
  {
    get(target, property, receiver) {
      if (property === 'isReal') throw new Error('secret identity was read')
      return Reflect.get(target, property, receiver)
    },
  },
)
const adapted = observeAgentBehavior(guardedAgent, { visible: true, walletDistance: .5 })
assert.equal(adapted.capturingWallet, true)
assert.equal(adapted.stealingWallet, false)
assert.deepEqual(adapted.position, { x: 3, z: -2 })

const approachingWallet = observeAgentBehavior(
  new Proxy(
    { beh: 'steal', p: { x: 0, z: 0 } },
    {
      get(target, property, receiver) {
        if (property === 'isReal') throw new Error('secret identity was read')
        return Reflect.get(target, property, receiver)
      },
    },
  ),
  { visible: true, walletDistance: 9 },
)
assert.equal(approachingWallet.stealingWallet, false, 'hidden destination intent leaked to observer')

// Crimes outside this observer's field of view cannot create knowledge.
const unseenCrime = createSuspicionState()
step(unseenCrime, { visible: false, capturingWallet: true, chasingPolice: true }, 10)
assert.equal(unseenCrime.score, 0)
assert.equal(unseenCrime.stage, SUSPICION_STAGE.CLEAR)

// Ordinary visible movement remains innocent.
const ordinary = createSuspicionState()
step(ordinary, { visible: true, walletDistance: 12 }, 30)
assert.equal(ordinary.score, 0)
assert.equal(ordinary.stage, SUSPICION_STAGE.CLEAR)

// Passive proximity and sprinting can draw attention, but are insufficient to
// prove identity no matter how long they continue.
const nearWallet = createSuspicionState()
step(nearWallet, { visible: true, walletDistance: 0 }, 30)
assert.equal(nearWallet.stage, SUSPICION_STAGE.ATTENTION)
assert.ok(nearWallet.score <= 24)

const runner = createSuspicionState()
step(runner, { visible: true, sprinting: true, walletDistance: 20 }, 30)
assert.equal(runner.stage, SUSPICION_STAGE.INVESTIGATE)
assert.ok(runner.score <= 42)

// A full wallet capture naturally crosses every escalating police response.
const capture = createSuspicionState()
const stages = []
for (let tick = 0; tick < 240; tick++) {
  updateSuspicion(capture, {
    visible: true,
    walletDistance: .5,
    capturingWallet: true,
    position: { x: 6, z: 4 },
  }, 1 / 60)
  if (stages.at(-1) !== capture.stage) stages.push(capture.stage)
  if (capture.stage === SUSPICION_STAGE.CONFIRMED) break
}
assert.deepEqual(stages, [
  SUSPICION_STAGE.CLEAR,
  SUSPICION_STAGE.ATTENTION,
  SUSPICION_STAGE.INVESTIGATE,
  SUSPICION_STAGE.TRACK,
  SUSPICION_STAGE.CONFIRMED,
])
assert.equal(capture.stageChanged, true)
assert.equal(capture.previousStage, SUSPICION_STAGE.TRACK)
assert.deepEqual(capture.lastKnownPosition, { x: 6, z: 4 })

// One-shot evidence is edge triggered rather than added once per render frame.
const theft = createSuspicionState()
updateSuspicion(theft, { visible: true, walletTaken: true }, 1 / 60)
const afterTheft = theft.score
step(theft, { visible: true, walletTaken: true }, 1)
assert.ok(theft.score <= afterTheft, 'wallet event repeated while held true')

// Stage hysteresis prevents rapid track/investigate flicker around a boundary.
const stable = createSuspicionState({ score: 60 })
step(stable, { visible: true }, .8)
assert.equal(stable.stage, SUSPICION_STAGE.TRACK)
step(stable, { visible: true }, 1.4)
assert.equal(stable.stage, SUSPICION_STAGE.INVESTIGATE)

// Supplying a hidden identity field cannot influence otherwise identical runs.
const identityBlindA = createSuspicionState()
const identityBlindB = createSuspicionState()
for (let tick = 0; tick < 240; tick++) {
  const common = {
    visible: tick % 80 < 60,
    walletDistance: tick < 120 ? 2 : 8,
    sprinting: tick > 40 && tick < 160,
    fleeingPolice: tick > 130,
  }
  updateSuspicion(identityBlindA, { ...common, isReal: true }, 1 / 60)
  updateSuspicion(identityBlindB, { ...common, isReal: false }, 1 / 60)
}
assert.deepEqual(identityBlindA, identityBlindB)

// Every officer owns an independent belief map and can rank its known targets.
const officerA = createSuspicionMemory()
const officerB = createSuspicionMemory()
const red = { id: 'red' }
const blue = { id: 'blue' }
for (let tick = 0; tick < 120; tick++) {
  updateTargetSuspicion(officerA, red, { visible: true, capturingWallet: true }, 1 / 60)
  updateTargetSuspicion(officerA, blue, { visible: true, sprinting: true }, 1 / 60)
}
assert.equal(getMostSuspiciousTarget(officerA).target, red)
assert.equal(officerB.targets.size, 0)

// Targets omitted from a frame decay and are eventually forgotten.
const redBeforeDecay = officerA.targets.get(red).score
decayUnobservedSuspicion(officerA, new Set([blue]), 1)
assert.ok(officerA.targets.get(red).score < redBeforeDecay)
for (let second = 0; second < 60; second++) decayUnobservedSuspicion(officerA, new Set(), 1)
assert.equal(officerA.targets.size, 0)

// The same observation sequence always produces the same complete state.
const deterministicRun = () => {
  const state = createSuspicionState()
  for (let tick = 0; tick < 600; tick++) {
    updateSuspicion(state, {
      visible: tick % 90 < 70,
      walletDistance: tick % 150 < 80 ? 1.5 : 7,
      sprinting: tick % 120 > 60,
      stealingWallet: tick > 180 && tick < 300,
      walletTaken: tick === 300,
    }, 1 / 60)
  }
  return state
}
assert.deepEqual(deterministicRun(), deterministicRun())

console.log('suspicion regression suite passed: visibility, stages, caps, memory, determinism')
