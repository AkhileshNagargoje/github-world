import { useMemo } from 'react'
import * as THREE from 'three'
import { getGroundTexture } from '../lib/groundTexture'

interface GroundProps {
  /** 0..1 — higher looks lusher/greener, lower looks barren. */
  prosperity: number
  /** Radius the city occupies — the island is sized to enclose it. */
  radius: number
  /** Night mode darkens land and water. */
  night: boolean
}

/**
 * The world sits on an irregular island surrounded by water, so the scattered
 * towers are framed by a coastline instead of floating on an endless plane. At
 * night the land goes dark green and the water goes deep and glossy.
 */
export default function Ground({ prosperity, radius, night }: GroundProps) {
  const landColor = night ? '#33403a' : lerpColor('#9c968a', '#7d9a6e', prosperity)
  const waterColor = night ? '#0a1626' : '#3f7cae'

  // Irregular island polygon (deterministic coastline), sized to enclose the
  // city. The same outline is reused a little larger for the beach, so sand
  // rings the grass instead of green meeting blue at a hard seam.
  const coastline = useMemo(() => {
    const outline = (scale: number) => {
      const shape = new THREE.Shape()
      const base = radius * 1.22 * scale
      const pts = 56
      for (let i = 0; i < pts; i++) {
        const a = (i / pts) * Math.PI * 2
        const n =
          0.92 +
          0.11 * Math.sin(a * 3 + 1.3) +
          0.06 * Math.sin(a * 7 + 4.1) +
          0.04 * Math.sin(a * 13 + 2.2)
        const r = base * n
        const x = Math.cos(a) * r
        const y = Math.sin(a) * r
        if (i === 0) shape.moveTo(x, y)
        else shape.lineTo(x, y)
      }
      shape.closePath()
      return new THREE.ShapeGeometry(shape)
    }
    return { land: outline(1), beach: outline(1.06) }
  }, [radius])
  const islandGeo = coastline.land

  // Grass texture tiled by world coordinate (ShapeGeometry UVs are world-space).
  const map = useMemo(() => {
    const t = getGroundTexture().clone()
    t.repeat.set(1 / 7, 1 / 7)
    t.needsUpdate = true
    return t
  }, [])

  const waterSize = Math.max(400, radius * 12)

  return (
    <group>
      {/* Water, well below the land so the coastline reads as a raised island */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.35, 0]}>
        <planeGeometry args={[waterSize, waterSize]} />
        <meshStandardMaterial
          color={waterColor}
          metalness={night ? 0.75 : 0.35}
          roughness={night ? 0.18 : 0.35}
          emissive={night ? '#0a1a2e' : '#000000'}
          emissiveIntensity={night ? 0.5 : 0}
        />
      </mesh>

      {/* Sand shelf, just under the grass and a little wider */}
      <mesh
        geometry={coastline.beach}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.12, 0]}
        receiveShadow
      >
        <meshStandardMaterial color={night ? '#3b3a33' : '#d8c9a3'} roughness={1} />
      </mesh>

      {/* Island landmass */}
      <mesh
        geometry={islandGeo}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
        receiveShadow
      >
        <meshStandardMaterial color={landColor} map={map} roughness={1} />
      </mesh>
    </group>
  )
}

/** Linear interpolate between two hex colors. */
function lerpColor(a: string, b: string, t: number): string {
  const ca = hexToRgb(a)
  const cb = hexToRgb(b)
  const r = Math.round(ca[0] + (cb[0] - ca[0]) * t)
  const g = Math.round(ca[1] + (cb[1] - ca[1]) * t)
  const bl = Math.round(ca[2] + (cb[2] - ca[2]) * t)
  return `rgb(${r}, ${g}, ${bl})`
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ]
}
