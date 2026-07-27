import { Bloom, EffectComposer, SSAO } from '@react-three/postprocessing'
import { BlendFunction } from 'postprocessing'

/**
 * Ambient occlusion and bloom. Split into its own chunk and loaded lazily —
 * `postprocessing` is a large dependency, and the city renders fine (just
 * flatter) for the moment before it arrives.
 */
export default function Effects({ night }: { night: boolean }) {
  return (
    <EffectComposer>
      {/* Contact shading where buildings meet the ground and each other —
          without it the towers look pasted onto the grass. */}
      <SSAO
        blendFunction={BlendFunction.MULTIPLY}
        samples={16}
        rings={4}
        radius={0.12}
        intensity={22}
        luminanceInfluence={0.5}
        worldDistanceThreshold={80}
        worldDistanceFalloff={40}
        worldProximityThreshold={4}
        worldProximityFalloff={2}
        fade={0.02}
      />
      {/* Makes lit windows, lamps and spires glow — subtle by day, strong at
          night. The daytime threshold sits high on purpose: lower, and the pale
          kerbs and plots pick up a white glow along every street. */}
      <Bloom
        mipmapBlur
        intensity={night ? 0.85 : 0.22}
        luminanceThreshold={night ? 0.5 : 0.88}
        luminanceSmoothing={0.25}
      />
    </EffectComposer>
  )
}
