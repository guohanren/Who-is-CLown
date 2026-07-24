import * as THREE from 'three'

const materials = new Map()
const geometries = new Map()

function material(color, options = {}) {
  const key = `${color}:${options.roughness ?? .72}:${options.metalness ?? .04}:${options.emissive ?? 0}`
  if (!materials.has(key)) {
    materials.set(key, new THREE.MeshStandardMaterial({
      color,
      roughness: options.roughness ?? .72,
      metalness: options.metalness ?? .04,
      emissive: options.emissive ?? 0,
      flatShading: true,
    }))
  }
  return materials.get(key)
}

function geometry(key, factory) {
  if (!geometries.has(key)) geometries.set(key, factory())
  return geometries.get(key)
}

function addMesh(parent, shape, color, position, rotation = [0, 0, 0], options = {}) {
  const item = new THREE.Mesh(shape, material(color, options))
  item.position.set(...position)
  item.rotation.set(...rotation)
  item.castShadow = true
  item.receiveShadow = true
  parent.add(item)
  return item
}

const sphere = (radius, width = 10, height = 7) => geometry(
  `sphere:${radius}:${width}:${height}`,
  () => new THREE.SphereGeometry(radius, width, height),
)
const cylinder = (top, bottom, height, segments = 8) => geometry(
  `cylinder:${top}:${bottom}:${height}:${segments}`,
  () => new THREE.CylinderGeometry(top, bottom, height, segments),
)
const box = (x, y, z) => geometry(`box:${x}:${y}:${z}`, () => new THREE.BoxGeometry(x, y, z))
const cone = (radius, height, segments = 8) => geometry(
  `cone:${radius}:${height}:${segments}`,
  () => new THREE.ConeGeometry(radius, height, segments),
)
const torus = (radius, tube, arc = Math.PI * 2) => geometry(
  `torus:${radius}:${tube}:${arc}`,
  () => new THREE.TorusGeometry(radius, tube, 5, 14, arc),
)

function makeArm(rig, side, shirt, skin, glove = skin) {
  const arm = new THREE.Group()
  arm.position.set(side * .34, 1.43, 0)
  rig.add(arm)
  addMesh(arm, sphere(.125, 8, 6), shirt, [0, -.05, 0])
  addMesh(arm, cylinder(.095, .08, .27, 7), shirt, [0, -.19, 0])
  addMesh(arm, cylinder(.073, .067, .27, 7), skin, [0, -.45, 0])
  addMesh(arm, sphere(.085, 8, 6), glove, [0, -.61, .005])
  return arm
}

function makeLeg(rig, side, pants, shoe) {
  const leg = new THREE.Group()
  leg.position.set(side * .145, .85, 0)
  rig.add(leg)
  addMesh(leg, cylinder(.115, .095, .53, 7), pants, [0, -.265, 0])
  addMesh(leg, box(.22, .14, .34), shoe, [0, -.565, .075])
  return leg
}

function makeBase({ skin, shirt, pants, shoe, glove = skin }) {
  const root = new THREE.Group()
  const rig = new THREE.Group()
  const baseY = -.2
  rig.position.y = baseY
  root.add(rig)

  const torso = addMesh(rig, cylinder(.31, .255, .7, 8), shirt, [0, 1.18, 0])
  const waist = addMesh(rig, cylinder(.265, .255, .12, 8), pants, [0, .8, 0])
  const head = new THREE.Group()
  head.position.set(0, 1.75, 0)
  rig.add(head)
  addMesh(head, sphere(.285, 12, 8), skin, [0, 0, 0])

  const la = makeArm(rig, -1, shirt, skin, glove)
  const ra = makeArm(rig, 1, shirt, skin, glove)
  const ll = makeLeg(rig, -1, pants, shoe)
  const rl = makeLeg(rig, 1, pants, shoe)

  root.userData = { rig, torso, waist, head, la, ra, ll, rl, baseY }
  return root
}

function addEye(head, x, color = 0x18202a) {
  addMesh(head, sphere(.062, 8, 6), 0xf7f1e4, [x, .055, .255])
  addMesh(head, sphere(.027, 8, 6), color, [x, .052, .31], [0, 0, 0], { roughness: .3 })
}

