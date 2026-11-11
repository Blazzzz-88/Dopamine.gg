import { describe, expect, it } from 'vitest';
import { buildSculptedMeshData, resolveWeaponArchetype } from './weapon3dBuilder';
import { WeaponClass } from '../types/casino';

function makeSolidRectAlpha(w: number, h: number, pad = 4): Float32Array {
  const a = new Float32Array(w * h);
  for (let y = pad; y < h - pad; y++) {
    for (let x = pad; x < w - pad; x++) {
      a[y * w + x] = 1;
    }
  }
  return a;
}

function makeShapeWithHole(w: number, h: number): Float32Array {
  const a = makeSolidRectAlpha(w, h, 4);
  // Carve hollow interior rectangle (trigger guard / karambit ring hole)
  for (let y = Math.floor(h * 0.35); y < Math.floor(h * 0.65); y++) {
    for (let x = Math.floor(w * 0.35); x < Math.floor(w * 0.65); x++) {
      a[y * w + x] = 0;
    }
  }
  return a;
}

describe('Constructeur de géométrie 3D d’armes', () => {
  it('résout correctement les 8 archétypes 3D du catalogue', () => {
    expect(resolveWeaponArchetype('fusil', 'AR-15 Silencieux')).toBe('ar15_sil');
    expect(resolveWeaponArchetype('fusil', 'Phantom')).toBe('ar15_sil');
    expect(resolveWeaponArchetype('fusil', 'AR-15')).toBe('ar15');
    expect(resolveWeaponArchetype('fusil', 'AK-47')).toBe('ak47');
    expect(resolveWeaponArchetype('sniper', 'AWP')).toBe('awp');
    expect(resolveWeaponArchetype('pistolet', 'Pistolet Tactique')).toBe('pistolet');
    expect(resolveWeaponArchetype('pistolet', 'Deagle')).toBe('pistolet');
    expect(resolveWeaponArchetype('pm', 'MAC-10')).toBe('mac10');
    expect(resolveWeaponArchetype('lame', 'Couteau Baïonnette')).toBe('couteau');
    expect(resolveWeaponArchetype('lame', 'Katana')).toBe('couteau');
    expect(resolveWeaponArchetype('lame', 'Dague')).toBe('couteau');
    expect(resolveWeaponArchetype('lame', 'Karambit')).toBe('karambit');
  });

  it('génère un maillage 3D fermé sans NaN pour chacun des 8 modèles d’armes', () => {
    const cases: Array<[WeaponClass, string]> = [
      ['fusil', 'AR-15 Silencieux'],
      ['fusil', 'AR-15'],
      ['fusil', 'AK-47'],
      ['sniper', 'AWP'],
      ['pistolet', 'Pistolet Tactique'],
      ['pm', 'MAC-10'],
      ['lame', 'Couteau Baïonnette'],
      ['lame', 'Karambit'],
    ];

    for (const [wClass, wName] of cases) {
      const w = 64;
      const h = 32;
      const alpha = makeSolidRectAlpha(w, h, 4);
      const mesh = buildSculptedMeshData(alpha, w, h, wClass, wName);

      expect(mesh.positions.length).toBeGreaterThan(0);
      expect(mesh.indices.length).toBeGreaterThan(0);
      expect(mesh.indices.length % 3).toBe(0);
      expect(mesh.bounds.width).toBeGreaterThan(1);
      expect(mesh.bounds.depth).toBeGreaterThan(0.05);

      let badFloats = 0;
      for (let i = 0; i < mesh.positions.length; i++) {
        if (!Number.isFinite(mesh.positions[i]) || !Number.isFinite(mesh.normals[i])) badFloats++;
      }
      expect(badFloats).toBe(0);

      let badUVs = 0;
      for (let i = 0; i < mesh.uvs.length; i++) {
        if (mesh.uvs[i] < 0 || mesh.uvs[i] > 1) badUVs++;
      }
      expect(badUVs).toBe(0);

      const vertCount = mesh.positions.length / 3;
      let badIndices = 0;
      for (let i = 0; i < mesh.indices.length; i++) {
        if (mesh.indices[i] >= vertCount) badIndices++;
      }
      expect(badIndices).toBe(0);
    }
  });

  it('préserve les trous internes (pontet de détente, anneau karambit) et l’épaisseur multi-zones', () => {
    const w = 60;
    const h = 40;
    const alpha = makeShapeWithHole(w, h);
    const mesh = buildSculptedMeshData(alpha, w, h, 'lame', 'Karambit');

    // Verify no triangle centroid falls inside the carved inner hollow hole (world center ~ 0,0)
    let insideHoleCount = 0;
    const scale = 4.0 / (w - 8);
    const holeHalfW = (w * 0.12) * scale;
    const holeHalfH = (h * 0.12) * scale;

    for (let t = 0; t < mesh.indices.length; t += 3) {
      const i0 = mesh.indices[t] * 3;
      const i1 = mesh.indices[t + 1] * 3;
      const i2 = mesh.indices[t + 2] * 3;
      const cx = (mesh.positions[i0] + mesh.positions[i1] + mesh.positions[i2]) / 3;
      const cy = (mesh.positions[i0 + 1] + mesh.positions[i1 + 1] + mesh.positions[i2 + 1]) / 3;
      if (Math.abs(cx) < holeHalfW && Math.abs(cy) < holeHalfH) {
        insideHoleCount++;
      }
    }
    expect(insideHoleCount).toBe(0);
    expect(mesh.componentCount).toBe(1);
  });

  it('sculpte la lunette des AWP avec un profil cylindrique réellement circulaire (ratio Z/Y ~ 1:1)', () => {
    const w = 160;
    const h = 44;
    const a = new Float32Array(w * h);
    // Corps principal horizontal du fusil (y = 18..28, x = 8..150)
    for (let y = 18; y <= 28; y++) {
      for (let x = 8; x <= 150; x++) a[y * w + x] = 1;
    }
    // Lunette cylindrique au-dessus avec espace d'air + un montant vertical (u ~ 0.45..0.75)
    for (let y = 6; y <= 13; y++) {
      for (let x = 72; x <= 118; x++) a[y * w + x] = 1;
    }
    // Montant reliant la lunette au boîtier en x = 94..96
    for (let y = 13; y <= 18; y++) {
      for (let x = 94; x <= 96; x++) a[y * w + x] = 1;
    }

    const mesh = buildSculptedMeshData(a, w, h, 'sniper', 'AWP');
    const scale = 4.0 / (150 - 8);
    const scopeVerticalDiameter = (13 - 6) * scale;
    const scopeTopY = -(6 - 17) * scale;
    const scopeMidY = -(9.5 - 17) * scale;

    // Mesure max|Z| uniquement dans la zone haute de la lunette
    let maxScopeDepth = 0;
    for (let i = 0; i < mesh.positions.length; i += 3) {
      const py = mesh.positions[i + 1];
      const pz = Math.abs(mesh.positions[i + 2]);
      if (py >= scopeMidY - 0.05 && py <= scopeTopY + 0.02 && pz > maxScopeDepth) {
        maxScopeDepth = pz;
      }
    }
    // Le diamètre 3D en Z (2 * maxScopeDepth) doit égaler ~100% du diamètre vertical de la lunette
    expect(maxScopeDepth * 2).toBeGreaterThanOrEqual(scopeVerticalDiameter * 0.88);
  });

  it('détecte la bouche exacte du canon (muzzleLocalPos) des armes à feu en ignorant sangle/bipied', () => {
    const w = 120;
    const h = 60;
    const rifleAlpha = new Float32Array(w * h);
    // Canon horizontal supérieur (y = 14..18, x = 6..112) + crosse/poignée en bas
    for (let y = 14; y <= 18; y++) {
      for (let x = 6; x <= 112; x++) rifleAlpha[y * w + x] = 1;
    }
    for (let y = 19; y <= 46; y++) {
      for (let x = 8; x <= 14; x++) rifleAlpha[y * w + x] = 1; // bipied ou sangle sous le canon
    }

    const rifleMesh = buildSculptedMeshData(rifleAlpha, w, h, 'fusil', 'AR-15');
    expect(rifleMesh.muzzleLocalPos).toBeDefined();
    expect(rifleMesh.muzzleLocalPos![0]).toBeLessThan(-1.5);
    // Le centre du canon (y=16) doit primer sur la sangle/bipied du bas (y=19..46)
    expect(rifleMesh.muzzleLocalPos![1]).toBeGreaterThan(0.15);

    const pistolAlpha = makeSolidRectAlpha(80, 50, 4);
    const pistolMesh = buildSculptedMeshData(pistolAlpha, 80, 50, 'pistolet', 'Pistolet Tactique');
    expect(pistolMesh.muzzleLocalPos).toBeDefined();
    expect(pistolMesh.muzzleLocalPos![0]).toBeGreaterThan(1.5);

    const knifeMesh = buildSculptedMeshData(pistolAlpha, 80, 50, 'lame', 'Karambit');
    expect(knifeMesh.muzzleLocalPos).toBeUndefined();
  });

  it('sépare proprement le chargeur 3D amovible (AR-15 / AK-47) avec ses UV et détecte les chargeurs internes pistolet', () => {
    const w = 160;
    const h = 64;
    const rifleAlpha = new Float32Array(w * h);
    // Châssis / canon / crosse (x = 6..152, y = 14..31)
    for (let y = 14; y <= 31; y++) {
      for (let x = 6; x <= 152; x++) rifleAlpha[y * w + x] = 1;
    }
    // Chargeur saillant devant le pontet (u ~ 0.41..0.51, y = 32..57)
    for (let y = 32; y <= 57; y++) {
      for (let x = 66; x <= 80; x++) rifleAlpha[y * w + x] = 1;
    }
    // Pontet / encoche entre chargeur et poignée (x = 81..92, y = 32..36)
    for (let y = 32; y <= 36; y++) {
      for (let x = 81; x <= 92; x++) rifleAlpha[y * w + x] = 1;
    }
    // Poignée arrière (x = 93..105, y = 32..55)
    for (let y = 32; y <= 55; y++) {
      for (let x = 93; x <= 105; x++) rifleAlpha[y * w + x] = 1;
    }

    const rifleMesh = buildSculptedMeshData(rifleAlpha, w, h, 'fusil', 'AR-15', {
      singleHeroComponent: true,
      separateMagazine: true,
    });
    expect(rifleMesh.magMeta).toBeDefined();
    expect(rifleMesh.magMeta!.isInternal).toBe(false);
    expect(rifleMesh.magMeta!.pullDirLocal[1]).toBeLessThan(-0.7);
    expect(rifleMesh.magMeshData).toBeDefined();
    expect(rifleMesh.magMeshData!.positions.length).toBeGreaterThan(30);
    expect(rifleMesh.magMeshData!.indices.length).toBeGreaterThan(18);
    expect(rifleMesh.magMeshData!.bounds.height).toBeGreaterThan(0.3);

    for (let i = 0; i < rifleMesh.magMeshData!.uvs.length; i++) {
      expect(rifleMesh.magMeshData!.uvs[i]).toBeGreaterThanOrEqual(0);
      expect(rifleMesh.magMeshData!.uvs[i]).toBeLessThanOrEqual(1);
    }

    const pistolAlpha = makeSolidRectAlpha(80, 56, 4);
    const pistolMesh = buildSculptedMeshData(pistolAlpha, 80, 56, 'pistolet', 'Pistolet Tactique', {
      singleHeroComponent: true,
      separateMagazine: true,
    });
    expect(pistolMesh.magMeta?.isInternal).toBe(true);
    expect(pistolMesh.magMeshData).toBeUndefined();

    const knifeMesh = buildSculptedMeshData(pistolAlpha, 80, 56, 'lame', 'Karambit', {
      singleHeroComponent: true,
      separateMagazine: true,
    });
    expect(knifeMesh.magMeta).toBeUndefined();
    expect(knifeMesh.magMeshData).toBeUndefined();
  });

  it('donne aux modèles Deagle (pistolet) une silhouette équilibrée et au MAC-10 un boîtier large', () => {
    const pistolMesh = buildSculptedMeshData(
      makeSolidRectAlpha(80, 56, 4),
      80,
      56,
      'pistolet',
      'Pistolet Tactique'
    );
    const macMesh = buildSculptedMeshData(
      makeSolidRectAlpha(64, 58, 4),
      64,
      58,
      'pm',
      'MAC-10'
    );
    expect(pistolMesh.bounds.depth).toBeGreaterThanOrEqual(0.24);
    expect(pistolMesh.bounds.depth).toBeLessThanOrEqual(0.32);
    expect(macMesh.bounds.depth).toBeGreaterThanOrEqual(0.50);
  });

  it('conserve le fusil complet en mode Zombie même avec une détente flottante plus basse que le centre de gravité (AR-15 Hurlement de Braise) tout en isolant les lames doubles', () => {
    const w = 180;
    const h = 72;
    const howlAlpha = new Float32Array(w * h);
    // Corps AR-15 principal (x = 8..168, y = 14..32) + chargeur (x = 70..86, y = 33..58) + crosse/poignée
    for (let y = 14; y <= 32; y++) {
      for (let x = 8; x <= 168; x++) howlAlpha[y * w + x] = 1;
    }
    for (let y = 33; y <= 58; y++) {
      for (let x = 70; x <= 86; x++) howlAlpha[y * w + x] = 1;
    }
    for (let y = 33; y <= 52; y++) {
      for (let x = 104; x <= 116; x++) howlAlpha[y * w + x] = 1;
    }
    // Petite détente flottante isolée DANS le pontet, dont le cy est plus bas que celui du fusil
    for (let y = 36; y <= 44; y++) {
      for (let x = 93; x <= 96; x++) howlAlpha[y * w + x] = 1;
    }

    const rifleMesh = buildSculptedMeshData(howlAlpha, w, h, 'fusil', 'AR-15', {
      singleHeroComponent: true,
      separateMagazine: true,
    });
    expect(rifleMesh.bounds.width).toBeGreaterThan(3.5);
    expect(rifleMesh.bounds.height).toBeGreaterThan(0.75);
    expect(rifleMesh.magMeta?.isInternal).toBe(false);
    expect(rifleMesh.magMeshData).toBeDefined();

    // Cas des deux baïonnettes empilées : l'isolation FPS garde uniquement la lame inférieure
    const twinAlpha = new Float32Array(w * h);
    for (let y = 10; y <= 24; y++) {
      for (let x = 16; x <= 156; x++) twinAlpha[y * w + x] = 1;
    }
    for (let y = 44; y <= 58; y++) {
      for (let x = 22; x <= 162; x++) twinAlpha[y * w + x] = 1;
    }
    const twinMesh = buildSculptedMeshData(twinAlpha, w, h, 'lame', 'Couteau Baïonnette', {
      singleHeroComponent: true,
    });
    expect(twinMesh.componentCount).toBe(1);
    expect(twinMesh.bounds.width).toBeGreaterThan(3.5);
    expect(twinMesh.bounds.height).toBeLessThan(0.6);
  });
});
