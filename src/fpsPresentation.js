import * as THREE from 'three'

const basic = (color, extra = {}) => new THREE.MeshStandardMaterial({
  color,
  roughness: .52,
  metalness: .28,
  depthTest: false,
  depthWrite: false,
  ...extra,
})

function mesh(group, geometry, material, position, rotation = [0, 0, 0]) {
  const item = new THREE.Mesh(geometry, material)
  item.position.set(...position)
  item.rotation.set(...rotation)
  item.renderOrder = 1000
  item.frustumCulled = false
  group.add(item)
  return item
}

export function createFirstPersonWeapons(camera) {
  const root = new THREE.Group()
  root.renderOrder = 1000
  camera.add(root)

  const fill = new THREE.PointLight(0xdbe9ff, .7, 3)
  fill.position.set(.2, .2, -.5)
  root.add(fill)

  const gun = new THREE.Group()
  const gunMetal = basic(0x20262d, { roughness: .35, metalness: .72 })
  const gunDark = basic(0x0d1116, { roughness: .48, metalness: .55 })
  const gunAccent = basic(0x64717d, { roughness: .3, metalness: .8 })
  const skin = basic(0xd49b72, { roughness: .82, metalness: 0 })

  mesh(gun, new THREE.BoxGeometry(.24, .18, .58), gunMetal, [0, .02, 0])
  mesh(gun, new THREE.BoxGeometry(.18, .08, .32), gunAccent, [0, .14, -.04])
  mesh(gun, new THREE.BoxGeometry(.13, .3, .16), gunDark, [.01, -.2, .1], [-.2, 0, 0])
  mesh(gun, new THREE.CylinderGeometry(.045, .055, .42, 10), gunDark, [0, .045, -.46], [Math.PI / 2, 0, 0])
  mesh(gun, new THREE.BoxGeometry(.07, .1, .05), gunAccent, [0, .19, -.19])
  mesh(gun, new THREE.BoxGeometry(.05, .08, .04), gunAccent, [0, .17, -.52])
  mesh(gun, new THREE.BoxGeometry(.17, .09, .21), gunDark, [0, .02, .36])
  mesh(gun, new THREE.BoxGeometry(.19, .18, .16), skin, [.03, -.32, .12], [-.18, 0, 0])
  mesh(gun, new THREE.BoxGeometry(.19, .17, .23), skin, [-.16, -.09, -.18], [0, 0, -.18])

  const flashMat = new THREE.MeshBasicMaterial({
    color: 0xffc342,
    transparent: true,
    opacity: 0,
    depthTest: false,
    depthWrite: false,
  })
  const flash = mesh(gun, new THREE.ConeGeometry(.13, .38, 7), flashMat, [0, .045, -.82], [-Math.PI / 2, 0, 0])
  const muzzleLight = new THREE.PointLight(0xff8a28, 0, 4)
  muzzleLight.position.set(0, .04, -.7)
  gun.add(muzzleLight)
  root.add(gun)

  const knife = new THREE.Group()
  const blade = basic(0xc9d4dc, { roughness: .22, metalness: .9 })
  const handle = basic(0x1c2024, { roughness: .7, metalness: .2 })
  mesh(knife, new THREE.CylinderGeometry(.055, .065, .34, 9), handle, [0, -.04, .08], [Math.PI / 2, 0, 0])
  mesh(knife, new THREE.BoxGeometry(.22, .055, .08), gunAccent, [0, -.04, -.12])
  mesh(knife, new THREE.ConeGeometry(.105, .58, 4), blade, [0, -.04, -.43], [-Math.PI / 2, Math.PI / 4, 0])
  mesh(knife, new THREE.BoxGeometry(.22, .18, .24), skin, [.02, -.13, .25], [.08, 0, 0])
  root.add(knife)

  let recoil = 0
  let slash = 0
  let flashTime = 0
  let reloadAnim = 0

  function fire(role) {
    if (role === 'police') {
      recoil = 1
      flashTime = .075
      flash.rotation.z = Math.random() * Math.PI
    } else {
      slash = 1
    }
  }

  function update(dt, state) {
    const { role, moving, sprinting, time, reloading } = state
    gun.visible = role === 'police'
    knife.visible = role === 'clown'

    recoil = Math.max(0, recoil - dt * 8.5)
    slash = Math.max(0, slash - dt * 4.8)
    flashTime = Math.max(0, flashTime - dt)
    reloadAnim += ((reloading ? 1 : 0) - reloadAnim) * Math.min(1, dt * 8)

    const pace = sprinting ? 12 : 8
    const amount = moving ? (sprinting ? .018 : .011) : .002
    const bobX = Math.sin(time * pace) * amount
    const bobY = Math.abs(Math.cos(time * pace)) * amount

    root.position.set(.37 + bobX, -.3 - bobY, -.72)
    root.rotation.set(-.02 + bobY * .8, -.03 - bobX * .9, bobX * 1.6)

    gun.position.set(0, -.04 - reloadAnim * .28, recoil * .12)
    gun.rotation.set(reloadAnim * -.55, 0, reloadAnim * .38)
    knife.position.set(.02, -.02, 0)
    knife.rotation.set(-slash * .6, slash * .55, -.18 - slash * 1.35)

    const flashAlpha = flashTime > 0 ? flashTime / .075 : 0
    flash.material.opacity = flashAlpha
    flash.scale.setScalar(.75 + flashAlpha * .5)
    muzzleLight.intensity = flashAlpha * 3.5
  }

  function dispose() {
    root.traverse(item => {
      if (!item.isMesh) return
      item.geometry?.dispose()
      item.material?.dispose()
    })
    camera.remove(root)
  }

  return { fire, update, dispose }
}

