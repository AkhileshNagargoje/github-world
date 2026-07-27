import { Suspense, lazy, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, PerformanceMonitor, Sky, SoftShadows, Stars } from '@react-three/drei'
import type { Building, World } from '../types'
import { TIMELAPSE_SECONDS, type TimelineState } from '../lib/timeline'
import { detectTier, settingsFor, type QualityTier } from '../lib/quality'
import BuildingMesh from './Building'
import Ground from './Ground'
import CityDecor from './CityDecor'

const Effects = lazy(() => import('./Effects'))

interface SceneProps {
  world: World
  night: boolean
  /** Time-lapse state, mutated in the render loop rather than in React state. */
  timeline: React.MutableRefObject<TimelineState>
  /** Called a few times a second so the scrubber's year can follow along. */
  onTimelineTick: () => void
  selectedId: number | null
  onSelect: (building: Building) => void
  onDeselect: () => void
}

/** The full 3D scene: camera, lights, ground and every building. */
export default function Scene({
  world,
  night,
  timeline,
  onTimelineTick,
  selectedId,
  onSelect,
  onDeselect,
}: SceneProps) {
  // The whole-city radius (computed in buildWorld) frames the camera, sizes the
  // ground, and bounds the shadow frustum.
  const radius = world.cityRadius

  // Start at a tier matched to the device, then drop if frames actually sag.
  const [tier, setTier] = useState<QualityTier>(detectTier)
  const quality = settingsFor(tier)

  // Day: soft flat daylight. Night: dim moonlight so the glowing windows,
  // streetlights and spires carry the scene.
  const sunIntensity = night ? 0.45 : 1.6 + world.prosperity * 0.6
  const ambientIntensity = night ? 0.24 : 0.5 + world.prosperity * 0.25
  const bg = night ? '#0b1020' : '#cfe0ef'
  const camStart: [number, number, number] = [radius * 1.4, radius * 1.15, radius * 1.4]

  return (
    <Canvas
      shadows
      camera={{ position: camStart, fov: 36, near: 0.1, far: 3000 }}
      dpr={quality.dpr}
      // `preserveDrawingBuffer` keeps the last composed frame readable, which is
      // what the postcard export reads back — including bloom and AO, which a
      // plain re-render outside the effect composer would miss.
      gl={{
        antialias: true,
        preserveDrawingBuffer: true,
        toneMappingExposure: night ? 1.15 : 1.05,
      }}
      onPointerMissed={onDeselect}
    >
      {/* Measured framerate, not just a guess about the device: if the city
          can't hold frame, step down to the cheaper settings. */}
      <PerformanceMonitor onDecline={() => setTier('low')} />

      <SoftShadows size={24} samples={quality.softShadowSamples} focus={0.85} />

      <TimelineDriver timeline={timeline} onTick={onTimelineTick} />

      <color attach="background" args={[bg]} />
      <fog attach="fog" args={[bg, radius * 2.4, radius * 5.5]} />

      {night ? (
        <Stars
          radius={radius * 3}
          depth={radius}
          count={quality.starCount}
          factor={radius * 0.06}
          fade
        />
      ) : (
        <Sky
          distance={450000}
          sunPosition={[radius, radius * 1.6, radius * 0.5]}
          turbidity={8}
          rayleigh={1.2}
          mieCoefficient={0.006}
          mieDirectionalG={0.85}
        />
      )}

      <ambientLight intensity={ambientIntensity} />
      <hemisphereLight
        args={night ? ['#3a4770', '#141b1a', 0.7] : ['#eaf2ff', '#8a8163', 0.7]}
      />
      {/* Key light (casts shadows) — sun by day, cool moonlight by night */}
      <directionalLight
        position={[radius, radius * 1.8, radius * 0.7]}
        intensity={sunIntensity}
        color={night ? '#9fb4e8' : '#ffffff'}
        castShadow
        shadow-mapSize-width={quality.shadowMapSize}
        shadow-mapSize-height={quality.shadowMapSize}
        shadow-bias={-0.0004}
        shadow-camera-left={-radius * 1.6}
        shadow-camera-right={radius * 1.6}
        shadow-camera-top={radius * 1.6}
        shadow-camera-bottom={-radius * 1.6}
        shadow-camera-near={0.1}
        shadow-camera-far={radius * 6}
      />
      {!night && (
        <directionalLight position={[-radius, radius * 0.9, -radius * 0.6]} intensity={0.35} />
      )}

      <Ground prosperity={world.prosperity} radius={radius} night={night} />
      <CityDecor
        buildings={world.buildings}
        cityRoads={world.roads}
        spacing={world.spacing}
        radius={radius}
        night={night}
      />

      {world.buildings.map((b) => (
        <BuildingMesh
          key={b.id}
          building={b}
          timeline={timeline}
          selected={b.id === selectedId}
          night={night}
          onSelect={onSelect}
        />
      ))}

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        minDistance={6}
        maxDistance={radius * 4}
        maxPolarAngle={Math.PI / 2.15}
        target={[0, 2, 0]}
      />

      {/* Ambient occlusion + bloom, loaded lazily so the heavy postprocessing
          bundle doesn't block the first frame of the city. */}
      <Suspense fallback={null}>
        <Effects night={night} ambientOcclusion={quality.ambientOcclusion} />
      </Suspense>
    </Canvas>
  )
}

/**
 * Advances the time-lapse inside the render loop. Buildings read the same ref
 * directly, so a playing city costs no React renders — only the year label is
 * pushed back out, a few times a second.
 */
function TimelineDriver({
  timeline,
  onTick,
}: {
  timeline: React.MutableRefObject<TimelineState>
  onTick: () => void
}) {
  const sinceTick = useRef(0)
  useFrame((_, delta) => {
    const state = timeline.current
    if (!state.active || !state.playing) return
    const span = state.to - state.from
    state.at = Math.min(state.to, state.at + (span / TIMELAPSE_SECONDS) * delta)
    if (state.at >= state.to) {
      state.playing = false
      onTick()
      return
    }
    sinceTick.current += delta
    if (sinceTick.current > 0.2) {
      sinceTick.current = 0
      onTick()
    }
  })
  return null
}
