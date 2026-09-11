export async function resolve(specifier, context, nextResolve) {
  try { return await nextResolve(specifier, context); }
  catch (err) {
    if (specifier.startsWith('.') && !/\.[cm]?[jt]sx?$/.test(specifier)) {
      for (const ext of ['.ts', '.tsx', '/index.ts']) {
        try { return await nextResolve(specifier + ext, context); } catch {}
      }
    }
    throw err;
  }
}
