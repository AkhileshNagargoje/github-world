import { useMemo } from 'react'
import { Instances, Instance } from '@react-three/drei'
import { Text } from '@react-three/drei'
import { parkLayout } from '../lib/contributionPark'
import type { Contributions } from '../types'

interface ContributionParkProps {
  contributions: Contributions
  /** How far the city itself reaches, so the park can sit just beyond it. */
  cityReach: number
  spacing: number
  night: boolean
}

/** GitHub's calendar greens, darkest for the busiest days. */
const BED_COLORS = ['#3f6b46', '#4f9c56', '#57c463', '#7ae081', '#a8f0aa']

/**
 * The contribution calendar as a park on the edge of the city: one planted bed
 * per day, laid out in the same 53x7 grid, growing taller and lighter the more
 * was committed that day. Only rendered when a token was available to fetch it.
 *
 * All 371 beds share one instanced mesh per colour band, so the park costs a
 * handful of draw calls rather than one per day.
 */
export default function ContributionPark({
  contributions,
  cityReach,
  spacing,
  night,
}: ContributionParkProps) {
  const { beds, park } = useMemo(() => {
    const park = parkLayout(cityReach, spacing)
    const busiest = Math.max(1, contributions.busiestDay)
    const originX = park.center[0] - park.width / 2 + park.cell / 2
    const originZ = park.center[1] - park.depth / 2 + park.cell / 2

    // Group the beds by colour band so each band is one instanced draw.
    const bands: { x: number; z: number; height: number }[][] = BED_COLORS.map(() => [])
    contributions.weeks.forEach((week, column) => {
      week.forEach((day, row) => {
        if (day.count <= 0) return
        // Square-root keeps a single very busy day from flattening the rest.
        const intensity = Math.sqrt(day.count / busiest)
        const band = Math.min(BED_COLORS.length - 1, Math.floor(intensity * BED_COLORS.length))
        bands[band].push({
          x: originX + column * park.cell,
          z: originZ + row * park.cell,
          height: 0.12 + intensity * park.maxHeight,
        })
      })
    })
    return { beds: bands, park }
  }, [contributions, cityReach, spacing])

  const labelSize = Math.max(0.8, park.cell * 1.6)

  return (
    <group>
      {/* The lawn the beds are planted in */}
      <mesh
        position={[park.center[0], 0.02, park.center[1]]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[park.width + park.cell * 2, park.depth + park.cell * 2]} />
        <meshStandardMaterial color={night ? '#20301f' : '#46703c'} roughness={1} />
      </mesh>

      {beds.map((band, i) =>
        band.length === 0 ? null : (
          <Instances key={i} limit={band.length} range={band.length} castShadow receiveShadow>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial
              color={BED_COLORS[i]}
              emissive={BED_COLORS[i]}
              emissiveIntensity={night ? 0.35 : 0}
              roughness={0.85}
              flatShading
            />
            {band.map((bed, j) => (
              <Instance
                key={j}
                position={[bed.x, bed.height / 2, bed.z]}
                scale={[park.cell * 0.78, bed.height, park.cell * 0.78]}
              />
            ))}
          </Instances>
        ),
      )}

      <Text
        position={[park.center[0], 0.06, park.center[1] + park.depth / 2 + labelSize * 1.4]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={labelSize}
        anchorX="center"
        anchorY="middle"
        color={night ? '#9fb4e8' : '#3c4550'}
      >
        {`${contributions.total.toLocaleString()} contributions this year`}
      </Text>
    </group>
  )
}
