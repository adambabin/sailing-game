// Objects in the world are "painted" with a colour rather than given a fixed
// material, so they can be recoloured at any time (for ship customisation).

import * as THREE from 'three';

export function paint(mesh, color, opts = {}) {
  mesh.userData.paint = { color, ...opts };
  return mesh;
}

// Sail cloth patterns, drawn onto a small canvas and wrapped onto the sails.
const patterns = new Map();
export function sailPattern(kind, stripe) {
  const key = kind + stripe;
  if (patterns.has(key)) return patterns.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#' + new THREE.Color(stripe).getHexString();
  if (kind === 'stripes') for (let i = 0; i < 4; i++) g.fillRect(i * 32 + 16, 0, 16, 128);
  if (kind === 'bands') for (let i = 0; i < 3; i++) g.fillRect(0, i * 44 + 14, 128, 14);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  patterns.set(key, tex);
  return tex;
}

const cache = new Map();
function materialFor(p) {
  const key = [p.color, p.vertexColors ? 1 : 0, p.double ? 1 : 0, p.glow ? 1 : 0, p.map ? p.map.uuid : 0].join('|');
  if (cache.has(key)) return cache.get(key);
  const base = {
    color: p.vertexColors ? 0xffffff : p.color,
    vertexColors: !!p.vertexColors,
    side: p.double ? THREE.DoubleSide : THREE.FrontSide,
    map: p.map || null,
  };
  const m = p.glow ? new THREE.MeshBasicMaterial(base) : new THREE.MeshStandardMaterial({ ...base, roughness: 0.9, metalness: 0 });
  cache.set(key, m);
  return m;
}

// Give every painted object under `root` a material matching its current paint.
export function applyPaint(root) {
  root.traverse((o) => {
    if (o.userData.paint) o.material = materialFor(o.userData.paint);
  });
}
