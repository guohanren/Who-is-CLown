/**
 * Observable-behaviour suspicion model.
 *
 * This module deliberately has no concept of a target's real role. Callers
 * must provide only facts that a particular police observer can perceive.
 * Keeping the model pure JavaScript also lets the single-player client and a
 * future authoritative multiplayer server share exactly the same rules.
 */

export const SUSPICION_STAGE = Object.freeze({
  CLEAR: 'clear',
  ATTENTION: 'attention',
  INVESTIGATE: 'investigate',
  TRACK: 'track',
  CONFIRMED: 'confirmed',
})

export const SUSPICION_STAGE_LABEL = Object.freeze({
  [SUSPICION_STAGE.CLEAR]: '平常',
  [SUSPICION_STAGE.ATTENTION]: '注意',
  [SUSPICION_STAGE.INVESTIGATE]: '调查',
  [SUSPICION_STAGE.TRACK]: '追踪',
  [SUSPICION_STAGE.CONFIRMED]: '确认',
})

const STAGES = [
  SUSPICION_STAGE.CLEAR,
  SUSPICION_STAGE.ATTENTION,
  SUSPICION_STAGE.INVESTIGATE,
  SUSPICION_STAGE.TRACK,
  SUSPICION_STAGE.CONFIRMED,
]

const DEFAULTS = {
  maxScore: 100,
  thresholds: {
    attention: 18,
    investigate: 36,
    track: 58,
    confirmed: 82,
  },
  // Points per second while the observer can see the behaviour.
  rates: {
    nearWallet: 2.4,
    sprinting: 3.5,
    stealingWallet: 6,
    fleeingPolice: 9,
    chasingPolice: 14,
    capturingWallet: 24,
    attackingPolice: 22,
  },
  // A weak signal cannot identify a clown by itself, even if repeated forever.
  signalCaps: {
    nearWallet: 24,
    sprinting: 42,
    stealingWallet: 64,
    fleeingPolice: 76,
    chasingPolice: 90,
    capturingWallet: 100,
    attackingPolice: 100,
  },
  // One-shot evidence. Rising-edge detection prevents frame-rate dependence.
  pulses: {
    walletTaken: 42,
    policeAttacked: 62,
  },
  walletAwarenessRadius: 4,
  visibleDecay: 5,
  unseenDecay: 2.2,
  confirmedDecayMultiplier: .45,
  decayGrace: .7,
  evidenceRampSeconds: 4,
  maxEvidenceMultiplier: 1.35,
  hysteresis: 5,
  forgetAfter: 25,
}

function deepFreeze(value) {
  Object.freeze(value)
  Object.values(value).forEach(child => {
    if (child && typeof child === 'object' && !Object.isFrozen(child)) deepFreeze(child)
  })
  return value
}

export const DEFAULT_SUSPICION_CONFIG = deepFreeze(DEFAULTS)

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function validateConfig(config) {
  const ordered = STAGES.slice(1).map(stage => config.thresholds[stage])
  if (ordered.some(value => !Number.isFinite(value))) {
    throw new TypeError('Suspicion thresholds must be finite numbers')
  }
  for (let index = 1; index < ordered.length; index++) {
    if (ordered[index] <= ordered[index - 1]) {
      throw new RangeError('Suspicion thresholds must be strictly increasing')
    }
  }
  if (ordered[0] < 0 || ordered.at(-1) > config.maxScore) {
    throw new RangeError('Suspicion thresholds must fit within maxScore')
  }
  return config
}

/** Create a reusable, validated configuration with optional balancing changes. */
export function createSuspicionConfig(overrides = {}) {
  return validateConfig({
    ...DEFAULT_SUSPICION_CONFIG,
    ...overrides,
    thresholds: { ...DEFAULT_SUSPICION_CONFIG.thresholds, ...overrides.thresholds },
    rates: { ...DEFAULT_SUSPICION_CONFIG.rates, ...overrides.rates },
    signalCaps: { ...DEFAULT_SUSPICION_CONFIG.signalCaps, ...overrides.signalCaps },
    pulses: { ...DEFAULT_SUSPICION_CONFIG.pulses, ...overrides.pulses },
  })
}