export function createCombatFx(scene) {
  const particles = []

  function burst(position, color, count = 8, speed = 3.5, life = .45) {
    for (let i = 0; i < count; i++) {
      const material = new THREE.MeshBasicMaterial({ color, transparent: true })
      const item = new THREE.Mesh(new THREE.BoxGeometry(.055, .055, .055), material)
      item.position.copy(position)
      scene.add(item)
      particles.push({
        item,
        velocity: new THREE.Vector3(
          (Math.random() - .5) * speed,
          Math.random() * speed * .7,
          (Math.random() - .5) * speed,
        ),
        life,
        maxLife: life,
      })
    }
  }

  function update(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const particle = particles[i]
      particle.life -= dt
      if (particle.life <= 0) {
        scene.remove(particle.item)
        particle.item.geometry.dispose()
        particle.item.material.dispose()
        particles.splice(i, 1)
        continue
      }
      particle.velocity.y -= 6 * dt
      particle.item.position.addScaledVector(particle.velocity, dt)
      const ratio = particle.life / particle.maxLife
      particle.item.material.opacity = ratio
      particle.item.scale.setScalar(.5 + ratio)
    }
  }

  function dispose() {
    for (const particle of particles) {
      scene.remove(particle.item)
      particle.item.geometry.dispose()
      particle.item.material.dispose()
    }
    particles.length = 0
  }

  return {
    hit(position) { burst(position.clone().add(new THREE.Vector3(0, 1.05, 0)), 0xff4d35, 10, 4.2, .5) },
    miss(position) { burst(position, 0xffcb63, 5, 2.5, .28) },
    pickup(position) { burst(position.clone().add(new THREE.Vector3(0, .6, 0)), 0xffd34d, 18, 3.2, .8) },
    update,
    dispose,
  }
}

export function createGameAudio() {
  let context = null
  let unlocked = false

  function getContext() {
    if (!context) {
      const AudioContext = window.AudioContext || window.webkitAudioContext
      if (!AudioContext) return null
      context = new AudioContext()
    }
    if (context.state === 'suspended') context.resume()
    unlocked = true
    return context
  }

  function tone(from, to, duration, type = 'sine', volume = .08, delay = 0) {
    const ctx = getContext()
    if (!ctx) return
    const start = ctx.currentTime + delay
    const oscillator = ctx.createOscillator()
    const gain = ctx.createGain()
    oscillator.type = type
    oscillator.frequency.setValueAtTime(from, start)
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, to), start + duration)
    gain.gain.setValueAtTime(volume, start)
    gain.gain.exponentialRampToValueAtTime(.0001, start + duration)
    oscillator.connect(gain).connect(ctx.destination)
    oscillator.start(start)
    oscillator.stop(start + duration)
  }

  function noise(duration, volume, cutoff = 2400) {
    const ctx = getContext()
    if (!ctx) return
    const length = Math.max(1, Math.floor(ctx.sampleRate * duration))
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length)
    const source = ctx.createBufferSource()
    const filter = ctx.createBiquadFilter()
    const gain = ctx.createGain()
    filter.type = 'lowpass'
    filter.frequency.value = cutoff
    gain.gain.setValueAtTime(volume, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + duration)
    source.buffer = buffer
    source.connect(filter).connect(gain).connect(ctx.destination)
    source.start()
  }

  function dispose() {
    unlocked = false
    if (context && context.state !== 'closed') context.close().catch(() => {})
    context = null
  }

  return {
    unlock: getContext,
    shoot() { noise(.12, .18, 3200); tone(150, 55, .14, 'sawtooth', .12) },
    slash() { tone(520, 110, .18, 'sawtooth', .065) },
    hit() { tone(180, 90, .09, 'square', .08) },
    hurt() { noise(.16, .11, 900); tone(90, 48, .2, 'sawtooth', .09) },
    empty() { tone(1700, 1250, .045, 'square', .035) },
    reload() { tone(430, 610, .08, 'square', .025); tone(520, 760, .08, 'square', .02, .48) },
    pickup() {
      tone(440, 660, .12, 'sine', .045)
      tone(660, 880, .14, 'sine', .04, .11)
    },
    step() {
      if (!unlocked) return
      noise(.045, .018, 420)
    },
    dispose,
  }
}
