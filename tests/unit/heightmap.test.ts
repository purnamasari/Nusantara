import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decodeToMetres, encodeHeights, readSamples } from '../../src/heightmap/codec.ts';
import { validateMetadata } from '../../src/heightmap/metadata.ts';
import { GameError } from '../../src/lib/errors.ts';
import { bandung } from '../../src/content/regions/bandung.ts';
import { fixtureMeta, loadBandungData } from './helpers.ts';
import { syntheticElevation } from '../../tools/synthetic.ts';

describe('heightmap codec (plan §5)', () => {
  it('round-trips uint8 within half a quantisation step', () => {
    const metres = Array.from({ length: 16 }, (_, i) => 600 + i * 97.3);
    const bytes = encodeHeights(metres, 600, 600 + 15 * 97.3, 'uint8');
    const meta = fixtureMeta(bandung, 4, 600, 600 + 15 * 97.3);
    const back = decodeToMetres(bytes, meta);
    const step = (15 * 97.3) / 255;
    metres.forEach((m, i) => expect(Math.abs(back[i]! - m)).toBeLessThanOrEqual(step / 2 + 1e-9));
  });

  it('round-trips uint16 little-endian', () => {
    const metres = [0, 1234.5, 4321, 9999];
    const bytes = encodeHeights(metres, 0, 9999, 'uint16');
    const meta = { ...fixtureMeta(bandung, 2, 0, 9999) };
    meta.encoding = { ...meta.encoding, format: 'uint16' };
    meta.file = { ...meta.file, bytes: 8 };
    const back = decodeToMetres(bytes, meta);
    metres.forEach((m, i) => expect(Math.abs(back[i]! - m)).toBeLessThan(0.1));
    expect(bytes[2]).toBe((Math.round((1234.5 / 9999) * 65535) & 255));
  });

  it('rejects a byte length that does not match the grid (HEIGHTMAP_INVALID)', () => {
    const meta = fixtureMeta(bandung, 4, 0, 1);
    expect(() => readSamples(new Uint8Array(15), meta)).toThrow(GameError);
    try {
      readSamples(new Uint8Array(15), meta);
    } catch (e) {
      expect((e as GameError).code).toBe('HEIGHTMAP_INVALID');
    }
  });

  it('metadata validation reports problems', () => {
    expect(validateMetadata(null)).not.toHaveLength(0);
    const bad = { ...fixtureMeta(bandung, 4, 10, 5) };
    expect(validateMetadata(bad).some((e) => e.includes('min/max'))).toBe(true);
    const wrongBytes = { ...fixtureMeta(bandung, 4, 0, 1), file: { name: 'x', bytes: 3, sha256: '' } };
    expect(validateMetadata(wrongBytes).some((e) => e.includes('file.bytes'))).toBe(true);
  });
});

describe('committed Bandung heightmap', () => {
  const { meta, bytes } = loadBandungData();

  it('matches its metadata (schema, size, sha256, region, bounds)', () => {
    expect(validateMetadata(meta)).toEqual([]);
    expect(bytes.byteLength).toBe(65536);
    expect(meta.file.bytes).toBe(65536);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(meta.file.sha256);
    expect(meta.regionId).toBe('bandung');
    expect(meta.bounds).toEqual(bandung.geo.bounds);
    expect(meta.grid.width).toBe(bandung.world.gridSize);
  });

  it('is the synthetic stand-in, reproducible bit-for-bit from the region config (V13)', () => {
    expect(meta.source.kind).toBe('synthetic');
    const metres = syntheticElevation(bandung);
    const again = encodeHeights(metres, meta.encoding.minElevationM, meta.encoding.maxElevationM, 'uint8');
    expect(createHash('sha256').update(again).digest('hex')).toBe(meta.file.sha256);
  });

  it('quantisation report is within the §5.4 thresholds', () => {
    expect(meta.quantization.maxErrGameM).toBeLessThanOrEqual(0.3);
    expect(meta.quantization.rmsErrGameM).toBeLessThanOrEqual(0.1);
    expect(meta.quantization.terraceCellsPct).toBeLessThanOrEqual(5);
  });
});
