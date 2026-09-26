// Vision Nexus 2030 — save identities for National Simulation worlds.
// Each world has its own save, so starting one never overwrites another:
//   campaign            the 2024–2030 mandate (its "Beyond 2030" continuation stays in the same world)
//   sandbox             the open-ended sandbox
//   challenge-<id>      one per Timed Challenge (sandstorm, rainfall, hajj)
// Mission runs ('visionNexus2030.run.v4') and the City Builder ('visionNexus2030.city.v1') already have their own keys.
// All functions take a Storage-like object (getItem/setItem/removeItem/key/length) so they can be tested headlessly.
(() => {
  'use strict';
  const PREFIX = 'visionNexus2030.world.v3.', LEGACY = 'visionNexus2030.save.v3';
  const RANK = {campaign:0, sandbox:1};

  // Which world a saved state belongs to. New states carry `slot`; legacy states are classified from their mode.
  function slotOf(st){
    if (!st) return null;
    if (st.slot) return st.slot;
    if (st.mode === 'challenge' || st.onlyChallenge) return 'challenge-' + (st.onlyChallenge || 'unknown');
    if (st.mode === 'sandbox') return (st.log || []).some(e => /Beyond 2030/.test((e && e.text) || '')) ? 'campaign' : 'sandbox';
    return 'campaign';
  }
  const keyOf = slot => PREFIX + slot;
  const kindOf = slot => slot === 'campaign' || slot === 'sandbox' ? slot : 'challenge';
  function read(store, slot){ try { const raw = store.getItem(keyOf(slot)); return raw ? JSON.parse(raw) : null; } catch(e) { return null; } }
  function list(store){
    const out = [];
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i); if (!k || !k.startsWith(PREFIX) || k.slice(PREFIX.length).includes('.')) continue;
      const slot = k.slice(PREFIX.length), d = read(store, slot);
      if (d) out.push({slot, kind:kindOf(slot), month:d.month, mode:d.mode, ended:!!d.ended, challenge:d.onlyChallenge || null, difficulty:d.difficulty});
    }
    return out.sort((a, b) => (RANK[a.slot] ?? 2) - (RANK[b.slot] ?? 2) || a.slot.localeCompare(b.slot));
  }
  // Write the live state into its own world's slot (and stamp the state with that slot).
  function write(store, st){ const slot = slotOf(st); st.slot = slot; store.setItem(keyOf(slot), JSON.stringify(st)); return slot; }
  // Before a world is deliberately replaced, keep its last save as a one-step backup.
  function retire(store, slot){ const raw = store.getItem(keyOf(slot)); if (raw != null) store.setItem(keyOf(slot) + '.replaced', raw); return raw != null; }
  // One-time move from the old single save key into its world's slot. Never overwrites an existing world save and
  // never deletes data: the original is kept as '.migrated' (or '<slot>.legacy' if that world already had a save).
  function migrate(store){
    const raw = store.getItem(LEGACY); if (raw == null) return {migrated:false};
    let d; try { d = JSON.parse(raw); } catch(e) { return {migrated:false, error:'unreadable'}; }
    if (!d || d.version !== 3) return {migrated:false, error:'incompatible'};
    const slot = slotOf(d), k = keyOf(slot), kept = store.getItem(k) != null;
    if (kept) store.setItem(k + '.legacy', raw); else { d.slot = slot; store.setItem(k, JSON.stringify(d)); }
    store.setItem(LEGACY + '.migrated', raw); store.removeItem(LEGACY);
    return {migrated:true, slot, conflict:kept};
  }
  window.VisionSaves = {PREFIX, LEGACY, slotOf, keyOf, kindOf, read, list, write, retire, migrate};
})();
