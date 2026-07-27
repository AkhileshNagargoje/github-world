import { useMemo, useState } from 'react'
import * as THREE from 'three'
import type { ThreeEvent } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import type { Building as BuildingModel } from '../types'
import { getWindowTextures } from '../lib/buildingTextures'

interface BuildingProps {
  building: BuildingModel
  selected: boolean
  night: boolean
  onSelect: (building: BuildingModel) => void
}

const WARM_LIGHT = '#ffd9a0'
const GOLD = '#ffd23f'

/**
 * One repo, rendered as a low-poly city block: a color-tinted tower with
 * procedural windows whose interior light reflects how actively the project is
 * worked on, a door, an optional star-spire + ground halo (prestige), a crane
 * for repos under construction, and balconies on the central landmark.
 */
export default function Building({ building, selected, night, onSelect }: BuildingProps) {
  const [hovered, setHovered] = useState(false)
  const [x, z] = building.position
  const {
    name,
    height,
    footprint,
    depth,
    rotationY,
    color,
    active,
    landmark,
    stars,
    forks,
    windowLight,
  } = building
  const maxFoot = Math.max(footprint, depth)
  const roadDistance = Math.hypot(x - building.roadPoint[0], z - building.roadPoint[1])
  const plotW = footprint + 0.85
  const plotD = depth + 0.85
  // The driveway has to reach the asphalt, so it uses the same road width the
  // layout set the plot back by (and that CityDecor renders).
  const connectorLength = Math.max(
    0,
    roadDistance - plotD * 0.5 - building.roadWidth * 0.5,
  )
  const connectorWidth = Math.max(0.7, Math.min(1.15, footprint * 0.28))

  // Per-building window textures: clone the shared maps and set `repeat` so the
  // window grid tiles to roughly square cells regardless of the box size.
  const { map, emissiveMap } = useMemo(() => {
    const base = getWindowTextures()
    const rx = Math.max(1, Math.min(5, Math.round(((footprint + depth) / 2) / 1.1)))
    const ry = Math.max(1, Math.min(12, Math.round(height / 1.6)))
    const m = base.map.clone()
    const e = base.emissiveMap.clone()
    m.repeat.set(rx, ry)
    e.repeat.set(rx, ry)
    m.needsUpdate = true
    e.needsUpdate = true
    return { map: m, emissiveMap: e }
  }, [footprint, depth, height])

  // Windows glow with activity; much brighter at night; hover/select turns up.
  const emissiveIntensity =
    windowLight * (night ? 2.2 : 1.15) + (selected ? 0.7 : 0) + (hovered ? 0.4 : 0)

  // Prestige: taller gold spire = more stars; wider halo = more stars + forks.
  const spireHeight = stars > 0 ? Math.min(6, Math.log2(stars + 1) * 0.9) : 0
  const haloRadius =
    stars + forks > 0 ? maxFoot * 0.75 + Math.log2(stars + forks + 1) * 0.35 : 0

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    onSelect(building)
  }
  const handleOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    setHovered(true)
    document.body.style.cursor = 'pointer'
  }
  const handleOut = () => {
    setHovered(false)
    document.body.style.cursor = 'auto'
  }

  const doorH = Math.min(1.1, height * 0.28)
  const doorW = Math.min(footprint * 0.34, 0.9)

  return (
    <group position={[x, 0, z]}>
      <group rotation={[0, rotationY, 0]}>
        {/* Sidewalk plot plus a short path to the nearest street. */}
        <mesh position={[0, 0.035, 0]} receiveShadow>
          <boxGeometry args={[plotW, 0.06, plotD]} />
          <meshStandardMaterial color="#a9adb3" roughness={1} />
        </mesh>
        {connectorLength > 0 && (
          <mesh position={[0, 0.04, plotD * 0.5 + connectorLength * 0.5]} receiveShadow>
            <boxGeometry args={[connectorWidth, 0.055, connectorLength]} />
            <meshStandardMaterial color="#9fa4ac" roughness={1} />
          </mesh>
        )}

        {/* Building body */}
        <mesh
          position={[0, height / 2, 0]}
          castShadow
          receiveShadow
          onClick={handleClick}
          onPointerOver={handleOver}
          onPointerOut={handleOut}
        >
          <boxGeometry args={[footprint, height, depth]} />
          <meshStandardMaterial
            color={color}
            map={map}
            emissive={WARM_LIGHT}
            emissiveMap={emissiveMap}
            emissiveIntensity={emissiveIntensity}
            roughness={0.72}
            metalness={0.05}
          />
        </mesh>

        {/* Door on the front (+z) face */}
        <mesh position={[0, doorH / 2, depth / 2 + 0.01]}>
          <boxGeometry args={[doorW, doorH, 0.06]} />
          <meshStandardMaterial
            color="#2a2f38"
            emissive={WARM_LIGHT}
            emissiveIntensity={windowLight * (night ? 1.4 : 0.6)}
          />
        </mesh>

        {/* Balconies on the landmark for a bit of civic grandeur */}
        {landmark && <Balconies height={height} footprint={footprint} />}

        {/* Selection / hover outline ring on the ground */}
        {(selected || hovered) && (
          <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[maxFoot * 0.62, maxFoot * 0.82, 4]} />
            <meshBasicMaterial color={selected ? GOLD : '#ffffff'} />
          </mesh>
        )}

        {/* Prestige halo — famous repos get a golden ring of light on the ground */}
        {haloRadius > 0 && (
          <mesh position={[0, 0.075, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[haloRadius * 0.82, haloRadius, 24]} />
            <meshBasicMaterial
              color={GOLD}
              transparent
              opacity={0.45}
              side={THREE.DoubleSide}
            />
          </mesh>
        )}

        {/* Star spire */}
        {spireHeight > 0 && (
          <group position={[0, height, 0]}>
            <mesh position={[0, spireHeight / 2, 0]} castShadow>
              <coneGeometry args={[0.22, spireHeight, 4]} />
              <meshStandardMaterial
                color={GOLD}
                emissive={GOLD}
                emissiveIntensity={0.6}
                metalness={0.7}
                roughness={0.3}
                flatShading
              />
            </mesh>
          </group>
        )}

        {/* Landmark beacon (marks the city center regardless of stars) */}
        {landmark && (
          <mesh position={[0, height + spireHeight + 0.7, 0]}>
            <octahedronGeometry args={[0.6, 0]} />
            <meshStandardMaterial
              color={GOLD}
              emissive={GOLD}
              emissiveIntensity={1.2}
              flatShading
            />
          </mesh>
        )}

        {/* "Under construction" crane on active, non-landmark repos */}
        {active && !landmark && <Crane baseHeight={height} />}

        {/* Name signs mounted on the building facade (front & back faces), sized
            to roughly span the width, near the top - like real rooftop signage. */}
        <FacadeSign
          name={name}
          width={footprint}
          depth={depth}
          height={height}
          selected={selected}
        />
      </group>
    </group>
  )
}

