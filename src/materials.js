// Objects in the world are "painted" with a colour rather than given a fixed
// material. When the art style changes, every painted object gets a fresh
// material in that style: flat facets, cartoon bands, or soft shading.

import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export function paint(mesh, color, opts = {}) {
  mesh.userData.paint = { color, ...opts };
  return mesh;
}

// Three-step light ramp used by the cartoon style.
const toonRamp = new THREE.DataTexture(new Uint8Array([110, 190, 255]), 3, 1, THREE.RedFormat);
toonRamp.minFilter = toonRamp.magFilter = THREE.NearestFilter;
toonRamp.needsUpdate = true;

const cache = new Map();

function materialFor(style, p) {
  const key = [style.id, p.color, p.vertexColors ? 1 : 0, p.double ? 1 : 0, p.glow ? 1 : 0].join('|');
  if (cache.has(key)) return cache.get(key);
  const base = {
    color: p.vertexColors ? 0xffffff : p.color,
    vertexColors: !!p.vertexColors,
    side: p.double ? THREE.DoubleSide : THREE.FrontSide,
  };
  let m;
  if (p.glow) m = new THREE.MeshBasicMaterial(base);
  else if (style.material === 'flat') m = new THREE.MeshLambertMaterial({ ...base, flatShading: true });
  else if (style.material === 'toon') m = new THREE.MeshToonMaterial({ ...base, gradientMap: toonRamp });
  else m = new THREE.MeshStandardMaterial({ ...base, roughness: 0.9, metalness: 0 });
  cache.set(key, m);
  return m;
}

// Ink outlines: a slightly inflated, dark, inside-out copy of the object.
const outlineMats = new Map();
function outlineMaterial(thickness) {
  if (outlineMats.has(thickness)) return outlineMats.get(thickness);
  const m = new THREE.MeshBasicMaterial({ color: 0x1d2433, side: THREE.BackSide });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `vec3 transformed = position + normalize(normal) * ${thickness.toFixed(3)};`
    );
  };
  m.customProgramCacheKey = () => 'outline' + thickness;
  outlineMats.set(thickness, m);
  return m;
}

const outlineGeos = new Map();
function outlineGeometry(geo) {
  if (outlineGeos.has(geo.uuid)) return outlineGeos.get(geo.uuid);
  let g = geo.clone();
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g.deleteAttribute('color');
  g = mergeVertices(g, 1e-3);
  g.computeVertexNormals();
  outlineGeos.set(geo.uuid, g);
  return g;
}

export function applyStyle(root, style) {
  const painted = [];
  root.traverse((o) => {
    if (o.userData.paint) painted.push(o);
  });
  for (const o of painted) {
    const p = o.userData.paint;
    o.material = materialFor(style, p);
    if (p.outline) {
      let line = o.userData.outlineMesh;
      if (style.outline && !line) {
        line = new THREE.Mesh(outlineGeometry(o.geometry), outlineMaterial(p.outline));
        o.add(line);
        o.userData.outlineMesh = line;
      }
      if (line) line.visible = style.outline;
    }
  }
}