function addCopHealthBar(root) {
  const bg = new THREE.Mesh(
    new THREE.PlaneGeometry(.78, .085),
    new THREE.MeshBasicMaterial({ color: 0x1b2530, side: THREE.DoubleSide, depthTest: false }),
  )
  bg.position.set(0, 2.42, 0)
  bg.name = 'bg'
  bg.renderOrder = 20
  bg.visible = false
  root.add(bg)

  const fg = new THREE.Mesh(
    new THREE.PlaneGeometry(.74, .052),
    new THREE.MeshBasicMaterial({ color: 0x35a8ff, side: THREE.DoubleSide, depthTest: false }),
  )
  fg.position.set(0, 2.42, .006)
  fg.name = 'fg'
  fg.renderOrder = 21
  fg.visible = false
  root.add(fg)
}

export function setHealthBarVisibility(model, visible) {
  const bg = model?.getObjectByName('bg')
  const fg = model?.getObjectByName('fg')
  if (bg) bg.visible = visible
  if (fg) fg.visible = visible
}

export function mkClown(scene) {
  const red = 0xc63d47
  const blue = 0x3557a6
  const skin = 0xf0b282
  const white = 0xf5efe0
  const root = makeBase({
    skin,
    shirt: red,
    pants: blue,
    shoe: 0x49301f,
    glove: white,
  })
  const { rig, torso, head } = root.userData

  // Ruffled collar, bow tie, coat trim, buttons, and oversized shoes build a clear clown silhouette.
  for (let i = 0; i < 9; i++) {
    const angle = (i / 9) * Math.PI * 2
    addMesh(rig, sphere(.085, 7, 5), white, [Math.cos(angle) * .28, 1.51, Math.sin(angle) * .23])
  }
  addMesh(rig, cone(.12, .2, 4), 0xf2c94c, [-.1, 1.42, .32], [0, 0, -Math.PI / 2])
  addMesh(rig, cone(.12, .2, 4), 0xf2c94c, [.1, 1.42, .32], [0, 0, Math.PI / 2])
  addMesh(rig, sphere(.052, 8, 6), 0xf6ce4b, [0, 1.26, .285])
  addMesh(rig, sphere(.052, 8, 6), 0x4cb8d4, [0, 1.08, .27])
  addMesh(rig, sphere(.052, 8, 6), 0xf6ce4b, [0, .92, .245])
  addMesh(rig, box(.06, .58, .035), white, [-.2, 1.18, .25], [0, 0, -.08])
  addMesh(rig, box(.06, .58, .035), white, [.2, 1.18, .25], [0, 0, .08])
  addMesh(rig, cone(.19, .34, 4), red, [-.15, .78, -.02], [0, 0, Math.PI])
  addMesh(rig, cone(.19, .34, 4), red, [.15, .78, -.02], [0, 0, Math.PI])

  addEye(head, -.105)
  addEye(head, .105)
  addMesh(head, sphere(.087, 10, 7), 0xe92f38, [0, -.005, .31], [0, 0, 0], { roughness: .4 })
  addMesh(head, sphere(.052, 8, 6), 0xf2798b, [-.19, -.07, .235])
  addMesh(head, sphere(.052, 8, 6), 0xf2798b, [.19, -.07, .235])
  const smile = addMesh(head, torus(.115, .018, Math.PI), 0x8c1c2a, [0, -.105, .275], [0, 0, Math.PI])
  smile.scale.y = .72

  // Identical colorful hair on every clown prevents cosmetic identity leaks.
  const hairColors = [0xf07b32, 0xe84955, 0xf2b84b]
  const hairPositions = [
    [-.26, .17, -.02], [.26, .17, -.02], [-.22, .27, -.05],
    [.22, .27, -.05], [-.1, .32, -.08], [.1, .32, -.08],
  ]
  hairPositions.forEach((position, index) => {
    addMesh(head, sphere(.12, 8, 6), hairColors[index % hairColors.length], position)
  })
  addMesh(head, cylinder(.145, .17, .15, 10), 0x56377c, [0, .38, -.015])
  addMesh(head, cylinder(.1, .135, .19, 10), 0x7048a0, [0, .52, -.015])
  addMesh(head, torus(.17, .025), 0xf0c64a, [0, .305, -.015], [Math.PI / 2, 0, 0])

  torso.material = material(red)
  if (scene) scene.add(root)
  return root
}