/** The repo name mounted flat on the front (+z) and back (-z) faces. */
function FacadeSign({
  name,
  width,
  depth,
  height,
  selected,
}: {
  name: string
  width: number
  depth: number
  height: number
  selected: boolean
}) {
  // Approximate a font size that makes the name span most of the face width.
  const fontSize = Math.max(0.26, Math.min(0.8, width / (Math.max(5, name.length) * 0.62)))
  const y = height - fontSize * 1.4
  const color = selected ? '#8a6d00' : '#20242c'
  const common = {
    fontSize,
    maxWidth: width * 1.15,
    anchorX: 'center' as const,
    anchorY: 'middle' as const,
    color,
    outlineWidth: fontSize * 0.06,
    outlineColor: '#ffffff',
    outlineOpacity: 0.9,
  }
  return (
    <>
      <Text position={[0, y, depth / 2 + 0.03]} {...common}>
        {name}
      </Text>
      <Text position={[0, y, -(depth / 2 + 0.03)]} rotation={[0, Math.PI, 0]} {...common}>
        {name}
      </Text>
    </>
  )
}

/** Thin protruding ledges on the front and side faces of the landmark tower. */
function Balconies({ height, footprint }: { height: number; footprint: number }) {
  const floors = Math.max(1, Math.floor(height / 3))
  const ledgeW = footprint * 0.9
  return (
    <group>
      {Array.from({ length: floors }).map((_, i) => {
        const y = (i + 1) * (height / (floors + 1))
        return (
          <group key={i}>
            <mesh position={[0, y, footprint / 2 + 0.12]} castShadow>
              <boxGeometry args={[ledgeW, 0.12, 0.3]} />
              <meshStandardMaterial color="#3b414d" flatShading />
            </mesh>
            <mesh position={[footprint / 2 + 0.12, y, 0]} castShadow>
              <boxGeometry args={[0.3, 0.12, ledgeW]} />
              <meshStandardMaterial color="#3b414d" flatShading />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}

/** A tiny stylized construction crane sitting on top of an active building. */
function Crane({ baseHeight }: { baseHeight: number }) {
  const mastHeight = 2
  const armLength = 2.2
  return (
    <group position={[0, baseHeight, 0]}>
      <mesh position={[0, mastHeight / 2, 0]} castShadow>
        <boxGeometry args={[0.18, mastHeight, 0.18]} />
        <meshStandardMaterial color="#ffb703" flatShading />
      </mesh>
      <mesh position={[armLength / 2 - 0.4, mastHeight, 0]} castShadow>
        <boxGeometry args={[armLength, 0.14, 0.14]} />
        <meshStandardMaterial color="#ffb703" flatShading />
      </mesh>
      <mesh position={[armLength - 0.4, mastHeight - 0.6, 0]}>
        <boxGeometry args={[0.3, 0.3, 0.3]} />
        <meshStandardMaterial color="#8d99ae" flatShading />
      </mesh>
    </group>
  )
}
