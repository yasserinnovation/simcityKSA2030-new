// node tools/optimize-glb.js <input.glb> <name> [--lod 0.35[,0.12]] [--texture 1024] [--height 0.0036 | --footprint 0.03] [--kind character|prop]
// Prepares a Meshy (or any glTF 2.0) export for the game, with gltf-transform (fetched by npx, dev-only):
//   • optimize: dedupe, prune, weld, resample animations, WebP textures resized to the budget, Meshopt geometry;
//   • optional LOD files <name>_lod1.glb, <name>_lod2.glb … simplified to each ratio (props; characters use a distance cut-off);
//   • prints the manifest entry to paste into assets/models/manifest.json (heights in world units; see README).
// Rigged characters keep their skin and clips; Meshy's separate animation GLBs can be listed under "animations".
const {execFileSync} = require('child_process'), path = require('path'), fs = require('fs');
const args = process.argv.slice(2), flag = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const [input, name] = args; if (!input || !name || input.startsWith('--')) { console.log('usage: node tools/optimize-glb.js <input.glb> <name> [--lod 0.35] [--texture 1024] [--height h | --footprint f] [--kind prop]'); process.exit(1); }
const root = path.resolve(__dirname, '..'), dir = path.join(root, 'assets/models'), out = path.join(dir, name + '.glb'); fs.mkdirSync(dir, {recursive:true});
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx', CLI = ['--yes', '@gltf-transform/cli@4'];
const win = process.platform === 'win32', q = x => win && /[\s()&]/.test(x) ? `"${x}"` : x;   // Windows runs npx through the shell: quote paths with spaces
const run = (...a) => { console.log('> gltf-transform', a.join(' ')); execFileSync(npx, CLI.concat(a).map(q), {stdio:'inherit', shell:win}); };
const tex = flag('texture', '1024');
run('optimize', path.resolve(input), out, '--compress', 'meshopt', '--texture-compress', 'webp', '--texture-size', tex, '--simplify', 'false', '--flatten', 'false', '--join', 'false');
const lods = (flag('lod', '') || '').split(',').filter(Boolean).map(Number), lodEntries = [];
lods.forEach((ratio, i) => { const lod = path.join(dir, `${name}_lod${i + 1}.glb`);
  run('weld', path.resolve(input), lod); run('simplify', lod, lod, '--ratio', String(ratio), '--error', '0.05');   // welded first, or seams block simplification
  run('optimize', lod, lod, '--compress', 'meshopt', '--texture-compress', 'webp', '--texture-size', String(Math.max(256, (+tex) >> (i + 1))), '--simplify', 'false', '--flatten', 'false', '--join', 'false');
  lodEntries.push({url:`assets/models/${name}_lod${i + 1}.glb`, from:+(0.6 * (i + 1)).toFixed(2)}); });
const kind = flag('kind', flag('height') ? 'character' : 'prop'), entry = {url:`assets/models/${name}.glb`, kind};
if (flag('height')) entry.height = +flag('height'); else entry.footprint = +flag('footprint', '0.03');
if (kind === 'character') entry.clips = {idle:'idle', walk:'walk', cheer:'cheer'};   // matched by name, case-insensitive (Meshy: "Idle", "Walking", ...)
if (lodEntries.length) entry.lods = lodEntries;
const kb = f => (fs.statSync(f).size / 1024).toFixed(1) + ' KB';
console.log(`\n${path.basename(input)} (${kb(path.resolve(input))}) -> ${path.relative(root, out)} (${kb(out)})` + lodEntries.map(l => `, ${l.url} (${kb(path.join(root, l.url))})`).join(''));
console.log('\nmanifest "models" entry:\n' + JSON.stringify({[name]:entry}, null, 2));
