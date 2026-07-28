import { useMemo, useRef, useState } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import type * as THREE from 'three'
import { Text } from '@react-three/drei'
import type { Building as BuildingModel } from '../types'
import { getTiledWindowTextures } from '../lib/buildingTextures'
import { easeOut, growthAt, type TimelineState } from '../lib/timeline'

interface BuildingProps {
  building: BuildingModel
  /** Shared time-lapse state; read per frame so playback costs no re-renders. */
  timeline: React.MutableRefObject<TimelineState>
  selected: boolean
  night: boolean
  onSelect: (building: BuildingModel) => void
}

/** Stable 0..1 value from a repo id — used for per-building variation. */
function hashUnit(id: number): number {
  let h = Math.imul(id ^ 0x9e3779b9, 2654435761) >>> 0
  h ^= h >>> 15
  return (h >>> 0) / 0xffffffff
}

const WARM_LIGHT = '#ffd9a0'
const GOLD = '#ffd23f'

/**
 * One repo, rendered as a low-poly city block: a color-tinted tower with
 * procedural windows whose interior light reflects how actively the project is
 * worked on, a door, an optional star-spire (prestige), a crane
 * for repos under construction, and balconies on the central landmark.
 */
export default function Building({ building, timeline, selected, night, onSelect }: BuildingProps) {
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
    starred,
    roof,
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

  // Window grid tiled to roughly square cells whatever the box size. Textures
  // are shared between every building that lands on the same tiling.
  const { map, emissiveMap } = useMemo(() => {
    const rx = Math.max(1, Math.min(5, Math.round(((footprint + depth) / 2) / 1.1)))
    const ry = Math.max(1, Math.min(12, Math.round(height / 1.6)))
    return getTiledWindowTextures(rx, ry)
  }, [footprint, depth, height])

  // Windows glow with activity; much brighter at night; hover/select turns up.
  // A deterministic per-building factor keeps some towers darker than others,
  // so a night skyline reads as a city with people in it rather than a grid of
  // identically lit boxes.
  const occupancy = useMemo(() => 0.55 + hashUnit(building.id) * 0.75, [building.id])
  const emissiveIntensity =
    windowLight * (night ? 2.2 * occupancy : 1.15) +
    (selected ? 0.7 : 0) +
    (hovered ? 0.4 : 0)

  // Prestige: only the best-starred repos carry a spire, and its height still
  // scales with stars — so it reads as a ranking, not as decoration.
  const spireHeight = starred ? Math.min(6, 1.4 + Math.log2(stars + 1) * 0.55) : 0

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

  // The building rises out of the ground when the time-lapse reaches the date
  // its repo was created, and is hidden before that.
  const risen = useRef<THREE.Group>(null)
  const createdMs = useMemo(() => new Date(building.createdAt).getTime(), [building.createdAt])
  useFrame(() => {
    const group = risen.current
    if (!group) return
    const grown = growthAt(timeline.current, createdMs)
    const scale = grown <= 0 ? 0 : easeOut(grown)
    group.visible = scale > 0.001
    group.scale.set(1, Math.max(0.001, scale), 1)
  })

  // Whatever sits on the roof (spire, beacon, crane) has to start above it.
  const roofTop =
    roof === 'pitched'
      ? Math.max(0.5, Math.min(1.5, footprint * 0.42))
      : roof === 'stepped'
        ? 1.2
        : roof === 'crown'
          ? 0.85
          : 0.12

  return (
    <group position={[x, 0, z]}>
      <group ref={risen} rotation={[0, rotationY, 0]}>
        {/* Sidewalk plot plus a short path to the nearest street. */}
        <mesh position={[0, 0.035, 0]} receiveShadow>
          <boxGeometry args={[plotW, 0.06, plotD]} />
          <meshStandardMaterial color="#8f949b" roughness={1} />
        </mesh>
        {connectorLength > 0 && (
          <mesh position={[0, 0.04, plotD * 0.5 + connectorLength * 0.5]} receiveShadow>
            <boxGeometry args={[connectorWidth, 0.055, connectorLength]} />
            <meshStandardMaterial color="#878d95" roughness={1} />
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

        {/* Roof: pitched on low buildings, stepped or crowned on towers */}
        <Roof kind={roof} height={height} width={footprint} depth={depth} color={color} />

        {/* Rooftop clutter — a tank and a vent give the skyline texture */}
        {roof !== 'pitched' && height > 5 && (
          <RoofClutter height={height} width={footprint} depth={depth} seed={stars + depth} />
        )}

        {/* Selection / hover outline ring on the ground */}
        {(selected || hovered) && (
          <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[maxFoot * 0.62, maxFoot * 0.82, 4]} />
            <meshBasicMaterial color={selected ? GOLD : '#ffffff'} />
          </mesh>
        )}

        {/* Star spire */}
        {spireHeight > 0 && (
          <group position={[0, height + roofTop, 0]}>
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
          <mesh position={[0, height + roofTop + spireHeight + 0.7, 0]}>
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
        {active && !landmark && <Crane baseHeight={height + roofTop} />}

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
    <Text position={[0, y, depth / 2 + 0.03]} {...common}>
      {name}
    </Text>
  )
}

/**
 * The top of the building. A pitched roof reads as a house, a stepped setback
 * or a crown reads as a tower — either way the skyline stops being flat boxes.
 */
function Roof({
  kind,
  height,
  width,
  depth,
  color,
}: {
  kind: BuildingModel['roof']
  height: number
  width: number
  depth: number
  color: string
}) {
  if (kind === 'flat') {
    // A slim parapet so even flat roofs catch an edge of light.
    return (
      <mesh position={[0, height + 0.06, 0]} castShadow>
        <boxGeometry args={[width * 1.03, 0.12, depth * 1.03]} />
        <meshStandardMaterial color="#868d97" roughness={0.85} />
      </mesh>
    )
  }
  if (kind === 'pitched') {
    const rise = Math.max(0.5, Math.min(1.5, width * 0.42))
    return (
      <group position={[0, height, 0]}>
        <mesh position={[0, rise / 2, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
          <coneGeometry args={[Math.max(width, depth) * 0.75, rise, 4]} />
          <meshStandardMaterial color="#8d5f4c" roughness={0.9} flatShading />
        </mesh>
      </group>
    )
  }
  if (kind === 'stepped') {
    return (
      <group position={[0, height, 0]}>
        <mesh position={[0, 0.3, 0]} castShadow>
          <boxGeometry args={[width * 0.8, 0.6, depth * 0.8]} />
          <meshStandardMaterial color={color} roughness={0.72} />
        </mesh>
        <mesh position={[0, 0.9, 0]} castShadow>
          <boxGeometry args={[width * 0.55, 0.6, depth * 0.55]} />
          <meshStandardMaterial color={color} roughness={0.72} />
        </mesh>
      </group>
    )
  }
  // Crown: a recessed cap ringed by a lip, for the tallest towers.
  return (
    <group position={[0, height, 0]}>
      <mesh position={[0, 0.08, 0]} castShadow>
        <boxGeometry args={[width * 1.06, 0.16, depth * 1.06]} />
        <meshStandardMaterial color="#7f8792" roughness={0.7} metalness={0.2} />
      </mesh>
      <mesh position={[0, 0.5, 0]} castShadow>
        <boxGeometry args={[width * 0.42, 0.7, depth * 0.42]} />
        <meshStandardMaterial color="#8b929c" roughness={0.7} />
      </mesh>
    </group>
  )
}

/** Water tank, vent box and a mast — the small stuff real rooftops carry. */
function RoofClutter({
  height,
  width,
  depth,
  seed,
}: {
  height: number
  width: number
  depth: number
  seed: number
}) {
  const pick = (seed * 9301 + 49297) % 233280 / 233280
  const offX = (pick - 0.5) * width * 0.5
  const offZ = (0.5 - pick) * depth * 0.5
  return (
    <group position={[0, height + 0.12, 0]}>
      <mesh position={[offX, 0.2, offZ]} castShadow>
        <cylinderGeometry args={[0.16, 0.16, 0.4, 8]} />
        <meshStandardMaterial color="#6f7681" roughness={0.85} flatShading />
      </mesh>
      <mesh position={[-offX * 0.7, 0.11, -offZ * 0.7]} castShadow>
        <boxGeometry args={[width * 0.2, 0.22, depth * 0.2]} />
        <meshStandardMaterial color="#7d838d" roughness={0.85} />
      </mesh>
    </group>
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
