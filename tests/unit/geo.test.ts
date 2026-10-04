import { describe, expect, it } from 'vitest';
import { Projection } from '../../src/geo/projection.ts';
import { geo } from '../../src/geo/types.ts';
import { compassPoint, forwardFromHeading, headingFromVector, rightFromHeading, rotationYFromHeading } from '../../src/geo/frames.ts';
import { Object3D, Vector3 } from 'three';
import { bandung } from '../../src/content/regions/bandung.ts';

const b = bandung.geo.bounds;
const proj = new Projection(b, 2000, 256);

describe('projection (plan §4.2)', () => {
  it('maps the four corners and the centre exactly', () => {
    expect(proj.geoToWorld(geo(b.north, b.west))).toEqual({ x: -1000, z: -1000 });
    expect(proj.geoToWorld(geo(b.north, b.east))).toEqual({ x: 1000, z: -1000 });
    expect(proj.geoToWorld(geo(b.south, b.west))).toEqual({ x: -1000, z: 1000 });
    expect(proj.geoToWorld(geo(b.south, b.east))).toEqual({ x: 1000, z: 1000 });
    const c = proj.geoToWorld(geo((b.north + b.south) / 2, (b.west + b.east) / 2));
    expect(c.x).toBeCloseTo(0, 9);
    expect(c.z).toBeCloseTo(0, 9);
  });

  it('north is −Z and east is +X', () => {
    const centre = geo(-6.925, 107.625);
    const north = proj.geoToWorld(geo(centre.lat + 0.01, centre.lon));
    const east = proj.geoToWorld(geo(centre.lat, centre.lon + 0.01));
    const c = proj.geoToWorld(centre);
    expect(north.z).toBeLessThan(c.z);
    expect(north.x).toBeCloseTo(c.x, 9);
    expect(east.x).toBeGreaterThan(c.x);
    expect(east.z).toBeCloseTo(c.z, 9);
  });

  it('round-trips lat/lon within 1e-9°', () => {
    for (let i = 0; i < 200; i++) {
      const lat = b.south + ((i * 37) % 200) / 200 * (b.north - b.south);
      const lon = b.west + ((i * 71) % 200) / 200 * (b.east - b.west);
      const w = proj.geoToWorld(geo(lat, lon));
      const back = proj.worldToGeo(w.x, w.z);
      expect(Math.abs(back.lat - lat)).toBeLessThan(1e-9);
      expect(Math.abs(back.lon - lon)).toBeLessThan(1e-9);
    }
  });

  it('grid sample (0,0) is NW and (255,255) is SE in geo and world space (V7)', () => {
    expect(proj.gridToGeo(0, 0)).toEqual({ lat: b.north, lon: b.west });
    const se = proj.gridToGeo(255, 255);
    expect(se.lat).toBeCloseTo(b.south, 12);
    expect(se.lon).toBeCloseTo(b.east, 12);
    expect(proj.gridToWorld(0, 0)).toEqual({ x: -1000, z: -1000 });
    const w = proj.gridToWorld(255, 255);
    expect(w.x).toBeCloseTo(1000, 9);
    expect(w.z).toBeCloseTo(1000, 9);
    expect(proj.spacing).toBeCloseTo(7.843137, 5);
  });

  it('rejects out-of-range coordinates and inverted bounds', () => {
    expect(() => geo(91, 0)).toThrow();
    expect(() => geo(0, 181)).toThrow();
    expect(() => new Projection({ south: 1, north: 0, west: 0, east: 1 }, 10, 4)).toThrow();
  });
});

describe('heading convention (plan §4.3)', () => {
  it('θ = 0 faces −Z (north), θ = π/2 faces +X (east)', () => {
    const n = forwardFromHeading(0);
    expect(n.x).toBeCloseTo(0, 12);
    expect(n.z).toBeCloseTo(-1, 12);
    const e = forwardFromHeading(Math.PI / 2);
    expect(e.x).toBeCloseTo(1, 12);
    expect(e.z).toBeCloseTo(0, 12);
    const r = rightFromHeading(0);
    expect(r.x).toBeCloseTo(1, 12);
    expect(headingFromVector(1, 0)).toBeCloseTo(Math.PI / 2, 12);
    expect(compassPoint(0)).toBe('N');
    expect(compassPoint(Math.PI / 2)).toBe('E');
  });

  it('rotation.y = −θ points a −Z-facing model along the heading', () => {
    for (const theta of [0, 0.7, Math.PI / 2, 2.5, 4]) {
      const o = new Object3D();
      o.rotation.y = rotationYFromHeading(theta);
      o.updateMatrixWorld();
      const f = new Vector3(0, 0, -1).applyQuaternion(o.quaternion);
      const expected = forwardFromHeading(theta);
      expect(f.x).toBeCloseTo(expected.x, 9);
      expect(f.z).toBeCloseTo(expected.z, 9);
    }
  });
});
