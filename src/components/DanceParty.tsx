import { useEffect, useRef } from 'react'

type Three = typeof import('three')

interface Dancer {
  group: import('three').Group
  armL: import('three').Group
  armR: import('three').Group
  legL: import('three').Group
  legR: import('three').Group
  head: import('three').Mesh
  shadow: import('three').Mesh
  speed: number
  phase: number
}

const COLORS = [0xff4d8d, 0x21d4fd, 0x9bff4d, 0xffa629, 0xb05cff, 0x2dffc4]

function makeDancer(THREE: Three, color: number): Dancer {
  const outfit = new THREE.MeshStandardMaterial({ color, roughness: 0.55 })
  const skin = new THREE.MeshStandardMaterial({ color: 0xffd7b3, roughness: 0.8 })
  const pants = new THREE.MeshStandardMaterial({ color: 0x2b3a55, roughness: 0.8 })

  const group = new THREE.Group()

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.28), outfit)
  torso.position.y = 0.95

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 16), skin)
  head.position.y = 1.45

  const makeArm = (side: 1 | -1) => {
    const pivot = new THREE.Group()
    pivot.position.set(0.31 * side, 1.2, 0)
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 0.12), skin)
    arm.position.y = -0.22
    pivot.add(arm)
    return pivot
  }
  const makeLeg = (side: 1 | -1) => {
    const pivot = new THREE.Group()
    pivot.position.set(0.13 * side, 0.65, 0)
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.6, 0.16), pants)
    leg.position.y = -0.3
    pivot.add(leg)
    return pivot
  }
  const armL = makeArm(1)
  const armR = makeArm(-1)
  const legL = makeLeg(1)
  const legR = makeLeg(-1)

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.45, 24),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18 }),
  )
  shadow.rotation.x = -Math.PI / 2
  shadow.position.y = 0.01

  group.add(torso, head, armL, armR, legL, legR)

  return {
    group,
    armL,
    armR,
    legL,
    legR,
    head,
    shadow,
    speed: 1.5 + Math.random() * 0.9,
    phase: Math.random() * Math.PI * 2,
  }
}

function startParty(THREE: Three, container: HTMLDivElement): () => void {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  container.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50)
  camera.position.set(0, 1.4, 7)
  camera.lookAt(0, 0.85, 0)

  scene.add(new THREE.AmbientLight(0xffffff, 0.8))
  const sun = new THREE.DirectionalLight(0xffffff, 1.4)
  sun.position.set(2, 5, 4)
  scene.add(sun)
  const disco1 = new THREE.PointLight(0xff00ff, 30, 20)
  disco1.position.set(-3, 3, 2)
  const disco2 = new THREE.PointLight(0x00ffff, 30, 20)
  disco2.position.set(3, 3, 2)
  scene.add(disco1, disco2)

  const count = Math.min(6, Math.max(3, Math.floor(container.clientWidth / 200)))
  const dancers: Dancer[] = []
  for (let i = 0; i < count; i++) {
    const dancer = makeDancer(THREE, COLORS[i % COLORS.length])
    scene.add(dancer.group, dancer.shadow)
    dancers.push(dancer)
  }

  const layout = () => {
    const width = Math.max(container.clientWidth, 1)
    const height = Math.max(container.clientHeight, 1)
    renderer.setSize(width, height)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    // Spread dancers across the width visible at the stage plane (z = 0).
    const visibleWidth =
      2 * camera.position.z * Math.tan(((camera.fov / 2) * Math.PI) / 180) * camera.aspect
    const spacing = (visibleWidth * 0.85) / (count + 1)
    dancers.forEach((d, i) => {
      const x = (i + 1 - (count + 1) / 2) * spacing
      d.group.position.x = x
      d.shadow.position.x = x
    })
  }
  layout()
  const resizeObserver = new ResizeObserver(layout)
  resizeObserver.observe(container)

  const clock = new THREE.Clock()
  let raf = 0
  const animate = () => {
    raf = requestAnimationFrame(animate)
    const t = clock.getElapsedTime()
    for (const d of dancers) {
      const beat = t * d.speed + d.phase
      const bounce = Math.abs(Math.sin(beat * 2))
      d.group.position.y = bounce * 0.16
      d.group.rotation.y = Math.sin(beat) * 0.7
      // Arms up, waving side to side ("raise the roof").
      d.armL.rotation.z = 2.4 + Math.sin(beat * 2) * 0.5
      d.armR.rotation.z = -2.4 - Math.cos(beat * 2) * 0.5
      d.legL.rotation.x = Math.sin(beat * 2) * 0.45
      d.legR.rotation.x = -Math.sin(beat * 2) * 0.45
      d.head.rotation.x = Math.sin(beat * 4) * 0.12
      d.shadow.scale.setScalar(1.15 - bounce * 0.35)
    }
    disco1.color.setHSL((t * 0.13) % 1, 1, 0.55)
    disco2.color.setHSL((t * 0.13 + 0.5) % 1, 1, 0.55)
    renderer.render(scene, camera)
  }
  animate()

  return () => {
    cancelAnimationFrame(raf)
    resizeObserver.disconnect()
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose()
        const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
        materials.forEach((m) => m.dispose())
      }
    })
    renderer.dispose()
    renderer.domElement.remove()
  }
}

/**
 * Easter egg: a row of low-poly dancers grooving at the bottom of the
 * screen. Three.js is loaded on demand so regular visitors never pay for
 * it; everything is built from primitives, no model assets needed.
 */
export default function DanceParty() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let disposed = false
    let stop: (() => void) | undefined
    import('three').then((THREE) => {
      if (!disposed && containerRef.current) {
        stop = startParty(THREE, containerRef.current)
      }
    })
    return () => {
      disposed = true
      stop?.()
    }
  }, [])

  return <div ref={containerRef} className="dance-party" aria-hidden="true" />
}
