// Vision Nexus 2030 — boot loader.
// The game scripts are classic scripts that read window.VisionWorld as they load, so they must run in order and only after
// the renderer exists. three.js is an ES module (vendor/three, no CDN), and modules cannot load from file:// pages, so:
//   • http(s)://…/index.html                 → three.js renderer (engine.js)
//   • …/index.html?renderer=classic, file:// → the original hand-written WebGL renderer (engine_classic.js)
// Both renderers implement the same VisionWorld API; nothing else in the game knows which one is running.
(() => {
  'use strict';
  const q = new URLSearchParams(location.search);
  const fileMode = location.protocol === 'file:';
  const classic = q.get('renderer') === 'classic' || fileMode;
  window.VN_RENDERER = classic ? 'classic' : 'three';
  window.VN_DEBUG = q.get('debug') === '1';

  const BEFORE = ['data.js', 'regions.js', 'layout.js', 'models.js', 'rocks.js', 'dunes.js', 'visual-details.js', 'scenic-landmarks.js', 'world-cosmetics.js', 'kingdom-diorama.js', 'country-overview.js', 'west-clay.js', 'east-clay.js', 'neom-clay.js', 'riyadh.js'];
  const AFTER = ['sim.js', 'saves.js', 'game.js', 'competitiveness.js', 'mission.js', 'i18n.js', 'play_core.js', 'play_mission.js', 'city.js', 'lens.js', 'city_ui.js', 'national_ar.js', 'help.js', 'tutorial.js'];
  const loadOne = src => new Promise((resolve, reject) => {
    const s = document.createElement('script'); s.src = src; s.async = false;
    s.onload = resolve; s.onerror = () => reject(new Error('Could not load ' + src));
    document.body.appendChild(s);
  });
  const loadAll = list => list.reduce((p, src) => p.then(() => loadOne(src)), Promise.resolve());
  const fail = e => {
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;inset:auto 16px 16px 16px;z-index:99;padding:14px 16px;border-radius:12px;background:#FAF9F5;color:#153F36;font:14px/1.5 sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.2)';
    d.textContent = 'Vision Nexus 2030 could not start the renderer (' + e.message + '). Open index.html?renderer=classic, or start the game with Launch_Prototype.bat / launch.sh.';
    document.body.appendChild(d);
    throw e;
  };

  loadAll(BEFORE)
    .then(() => classic ? loadOne('engine_classic.js') : import('./vendor/three/three.module.js').then(T => { window.THREE = T; return loadOne('engine.js'); }))
    .then(() => loadAll(AFTER))
    .then(() => {
      const b = document.querySelector('.build-badge');
      if (b) b.textContent += classic ? ' · classic renderer' + (fileMode ? ' (file:// — use the launcher for three.js)' : '') : ' · three.js renderer';
    })
    .catch(fail);
})();