export function getSuspicionStage(score, config = DEFAULT_SUSPICION_CONFIG) {
  const value = finite(score)
  if (value >= config.thresholds.confirmed) return SUSPICION_STAGE.CONFIRMED
  if (value >= config.thresholds.track) return SUSPICION_STAGE.TRACK
  if (value >= config.thresholds.investigate) return SUSPICION_STAGE.INVESTIGATE
  if (value >= config.thresholds.attention) return SUSPICION_STAGE.ATTENTION
  return SUSPICION_STAGE.CLEAR
}

export function getSuspicionStageRank(stage) {
  const rank = STAGES.indexOf(stage)
  return rank < 0 ? 0 : rank
}

export function isSuspicionAtLeast(stateOrStage, minimumStage) {
  const stage = typeof stateOrStage === 'string' ? stateOrStage : stateOrStage?.stage
  return getSuspicionStageRank(stage) >= getSuspicionStageRank(minimumStage)
}

function stageWithHysteresis(score, currentStage, config) {
  const proposed = getSuspicionStage(score, config)
  const currentRank = getSuspicionStageRank(currentStage)
  const proposedRank = getSuspicionStageRank(proposed)
  if (proposedRank >= currentRank || currentRank === 0) return proposed

  const currentThreshold = config.thresholds[currentStage]
  if (Number.isFinite(currentThreshold) && score >= currentThreshold - config.hysteresis) {
    return currentStage
  }
  return proposed
}

export function createSuspicionState(initial = {}, config = DEFAULT_SUSPICION_CONFIG) {
  const score = clamp(finite(initial.score), 0, config.maxScore)
  const stage = getSuspicionStage(score, config)
  return {
    score,
    stage,
    previousStage: stage,
    stageChanged: false,
    lastStageChangeAt: Number.isFinite(initial.lastStageChangeAt) ? initial.lastStageChangeAt : null,
    age: Math.max(0, finite(initial.age)),
    visibleFor: Math.max(0, finite(initial.visibleFor)),
    unseenFor: Math.max(0, finite(initial.unseenFor)),
    evidenceFor: Math.max(0, finite(initial.evidenceFor)),
    calmFor: Math.max(0, finite(initial.calmFor)),
    lastSeenAt: Number.isFinite(initial.lastSeenAt) ? initial.lastSeenAt : null,
    lastKnownPosition: initial.lastKnownPosition
      ? { x: finite(initial.lastKnownPosition.x), z: finite(initial.lastKnownPosition.z) }
      : null,
    primarySignal: initial.primarySignal || null,
    scoreDelta: 0,
    signals: {},
    eventLatch: {
      walletTaken: Boolean(initial.eventLatch?.walletTaken),
      policeAttacked: Boolean(initial.eventLatch?.policeAttacked),
    },
  }
}

function normalizeState(state, config) {
  if (!state || typeof state !== 'object') return createSuspicionState({}, config)
  if (!state.eventLatch) state.eventLatch = { walletTaken: false, policeAttacked: false }
  if (!state.signals) state.signals = {}
  state.score = clamp(finite(state.score), 0, config.maxScore)
  state.stage = STAGES.includes(state.stage) ? state.stage : getSuspicionStage(state.score, config)
  state.previousStage = STAGES.includes(state.previousStage) ? state.previousStage : state.stage
  state.stageChanged = Boolean(state.stageChanged)
  state.age = Math.max(0, finite(state.age))
  state.visibleFor = Math.max(0, finite(state.visibleFor))
  state.unseenFor = Math.max(0, finite(state.unseenFor))
  state.evidenceFor = Math.max(0, finite(state.evidenceFor))
  state.calmFor = Math.max(0, finite(state.calmFor))
  return state
}

