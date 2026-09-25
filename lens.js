// Vision Nexus 2030 — National Competitiveness Lens (details on demand; the map stays the hero).
(() => {
  'use strict';
  const G = window.VNP, C = window.VisionCompetitiveness; if (!G || !C) return;
  const {$, $$, esc, VM} = G, t = (...a) => G.t(...a), O = C.OBSERVED;
  const badge = k => `<span class="badge ${k}">${esc(t(k === 'obs' ? 'observed' : k === 'sim' ? 'simulated' : 'forecast'))}</span>`;
  const num = (v, d=0) => typeof v === 'number' ? v.toLocaleString(G.lang() === 'ar' ? 'en-US' : 'en-US', {minimumFractionDigits:d, maximumFractionDigits:d}) : esc(t(v));
  const ord = n => G.lang() === 'ar' ? `${n}` : `${n}${['th','st','nd','rd'][(n % 100 > 10 && n % 100 < 14) ? 0 : Math.min(n % 10, 4) % 4] || 'th'}`;
  let tab = 'overview', selFactor = null;
  function gameYear(){ const yrs = Object.entries(G.profile.missions).filter(([id, r]) => r.medal).map(([id]) => { const m = VM.mission(id); return m ? +String(m.date.en).slice(0, 4) : 2026; }).concat(G.profile.city ? [2026 + Math.floor((G.profile.city.month || 0) / 12)] : []); return yrs.length ? Math.max(2026, ...yrs) : 2026; }
  function rankChart(key){
    const r = O.RANKS[key], yrs = Object.keys(r.history).map(Number), vals = yrs.map(y => r.history[y]);
    const W = 260, H = 96, pad = 22, maxR = Math.max(...vals) + 2, minR = Math.max(1, Math.min(...vals) - 2);
    const X = i => pad + i * (W - pad * 2) / (yrs.length - 1), Y = v => 14 + (v - minR) / (maxR - minR) * (H - 34);   // rank 1 at the top
    const pts = vals.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
    return `<figure class="rank-card"><figcaption><b>${esc(t(r.label))}</b><span>${badge('obs')}</span></figcaption>
      <div class="rank-now"><strong>${ord(r.history[2026])}</strong><small>${esc(t('ofN', {n:r.of}))} · 2026</small></div>
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t(r.label))}: ${yrs.map((y, i) => y + ' ' + vals[i]).join(', ')}"><polyline points="${pts}" fill="none" stroke="#2c6fb0" stroke-width="2.5"/>
        ${vals.map((v, i) => `<circle cx="${X(i)}" cy="${Y(v)}" r="4" fill="${i === vals.length - 1 ? '#ee812d' : '#2c6fb0'}"/><text x="${X(i)}" y="${Y(v) - 8}" text-anchor="middle" font-size="10" font-weight="800" fill="#153f38">${v}</text><text x="${X(i)}" y="${H - 3}" text-anchor="middle" font-size="9" fill="#6c8173">${yrs[i]}</text>`).join('')}</svg></figure>`;
  }
  function overview(sc, fc){
    const done = id => (G.profile.missions[id] || {}).medal;
    return `<p class="hint">${esc(t('lensIntro'))}</p>
      <div class="rank-row">${['overall','emea','pop20m'].map(rankChart).join('')}</div>
      <p class="hint small">${esc(t('rankNote'))}</p>
      <div class="sci">
        <div class="sci-box"><small>${esc(t('sciBaseline'))} ${badge('obs')}</small><b>${sc.baseIndex.toFixed(1)}</b><em>${esc(t('sciBaselineNote'))}</em></div>
        <div class="sci-arrow">→</div>
        <div class="sci-box sim"><small>${esc(t('sciCurrent', {y:gameYear()}))} ${badge('sim')}</small><b>${sc.index.toFixed(1)}</b><em>${sc.index - sc.baseIndex >= 0 ? '+' : ''}${(sc.index - sc.baseIndex).toFixed(1)} ${esc(t('fromYourMissions'))}</em></div>
        <div class="sci-arrow">→</div>
        <div class="sci-box fc"><small>${esc(t('sciForecast'))} ${badge('fc')}</small><b>${fc.low.toFixed(1)}–${fc.high.toFixed(1)}</b><em>${esc(t(fc.assumptions))}</em></div>
      </div>
      <div class="dom-bars">${sc.domains.map(d => { const dd = O.DOMAINS.find(x => x.id === d.id); return `<div class="dom-bar"><span>${dd.icon} ${esc(t(dd.name))}</span><i style="--b:${d.baseline}%;--c:${d.current}%"></i><b>${d.baseline.toFixed(1)} → ${d.current.toFixed(1)}</b></div>`; }).join('')}</div>
      <h4>${esc(t('arcsTitle'))}</h4>
      <ul class="arcs">${O.CHALLENGES.map(c => { const ms = VM.MISSIONS.filter(m => m.chapter === 'riyadh' && m.arc === c.arc); return `<li><span class="arc-tag">${c.arc}</span><div><b>${c.icon} ${esc(t(c.name))}</b><small>${ms.map(m => `${done(m.id) ? '✓' : '○'} ${esc(t(m.title))}`).join(' · ')}</small></div></li>`; }).join('')}</ul>`;
  }
  function factors(sc){
    const fsc = id => sc.factors.find(f => f.id === id);
    return `<p class="hint">${esc(t('factorsIntro'))}</p>` + O.DOMAINS.map(d => `<details class="domain" ${d.id === (selFactor ? O.FACTORS.find(f => f.id === selFactor).domain : 'econ') ? 'open' : ''}><summary>${d.icon} <b>${esc(t(d.name))}</b><span>${sc.domains.find(x => x.id === d.id).baseline.toFixed(1)} → ${sc.domains.find(x => x.id === d.id).current.toFixed(1)}</span></summary>
      <table class="ftable"><thead><tr><th>${esc(t('factor'))}</th><th>${esc(t('score2026'))} ${badge('obs')}</th><th>${esc(t('rank2026'))} ${badge('obs')}</th><th>${esc(t('scenarioNow'))} ${badge('sim')}</th><th></th></tr></thead><tbody>
      ${O.FACTORS.filter(f => f.domain === d.id).map(f => { const s = fsc(f.id), tag = f.rank <= 10 ? `<span class="tag strong">${esc(t('strength'))}</span>` : f.rank >= 35 ? `<span class="tag opp">${esc(t('opportunity'))}</span>` : '';
        return `<tr class="${selFactor === f.id ? 'sel' : ''}" data-f="${f.id}" tabindex="0"><td>${esc(t(f.name))} ${tag}</td><td>${f.score.toFixed(1)}</td><td>${ord(f.rank)}</td><td>${s.current.toFixed(1)} <em class="${s.delta > 0 ? 'up' : s.delta < 0 ? 'down' : ''}">${s.delta ? (s.delta > 0 ? '+' : '') + s.delta.toFixed(2) : ''}</em></td><td>›</td></tr>`; }).join('')}
      </tbody></table></details>`).join('') + (selFactor ? factorDetail(selFactor, sc) : '');
  }
  function factorDetail(id, sc){
    const f = O.FACTORS.find(x => x.id === id), s = sc.factors.find(x => x.id === id), role = C.ROLE[id];
    return `<div class="fdetail" id="fdetail"><h4>${esc(t(f.name))}</h4><ol class="chain">
      <li><small>${esc(t('chain1'))} ${badge('obs')}</small><b>${f.score.toFixed(1)} / 100 · ${ord(f.rank)} ${esc(t('ofN', {n:70}))}</b></li>
      <li><small>${esc(t('chain2'))}</small>${s.causes.length ? `<ul>${s.causes.map(c => `<li>${esc(c.mission === 'city' ? t('cityTitle') : String(c.mission).startsWith('city:') ? t('cityMissions') + ' · ' + t((window.VisionCity.CMISSIONS.find(x => 'city:' + x.id === c.mission) || {title:{en:c.mission, ar:c.mission}}).title) : t(VM.mission(c.mission).title))}: ${esc(t(c.why))} <em>${c.delta > 0 ? '+' : ''}${c.delta}</em></li>`).join('')}</ul>` : `<span>${esc(t('noActionsYet'))}</span>`}</li>
      <li><small>${esc(t('chain3'))} ${badge('sim')}</small><b>${s.delta > 0 ? '+' : ''}${s.delta.toFixed(2)}</b></li>
      <li><small>${esc(t('chain4', {y:gameYear()}))} ${badge('sim')}</small><b>${s.current.toFixed(1)} / 100</b></li>
      <li><small>${esc(t('chain5'))}</small><span>${esc(t(O.SOURCE.label))}. ${esc(t('assumptionText'))}</span></li></ol>
      ${(() => { const ev = (G.profile.compEvents || []).filter(e => e.factor === id).slice(-6).reverse(); return ev.length ? `<h5>${esc(t('eventRecord'))} <span class="badge sim">${esc(t('simulated'))}</span></h5><ul class="events">${ev.map(e => `<li>${G.month(e.month, e.year)} · ${e.from > 0 ? '+' : ''}${e.from} → ${e.to > 0 ? '+' : ''}${e.to} — ${esc(t(e.why))}</li>`).join('')}</ul>` : ''; })()}
      <p class="where"><b>${esc(t('whereInPlay'))}:</b> ${esc(t(role.sys))} — ${role.where.map(mid => esc(t(VM.mission(mid).title))).join(' · ')}${role.city ? ' · ' + esc(t('cityTitle')) : ''}</p></div>`;
  }
  function facts(){
    return `<p class="hint">${esc(t('factsIntro'))}</p><table class="ftable facts"><thead><tr><th>${esc(t('fact'))}</th><th>${esc(t('observedValue'))} ${badge('obs')}</th><th>${esc(t('dataYear'))}</th><th>${esc(t('rankPdf'))}</th></tr></thead><tbody>
      ${O.FACTS.map(f => `<tr><td>${esc(t(f.name))}</td><td ${f.slide ? `title="${esc(t('slideShows', {v:f.slide}))}"` : ''}>${typeof f.value === 'number' ? num(f.value, f.decimals || 0) : esc(t(f.value))} ${f.unit ? esc(typeof f.unit === 'string' ? f.unit : t(f.unit)) : ''}${f.slide ? ' <sup>ⓘ</sup>' : ''}</td><td>${f.year || '—'}</td><td>${f.rank ? ord(f.rank) : f.rankNote ? `<span title="${esc(t(f.rankNote))}">${esc(t('notListed'))} ⓘ</span>` : '—'}</td></tr>`).join('')}
      </tbody></table><p class="hint small">${esc(t('factsFixed'))}</p>`;
  }
  function sources(){
    return `<div class="src"><h4>${esc(t('sourcesTitle'))}</h4><p><b>${esc(t(O.SOURCE.label))}</b></p>
      <dl><dt>${esc(t('refYear'))}</dt><dd>${O.SOURCE.referenceYear}</dd><dt>${esc(t('datasetVersion'))}</dt><dd>${O.SOURCE.id} · v${O.SOURCE.version}</dd></dl>
      <p>${esc(t(O.SOURCE.transcription))}</p><p class="disclaimer">${esc(t(O.SOURCE.disclaimer))}</p>
      <h4>${esc(t('threeKinds'))}</h4><ul class="kinds"><li>${badge('obs')} ${esc(t('kindObs'))}</li><li>${badge('sim')} ${esc(t('kindSim'))}</li><li>${badge('fc')} ${esc(t('kindFc'))}</li></ul>
      <p class="hint small">${esc(t('sciMethod'))}</p></div>`;
  }
  G.showLens = (which) => {
    if (which) tab = which;
    const el = $('#lensPanel'), sc = C.scenario(G.profile), fc = C.forecast(G.profile);
    const body = tab === 'factors' ? factors(sc) : tab === 'facts' ? facts() : tab === 'sources' ? sources() : overview(sc, fc);
    el.innerHTML = `<div class="sheet-card glass wide lens" role="dialog" aria-label="${esc(t('lensTitle'))}"><div class="sheet-head"><b>📊 ${esc(t('lensTitle'))}</b><button class="icon-btn" id="lensClose" aria-label="${esc(t('close'))}">✕</button></div>
      <div class="lens-tabs" role="tablist">${['overview','factors','facts','sources'].map(k => `<button role="tab" aria-selected="${tab === k}" class="${tab === k ? 'on' : ''}" data-tab="${k}">${esc(t('tab_' + k))}</button>`).join('')}</div>
      <div class="lens-body">${body}</div></div>`;
    el.classList.remove('hidden');
    $('#lensClose').onclick = () => el.classList.add('hidden');
    $$('#lensPanel [data-tab]').forEach(b => b.onclick = () => { selFactor = null; G.showLens(b.dataset.tab); });
    $$('#lensPanel [data-f]').forEach(r => { const go = () => { selFactor = r.dataset.f; G.showLens('factors'); const d = $('#fdetail'); if (d) d.scrollIntoView({block:'nearest'}); }; r.onclick = go; r.onkeydown = e => { if (e.key === 'Enter') go(); }; });
  };
  const btn = $('#mCompBtn'); if (btn) btn.onclick = () => G.showLens('overview');
})();
