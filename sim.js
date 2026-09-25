// Vision Nexus 2030 — deterministic simulation core.
// No DOM and no rendering here: the UI (game.js) and renderer (engine.js) only read state
// and send commands, so the simulation can later move to a Web Worker or another engine.
(() => {
  'use strict';
  const D = window.VISION_DATA;

  /* ----------------------------- constants ---------------------------- */
  const CAMPAIGN_MONTHS = 84;               // Jan 2024 → Dec 2030
  const EXPO_MONTH = 81;                     // Oct 2030 opening
  const TEMPLATE = [
    {k:'design',    name:'Design & approvals',                 dur:3, crew:{eng:2},           cost:1.2, after:[]},
    {k:'site',      name:'Site preparation',                   dur:2, crew:{civil:2},         cost:1.5, after:['design'], outdoor:true},
    {k:'materials', name:'Materials delivery',                 dur:0, crew:{},                cost:2.5, after:['design'], materials:10},
    {k:'build',     name:'Main construction',                  dur:7, crew:{civil:3,crane:2}, cost:6.0, after:['site','materials'], outdoor:true},
    {k:'utility',   name:'Power, water & transport connection', dur:2, crew:{eng:1,civil:1},   cost:1.8, after:['build'], grid:3},
    {k:'test',      name:'Testing & commissioning',            dur:2, crew:{test:1,eng:1},    cost:1.0, after:['utility']}
  ];
  const KEYS = TEMPLATE.map(t => t.k);
  const SCALE = {neom:1.6, newmurabba:1.4, expo:1.3, metro:1.3, ksip:1.3, qiddiya:1.3, redsea:1.2, hydrogen:1.2, oxagon:1.2, trojena:1.2, haramain:1.1};
  // Cross-portfolio prerequisites: "package of A" waits for "package of B".
  const CROSS = {
    'expo:test':['metro:test','ksip:utility'], 'masar:test':['haramain:utility'], 'neom:utility':['hydrogen:build'],
    'oxagon:build':['hydrogen:site'], 'lucid:test':['ceer:utility'], 'sports:test':['park:utility'], 'hajj:test':['masar:utility']
  };
  const EXPO_CRITICAL = ['expo','metro','ksip','newmurabba','sports','park'];
  const RESILIENCE_ASSETS = ['renewables','hydrogen','eastern','haramain','metro','green','greenriyadh','jazan','oxagon'];
  const GATEWAYS = [
    {id:'jeddah', name:'Jeddah Islamic Port',          lon:39.15, lat:21.47, cap:9},
    {id:'dammam', name:'King Abdulaziz Port, Dammam',  lon:50.15, lat:26.50, cap:9},
    {id:'riyadh', name:'Riyadh Dry Port',               lon:46.80, lat:24.62, cap:6, anchor:'Riyadh'},
    {id:'neom',   name:'NEOM Port',                     lon:35.62, lat:27.52, cap:4},
    {id:'jazan',  name:'Jazan Port',                    lon:42.57, lat:16.93, cap:3}
  ];
  const POOLS = {civil:'Construction crews', eng:'Engineering teams', crane:'Heavy cranes', test:'Testing teams', support:'Support units'};
  const DIFFICULTY = {
    strategic: {label:'Strategic', pools:{civil:13,eng:10,crane:9,test:4,support:5}, uncertainty:.15, recovery:9, lead:3, drain:.75, guidance:true},
    executive: {label:'Executive', pools:{civil:11,eng:8,crane:7,test:3,support:4},  uncertainty:.30, recovery:6, lead:2, drain:1.0, guidance:false},
    simulation:{label:'Simulation',pools:{civil:9,eng:7,crane:6,test:2,support:3},   uncertainty:.50, recovery:4, lead:1, drain:1.3, guidance:false}
  };
  const PROGRAMS = {
    trainCrews:   {name:'Train Saudi construction crews', pool:'civil', add:2, months:6, cost:3.0, localContent:+2, note:'Permanent capacity, builds local skills.'},
    contractCrews:{name:'Contract external crews',       pool:'civil', add:2, months:0, cost:5.0, expires:12, localContent:-1, note:'Immediate, but expensive and expires after 12 months.'},
    trainTesting: {name:'Certify a new testing team',    pool:'test',  add:1, months:8, cost:4.0, localContent:+1, note:'Relieves the commissioning bottleneck.'},
    leaseCranes:  {name:'Lease heavy cranes',            pool:'crane', add:2, months:3, cost:3.0, expires:18, note:'Short delivery time; lease ends after 18 months.'},
    trainEngineers:{name:'Graduate engineering programme',pool:'eng',  add:2, months:9, cost:3.5, localContent:+2, note:'Slow, but permanent and local.'},
    supportUnits: {name:'Equip resilience support units', pool:'support', add:1, months:4, cost:2.5, note:'More units for national challenges.'}
  };
  // Hajj dates move ~11 days earlier each year (month index from Jan 2024).
  const HAJJ_MONTHS = [5, 17, 28, 40, 52, 63, 75];

  /* ------------------------- national challenges ---------------------- */
  const CHALLENGES = {
    sandstorm: {
      name:'Riyadh Sandstorm Continuity Challenge', short:'Riyadh sandstorm', month:14, anchor:'Riyadh', duration:90,
      brief:'A dust front will cross Riyadh. Keep the airport, freight, grid, metro and outdoor worksites operating safely.',
      hazard:{type:'dust', from:[48.3,24.1], to:[45.6,25.2], radius:.85},
      assets:[
        {id:'ksia', name:'KSIA airside operations', lon:46.69, lat:24.97, kind:'airport', people:30000},
        {id:'expo-site', name:'Expo site crews', lon:46.84, lat:24.92, kind:'site', people:4000},
        {id:'murabba-site', name:'New Murabba site crews', lon:46.62, lat:24.84, kind:'site', people:3000},
        {id:'sub-east', name:'East Riyadh substation', lon:46.93, lat:24.66, kind:'grid', people:600000},
        {id:'freight', name:'Riyadh–Dammam freight corridor', lon:47.05, lat:24.80, kind:'logistics', people:0},
        {id:'metro-ops', name:'Riyadh Metro operations', lon:46.71, lat:24.66, kind:'transit', people:250000}
      ],
      units:[
        {type:'support', name:'Field support teams', n:3, supports:['site','transit'], color:[.25,.72,.45]},
        {type:'grid', name:'Grid crews', n:2, supports:['grid'], color:[.98,.78,.2]},
        {type:'logistics', name:'Logistics coordinators', n:2, supports:['logistics','airport'], color:[.35,.6,.95]},
        {type:'drone', name:'Survey drone', n:1, supports:['airport','site','logistics','grid','transit'], color:[.9,.9,1], drone:true}
      ],
      toggles:[
        {id:'pauseOutdoor', name:'Pause outdoor site work', protects:'site', note:'Protects site crews; Riyadh construction loses about two weeks.'},
        {id:'railFreight', name:'Shift freight to Dammam rail', protects:'logistics', note:'Keeps freight moving; Riyadh Dry Port loses 3 slots next month.'}
      ]
    },
    rainfall: {
      name:'Jeddah Rainfall & Mobility Resilience Challenge', short:'Jeddah rainfall', month:34, anchor:null, duration:90,
      brief:'Heavy rain bands will move over Jeddah. Keep people and services moving as water levels change.',
      hazard:{type:'rain', from:[38.75,21.15], to:[39.55,21.85], radius:.42},
      assets:[
        {id:'underpass', name:'Corniche underpasses', lon:39.12, lat:21.58, kind:'transit', people:120000},
        {id:'kaia', name:'King Abdulaziz Int. Airport', lon:39.17, lat:21.68, kind:'airport', people:40000},
        {id:'albalad', name:'Al-Balad heritage district', lon:39.19, lat:21.48, kind:'heritage', people:20000},
        {id:'desal', name:'Jeddah desalination & distribution', lon:39.08, lat:21.38, kind:'water', people:900000},
        {id:'hhr-jeddah', name:'Haramain Jeddah station', lon:39.24, lat:21.55, kind:'transit', people:60000},
        {id:'jc-site', name:'Jeddah Central site', lon:39.14, lat:21.52, kind:'site', people:3500}
      ],
      units:[
        {type:'pump', name:'Pump & drainage crews', n:3, supports:['transit','water','site'], color:[.35,.65,.95]},
        {type:'traffic', name:'Mobility support teams', n:2, supports:['transit','airport'], color:[.98,.78,.2]},
        {type:'heritage', name:'Heritage protection team', n:1, supports:['heritage','site'], color:[.85,.55,.3]},
        {type:'drone', name:'Survey drone', n:1, supports:['transit','water','site','heritage','airport'], color:[.9,.9,1], drone:true}
      ],
      toggles:[
        {id:'closeUnderpass', name:'Pre-close low underpasses', protects:'transit', note:'Keeps people safe; adds congestion on surface roads.'},
        {id:'storeWater', name:'Draw down reservoirs early', protects:'water', note:'Protects supply; costs 0.5B in pumping energy.'}
      ]
    },
    hajj: {
      name:'Hajj Heat & Flow Readiness Challenge', short:'Hajj heat & flow', month:40, anchor:'Makkah', duration:95,
      brief:'Peak heat coincides with movement between the holy sites. Maintain safe density, comfort, transport and support coverage for pilgrims.',
      hazard:{type:'heat', from:[39.93,21.39], to:[39.87,21.41], radius:.55},
      assets:[
        {id:'mina', name:'Mina camps', lon:39.90, lat:21.41, kind:'crowd', people:1500000},
        {id:'arafat', name:'Arafat plain', lon:39.98, lat:21.35, kind:'crowd', people:1800000},
        {id:'jamarat', name:'Jamarat flow', lon:39.87, lat:21.42, kind:'crowd', people:900000},
        {id:'haram', name:'Masjid al-Haram approaches', lon:39.826, lat:21.4225, kind:'crowd', people:1000000},
        {id:'mashaer', name:'Al Mashaer metro', lon:39.93, lat:21.39, kind:'transit', people:350000},
        {id:'health', name:'Health centres', lon:39.95, lat:21.37, kind:'health', people:50000}
      ],
      units:[
        {type:'cooling', name:'Shade & cooling teams', n:3, supports:['crowd'], color:[.35,.8,.9]},
        {type:'medical', name:'Medical support teams', n:2, supports:['health','crowd'], color:[.95,.4,.4]},
        {type:'transport', name:'Transport coordinators', n:2, supports:['transit','crowd'], color:[.98,.78,.2]},
        {type:'drone', name:'Survey drone', n:1, supports:['crowd','transit','health'], color:[.9,.9,1], drone:true}
      ],
      toggles:[
        {id:'stagger', name:'Stagger movement windows', protects:'crowd', note:'Lowers density; pilgrims travel over a longer window.'},
        {id:'extraTrains', name:'Increase metro frequency', protects:'transit', note:'More capacity; costs 0.4B in operations.'}
      ],
      protected:true
    }
  };

  /* ------------------------------ helpers ----------------------------- */
  const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
  const km = (lon1,lat1,lon2,lat2) => { const dx=(lon2-lon1)*101*Math.cos((lat1+lat2)/2*Math.PI/180)*1.12, dy=(lat2-lat1)*111; return Math.hypot(dx,dy); };
  const P = id => D.projects.find(p => p.id === id);
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const dateOf = m => `${MONTHS[((m%12)+12)%12]} ${2024+Math.floor(m/12)}`;

  let S = null, listeners = [], W = null;
  const emit = (type, data) => { for (const f of listeners) f(type, data); };
  function log(text, kind='info', chain=null){ const e={month:S.month, text, kind, chain}; S.log.push(e); if (S.log.length>200) S.log.shift(); emit('log', e); }

  /* ------------------------------- init ------------------------------- */
  function init(opts={}){
    const diff = DIFFICULTY[opts.difficulty] ? opts.difficulty : 'executive';
    S = {
      version:3, mode:opts.mode||'campaign', difficulty:diff, month:0, budget:opts.mode==='sandbox'?200:100,
      pools:Object.fromEntries(Object.entries(DIFFICULTY[diff].pools).map(([k,v]) => [k, {total:v, temp:[]}])),
      programs:[], maintenance:.7, localContent:0, spent:0, completedSinceStart:0,
      projects:{}, convoys:[], log:[], effects:[], lessons:[], challengeScores:{},
      challenge:null, advisory:null, recovery:null, ended:null, gatewayLoad:{}, gatewayPenalty:{},
      kpi:{}, hist:{momentum:[],budget:[],trust:[],resilience:[],expo:[]}, challengesDone:{}
    };
    for (const p of D.projects) {
      const pk = {};
      const doneInit = p.stage===2 ? ['design','site','materials'] : ['design'];
      for (const t of TEMPLATE) pk[t.k] = {status: doneInit.includes(t.k)?'done':'locked', progress: doneInit.includes(t.k)?1:0, assigned:{}, delivered: doneInit.includes(t.k)?t.materials||0:0, inTransit:0, gateway:nearestGateway(p).id, startAt:null, reason:null};
      S.projects[p.id] = {pk, condition:1, operational:false};
    }
    if (opts.mode==='challenge' && CHALLENGES[opts.challenge]) { S.month = Math.max(0, CHALLENGES[opts.challenge].month - DIFFICULTY[diff].lead); S.onlyChallenge = opts.challenge; }
    refreshStatuses(); computeKPIs(true);
    if (S.onlyChallenge) S.advisory={id:S.onlyChallenge, starts:CHALLENGES[S.onlyChallenge].month};
    log(opts.mode==='challenge' ? `Timed challenge: ${CHALLENGES[opts.challenge].name}. Prepare now: support units can be pre-positioned before it starts.` : 'Mandate begins. Schedule work packages, assign shared crews and keep materials flowing.', 'start');
    emit('init'); return S;
  }
  function nearestGateway(p){ let best=GATEWAYS[0], bd=1e9; for (const g of GATEWAYS){ const d=km(g.lon,g.lat,p.lon,p.lat); if(d<bd){bd=d;best=g;} } return best; }

  /* ------------------------- package status ---------------------------- */
  const tpl = k => TEMPLATE.find(t => t.k === k);
  const scale = id => SCALE[id] || 1;
  function prereqs(pid, k){
    const t=tpl(k), list=t.after.map(a => ({pid, k:a}));
    for (const ref of CROSS[pid+':'+k] || []) { const [p2,k2]=ref.split(':'); list.push({pid:p2, k:k2}); }
    return list;
  }
  const pkg = (pid,k) => S.projects[pid].pk[k];
  function unmet(pid,k){ return prereqs(pid,k).filter(r => pkg(r.pid,r.k).status!=='done'); }
  function refreshStatuses(){
    for (const p of D.projects) for (const k of KEYS) {
      const q=pkg(p.id,k); if (q.status==='done'||q.status==='active'||q.status==='scheduled') continue;
      q.status = unmet(p.id,k).length ? 'locked' : 'ready';
    }
    for (const p of D.projects) { const pr=S.projects[p.id]; const op=KEYS.every(k=>pkg(p.id,k).status==='done'); if(op&&!pr.operational){ pr.operational=true; pr.condition=1; if(S.month>0) log(`${p.name} is now operating. Services, jobs and visitors follow.`, 'success', [`${p.name} commissioning complete`,'Service opens','Public Trust and Momentum rise']); } }
  }
  function used(pool){ let n=0; for (const p of D.projects) for (const k of KEYS){ const q=pkg(p.id,k); if(q.status==='active') n+=q.assigned[pool]||0; } return n; }
  function total(pool){ const P0=S.pools[pool]; return P0.total + P0.temp.reduce((a,t)=>a+t.n,0); }
  const free = pool => total(pool) - used(pool);

  /* ------------------------------ commands ----------------------------- */
  function setAssign(pid, k, pool, n){
    const q=pkg(pid,k), t=tpl(k); if (!t.crew[pool] || q.status==='done') return false;
    const cur=q.assigned[pool]||0; n=clamp(Math.round(n),0,t.crew[pool]*2);
    if (q.status==='active' && n>cur && n-cur>free(pool)) n=cur+free(pool);
    q.assigned[pool]=n; emit('change'); return true;
  }
  function defaultAssign(pid,k){ const t=tpl(k), q=pkg(pid,k); for (const [pool,need] of Object.entries(t.crew)) if (q.assigned[pool]==null) q.assigned[pool]=Math.min(need, Math.max(1,free(pool))); }
  function start(pid, k){
    const q=pkg(pid,k), t=tpl(k); if (q.status!=='ready' && q.status!=='scheduled') return {ok:false, why:'Not ready: prerequisites are still open.'};
    defaultAssign(pid,k);
    for (const [pool,need] of Object.entries(t.crew)) { if ((q.assigned[pool]||0)<1) return {ok:false, why:`Assign at least one ${POOLS[pool].toLowerCase().replace(/s$/,'')}.`}; if (q.assigned[pool]>free(pool)) return {ok:false, why:`Only ${free(pool)} ${POOLS[pool].toLowerCase()} free. Release another package or build capacity.`}; }
    q.status='active'; q.startAt=null; q.reason=null;
    log(`${P(pid).name}: ${t.name} started${t.materials?` — shipping via ${GW(q.gateway).name}`:''}.`, 'action');
    emit('change'); return {ok:true};
  }
  function schedule(pid, k, month){
    const q=pkg(pid,k); if (q.status==='done'||q.status==='active') return false;
    q.status='scheduled'; q.startAt=Math.max(S.month, Math.round(month)); defaultAssign(pid,k);
    log(`${P(pid).name}: ${tpl(k).name} scheduled for ${dateOf(q.startAt)}.`, 'action'); emit('change'); return true;
  }
  function unschedule(pid,k){ const q=pkg(pid,k); if(q.status==='scheduled'){ q.status='locked'; q.startAt=null; refreshStatuses(); emit('change'); } }
  function pause(pid, k){ const q=pkg(pid,k); if (q.status!=='active') return; q.status='ready'; q.reason=null; log(`${P(pid).name}: ${tpl(k).name} paused; crews released to the national pool.`, 'action'); refreshStatuses(); emit('change'); }
  function setGateway(pid, gid){ pkg(pid,'materials').gateway=gid; emit('change'); }
  function startProgram(id){
    const pr=PROGRAMS[id]; if (!pr) return {ok:false};
    if (S.budget < pr.cost) return {ok:false, why:`Needs ${pr.cost}B of investment capacity.`};
    S.budget-=pr.cost; S.spent+=pr.cost; S.programs.push({id, due:S.month+pr.months}); if (pr.localContent) S.localContent+=pr.localContent;
    log(`${pr.name}: ${pr.months?`capacity arrives in ${pr.months} months`:'capacity available now'}.`, 'action');
    if (!pr.months) matureProgram({id});
    emit('change'); return {ok:true};
  }
  function matureProgram(p){ const pr=PROGRAMS[p.id]; if (pr.expires) S.pools[pr.pool].temp.push({n:pr.add, until:S.month+pr.expires}); else S.pools[pr.pool].total+=pr.add; if (pr.months) log(`${pr.name} complete: +${pr.add} ${POOLS[pr.pool].toLowerCase()}.`, 'success'); }
  function setMaintenance(v){ S.maintenance=clamp(v,0,1); emit('change'); }

  /* ------------------------------ forecasts ---------------------------- */
  function rateOf(pid,k){
    const t=tpl(k), q=pkg(pid,k); let r=Infinity;
    for (const [pool,need] of Object.entries(t.crew)) { const a=q.assigned[pool]??need; const x=a/need; r=Math.min(r, x<=1?x:1+(x-1)*.5); }
    return r===Infinity?1:r;
  }
  function weather(pid,k,m=S.month){
    const t=tpl(k); if (!t.outdoor) return {f:1, why:null};
    const mo=((m%12)+12)%12, p=P(pid);
    if (mo>=5&&mo<=7) return {f:.8, why:'Summer heat limits outdoor shifts'};
    if (mo>=2&&mo<=4&&(p.region||'').includes('Riyadh')) return {f:.9, why:'Dust season'};
    return {f:1, why:null};
  }
  function forecast(pid,k){
    const t=tpl(k), q=pkg(pid,k), u=DIFFICULTY[S.difficulty].uncertainty;
    if (t.materials){ const g=GW(q.gateway), p=P(pid), share=Math.max(1, Math.min(4, g.cap)), rem=Math.max(0,t.materials-q.delivered), travel=travelMonths(g,p);
      const est=rem/share+travel; return {lo:est*.9, hi:est*(1.1+u), conf:Math.round(100-u*100-(S.gatewayLoad[g.id]>g.cap?15:0)), travel}; }
    const r=Math.max(.05,rateOf(pid,k)), w=weather(pid,k).f, est=(1-q.progress)*t.dur*scale(pid)/(r*w);
    return {lo:est*.85, hi:est*(1.15+u), conf:Math.round(100-u*100-(t.outdoor?8:0))};
  }
  function remainingMonths(pid){
    let m=0; for (const k of KEYS){ const q=pkg(pid,k), t=tpl(k); if(q.status==='done') continue;
      if (t.materials) { if (q.status!=='active') m+=0; continue; }   // materials overlap with site prep
      m+=(1-q.progress)*t.dur*scale(pid)/(q.status==='active'?Math.max(.3,rateOf(pid,k)):1); if(q.status!=='active'&&q.status!=='scheduled') m+=1; }
    return m;
  }
  function GW(id){ return GATEWAYS.find(g=>g.id===id)||GATEWAYS[0]; }
  function travelMonths(g,p){ return .25 + km(g.lon,g.lat,p.lon,p.lat)/1400; }

  /* ------------------------------ monthly tick ------------------------- */
  function tickMonth(){
    if (!S || S.ended) return;
    S.month++;
    const causes=[];
    // Capacity programmes mature / expire
    for (const pr of S.programs.filter(p=>p.due<=S.month&&!p.done)) { pr.done=true; if (PROGRAMS[pr.id].months) matureProgram(pr); }
    for (const pool of Object.values(S.pools)) { const before=pool.temp.length; pool.temp=pool.temp.filter(t=>t.until>S.month); if(pool.temp.length<before) log('A temporary crew/equipment contract has ended; capacity returned to baseline.','warn'); }
    // Scheduled packages begin when their month arrives
    for (const p of D.projects) for (const k of KEYS) { const q=pkg(p.id,k); if (q.status==='scheduled' && q.startAt<=S.month) { if (unmet(p.id,k).length) { q.reason='Waiting on prerequisites: '+unmet(p.id,k).map(r=>`${P(r.pid).name} · ${tpl(r.k).name}`).join(', '); continue; } const res=start(p.id,k); if(!res.ok){ q.status='scheduled'; q.reason=res.why; } } }
    // Grid headroom (connections need spare national capacity)
    const grid=gridHeadroom();
    // Work progresses
    const budgetFactor = S.budget < 0 ? .35 : 1;
    for (const p of D.projects) for (const k of KEYS) {
      const q=pkg(p.id,k), t=tpl(k); if (q.status!=='active' || t.materials) continue;
      q.reason=null;
      const missing=Object.entries(t.crew).filter(([pool])=>(q.assigned[pool]||0)<1);
      if (missing.length) { q.reason=`Needs ${POOLS[missing[0][0]].toLowerCase()}`; continue; }
      if (t.grid && grid.free < t.grid*scale(p.id) && q.progress<.05) { q.reason=`Grid headroom: needs ${(t.grid*scale(p.id)).toFixed(1)}, ${Math.max(0,grid.free).toFixed(1)} free`; causes.push(['Grid headroom low', `${p.name} connection waiting`, 'Momentum forecast falls']); continue; }
      const w=weather(p.id,k), rate=rateOf(p.id,k)*w.f*budgetFactor, dp=rate/(t.dur*scale(p.id));
      if (w.why) q.reason=w.why+' (−'+Math.round((1-w.f)*100)+'% pace)';
      if (budgetFactor<1) q.reason='Investment capacity below floor (−65% pace)';
      const spend=t.cost*scale(p.id)*Math.min(dp,1-q.progress); S.budget-=spend; S.spent+=spend;
      q.progress=Math.min(1,q.progress+dp);
      if (q.progress>=1) { q.status='done'; q.assigned={}; q.reason=null; S.completedSinceStart++; log(`${p.name}: ${t.name} complete.`, 'success'); }
    }
    // Physical logistics: gateway slots → convoys → site
    runLogistics();
    refreshStatuses();
    // Budget: revenue grows with operating assets and confidence; operations & maintenance cost money
    const ops=D.projects.filter(p=>S.projects[p.id].operational);
    const revenue=1.1 + .11*ops.length + (S.kpi.trust?(S.kpi.trust.value-60)*.012:0);
    const opCost=.02*ops.length, maintCost=(.25+.35*S.maintenance)*.06*Math.max(3,ops.length);
    S.budget+=revenue-opCost-maintCost; S.lastBudget={revenue,opCost,maintCost};
    // Asset condition follows maintenance
    for (const p of ops) { const pr=S.projects[p.id]; pr.condition=clamp(pr.condition + (S.maintenance-.62)*.03, .3, 1); }
    // Effects decay
    S.effects=S.effects.filter(e=>e.until>S.month);
    // Challenge Director: early signals
    directorMonthly();
    computeKPIs();
    thresholds();
    if (S.mode==='campaign' && S.month>=CAMPAIGN_MONTHS && !S.ended) conclude('term');
    for (const c of causes.slice(0,1)) log(c.join(' → '), 'cause', c);
    emit('month', S.month);
  }
  function gridHeadroom(){
    let cap=14; const op=id=>S.projects[id].operational;
    if (op('renewables')) cap+=12; if (op('eastern')) cap+=8; if (op('hydrogen')) cap+=6; if (op('green')) cap+=2;
    let use=0; for (const p of D.projects){ if(S.projects[p.id].operational) use+=1.2*scale(p.id); const q=pkg(p.id,'utility'); if(q.status==='active'&&q.progress>=.05) use+=3*scale(p.id); }
    return {cap, use, free:cap-use};
  }
  function runLogistics(){
    S.gatewayLoad={};
    // Arrivals
    for (const c of S.convoys) if (!c.arrived && c.t1<=S.month) { c.arrived=true; const q=pkg(c.pid,'materials'); q.inTransit-=c.units; q.delivered+=c.units; }
    S.convoys=S.convoys.filter(c=>!c.arrived || c.t1>S.month-1);
    // Departures, limited by gateway slots (Expo-critical projects first)
    const active=D.projects.filter(p=>pkg(p.id,'materials').status==='active').sort((a,b)=>(EXPO_CRITICAL.includes(b.id)?1:0)-(EXPO_CRITICAL.includes(a.id)?1:0));
    const slots=Object.fromEntries(GATEWAYS.map(g=>[g.id, Math.max(0,g.cap-(S.gatewayPenalty[g.id]||0))]));
    S.gatewayPenalty={};
    for (const p of active) {
      const q=pkg(p.id,'materials'), t=tpl('materials'), g=GW(q.gateway), need=t.materials-q.delivered-q.inTransit;
      S.gatewayLoad[g.id]=(S.gatewayLoad[g.id]||0)+Math.min(4,Math.max(0,need));
      if (need<=0) { if (q.delivered>=t.materials){ q.status='done'; q.progress=1; q.reason=null; S.completedSinceStart++; log(`${p.name}: all materials on site.`,'success'); } continue; }
      const send=Math.min(4, need, slots[g.id]);
      if (send<=0) { q.reason=`${g.name} is at capacity — queued`; continue; }
      slots[g.id]-=send; q.inTransit+=send; q.reason=null;
      const cost=t.cost*scale(p.id)*send/t.materials; S.budget-=cost; S.spent+=cost;
      S.convoys.push({pid:p.id, gw:g.id, units:send, t0:S.month, t1:S.month+travelMonths(g,p)});
      q.progress=(q.delivered+q.inTransit*.5)/t.materials;
    }
  }

  /* ------------------------------ KPIs --------------------------------- */
  function computeKPIs(first){
    const ops=D.projects.filter(p=>S.projects[p.id].operational);
    const active=[], waiting=[];
    for (const p of D.projects) for (const k of KEYS){ const q=pkg(p.id,k); if(q.status==='active'){ active.push([p,k]); if(q.reason&&!q.reason.startsWith('Summer')&&!q.reason.startsWith('Dust')) waiting.push([p,k,q.reason]); } }
    const eff = key => S.effects.filter(e=>e.kpi===key).map(e=>({label:e.label, v:e.v}));
    const avgCond = ops.length ? ops.reduce((a,p)=>a+S.projects[p.id].condition,0)/ops.length : 1;
    const K = {};
    K.momentum = [
      {label:'Starting national portfolio', v:14},
      {label:`${S.completedSinceStart} work packages completed`, v:Math.min(38, S.completedSinceStart*.55)},
      {label:`${ops.length} projects operating`, v:ops.length*2.4},
      {label:`${active.length} packages in active delivery`, v:Math.min(8, active.length*.35)},
      {label:`${waiting.length} packages waiting (crews, materials, grid or funding)`, v:-Math.min(10, waiting.length*.6)}
    ];
    const cityBuilds=active.filter(([p,k])=>k==='build'&&(p.anchor||['jeddahcentral','madinah','roshn'].includes(p.id)));
    K.trust = [
      {label:'Baseline public confidence', v:62},
      {label:`${ops.length} new services opened`, v:Math.min(22, ops.length*1.3)},
      {label:`Construction disruption in cities (${cityBuilds.length} sites)`, v:-cityBuilds.length*.45},
      {label:'Visible delays', v:-Math.min(6, waiting.length*.4)},
      {label:`Service reliability (maintenance ${Math.round(S.maintenance*100)}%)`, v:(S.maintenance-.6)*10},
      {label:'Asset condition', v:-(1-avgCond)*15},
      ...eff('trust'),
      ...(S.budget<5?[{label:'Investment capacity under pressure', v:-(5-S.budget)*.6}]:[])
    ];
    const resOps=RESILIENCE_ASSETS.filter(id=>S.projects[id].operational);
    K.resilience = [
      {label:'Existing national infrastructure', v:44},
      {label:`${resOps.length} resilience assets operating (energy, transit, logistics)`, v:resOps.length*3.2},
      {label:`Preventive maintenance ${Math.round(S.maintenance*100)}%`, v:(S.maintenance-.5)*22},
      {label:`${total('support')} support units available`, v:(total('support')-3)*1.8},
      {label:'Asset condition', v:-(1-avgCond)*20},
      ...S.lessons.map(l=>({label:'Learning: '+l, v:3})),
      ...eff('resilience')
    ];
    const expo=[], slackList=[];
    for (const id of EXPO_CRITICAL){ const rem=remainingMonths(id), slack=EXPO_MONTH-S.month-rem; slackList.push(slack); const doneShare=KEYS.filter(k=>pkg(id,k).status==='done').length/KEYS.length; expo.push({label:`${P(id).name}: ${Math.round(doneShare*6)}/6 packages · ${S.projects[id].operational?'operating':slack>=0?`${Math.round(slack)} months float`:`${Math.round(-slack)} months behind`}`, v:(doneShare*.6+clamp(.5+slack/14,0,1)*.4)*100/EXPO_CRITICAL.length}); }
    K.expo=expo;
    K.budget=[{label:'Monthly revenue', v:+(S.lastBudget?.revenue||0).toFixed(2)},{label:'Operations', v:-(S.lastBudget?.opCost||0)},{label:'Maintenance', v:-(S.lastBudget?.maintCost||0)},{label:'Invested so far', v:-S.spent}];
    for (const [k,list] of Object.entries(K)){
      const target = k==='budget' ? S.budget : clamp(list.reduce((a,c)=>a+c.v,0),0,100);
      const prev = S.kpi[k]?.value ?? target;
      const value = first || k==='budget' ? target : prev+(target-prev)*.45;
      S.kpi[k]={value, target, contrib:list.filter(c=>Math.abs(c.v)>.01).sort((a,b)=>Math.abs(b.v)-Math.abs(a.v))};
      S.hist[k].push(value); if (S.hist[k].length>36) S.hist[k].shift();
    }
  }

  /* ---------------------------- thresholds ----------------------------- */
  // Escalation: early signal → advisory → diagnosis → corrective mission → recovery window → review → transition
  function thresholds(){
    if (S.mode!=='campaign' || S.ended) return;
    const checks = [
      {id:'budget', ok:S.budget>=0, name:'Investment capacity below the protected operating floor', fix:'Pause lower-priority packages, reduce contracts, or let operating assets rebuild revenue.'},
      {id:'trust', ok:S.kpi.trust.value>=35, name:'Public trust and quality of life below the protected floor', fix:'Open services, reduce city disruption and restore maintenance.'},
      {id:'resilience', ok:S.kpi.resilience.value>=30, name:'Service continuity below the protected floor', fix:'Raise maintenance, complete energy/transit assets and equip support units.'},
      {id:'hajj', ok:!S.hajjBreach || S.hajjRecovered, name:'Hajj safety readiness below the protected threshold', fix:'Complete the next Hajj & Pilgrim Experience or Masar Makkah package.'}
    ];
    const bad=checks.find(c=>!c.ok);
    if (bad && !S.recovery) { S.recovery={id:bad.id, name:bad.name, fix:bad.fix, until:S.month+DIFFICULTY[S.difficulty].recovery, baseline:S.completedSinceStart}; log(`Advisory: ${bad.name}. Recovery window open until ${dateOf(S.recovery.until)}. ${bad.fix}`, 'advisory'); emit('recovery', S.recovery); }
    else if (S.recovery) {
      const still=checks.find(c=>c.id===S.recovery.id && !c.ok);
      if (!still) { log(`Recovered: ${S.recovery.name.replace(' below the protected',' back within the protected').replace('floor','range')}.`, 'success'); S.recovery=null; emit('recovery', null); }
      else if (S.month>=S.recovery.until) conclude('threshold', S.recovery.name);
    }
    if (S.hajjBreach && !S.hajjRecovered && hajjDoneCount()>S.hajjBaseline) { S.hajjRecovered=true; log('Hajj readiness restored: new pilgrim-service capacity is in place.','success'); }
  }

  /* ------------------------- Challenge Director ------------------------ */
  function directorMonthly(){
    const lead=DIFFICULTY[S.difficulty].lead;
    for (const [id,c] of Object.entries(CHALLENGES)) {
      if (S.challengesDone[id] || S.challenge) continue;
      if (S.onlyChallenge && S.onlyChallenge!==id) continue;
      if (S.month===c.month-lead || (S.onlyChallenge===id && !S.advisory)) { if(!S.advisory){ S.advisory={id, starts:c.month}; log(`Early signal: ${c.name} expected around ${dateOf(c.month)}. Pre-position support units now to raise readiness.`, 'signal'); emit('advisory', S.advisory); } }
      if (S.month>=c.month && S.advisory?.id===id) { beginChallenge(id); break; }
    }
  }
  function beginChallenge(id){
    const c=CHALLENGES[id];
    const prepared=(S.advisory&&S.advisory.prepared)||[];
    const learned=S.lessons.length*.04;
    S.challenge={id, t:0, duration:c.duration, toggles:{}, stabilizedAt:null, supported:0, prepared:prepared.length,
      assets:c.assets.map(a=>({...a, continuity:100, exposure:0, peak:0, minC:100})),
      units:[]};
    let n=0;
    for (const a of S.challenge.assets) a.pos=W.place(a.lon,a.lat,c.anchor);
    c.units.forEach((u,idx) => { const count=u.n+(idx===0?Math.max(0,total('support')-4):0); for (let i=0;i<count;i++) {
      const pre=prepared.find(p=>p.type===u.type && !p.used); if (pre) pre.used=true;
      S.challenge.units.push({uid:`${u.type}-${i}`, type:u.type, name:u.name, supports:u.supports, color:u.color, drone:!!u.drone,
        pos:pre?[...pre.pos]:null, target:pre?[...pre.pos]:null, assetId:pre?pre.assetId:null, prepared:!!pre, onsite:!!pre, speed:.11*(1+learned)});
      n++; } });
    S.advisory=null;
    log(`${c.name} is live. The world keeps moving: dispatch units on the map, adjust operations and protect people and services.`, 'challenge');
    emit('challengeStart', S.challenge);
  }
  function prepareUnit(type, pos, assetId){
    if (!S.advisory) return false;
    const c=CHALLENGES[S.advisory.id], u=c.units.find(x=>x.type===type); if (!u) return false;
    S.advisory.prepared=S.advisory.prepared||[];
    const mine=S.advisory.prepared.filter(p=>p.type===type);
    if (mine.length>=u.n) S.advisory.prepared.splice(S.advisory.prepared.indexOf(mine[0]),1);   // move the longest-placed unit
    S.advisory.prepared.push({type, pos, assetId});
    emit('change'); return true;
  }
  // Real-time challenge simulation (seconds). Units move physically; assets respond to exposure and support.
  function challengeTick(dt){
    const world=W;
    const ch=S.challenge; if (!ch) return;
    const c=CHALLENGES[ch.id], drain=DIFFICULTY[S.difficulty].drain;
    ch.t+=dt; const f=clamp(ch.t/ch.duration,0,1);
    const from=world.place(c.hazard.from[0],c.hazard.from[1],null), to=world.place(c.hazard.to[0],c.hazard.to[1],null);
    const hz={x:from[0]+(to[0]-from[0])*f, z:from[1]+(to[1]-from[1])*f, r:c.hazard.radius*(c.hazard.type==='heat'?(.7+.5*Math.sin(Math.PI*f)):1), type:c.hazard.type, intensity:Math.pow(Math.sin(Math.PI*clamp(f*1.08,0,1)),.55)};
    ch.hazard=hz;
    // Units travel
    for (const u of ch.units) { if (!u.pos || !u.target) continue; const dx=u.target[0]-u.pos[0], dz=u.target[1]-u.pos[1], d=Math.hypot(dx,dz), step=u.speed*(u.drone?2.2:1)*dt;
      if (d<=step) { u.pos=[...u.target]; u.onsite=true; } else { u.pos=[u.pos[0]+dx/d*step, u.pos[1]+dz/d*step]; u.onsite=false; } }
    let allClear=true;
    for (const a of ch.assets) {
      if (!a.pos) a.pos=world.place(a.lon,a.lat,c.anchor);
      const dist=Math.hypot(a.pos[0]-hz.x,a.pos[1]-hz.z);
      a.exposure=clamp((1-dist/hz.r)*1.5,0,1)*hz.intensity; a.peak=Math.max(a.peak,a.exposure);
      let prot=0; const helpers=[];
      for (const u of ch.units) if (u.onsite && u.pos && u.supports.includes(a.kind) && Math.hypot(u.pos[0]-a.pos[0],u.pos[1]-a.pos[1])<(u.drone?.34:.16)) { prot+=u.drone?.22:(helpers.some(h=>!h.drone)?.18:.72); helpers.push(u); }
      for (const tg of c.toggles) if (ch.toggles[tg.id] && tg.protects===a.kind) prot+=.5;
      prot=Math.min(.92,prot); a.protection=prot;
      if (a.exposure>.08) { a.continuity-=a.exposure*(1-prot)*2.3*drain*dt; if (prot>.3) ch.supported+=a.people*a.exposure*dt/ch.duration; allClear=false; }
      else a.continuity+=(prot>.3?4:2)*dt;
      a.continuity=clamp(a.continuity,0,100); a.minC=Math.min(a.minC,a.continuity);
      if (a.continuity<85) allClear=false;
    }
    if (allClear && f>.35 && ch.stabilizedAt==null) ch.stabilizedAt=ch.t;
    if (ch.t>=ch.duration) endChallenge();
  }
  function dispatch(type, pos, assetId){
    const ch=S.challenge; if (!ch) return prepareUnit(type,pos,assetId);
    const c=CHALLENGES[ch.id];
    const cand=ch.units.filter(u=>u.type===type).sort((a,b)=>(a.assetId?1:0)-(b.assetId?1:0) || (a.pos&&b.pos?Math.hypot(a.pos[0]-pos[0],a.pos[1]-pos[1])-Math.hypot(b.pos[0]-pos[0],b.pos[1]-pos[1]):0));
    const u=cand[0]; if (!u) return false;
    if (!u.pos) { const home=ch.base||(ch.base=baseFor(ch)); u.pos=[...home]; }
    u.target=[...pos]; u.assetId=assetId; u.onsite=false; emit('change'); return u;
  }
  function baseFor(ch){ const a=ch.assets; return [a.reduce((s,x)=>s+x.pos[0],0)/a.length+.35, a.reduce((s,x)=>s+x.pos[1],0)/a.length+.3]; }
  function setToggle(id, on){ if (!S.challenge) return; S.challenge.toggles[id]=!!on; emit('change'); }
  function endChallenge(){
    const ch=S.challenge, c=CHALLENGES[ch.id];
    const weight=a=>1+Math.log10(1+a.people);
    const wsum=ch.assets.reduce((s,a)=>s+weight(a),0);
    const continuity=ch.assets.reduce((s,a)=>s+a.minC*weight(a),0)/wsum;
    const exposedPeople=ch.assets.reduce((s,a)=>s+(a.peak>.1?a.people:0),0)||1;
    const supportedShare=clamp(ch.supported/exposedPeople*1.6,0,1);
    const stab=ch.stabilizedAt==null?0:clamp(1-(ch.stabilizedAt/ch.duration-.35)/.65,0,1);
    const readiness=clamp(ch.prepared/Math.max(1,c.units.reduce((s,u)=>s+u.n,0)),0,1);
    const score=Math.round(continuity*.55 + readiness*15 + stab*15 + supportedShare*15);
    const side=[];
    if (ch.toggles.pauseOutdoor){ for (const p of D.projects.filter(p=>p.anchor==='Riyadh')){ const q=pkg(p.id,'build'); if(q.status==='active') q.progress=Math.max(0,q.progress-.5/(7*scale(p.id))); } side.push('Riyadh construction lost about two weeks while outdoor work paused.'); }
    if (ch.toggles.railFreight){ S.gatewayPenalty.riyadh=3; side.push('Riyadh Dry Port runs 3 slots short next month.'); }
    if (ch.toggles.storeWater){ S.budget-=.5; side.push('0.5B spent on early reservoir pumping.'); }
    if (ch.toggles.extraTrains){ S.budget-=.4; side.push('0.4B spent on extra metro operations.'); }
    if (ch.toggles.closeUnderpass) side.push('Surface roads carried extra traffic during the closure.');
    if (ch.toggles.stagger) side.push('Pilgrim movement windows were longer but calmer.');
    const lesson={sandstorm:'Dust-season operations playbook', rainfall:'Urban drainage coordination', hajj:'Heat & crowd-flow readiness'}[ch.id];
    if (!S.lessons.includes(lesson)) S.lessons.push(lesson);
    S.effects.push({kpi:'trust', v:+((score-60)*.14).toFixed(1), until:S.month+12, label:`${c.short}: ${Math.round(continuity)}% continuity`});
    S.effects.push({kpi:'resilience', v:+((score-50)*.08).toFixed(1), until:S.month+18, label:`${c.short}: readiness ${Math.round(readiness*100)}%`});
    S.challengeScores[ch.id]=score; S.challengesDone[ch.id]=true;
    if (c.protected) { const crowdMin=Math.min(...ch.assets.filter(a=>a.kind==='crowd').map(a=>a.minC)); if (crowdMin<60) { S.hajjBreach=true; S.hajjBaseline=hajjDoneCount(); } }
    const review={id:ch.id, name:c.name, score, continuity:Math.round(continuity), readiness:Math.round(readiness*100), stabilization:ch.stabilizedAt==null?null:Math.round(ch.stabilizedAt), supported:Math.round(ch.supported), supportedShare:Math.round(supportedShare*100),
      assets:ch.assets.map(a=>({name:a.name, minC:Math.round(a.minC)})), side, lesson,
      learning: learningNotes(ch)};
    S.lastReview=review; S.challenge=null;
    log(`${c.name} complete: score ${score}. ${review.learning[0]||''}`, 'challenge');
    emit('challengeEnd', review);
    if (S.onlyChallenge) S.ended={type:'challenge', review};
  }
  function learningNotes(ch){
    const out=[], weakest=[...ch.assets].sort((a,b)=>a.minC-b.minC)[0];
    if (weakest.minC<70) out.push(`${weakest.name} dipped to ${Math.round(weakest.minC)}% — station a matching unit there before the peak next time.`);
    if (!ch.prepared) out.push('No units were pre-positioned. Acting on the early signal raises readiness and saves travel time.');
    const idle=ch.units.filter(u=>!u.pos).length; if (idle) out.push(`${idle} unit(s) were never dispatched.`);
    if (!out.length) out.push('Strong coordination: every exposed service kept a support unit through the peak.');
    return out;
  }
  function hajjDoneCount(){ return ['hajj','masar'].reduce((a,id)=>a+KEYS.filter(k=>pkg(id,k).status==='done').length,0); }

  /* ------------------------- outcome (gated) --------------------------- */
  function outcome(){
    const ops=id=>S.projects[id].operational?1:0;
    const doneShare=S.completedSinceStart/Math.max(1, D.projects.reduce((n,p)=>n+KEYS.filter(k=>pkg(p.id,k).status!=='done').length,0)+S.completedSinceStart);
    const comp = {
      'Delivery':            clamp(S.kpi.momentum.value,0,100),
      'Trust & quality of life': clamp(S.kpi.trust.value,0,100),
      'Diversification':     clamp(30+['qiddiya','redsea','amaala','alula','ceer','lucid','oxagon','jazan','expo','trojena'].reduce((a,id)=>a+ops(id)*7,0),0,100),
      'Infrastructure':      clamp(25+['metro','ksip','haramain','masar','newmurabba','roshn'].reduce((a,id)=>a+ops(id)*12,0)+doneShare*20,0,100),
      'Skills & local content': clamp(50+S.localContent*4,0,100),
      'Sustainability':      clamp(35+['renewables','hydrogen','green','greenriyadh','park','sindalah'].reduce((a,id)=>a+ops(id)*11,0),0,100),
      'Resilience':          clamp(S.kpi.resilience.value,0,100)
    };
    const vals=Object.values(comp), balanced=vals.reduce((a,b)=>a+b,0)/vals.length;
    const spread=Math.max(...vals)-Math.min(...vals), balanceAdj=spread>45?-(spread-45)*.3:0;
    const cs=Object.values(S.challengeScores), readiness=cs.length?cs.reduce((a,b)=>a+b,0)/cs.length:40;
    const efficiency=clamp(100 - Math.max(0,(S.spent/Math.max(1,S.completedSinceStart))-3)*12 + (S.budget>=0?5:-15),0,100);
    const total=balanced*.7 + readiness*.2 + efficiency*.1 + balanceAdj;
    const protectedOk = S.budget>=0 && S.kpi.trust.value>=35 && S.kpi.resilience.value>=30 && (!S.hajjBreach||S.hajjRecovered);
    const tier = !protectedOk ? 'Next chapter' : total>=72?'Transformational':total>=58?'Strong foundation':total>=45?'Foundation laid':'Next chapter';
    return {comp, balanced, balanceAdj, readiness, efficiency, total:Math.round(total), protectedOk, tier};
  }
  function conclude(kind, reason){ S.ended={type:kind, reason, outcome:outcome()}; log(kind==='term'?'The 2030 mandate term is complete.':`Executive review: ${reason}. The mandate transitions to the next leadership chapter.`, 'end'); emit('end', S.ended); }
  function continueSandbox(){ S.mode='sandbox'; S.ended=null; S.recovery=null; S.budget=Math.max(S.budget,40); log('Future chapter — Beyond 2030: the Kingdom continues with no mandate limits.','start'); emit('change'); }

  /* ------------------------- saves & queries --------------------------- */
  function serialize(){ return JSON.stringify(S); }
  function load(json){ const d=JSON.parse(json); if (!d||d.version!==3) throw new Error('Incompatible save'); S=d; emit('init'); return S; }
  function projectSummary(pid){
    const pr=S.projects[pid], list=KEYS.map(k=>({k, ...pkg(pid,k), name:tpl(k).name}));
    const done=list.filter(x=>x.status==='done').length, act=list.find(x=>x.status==='active');
    const next=list.find(x=>x.status==='ready'||x.status==='scheduled'), locked=list.find(x=>x.status==='locked');
    let health='idle', status='';
    if (pr.operational) { health='operating'; status=`Operating · condition ${Math.round(pr.condition*100)}%`; }
    else if (act && act.reason && !/Summer|Dust/.test(act.reason)) { health='waiting'; status=`${act.name}: ${act.reason}`; }
    else if (act) { health='active'; status=`${act.name} ${Math.round(act.progress*100)}%`; }
    else if (next) { health=next.status==='scheduled'?'active':'ready'; status=next.status==='scheduled'?`${next.name} scheduled ${dateOf(next.startAt)}`:`Ready: ${next.name}`; }
    else if (locked) { const u=unmet(pid,locked.k); health=u.some(r=>r.pid!==pid)?'blocked':'idle'; status=`Blocked: ${u.map(r=>`${P(r.pid).name} · ${tpl(r.k).name}`)[0]||''}`; }
    const deps=new Set(); for (const [key,refs] of Object.entries(CROSS)) { if (key.startsWith(pid+':')) refs.forEach(r=>deps.add(r.split(':')[0])); if (refs.some(r=>r.startsWith(pid+':'))) deps.add(key.split(':')[0]); }
    for (const [a,b] of D.links) { if(a===pid) deps.add(b); if(b===pid) deps.add(a); }
    return {done, active:act?act.k:null, progress:act?act.progress:0, health, status, deps:[...deps], expoCritical:EXPO_CRITICAL.includes(pid), doneKeys:list.filter(x=>x.status==='done').map(x=>x.k)};
  }
  function packageView(pid,k){
    const t=tpl(k), q=pkg(pid,k), fc=forecast(pid,k);
    const crew=Object.entries(t.crew).map(([pool,need])=>({pool, label:POOLS[pool], need, assigned:q.assigned[pool]??need, free:free(pool), total:total(pool)}));
    const side=[];
    for (const c of crew) { const after=c.free-(q.status==='active'?0:c.assigned); if (after<0) side.push(`Needs ${-after} more ${c.label.toLowerCase()} than are free.`); else if (after===0 && q.status!=='active') side.push(`Uses the last free ${c.label.toLowerCase().replace(/s$/,'')} — other packages needing it will wait.`); }
    if (t.outdoor) { const w=weather(pid,k); if (w.why) side.push(w.why+'.'); }
    if (t.grid) { const g=gridHeadroom(); side.push(`Needs ${(t.grid*scale(pid)).toFixed(1)} grid headroom (${g.free.toFixed(1)} free nationally).`); }
    if (t.k==='build' && P(pid).anchor) side.push('Adds city construction disruption while active (−Public Trust).');
    const downstream=[]; for (const [key,refs] of Object.entries(CROSS)) if (refs.includes(pid+':'+k)) downstream.push({pid:key.split(':')[0], k:key.split(':')[1]});
    return {k, name:t.name, status:q.status, progress:q.progress, reason:q.reason, startAt:q.startAt, cost:+(t.cost*scale(pid)).toFixed(1), crew, forecast:fc,
      prereqs:prereqs(pid,k).map(r=>({...r, name:`${P(r.pid).name} · ${tpl(r.k).name}`, done:pkg(r.pid,r.k).status==='done', external:r.pid!==pid})),
      downstream:downstream.map(r=>({...r, name:`${P(r.pid).name} · ${tpl(r.k).name}`})),
      materials:t.materials?{need:t.materials, delivered:q.delivered, inTransit:q.inTransit, gateway:q.gateway}:null, side, suggested:false};
  }
  function suggestion(){
    // Strategic difficulty: highlight the ready package with the most downstream value.
    let best=null, bs=-1;
    for (const p of D.projects) for (const k of KEYS){ const q=pkg(p.id,k); if(q.status!=='ready') continue; let s=(EXPO_CRITICAL.includes(p.id)?3:1)+(k==='test'?2:0)+(RESILIENCE_ASSETS.includes(p.id)?1:0); for(const refs of Object.values(CROSS)) if(refs.includes(p.id+':'+k)) s+=2; if(s>bs){bs=s;best={pid:p.id,k};} }
    return best;
  }

  window.VisionSim = {
    init, tickMonth, challengeTick, setWorld:w=>{W=w}, challengeAssets:id=>CHALLENGES[id].assets.map(a=>({...a,pos:W.place(a.lon,a.lat,CHALLENGES[id].anchor)})), serialize, load, on:f=>listeners.push(f),
    start, schedule, unschedule, pause, setAssign, setGateway, startProgram, setMaintenance, dispatch, setToggle, continueSandbox,
    get state(){ return S; }, projectSummary, packageView, gridHeadroom, free, total, forecast, outcome, suggestion, dateOf,
    KEYS, TEMPLATE, POOLS, PROGRAMS, GATEWAYS, CHALLENGES, DIFFICULTY, CAMPAIGN_MONTHS, EXPO_MONTH, EXPO_CRITICAL, HAJJ_MONTHS
  };
})();