function copyPosition(position) {
  if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.z)) return null
  return { x: position.x, z: position.z }
}

/**
 * Convert the game's public movement state into an observation.
 *
 * `visible` must already include field-of-view and obstacle line-of-sight. The
 * helper intentionally reads only behaviour, movement and position fields.
 */
export function observeAgentBehavior(agent, context = {}) {
  const behavior = typeof context.behavior === 'string' ? context.behavior : (agent?.beh || '')
  const position = context.position || agent?.p || null
  const walletDistance = Number.isFinite(context.walletDistance) ? context.walletDistance : Infinity
  return {
    visible: context.visible === true,
    position: copyPosition(position),
    time: Number.isFinite(context.time) ? context.time : null,
    walletDistance,
    sprinting: Boolean(context.sprinting ?? agent?.spr ?? false),
    // "steal" is an internal destination choice until the target is actually
    // close enough to perform a visibly suspicious wallet interaction.
    stealingWallet: Boolean(context.stealingWallet ?? (behavior === 'steal' && walletDistance <= 2.5)),
    capturingWallet: Boolean(context.capturingWallet ?? (behavior === 'capturing')),
    fleeingPolice: Boolean(context.fleeingPolice ?? (behavior === 'flee_cop')),
    chasingPolice: Boolean(context.chasingPolice ?? (behavior === 'hunt_cop')),
    attackingPolice: Boolean(context.attackingPolice),
    walletTaken: Boolean(context.walletTaken),
    policeAttacked: Boolean(context.policeAttacked),
  }
}

function addContribution(contributions, signal, points) {
  if (points <= 0) return
  contributions[signal] = (contributions[signal] || 0) + points
}

/**
 * Update one police observer's belief about one target. The state is mutated
 * and returned, avoiding per-frame allocations in the render loop.
 */
