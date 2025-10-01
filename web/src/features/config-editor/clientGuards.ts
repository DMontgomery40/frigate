export type GuardResult = { warnings: string[]; errors: string[] };

/**
 * Non-blocking guard rails: warn for typical pitfalls, only block fatal structure issues.
 */
export function validateConfigGuards(cfg: any): GuardResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  const cams = cfg?.cameras;
  // Fatal: cameras must be a map (name -> camera)
  if (Array.isArray(cams)) {
    errors.push('"cameras" must be an object map of camera names, not an array.');
    return { warnings, errors };
  }

  if (cams && typeof cams === 'object') {
    for (const [name, cam] of Object.entries<any>(cams)) {
      const inputs = cam?.ffmpeg?.inputs;
      const roleSet = new Set<string>();

      if (Array.isArray(inputs)) {
        for (const inp of inputs) {
          const roles = Array.isArray(inp?.roles) ? inp.roles.map((r: any) => String(r)) : [];
          roles.forEach((r: string) => roleSet.add(r));
        }
      }

      // Warnings (non-blocking): enabled features missing expected roles
      if (cam?.detect?.enabled && !roleSet.has('detect')) {
        warnings.push(`Camera "${name}": detect.enabled is true, but no ffmpeg input has role "detect".`);
      }
      if (cam?.record?.enabled && !roleSet.has('record')) {
        warnings.push(`Camera "${name}": record.enabled is true, but no ffmpeg input has role "record".`);
      }
      if (cam?.rtmp?.enabled && !roleSet.has('rtmp')) {
        warnings.push(`Camera "${name}": rtmp.enabled is true, but no ffmpeg input has role "rtmp".`);
      }

      // Warn if detect dimensions are present but invalid
      const w = cam?.detect?.width;
      const h = cam?.detect?.height;
      if (w !== undefined && (!Number.isInteger(w) || w <= 0)) {
        warnings.push(`Camera "${name}": detect.width should be a positive integer.`);
      }
      if (h !== undefined && (!Number.isInteger(h) || h <= 0)) {
        warnings.push(`Camera "${name}": detect.height should be a positive integer.`);
      }
    }
  }

  return { warnings, errors };
}

