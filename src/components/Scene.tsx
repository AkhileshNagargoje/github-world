import { Canvas } from '@react-three/fiber'
import { OrbitControls, Sky, SoftShadows, Stars } from '@react-three/drei'
import { Bloom, EffectComposer } from '@react-three/postprocessing'
import type { Building, World } from '../types'
import BuildingMesh from './Building'
import Ground from './Ground'
import CityDecor from './CityDecor'

interface SceneProps {
  world: World
  night: boolean
  selectedId: number | null
  onSelect: (building: Building) => void
  onDeselect: () => void
}

/** The full 3D scene: camera, lights, ground and every building. */
export default function Scene({
  world,
  night,
  selectedId,
  onSelect,
  onDeselect,
}: SceneProps) {
  // The whole-city radius (computed in buildWorld) frames the camera, sizes the
  // ground, and bounds the shadow frustum.
  const radius = world.cityRadius

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
      dpr={[1, 2]}
      gl={{ antialias: true, toneMappingExposure: night ? 1.15 : 1.05 }}
      onPointerMissed={onDeselect}
    >
      <SoftShadows size={24} samples={8} focus={0.85} />

      <color attach="background" args={[bg]} />
      <fog attach="fog" args={[bg, radius * 2.4, radius * 5.5]} />

      {night ? (
        <Stars radius={radius * 3} depth={radius} count={2500} factor={radius * 0.06} fade />
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
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
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

      {/* Bloom makes the lit windows, lamps and spires glow — subtle by day,
          strong at night. */}
      <EffectComposer>
        <Bloom
          mipmapBlur
          intensity={night ? 0.85 : 0.25}
          luminanceThreshold={night ? 0.5 : 0.72}
          luminanceSmoothing={0.25}
        />
      </EffectComposer>
    </Canvas>
  )
}