export function updateSuspicion(state, observation = {}, deltaTime, config = DEFAULT_SUSPICION_CONFIG) {
  state = normalizeState(state, config)
  const dt = Math.max(0, finite(deltaTime))
  if (dt === 0) {
    state.scoreDelta = 0
    state.signals = {}
    state.stageChanged = false
    return state
  }

  const before = state.score
  const stageBeforeUpdate = state.stage
  const visible = observation.visible === true
  state.age += dt
  state.signals = {}

  if (visible) {
    state.visibleFor += dt
    state.unseenFor = 0
    state.lastSeenAt = Number.isFinite(observation.time) ? observation.time : state.age
    const seenPosition = copyPosition(observation.position)
    if (seenPosition) state.lastKnownPosition = seenPosition

    const activeSignals = []
    const activate = (name, active, strength = 1) => {
      if (!active || strength <= 0) return
      activeSignals.push({ name, strength })
    }

    const walletDistance = finite(observation.walletDistance, Infinity)
    const walletStrength = Number.isFinite(walletDistance)
      ? clamp(1 - walletDistance / config.walletAwarenessRadius, 0, 1)
      : 0
    activate('nearWallet', walletStrength > 0, walletStrength)
    activate('sprinting', observation.sprinting === true)
    activate('stealingWallet', observation.stealingWallet === true)
    activate('fleeingPolice', observation.fleeingPolice === true)
    activate('chasingPolice', observation.chasingPolice === true)
    activate('capturingWallet', observation.capturingWallet === true)
    activate('attackingPolice', observation.attackingPolice === true)

    if (activeSignals.length) {
      state.evidenceFor += dt
      state.calmFor = 0
      const rampProgress = config.evidenceRampSeconds > 0
        ? clamp(state.evidenceFor / config.evidenceRampSeconds, 0, 1)
        : 1
      const multiplier = 1 + (config.maxEvidenceMultiplier - 1) * rampProgress
      let sustainedPoints = 0
      let evidenceCap = 0
      activeSignals.forEach(({ name, strength }) => {
        const points = finite(config.rates[name]) * strength * dt * multiplier
        addContribution(state.signals, name, points)
        sustainedPoints += points
        evidenceCap = Math.max(evidenceCap, finite(config.signalCaps[name], config.maxScore))
      })
      // Caps apply only to newly gained points; lower-grade evidence never
      // erases stronger evidence that was already observed.
      state.score = Math.min(state.score + sustainedPoints, Math.max(state.score, evidenceCap))
    } else {
      state.evidenceFor = 0
      state.calmFor += dt
      if (state.calmFor > config.decayGrace) state.score -= config.visibleDecay * dt
    }

    const pulse = (name, active) => {
      const wasActive = Boolean(state.eventLatch[name])
      if (active && !wasActive) {
        const points = finite(config.pulses[name])
        addContribution(state.signals, name, points)
        state.score += points
      }
      state.eventLatch[name] = active
    }
    pulse('walletTaken', observation.walletTaken === true)
    pulse('policeAttacked', observation.policeAttacked === true)
  } else {
    state.visibleFor = 0
    state.unseenFor += dt
    state.evidenceFor = 0
    state.calmFor += dt
    const stageMultiplier = state.stage === SUSPICION_STAGE.CONFIRMED
      ? config.confirmedDecayMultiplier
      : 1
    if (state.calmFor > config.decayGrace) state.score -= config.unseenDecay * stageMultiplier * dt
    // Consume event edges even when hidden so a stale true flag cannot become
    // evidence on the first frame that the target re-enters view.
    state.eventLatch.walletTaken = observation.walletTaken === true
    state.eventLatch.policeAttacked = observation.policeAttacked === true
  }

  state.score = clamp(state.score, 0, config.maxScore)
  state.stage = stageWithHysteresis(state.score, state.stage, config)
  state.previousStage = stageBeforeUpdate
  state.stageChanged = state.stage !== stageBeforeUpdate
  if (state.stageChanged) state.lastStageChangeAt = state.age
  state.scoreDelta = state.score - before
  const strongest = Object.entries(state.signals).sort((left, right) => right[1] - left[1])[0]
  if (strongest) state.primarySignal = strongest[0]
  else if (state.score === 0) state.primarySignal = null
  return state
}

/** A separate memory should be created for every police observer. */
export function createSuspicionMemory(configOverrides = {}) {
  return {
    config: createSuspicionConfig(configOverrides),
    targets: new Map(),
  }
}

export function updateTargetSuspicion(memory, target, observation, deltaTime) {
  if (!memory?.targets || !(memory.targets instanceof Map)) {
    throw new TypeError('updateTargetSuspicion requires a suspicion memory')
  }
  let state = memory.targets.get(target)
  if (!state) {
    state = createSuspicionState({}, memory.config)
    memory.targets.set(target, state)
  }
  return updateSuspicion(state, observation, deltaTime, memory.config)
}

/** Decay targets not explicitly updated this frame and forget cold memories. */
export function decayUnobservedSuspicion(memory, observedTargets, deltaTime) {
  const observed = observedTargets instanceof Set ? observedTargets : new Set(observedTargets || [])
  for (const [target, state] of memory.targets) {
    if (observed.has(target)) continue
    updateSuspicion(state, { visible: false }, deltaTime, memory.config)
    if (state.score === 0 && state.unseenFor >= memory.config.forgetAfter) memory.targets.delete(target)
  }
}

export function rankSuspicionTargets(memory, predicate = null) {
  return [...memory.targets.entries()]
    .filter(([target, state]) => !predicate || predicate(target, state))
    .map(([target, state]) => ({ target, state }))
    .sort((left, right) => (
      right.state.score - left.state.score
      || left.state.unseenFor - right.state.unseenFor
      || right.state.visibleFor - left.state.visibleFor
    ))
}

export function getMostSuspiciousTarget(memory, predicate = null) {
  return rankSuspicionTargets(memory, predicate)[0] || null
}
