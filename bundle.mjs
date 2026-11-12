import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dir = __dirname;

const css = fs.readFileSync(path.join(dir, 'style.css'), 'utf-8');
const indexHtml = fs.readFileSync(path.join(dir, 'index.html'), 'utf-8');
let physicsJs = fs.readFileSync(path.join(dir, 'physics.js'), 'utf-8');
let rendererJs = fs.readFileSync(path.join(dir, 'renderer.js'), 'utf-8');
let appJs = fs.readFileSync(path.join(dir, 'app.js'), 'utf-8');

physicsJs = physicsJs
  .replace(/export\s+const\s+/g, 'const ')
  .replace(/export\s+let\s+/g, 'let ')
  .replace(/export\s+function\s+/g, 'function ')
  .replace(/export\s+class\s+/g, 'class ');

rendererJs = rendererJs
  .replace(/export\s+class\s+FractureRenderer/g, 'class FractureRenderer')
  .replace(/export\s+function\s+/g, 'function ')
  .replace(/export\s+const\s+/g, 'const ');

appJs = appJs.replace(/import\s+\{[\s\S]*?\}\s+from\s+['"][^'"]+['"];?/g, '');

const combinedJs = `
// ============================================================================
// Bundled Bone Fracture Healing & Mechanoregulation Simulator
// Based on Byrne, Lacroix & Prendergast (2011) & Perier-Metz et al. (2020)
// ============================================================================
${physicsJs}

${rendererJs}

${appJs}
`;

let standaloneHtml = indexHtml.replace(
  '<link rel="stylesheet" href="style.css">',
  () => `<style>\n${css}\n</style>`
);

standaloneHtml = standaloneHtml.replace(
  '<script type="module" src="app.js"></script>',
  () => `<script>\n${combinedJs}\n</script>`
);

const logoPath = path.join(dir, 'EBLlogo.png');
if (fs.existsSync(logoPath)) {
  const logoBase64 = fs.readFileSync(logoPath).toString('base64');
  standaloneHtml = standaloneHtml.replace(
    'src="EBLlogo.png"',
    () => `src="data:image/png;base64,${logoBase64}"`
  );
}

fs.writeFileSync(path.join(dir, 'index_standalone.html'), standaloneHtml, 'utf-8');
console.log('Successfully generated index_standalone.html');
