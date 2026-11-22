// Télécharge les ressources CC0 de Poly Haven (polyhaven.com) : HDRI, textures PBR, modèles.
// node tools/fetch-assets.js
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', 'assets');
const UA = { headers: { 'User-Agent': 'lumen-asset-fetcher' } };

const HDRIS = ['qwantani_morning_puresky', 'qwantani_noon_puresky', 'qwantani_late_afternoon_puresky',
  'qwantani_sunset_puresky', 'qwantani_dusk_2_puresky', 'qwantani_night_puresky'];
const TEXTURES = ['asphalt_02', 'square_concrete_pavers', 'concrete_floor_02', 'red_brick_03', 'white_plaster_02',
  'yellow_plaster', 'concrete_tile_facade', 'brick_wall_10', 'painted_concrete', 'gravel_floor', 'leafy_grass',
  'wood_floor', 'marble_tiles', 'laminate_floor_02', 'bark_willow_02', 'rectangular_facade_tiles_02', 'grey_plaster'];
const MODELS = ['street_lamp_01', 'street_lamp_02', 'fire_hydrant', 'metal_trash_can', 'modular_street_seating',
  'planter_box_01', 'potted_plant_02', 'shrub_02', 'exterior_aircon_unit', 'outdoor_table_chair_set_01',
  'CoffeeCart_01', 'korean_public_payphone_01', 'Sofa_01', 'modern_arm_chair_01', 'modern_coffee_table_01',
  'bar_chair_round_01', 'GothicBed_01', 'Television_01', 'CashRegister_01', 'potted_plant_01', 'dining_table',
  'WoodenChair_01', 'Shelf_01', 'trashbag', 'concrete_road_barrier'];

async function json(url) { const r = await fetch(url, UA); if (!r.ok) throw new Error(r.status + ' ' + url); return r.json(); }
async function dl(url, dest) {
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) return;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  for (let i = 0; i < 3; i++) {
    try { const r = await fetch(url, UA); if (!r.ok) throw new Error(r.status);
      fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer())); return; }
    catch (e) { if (i === 2) throw new Error('échec ' + url + ' ' + e.message); }
  }
}
async function pool(items, n, fn) { let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const it = items[i++]; try { await fn(it); } catch (e) { console.error(e.message); } } })); }

(async () => {
  const jobs = [];
  for (const h of HDRIS) {
    const f = await json('https://api.polyhaven.com/files/' + h);
    jobs.push([f.hdri['2k'].hdr.url, path.join(ROOT, 'hdri', h + '_2k.hdr')]);
  }
  for (const t of TEXTURES) {
    let f; try { f = await json('https://api.polyhaven.com/files/' + t); } catch (e) { console.error('texture absente', t); continue; }
    const pick = (k) => f[k] && f[k]['2k'] && f[k]['2k'].jpg && f[k]['2k'].jpg.url;
    const map = { diff: pick('Diffuse'), nor: pick('nor_gl'), arm: pick('arm') };
    for (const k in map) if (map[k]) jobs.push([map[k], path.join(ROOT, 'tex', t, k + '.jpg')]);
  }
  for (const m of MODELS) {
    let f; try { f = await json('https://api.polyhaven.com/files/' + m); } catch (e) { console.error('modèle absent', m); continue; }
    const g = f.gltf['2k'] ? f.gltf['2k'].gltf : f.gltf['1k'].gltf;
    const dir = path.join(ROOT, 'props', '_src', m);
    jobs.push([g.url, path.join(dir, m + '.gltf')]);
    for (const k in g.include) jobs.push([g.include[k].url, path.join(dir, k)]);
  }
  console.log(jobs.length, 'fichiers');
  let done = 0;
  await pool(jobs, 6, async ([u, d]) => { await dl(u, d); if (++done % 20 === 0) console.log(done + '/' + jobs.length); });
  console.log('terminé');
})();
