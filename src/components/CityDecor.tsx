import { useMemo } from 'react'
import { Instances, Instance } from '@react-three/drei'
import type { Building } from '../types'

interface CityDecorProps {
  buildings: Building[]
  spacing: number
  radius: number
  night: boolean
}

function makeRng(seed: number) {
  let s = (seed >>> 0) || 1
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0xffffffff
  }
}

interface RoadSeg {
  pos: [number, number, number]
  length: number
  angle: number
  a: [number, number]
  b: [number, number]
}

interface ParkData {
  cx: number
  cz: number
  radius: number
}

export default function CityDecor({ buildings, spacing, radius, night }: CityDecorProps) {
  const { roads, parks, trees, foliageScales, lamps } = useMemo(() => {
    const rng = makeRng(0x51ede21)
    const minGap = spacing * 0.9

    const n = buildings.length
    const pos = buildings.map((b) => b.position)
    const d2 = (i: number, j: number) =>
      Math.hypot(pos[i][0] - pos[j][0], pos[i][1] - pos[j][1])
    const edgeSet = new Set<string>()
    const addEdge = (i: number, j: number) => edgeSet.add(i < j ? `${i},${j}` : `${j},${i}`)
    if (n > 1) {
      const inTree = new Array(n).fill(false)
      const best = new Array(n).fill(Infinity)
      const parent = new Array(n).fill(-1)
      best[0] = 0
      for (let it = 0; it < n; it++) {
        let u = -1
        let bd = Infinity
        for (let v = 0; v < n; v++) if (!inTree[v] && best[v] < bd) (bd = best[v]), (u = v)
        if (u < 0) break
        inTree[u] = true
        if (parent[u] >= 0) addEdge(u, parent[u])
        for (let v = 0; v < n; v++) {
          if (inTree[v]) continue
          const d = d2(u, v)
          if (d < best[v]) (best[v] = d), (parent[v] = u)
        }
      }
      for (let i = 0; i < n; i++) {
        let nj = -1
        let nd = Infinity
        for (let j = 0; j < n; j++) if (j !== i && d2(i, j) < nd) (nd = d2(i, j)), (nj = j)
        if (nj >= 0) addEdge(i, nj)
      }
    }

    const roads: RoadSeg[] = []
    for (const key of edgeSet) {
      const [i, j] = key.split(',').map(Number)
      const a = pos[i]
      const b = pos[j]
      const dx = b[0] - a[0]
      const dz = b[1] - a[1]
      const length = Math.hypot(dx, dz)
      const angle = -Math.atan2(dz, dx)
      roads.push({ pos: [(a[0] + b[0]) / 2, 0.03, (a[1] + b[1]) / 2], length, angle, a, b })

    }

    const trees: [number, number, number][] = []
    const foliageScales: number[] = []
    const treeTarget = Math.min(240, 60 + buildings.length * 3)
    const tryPlace = (x: number, z: number) => {
      if (Math.hypot(x, z) > radius * 0.99 || trees.length >= treeTarget) return
      const clash = buildings.some((b) => {
        const half = Math.max(b.footprint, b.depth) * 0.7 + minGap
        return Math.hypot(x - b.position[0], z - b.position[1]) < half
      })
      if (clash) return
      trees.push([x, 0, z])
      foliageScales.push(rng() < 0.15 ? 1.0 + rng() * 0.5 : 0.5 + rng() * 0.4)
    }
    for (const r of roads) {
      const dirx = (r.b[0] - r.a[0]) / r.length
      const dirz = (r.b[1] - r.a[1]) / r.length
      const px = -dirz
      const pz = dirx
      const step = spacing * 1.6
      for (let s = step; s < r.length - step; s += step) {
        const side = spacing * 0.42
        if (rng() < 0.7) tryPlace(r.a[0] + dirx * s + px * side, r.a[1] + dirz * s + pz * side)
        if (rng() < 0.7) tryPlace(r.a[0] + dirx * s - px * side, r.a[1] + dirz * s - pz * side)
      }
    }

    const parks: ParkData[] = []
    const parkCount = Math.max(1, Math.floor(buildings.length / 8))
    for (let p = 0; p < parkCount; p++) {
      const a = rng() * Math.PI * 2
      const r = Math.sqrt(rng()) * radius * 0.85
      const cx = Math.cos(a) * r
      const cz = Math.sin(a) * r
      const pr = spacing * (0.8 + rng() * 1.2)
      const clash = buildings.some((b) =>
        Math.hypot(cx - b.position[0], cz - b.position[1]) < pr + Math.max(b.footprint, b.depth) * 0.7
      )
      if (clash) continue
      parks.push({ cx, cz, radius: pr })
      for (let k = 0; k < 8 + Math.floor(rng() * 6); k++) {
        const rr = rng() * pr * 0.85
        const aa = rng() * Math.PI * 2
        tryPlace(cx + Math.cos(aa) * rr, cz + Math.sin(aa) * rr)
      }
    }

    const groves = 6
    for (let g = 0; g < groves; g++) {
      const a = rng() * Math.PI * 2
      const r = Math.sqrt(rng()) * radius * 0.95
      const cx = Math.cos(a) * r
      const cz = Math.sin(a) * r
      const cnt = 3 + Math.floor(rng() * 4)
      for (let k = 0; k < cnt; k++) {
        const rr = rng() * spacing * 1.4
        const aa = rng() * Math.PI * 2
        tryPlace(cx + Math.cos(aa) * rr, cz + Math.sin(aa) * rr)
      }
    }

    const lamps: [number, number, number][] = buildings.map((b) => [
      b.position[0] + Math.max(b.footprint, b.depth) * 0.6 + 0.5,
      0,
      b.position[1] + Math.max(b.footprint, b.depth) * 0.6 + 0.5,
    ])

    return { roads, parks, trees, foliageScales, lamps }
  }, [buildings, spacing, radius])

  const roadW = spacing * 0.3

  return (
    <group>
      <group>
        {parks.length > 0 && (
          <Instances limit={parks.length} range={parks.length}>
            <circleGeometry args={[1, 24]} />
            <meshStandardMaterial color="#5b8a5c" roughness={1} transparent opacity={0.25} />
            {parks.map((p, i) => (
              <Instance
                key={i}
                position={[p.cx, 0.01, p.cz]}
                rotation={[-Math.PI / 2, 0, 0]}
                scale={p.radius}
              />
            ))}
          </Instances>
        )}
      </group>

      {/* Roads */}
      {roads.length > 0 && (
        <>
          <Instances limit={roads.length} range={roads.length} receiveShadow>
            <boxGeometry args={[1, 0.04, 1]} />
            <meshStandardMaterial color="#b7b9be" roughness={1} />
            {roads.map((r, i) => (
              <Instance
                key={i}
                position={[r.pos[0], 0.02, r.pos[2]]}
                rotation={[0, r.angle, 0]}
                scale={[r.length + roadW, 1, roadW * 1.85]}
              />
            ))}
          </Instances>
          <Instances limit={roads.length} range={roads.length} receiveShadow>
            <boxGeometry args={[1, 0.05, 1]} />
            <meshStandardMaterial color="#33363d" roughness={1} />
            {roads.map((r, i) => (
              <Instance
                key={i}
                position={[r.pos[0], 0.035, r.pos[2]]}
                rotation={[0, r.angle, 0]}
                scale={[r.length, 1, roadW]}
              />
            ))}
          </Instances>
          <Instances limit={roads.length} range={roads.length}>
            <boxGeometry args={[1, 0.06, 1]} />
            <meshStandardMaterial color="#d8c463" roughness={1} />
            {roads.map((r, i) => (
              <Instance
                key={i}
                position={[r.pos[0], 0.055, r.pos[2]]}
                rotation={[0, r.angle, 0]}
                scale={[r.length * 0.88, 1, roadW * 0.06]}
              />
            ))}
          </Instances>
        </>
      )}

      {/* Trees */}
      {trees.length > 0 && (
        <>
          <Instances limit={trees.length} range={trees.length}>
            <cylinderGeometry args={[0.06, 0.08, 0.5, 5]} />
            <meshStandardMaterial color="#6b4b2b" flatShading />
            {trees.map((p, i) => (
              <Instance key={i} position={[p[0], 0.25, p[2]]} />
            ))}
          </Instances>
          <Instances limit={trees.length} range={trees.length}>
            <icosahedronGeometry args={[0.42, 0]} />
            <meshStandardMaterial color="#3f8f4a" flatShading />
            {trees.map((p, i) => (
              <Instance key={i} position={[p[0], 0.8, p[2]]} scale={foliageScales[i]} />
            ))}
          </Instances>
        </>
      )}

      {/* Streetlights */}
      {lamps.length > 0 && (
        <>
          <Instances limit={lamps.length} range={lamps.length} castShadow>
            <cylinderGeometry args={[0.04, 0.05, 1.6, 5]} />
            <meshStandardMaterial color="#4a4f57" flatShading />
            {lamps.map((p, i) => (
              <Instance key={i} position={[p[0], 0.8, p[2]]} />
            ))}
          </Instances>
          <Instances limit={lamps.length} range={lamps.length}>
            <sphereGeometry args={[0.1, 6, 6]} />
            <meshStandardMaterial
              color="#fff2c4"
              emissive="#ffe08a"
              emissiveIntensity={night ? 3 : 0.8}
            />
            {lamps.map((p, i) => (
              <Instance key={i} position={[p[0], 1.62, p[2]]} />
            ))}
          </Instances>
        </>
      )}
    </group>
  )
}