export function mkCop(scene) {
  const navy = 0x203754
  const dark = 0x101a27
  const skin = 0xeab58d
  const root = makeBase({
    skin,
    shirt: navy,
    pants: 0x182b43,
    shoe: 0x111419,
    glove: 0x151b22,
  })
  const { rig, head, ra } = root.userData

  // Layered tactical vest, shoulder armor, utility belt, pouches, badge, and radio.
  addMesh(rig, box(.5, .54, .13), 0x17283c, [0, 1.2, .235], [0, 0, 0], { roughness: .56 })
  addMesh(rig, box(.42, .22, .045), 0x314b68, [0, 1.34, .31])
  addMesh(rig, box(.1, .16, .06), 0x355f84, [-.15, 1.2, .32])
  addMesh(rig, box(.1, .16, .06), 0x355f84, [0, 1.2, .32])
  addMesh(rig, box(.1, .16, .06), 0x355f84, [.15, 1.2, .32])
  addMesh(rig, cylinder(.31, .31, .1, 8), dark, [0, .84, 0])
  addMesh(rig, box(.14, .18, .1), dark, [-.2, .78, .2])
  addMesh(rig, box(.14, .18, .1), dark, [.2, .78, .2])
  addMesh(rig, sphere(.045, 8, 6), 0xe8c14b, [-.14, 1.42, .325], [0, 0, 0], { metalness: .65 })
  addMesh(rig, box(.18, .11, .25), 0x17202b, [-.32, 1.39, 0])
  addMesh(rig, box(.18, .11, .25), 0x17202b, [.32, 1.39, 0])

  addEye(head, -.1, 0x24354a)
  addEye(head, .1, 0x24354a)
  addMesh(head, box(.055, .09, .045), skin, [0, -.035, .285])
  const helmetShape = geometry(
    'cop-helmet',
    () => new THREE.SphereGeometry(.31, 12, 7, 0, Math.PI * 2, 0, Math.PI * .56),
  )
  addMesh(head, helmetShape, 0x111b2a, [0, .02, -.01], [0, 0, 0], { roughness: .43, metalness: .18 })
  addMesh(head, box(.55, .075, .3), 0x111b2a, [0, .16, .12])
  addMesh(head, box(.45, .11, .045), 0x385b7d, [0, .055, .29], [0, 0, 0], { roughness: .2, metalness: .45, emissive: 0x07131f })
  addMesh(head, box(.055, .22, .055), dark, [-.31, .13, 0])
  addMesh(head, box(.035, .34, .035), dark, [-.31, .38, 0])

  const gun = new THREE.Group()
  gun.position.set(.02, -.42, .12)
  ra.add(gun)
  addMesh(gun, box(.1, .1, .4), 0x151a20, [0, 0, .12], [0, 0, 0], { metalness: .72, roughness: .35 })
  addMesh(gun, cylinder(.028, .035, .3, 8), 0x0c1014, [0, 0, .45], [Math.PI / 2, 0, 0], { metalness: .8 })
  addMesh(gun, box(.07, .19, .09), 0x111820, [0, -.12, .08], [-.18, 0, 0])

  addCopHealthBar(root)
  if (scene) scene.add(root)
  return root
}

export function aW(model, time, speed) {
  const data = model?.userData
  if (!data?.la) return
  const pace = 3.4 + Math.min(7, Math.max(1, speed)) * .52
  const stride = Math.sin(time * pace)
  const amount = Math.min(.72, .34 + speed * .055)
  data.la.rotation.x = stride * amount
  data.ra.rotation.x = -stride * amount
  data.ll.rotation.x = -stride * amount * .78
  data.rl.rotation.x = stride * amount * .78
  data.la.rotation.z = .04
  data.ra.rotation.z = -.04
  data.rig.position.y = data.baseY + Math.abs(Math.cos(time * pace)) * .035
  data.torso.rotation.y = Math.sin(time * pace * .5) * .045
  data.head.rotation.y *= .82
}

export function aI(model, time) {
  const data = model?.userData
  if (!data?.la) return
  const breathe = Math.sin(time * 1.35)
  data.la.rotation.x = breathe * .025
  data.ra.rotation.x = -breathe * .025
  data.ll.rotation.x = 0
  data.rl.rotation.x = 0
  data.la.rotation.z = .035
  data.ra.rotation.z = -.035
  data.rig.position.y = data.baseY + breathe * .009
  data.torso.rotation.y = 0
  data.head.rotation.y = Math.sin(time * .68) * .22
}
