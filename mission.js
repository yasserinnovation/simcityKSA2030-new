// Vision Nexus 2030 — Mission simulation (Riyadh: The Connected City).
// Deterministic and turn-based: time only advances when the player ends a turn.
// No DOM and no rendering here, so missions can be tested headlessly and moved to a worker.
(() => {
  'use strict';
  const D = window.VISION_DATA;
  const L = (en, ar) => ({en, ar});
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const P = id => D.projects.find(p => p.id === id);
  const km = (a, b) => { const dx = (b.lon - a.lon) * 101 * Math.cos((a.lat + b.lat) / 2 * Math.PI / 180), dy = (b.lat - a.lat) * 111; return Math.hypot(dx, dy); };
  const clone = o => JSON.parse(JSON.stringify(o));

  /* ============================ THE BOARD ============================ */
  const NODE_R = {
    core:    {name:L('City Centre','وسط المدينة'), lon:46.68, lat:24.71, anchor:'Riyadh', pop:0, jobs:0, core:true},
    expo:    {name:L('Expo 2030 site','موقع إكسبو 2030'), project:'expo', pop:0, jobs:20, attract:1.0},
    ksip:    {name:L('King Salman Airport','مطار الملك سلمان'), project:'ksip', pop:0, jobs:30, gateway:true},
    murabba: {name:L('New Murabba','المربع الجديد'), project:'newmurabba', pop:60, jobs:80, attract:.4},
    park:    {name:L('King Salman Park','حديقة الملك سلمان'), project:'park', pop:50, jobs:10, attract:.6},
    sports:  {name:L('Sports Boulevard','المسار الرياضي'), project:'sports', pop:120, jobs:20, attract:.4},
    qiddiya: {name:L('Qiddiya','القدية'), project:'qiddiya', pop:10, jobs:15, attract:.9},
    diriyah: {name:L('Diriyah','الدرعية'), project:'diriyah', pop:90, jobs:25, attract:.8},
    east:    {name:L('East Riyadh','شرق الرياض'), project:'greenriyadh', pop:380, jobs:60},
    roshn:   {name:L('North Riyadh','شمال الرياض'), project:'roshn', pop:330, jobs:40},
    sudair:  {name:L('Sudair Solar Park','مجمع سدير للطاقة الشمسية'), project:'renewables', pop:0, jobs:2, energySite:true},
    dryport: {name:L('Riyadh Dry Port','ميناء الرياض الجاف'), lon:46.80, lat:24.62, anchor:'Riyadh', pop:0, jobs:12, freightHub:true},
    eastgate:{name:L('East rail gateway (Gulf ports · Asia)','بوابة القطار الشرقية (موانئ الخليج · آسيا)'), lon:47.10, lat:24.78, anchor:'Riyadh', pop:0, jobs:0, freightOnly:true},
    westgate:{name:L('West gateway (Red Sea ports · Africa & Europe)','البوابة الغربية (موانئ البحر الأحمر · أفريقيا وأوروبا)'), lon:46.36, lat:24.66, anchor:'Riyadh', pop:0, jobs:0, freightOnly:true}
  };
  const ROADS_R = [['expo','core',2.6],['ksip','core',4],['murabba','core',4],['park','core',3],['sports','core',3],['qiddiya','diriyah',2.2],['diriyah','core',3.2],
    ['east','core',6],['roshn','core',5],['expo','ksip',3],['roshn','ksip',3.5],['diriyah','sports',2.5],['park','east',3],['sudair','roshn',3.2],['dryport','core',3.2],['eastgate','dryport',2.6],['westgate','core',2.6]];
  const CORR_R = [['core','expo'],['core','ksip'],['ksip','expo'],['core','murabba'],['core','diriyah'],['diriyah','qiddiya'],['core','east'],['core','roshn'],['core','park'],['park','sports'],['sports','diriyah'],['murabba','roshn'],['core','sports']];
  // ---- Chapter 2 board: Makkah & the West. 'core' is Makkah Central, where every trip is heading.
  const NODE_W = {
    core:    {name:L('Makkah Central','وسط مكة'), lon:39.826, lat:21.4225, anchor:'Makkah', pop:0, jobs:0, core:true},
    mashaer: {name:L('Holy Sites (Mina · Arafat)','المشاعر (منى · عرفات)'), project:'hajj', pop:0, jobs:5, attract:1},
    masar:   {name:L('Masar Makkah','مسار مكة'), project:'masar', pop:40, jobs:30, attract:.4},
    jeddah:  {name:L('Jeddah Central','وسط جدة'), project:'jeddahcentral', pop:260, jobs:90},
    kaia:    {name:L('King Abdulaziz Airport','مطار الملك عبدالعزيز'), lon:39.16, lat:21.68, pop:0, jobs:25, gateway:true},
    jport:   {name:L('Jeddah Islamic Port','ميناء جدة الإسلامي'), lon:39.15, lat:21.46, pop:0, jobs:20},
    north:   {name:L('North Jeddah','شمال جدة'), lon:39.13, lat:21.75, pop:170, jobs:30, local:.25},
    south:   {name:L('South Jeddah','جنوب جدة'), lon:39.23, lat:21.40, pop:210, jobs:30, local:.25},
    balad:   {name:L('Al-Balad (historic Jeddah)','البلد (جدة التاريخية)'), lon:39.186, lat:21.487, pop:45, jobs:15, local:.3},
    taif:    {name:L('Taif','الطائف'), lon:40.42, lat:21.27, pop:70, jobs:20, far:true},
    kaec:    {name:L('KAEC','مدينة الملك عبدالله الاقتصادية'), project:'ceer', pop:20, jobs:30, far:true}
  };
  const ROADS_W = [['jeddah','core',6.5],['kaia','jeddah',4],['jport','jeddah',3],['masar','core',3],['mashaer','core',2.4],['taif','core',2.5],['kaec','jeddah',2.5],
    ['north','jeddah',4],['south','jeddah',4],['balad','jeddah',2.5],['north','kaia',3]];
  const CORR_W = [['kaia','core'],['jeddah','core'],['core','mashaer'],['kaia','jeddah'],['masar','core'],['kaec','jeddah'],['taif','core'],['north','jeddah'],['south','jeddah']];
  // ---- NEOM & Northwest: 'core' is Oxagon Port, where materials and supplies land.
  const NODE_N = {
    core:     {name:L('Oxagon Port','ميناء أوكساجون'), project:'oxagon', pop:0, jobs:0, core:true},
    line:     {name:L('THE LINE — first module','ذا لاين — الوحدة الأولى'), project:'neom', pop:40, jobs:45},
    hydrogen: {name:L('NEOM Green Hydrogen','نيوم للهيدروجين الأخضر'), project:'hydrogen', pop:5, jobs:25},
    trojena:  {name:L('Trojena','تروجينا'), project:'trojena', pop:5, jobs:12, attract:.8},
    sindalah: {name:L('Sindalah','سندالة'), project:'sindalah', pop:2, jobs:6, attract:.7},
    tabuk:    {name:L('Tabuk','تبوك'), lon:36.57, lat:28.38, pop:160, jobs:50, local:.3},
    amaala:   {name:L('AMAALA','أمالا'), project:'amaala', pop:3, jobs:10, attract:.7},
    redsea:   {name:L('The Red Sea destination','وجهة البحر الأحمر'), project:'redsea', pop:5, jobs:14, attract:1, far:true},
    alula:    {name:L('AlUla','العلا'), project:'alula', pop:30, jobs:10, attract:.9, far:true},
    nsolar:   {name:L('NEOM renewables site','موقع نيوم للطاقة المتجددة'), lon:35.95, lat:28.12, pop:0, jobs:2, energySite:true}
  };
  const ROADS_N = [['line','core',4.2],['hydrogen','core',3.6],['trojena','line',2.8],['sindalah','core',1.6],['tabuk','hydrogen',3.5],['tabuk','trojena',2],['amaala','core',2],['redsea','amaala',2],['alula','tabuk',2],['nsolar','hydrogen',2]];
  const CORR_N = [['core','line'],['line','trojena'],['core','hydrogen'],['hydrogen','tabuk'],['core','amaala'],['amaala','redsea'],['tabuk','alula'],['core','sindalah']];
  // ---- The East: 'core' is Dammam.
  const NODE_E = {
    core:     {name:L('Dammam','الدمام'), lon:50.10, lat:26.43, pop:0, jobs:0, core:true},
    khobar:   {name:L('Al Khobar','الخبر'), lon:50.21, lat:26.28, pop:260, jobs:70},
    dhahran:  {name:L('Dhahran','الظهران'), lon:50.12, lat:26.30, pop:40, jobs:90},
    jubail:   {name:L('Jubail industrial city','مدينة الجبيل الصناعية'), project:'eastern', pop:70, jobs:110},
    qatif:    {name:L('Qatif','القطيف'), lon:50.00, lat:26.56, pop:130, jobs:25},
    dport:    {name:L('King Abdulaziz Port','ميناء الملك عبدالعزيز'), lon:50.15, lat:26.50, pop:0, jobs:30},
    kfia:     {name:L('King Fahd Airport','مطار الملك فهد'), lon:49.80, lat:26.47, pop:0, jobs:20, gateway:true},
    hofuf:    {name:L('Al-Ahsa (Hofuf)','الأحساء (الهفوف)'), lon:49.59, lat:25.38, pop:160, jobs:40, far:true},
    esolar:   {name:L('Al-Ahsa renewables site','موقع الأحساء للطاقة المتجددة'), project:'green', pop:0, jobs:2, energySite:true}
  };
  const ROADS_E = [['khobar','core',5],['dhahran','khobar',3],['dhahran','core',3],['jubail','core',4],['qatif','core',3],['dport','core',3],['kfia','core',3],['hofuf','core',2.5],['esolar','hofuf',2],['jubail','qatif',2.5]];
  const CORR_E = [['core','khobar'],['core','dhahran'],['core','jubail'],['core','qatif'],['core','kfia'],['core','hofuf'],['khobar','dhahran'],['qatif','jubail']];
  // ---- Aseer & the South: 'core' is Abha.
  const NODE_S = {
    core:     {name:L('Abha','أبها'), lon:42.51, lat:18.22, pop:0, jobs:0, core:true},
    soudah:   {name:L('Soudah Peaks','قمم السودة'), project:'soudah', pop:5, jobs:8, attract:1},
    rijal:    {name:L('Rijal Almaa heritage village','قرية رجال ألمع التراثية'), lon:42.27, lat:18.21, pop:10, jobs:4, attract:.8},
    khamis:   {name:L('Khamis Mushait','خميس مشيط'), lon:42.73, lat:18.30, pop:230, jobs:60},
    abhair:   {name:L('Abha Airport','مطار أبها'), lon:42.66, lat:18.24, pop:0, jobs:12, gateway:true},
    jazanc:   {name:L('Jazan city','مدينة جازان'), lon:42.56, lat:16.89, pop:160, jobs:40},
    jazanind: {name:L('Jazan industrial city','مدينة جازان للصناعات'), project:'jazan', pop:20, jobs:45},
    najran:   {name:L('Najran','نجران'), lon:44.13, lat:17.49, pop:120, jobs:30, far:true}
  };
  const ROADS_S = [['soudah','core',2],['khamis','core',5],['rijal','core',1.8],['abhair','khamis',3],['jazanc','core',2],['jazanind','jazanc',3],['najran','khamis',2],['soudah','rijal',1.2]];
  const CORR_S = [['core','soudah'],['core','khamis'],['khamis','abhair'],['core','rijal'],['core','jazanc'],['soudah','rijal'],['jazanc','jazanind']];
  // ---- Beyond 2030: the whole Kingdom. 'core' is Riyadh; the network is intercity rail and air.
  const NODE_K = {
    core:     {name:L('Riyadh','الرياض'), lon:46.68, lat:24.71, pop:0, jobs:0, core:true},
    jeddah:   {name:L('Jeddah','جدة'), lon:39.20, lat:21.54, pop:420, jobs:120},
    makkah:   {name:L('Makkah','مكة المكرمة'), lon:39.83, lat:21.42, pop:230, jobs:60, attract:1},
    madinah:  {name:L('Madinah','المدينة المنورة'), lon:39.61, lat:24.47, pop:160, jobs:45, attract:.8},
    dammam:   {name:L('Dammam','الدمام'), lon:50.10, lat:26.43, pop:280, jobs:110},
    qassim:   {name:L('Buraydah (Qassim)','بريدة (القصيم)'), lon:43.97, lat:26.33, pop:140, jobs:35},
    hail:     {name:L('Hail','حائل'), lon:41.69, lat:27.52, pop:80, jobs:20},
    tabuk:    {name:L('Tabuk & NEOM','تبوك ونيوم'), lon:36.57, lat:28.38, pop:110, jobs:60},
    abha:     {name:L('Abha','أبها'), lon:42.51, lat:18.22, pop:130, jobs:30, attract:.6},
    jazan:    {name:L('Jazan','جازان'), lon:42.58, lat:16.89, pop:100, jobs:30},
    hofuf:    {name:L('Al-Ahsa','الأحساء'), lon:49.59, lat:25.38, pop:120, jobs:30},
    alula:    {name:L('AlUla','العلا'), lon:37.92, lat:26.62, pop:20, jobs:10, attract:.9}
  };
  const ROADS_K = [['jeddah','makkah',5],['makkah','core',4],['madinah','qassim',3],['qassim','core',4],['dammam','core',5],['hofuf','dammam',3],['hofuf','core',3],['hail','qassim',2.5],['tabuk','hail',2],['alula','madinah',1.8],['abha','core',2.4],['jazan','abha',2.5],['jeddah','madinah',3.5],['tabuk','madinah',2]];
  const CORR_K = [['core','jeddah'],['core','dammam'],['core','qassim'],['qassim','madinah'],['madinah','jeddah'],['core','abha'],['abha','jazan'],['hail','qassim'],['tabuk','hail'],['madinah','alula'],['jeddah','makkah']];
  const BOARDS = {
    riyadh:{nodes:NODE_R, roads:ROADS_R, corridors:CORR_R, ring:{cap:15, base:8}, kmCost:1, anchor:'Riyadh', energy:{site:'sudair', link:'roshn'}},
    neom:  {nodes:NODE_N, roads:ROADS_N, corridors:CORR_N, ring:{cap:9, base:6}, kmCost:.3, anchor:null, vkt:.5, energy:{site:'nsolar', link:'hydrogen'}},
    east:  {nodes:NODE_E, roads:ROADS_E, corridors:CORR_E, ring:{cap:13, base:8}, kmCost:.6, anchor:null, vkt:.8, energy:{site:'esolar', link:'hofuf'}},
    south: {nodes:NODE_S, roads:ROADS_S, corridors:CORR_S, ring:{cap:8, base:8}, kmCost:.5, anchor:null, vkt:.45},
    kingdom:{nodes:NODE_K, roads:ROADS_K, corridors:CORR_K, ring:{cap:32, base:20}, kmCost:.045, anchor:null, vkt:.012, intercity:true},
    west:  {nodes:NODE_W, roads:ROADS_W, corridors:CORR_W, ring:{cap:12, base:10}, kmCost:.34, anchor:null, vkt:.45}
  };
  for (const b of Object.values(BOARDS)) for (const n of Object.values(b.nodes)) if (n.project) { const p = P(n.project); n.lon = p.lon; n.lat = p.lat; if (p.anchor) n.anchor = p.anchor; }
  const FREIGHT = {riyadh:[['eastgate','dryport'],['westgate','dryport'],['ksip','dryport'],['eastgate','ksip']]};
  let NODE_DEF = NODE_R, ROADS = ROADS_R, CORRIDORS = CORR_R, RING = BOARDS.riyadh.ring, BOARD = 'riyadh';
  function useBoard(id){ const b = BOARDS[id] || BOARDS.riyadh; BOARD = BOARDS[id] ? id : 'riyadh'; NODE_DEF = b.nodes; ROADS = b.roads; CORRIDORS = b.corridors; RING = b.ring; }

  /* ============================ UPGRADES ============================= */
  const UPGRADES = {
    smart:    {name:L('Smart Mobility','التنقل الذكي'), cost:2, req:[], icon:'🚦',
               does:L('Unlocks Bus Priority Lanes and the congestion lens that colours every road by load.','يفتح مسارات أولوية الحافلات وعدسة الازدحام التي تلوّن كل طريق حسب حمله.')},
    energy:   {name:L('Resilient Energy','الطاقة المرنة'), cost:2, req:[], icon:'🔋',
               does:L('Unlocks grid batteries and storm microgrids that keep services running through peaks and storms.','يفتح بطاريات الشبكة والشبكات المصغّرة التي تُبقي الخدمات تعمل خلال الذروة والعواصف.')},
    talent:   {name:L('Talent Accelerator','مسرّع المواهب'), cost:2, req:[], icon:'🎓',
               does:L('+1 crew in every mission, one extra response action per storm phase, and the Fast-track action.','طاقم إضافي في كل مهمة، وإجراء استجابة إضافي في كل مرحلة من العاصفة، وإجراء التسريع.')},
    logistics:{name:L('Advanced Logistics','الخدمات اللوجستية المتقدمة'), cost:3, req:['smart'], icon:'📦',
               does:L('Unlocks Logistics Hubs (nearby builds finish a turn sooner) and Night Deliveries.','يفتح المراكز اللوجستية (تنتهي المشاريع القريبة أسرع بجولة) والتوصيل الليلي.')},
    twin:     {name:L('Digital Twin Insights','رؤى التوأم الرقمي'), cost:3, req:['any2'], icon:'🛰️',
               does:L('Exact forecasts of every indicator before you commit, a mission-end prediction, and a two-phase storm forecast.','توقعات دقيقة لكل مؤشر قبل الالتزام، وتنبؤ بنتيجة المهمة، وتوقع العاصفة لمرحلتين.')}
  };
  const upgradeAvailable = (id, owned) => { const u = UPGRADES[id]; if (owned.includes(id)) return false; if (u.req.includes('any2')) return ['smart','energy','talent','logistics'].filter(x => owned.includes(x)).length >= 2; return u.req.every(r => owned.includes(r)); };

  /* ============================= ACTIONS ============================= */
  // target: corridor | road | node | none | project
  const ACTIONS = {
    metro:  {cat:'transit', name:L('Metro extension','امتداد المترو'), target:'corridor', crews:2, icon:'Ⓜ',
             why:L('High capacity and fast, with no road lane lost, but it is the slowest and most expensive option to build.','سعة عالية وسرعة دون فقدان مسار طريق، لكنه الأبطأ والأغلى بناءً.')},
    brt:    {cat:'transit', name:L('Bus rapid transit','حافلات التردد السريع'), target:'corridor', crews:1, icon:'🚌',
             why:L('Quick and cheap to build, but it takes a car lane and carries fewer people than metro.','سريعة ورخيصة، لكنها تأخذ مسارًا من السيارات وتنقل عددًا أقل من المترو.')},
    road:   {cat:'transit', name:L('Road widening','توسعة الطريق'), target:'road', crews:1, icon:'🛣',
             why:L('Adds car capacity fast, but new lanes attract new trips and push more cars into the central ring.','يضيف سعة للسيارات بسرعة، لكن المسارات الجديدة تجذب رحلات جديدة وتدفع مزيدًا من السيارات إلى الحلقة المركزية.')},
    freq:   {cat:'ops', name:L('Boost transit frequency','زيادة تردد النقل العام'), target:'none', crews:0, icon:'⏱', toggle:true,
             why:L('+40% capacity on every transit line and shorter waits, for 0.6 credits each turn it stays on.','زيادة 40٪ في سعة كل خط نقل وانتظار أقصر، بتكلفة 0.6 رصيد لكل جولة.')},
    priority:{cat:'ops', name:L('Bus priority lanes','مسارات أولوية الحافلات'), target:'none', crews:0, icon:'🚦', req:'smart', toggle:true,
             why:L('Buses move 25% faster and carry 50% more, while cars lose a little road space.','تتحرك الحافلات أسرع بنسبة 25٪ وتنقل 50٪ أكثر، مع خسارة بسيطة لمساحة السيارات.')},
    hotel:  {cat:'district', name:L('Hospitality district','حي ضيافة'), target:'node', crews:1, icon:'🏨',
             why:L('+20k visitor beds. They only fill if the district is well connected (mobility 50+).','20 ألف سرير إضافي للزوار، تمتلئ فقط إذا كان الحي متصلًا جيدًا (تنقل 50+).')},
    housing:{cat:'district', name:L('Affordable housing','إسكان ميسّر'), target:'node', crews:1, icon:'🏘',
             why:L('Homes near jobs raise quality of life, but add trips and energy demand.','منازل قرب الوظائف ترفع جودة الحياة، لكنها تضيف رحلات وطلبًا على الطاقة.')},
    park:   {cat:'district', name:L('Green corridor','ممر أخضر'), target:'node', crews:1, icon:'🌳',
             why:L('Shade and walking routes: trust and sustainability rise, and heat falls.','ظل ومسارات مشي: ترتفع الثقة والاستدامة وتنخفض الحرارة.')},
    gridlink:{cat:'energy', name:L('Grid connection','ربط بالشبكة'), target:'none', crews:1, icon:'⚡', once:true,
             why:L('Connects the renewable site to the city grid. Solar and wind are useless until they are connected.','يربط موقع الطاقة المتجددة بشبكة المدينة. الطاقة الشمسية والرياح بلا فائدة حتى يتم الربط.')},
    wind:   {cat:'energy', name:L('Wind farm','مزرعة رياح'), target:'none', crews:1, icon:'🌬', needs:'gridlink',
             why:L('Wind keeps blowing after sunset, so it helps the evening peak, but it costs more than solar and produces less at midday.','الرياح تستمر بعد الغروب فتساعد في ذروة المساء، لكنها أغلى من الشمسية وتنتج أقل وقت الظهيرة.')},
    solar:  {cat:'energy', name:L('Solar farm','مزرعة شمسية'), target:'none', crews:1, icon:'☀', needs:'gridlink',
             why:L('Clean daytime power. It helps little at the evening peak without storage.','طاقة نظيفة نهارًا، وتساعد قليلًا في ذروة المساء دون تخزين.')},
    peaker: {cat:'energy', name:L('Gas peaker plant','محطة ذروة غازية'), target:'none', crews:1, icon:'🏭',
             why:L('Reliable evening capacity, quickly and cheaply, but it adds emissions.','سعة مسائية موثوقة بسرعة وبتكلفة منخفضة، لكنها تزيد الانبعاثات.')},
    storage:{cat:'energy', name:L('Grid battery','بطارية الشبكة'), target:'none', crews:1, icon:'🔋', req:'energy',
             why:L('Stores solar power for the evening peak and adds resilience.','تخزن الطاقة الشمسية لذروة المساء وتضيف المرونة.')},
    retrofit:{cat:'energy', name:L('Efficiency retrofit','تحديث كفاءة الطاقة'), target:'node', crews:1, icon:'💡',
             why:L('Cuts energy demand in populated districts, so the lowest-cost watt is the one not used.','يخفض الطلب على الطاقة في الأحياء السكنية؛ فأرخص طاقة هي التي لا تُستهلك.')},
    demand: {cat:'ops', name:L('Peak demand response','الاستجابة لطلب الذروة'), target:'none', crews:0, icon:'📉', toggle:true,
             why:L('Shifts 8% of the evening peak for 0.4 credits each turn, with a small trust cost.','يزيح 8٪ من ذروة المساء بتكلفة 0.4 رصيد لكل جولة، مع أثر بسيط على الثقة.')},
    hub:    {cat:'district', name:L('Logistics hub','مركز لوجستي'), target:'node', crews:1, icon:'📦', req:'logistics',
             why:L('Materials arrive faster, and builds here and next door finish a turn sooner.','تصل المواد أسرع، وتنتهي المشاريع هنا وفي الجوار قبل موعدها بجولة.')},
    night:  {cat:'ops', name:L('Night deliveries','التوصيل الليلي'), target:'none', crews:0, icon:'🌙', req:'logistics', toggle:true,
             why:L('Halves construction disruption and adds delivery capacity, for 0.3 credits each turn.','يخفض إزعاج البناء إلى النصف ويضيف سعة توصيل، بتكلفة 0.3 رصيد لكل جولة.')},
    advance:{cat:'project', name:L('Start next package','بدء الحزمة التالية'), target:'project', crews:0, icon:'🏗',
             why:L('Starts the next work package: site, then structure, then systems.','يبدأ حزمة العمل التالية: الموقع ثم الهيكل ثم الأنظمة.')},
    contract:{cat:'ops', name:L('Contract extra crew','التعاقد مع طاقم إضافي'), target:'none', crews:0, icon:'👷',
             why:L('+1 crew for 3 turns, at a high cost.','طاقم إضافي لثلاث جولات بتكلفة عالية.')},
    fasttrack:{cat:'ops', name:L('Fast-track a build','تسريع مشروع'), target:'build', crews:0, icon:'⏩', req:'talent',
             why:L('Pay 50% more to finish an active build one turn sooner.','ادفع 50٪ إضافية لإنهاء مشروع قائم قبل موعده بجولة.')},
    route:  {cat:'transit', name:L('Custom bus route','مسار حافلات مخصص'), target:'route', crews:1, icon:'🚏',
             why:L('Choose your own stops along existing roads. Each segment becomes a bus lane (it takes a car lane) and serves every district on the route.','اختر محطاتك على الطرق القائمة. يصبح كل جزء مسار حافلات (يأخذ مسارًا من السيارات) ويخدم كل حي على المسار.')},
    freight:{cat:'transit', name:L('Freight rail link','خط قطار شحن'), target:'corridor', crews:1, icon:'🚆',
             why:L('Moves containers off city roads with high reliability. It takes 2 turns and a crew.','ينقل الحاويات بعيدًا عن طرق المدينة بموثوقية عالية. يستغرق جولتين وطاقمًا.')},
    warehouse:{cat:'district', name:L('Bonded warehouse','مستودع جمركي'), target:'node', crews:1, icon:'🏬',
             why:L('Buffers freight at a node: +1 throughput and more reliability, but it takes up budget.','يخزّن الشحن مؤقتًا في العقدة: زيادة في الإنتاجية والموثوقية، لكنه يستهلك من الأرصدة.')},
    digital:{cat:'ops', name:L('Digital logistics platform','منصة لوجستية رقمية'), target:'none', crews:0, icon:'📡', toggle:true,
             why:L('Tracks every container: +15% freight capacity and +15 reliability, for 0.5 credits each turn.','تتبع كل حاوية: +15٪ سعة شحن و+15 موثوقية، مقابل 0.5 رصيد لكل جولة.')},
    academy:{cat:'people', name:L('Training academy','أكاديمية تدريب'), target:'node', crews:1, icon:'🎓',
             why:L('Takes 2 turns to build, then trains people every turn. Benefits arrive later, so start early.','تستغرق جولتين للبناء ثم تدرّب كل جولة. تظهر الفوائد لاحقًا فابدأ مبكرًا.')},
    apprentice:{cat:'people', name:L('Apprenticeship programme','برنامج التلمذة المهنية'), target:'none', crews:0, icon:'🧰', toggle:true,
             why:L('Creates jobs now and slowly adds skills, for 0.5 credits each turn.','يوجد وظائف الآن ويضيف مهارات ببطء، مقابل 0.5 رصيد لكل جولة.')},
    research:{cat:'people', name:L('Research & innovation lab','مختبر البحث والابتكار'), target:'node', crews:1, icon:'🔬', once:true,
             why:L('Scientific capacity: advanced systems work finishes a turn sooner once the lab opens.','القدرة العلمية: تنتهي أعمال الأنظمة المتقدمة قبل موعدها بجولة بعد افتتاح المختبر.')},
    permits:{cat:'policy', name:L('One-stop permits','التراخيص الموحدة'), target:'none', crews:0, icon:'🪪', once:true,
             why:L('Institutional framework: clearer, faster approvals (+40 process readiness after 1 turn).','الإطار المؤسسي: موافقات أوضح وأسرع (+40 جاهزية إجراءات بعد جولة).')},
    framework:{cat:'policy', name:L('Investor-ready framework','إطار جاهز للمستثمر'), target:'none', crews:0, icon:'📜', once:true,
             why:L('Business legislation: +35 process readiness after 2 turns.','تشريعات الأعمال: +35 جاهزية إجراءات بعد جولتين.')},
    incentive:{cat:'policy', name:L('Targeted investor incentive','حافز استثماري موجّه'), target:'none', crews:0, icon:'🏷', once:true,
             why:L('Tax policy: +8 readiness immediately, but any offer brings 2 fewer credits.','السياسة الضريبية: +8 جاهزية فورًا، لكن أي عرض يأتي بأرصدة أقل برصيدين.')},
    offerA:{cat:'offer', name:L('Accept offer A — fast capital (fictional)','قبول العرض أ — رأس مال سريع (خيالي)'), target:'none', crews:0, icon:'💠', once:true,
             why:L('+10 credits now and the project opens next turn, but few local jobs or skills. A fictional game offer — not a real investor.','+10 أرصدة الآن ويُفتتح المشروع في الجولة التالية، لكن مع وظائف ومهارات محلية قليلة. عرض خيالي في اللعبة — ليس مستثمرًا حقيقيًا.')},
    offerB:{cat:'offer', name:L('Accept offer B — local partnership (fictional)','قبول العرض ب — شراكة محلية (خيالي)'), target:'none', crews:0, icon:'🔷', once:true,
             why:L('+5 credits, more local jobs and +20 talent; the project opens in 2 turns. A fictional game offer — not a real investor.','+5 أرصدة ووظائف محلية أكثر و+20 مواهب؛ يُفتتح المشروع بعد جولتين. عرض خيالي في اللعبة — ليس مستثمرًا حقيقيًا.')},
    // Storm response (Mission 5)
    shelter:{cat:'response', name:L('Open shelters','فتح الملاجئ'), target:'node', crews:0, icon:'🏠',
             why:L('Protects about 85% of people outdoors in this district when the storm arrives. People come first.','يحمي نحو 85٪ من الموجودين في الخارج في هذا الحي عند وصول العاصفة. الناس أولًا.')},
    medic:  {cat:'response', name:L('Field medical team','فريق طبي ميداني'), target:'node', crews:0, icon:'⛑',
             why:L('Covers the remaining people in a district, and helps those already caught out.','يغطي بقية الناس في الحي، ويساعد من علقوا في الخارج.')},
    reroute:{cat:'response', name:L('Reroute traffic','تحويل حركة المرور'), target:'road', crews:0, icon:'↪',
             why:L('Closes a road before the storm hits it. Vehicles move to other routes, so nobody is stranded.','يغلق طريقًا قبل وصول العاصفة إليه، فتنتقل المركبات إلى طرق أخرى ولا يعلق أحد.')},
    clear:  {cat:'response', name:L('Clearance crew','فريق إزالة الرمال'), target:'road', crews:0, icon:'🚜',
             why:L('Reopens a road once the storm has passed it. It does nothing while the storm is still overhead.','يعيد فتح الطريق بعد مرور العاصفة، ولا يفيد والعاصفة ما زالت فوقه.')},
    generator:{cat:'response', name:L('Mobile generators','مولدات متنقلة'), target:'node', crews:0, icon:'🔌',
             why:L('Keeps about 80% of essential services running in a district during the storm.','يُبقي نحو 80٪ من الخدمات الأساسية تعمل في الحي خلال العاصفة.')},
    microgrid:{cat:'response', name:L('Microgrid island','شبكة مصغّرة مستقلة'), target:'node', crews:0, icon:'🔋', req:'energy',
             why:L('Keeps all essential services running in a district during the storm.','يُبقي جميع الخدمات الأساسية تعمل في الحي خلال العاصفة.')},
    alert:  {cat:'response', name:L('Public early alert','إنذار مبكر للجمهور'), target:'none', crews:0, icon:'📣', once:true,
             why:L('Fewer people travel: 40% fewer outdoors and on the roads for the rest of the storm. Works best early.','يقل عدد المتنقلين 40٪ في الخارج وعلى الطرق لبقية العاصفة. الأفضل مبكرًا.')}
  };
  const costOf = (S, id, tgt) => {
    const a = ACTIONS[id];
    switch (id) {
      case 'metro': { const k = corridorKm(tgt) * BOARDS[BOARD].kmCost; return +(2.4 + k * .25).toFixed(1); }
      case 'brt':   { const k = corridorKm(tgt) * BOARDS[BOARD].kmCost; return +(1 + k * .08).toFixed(1); }
      case 'road':  { const l = S.links.find(x => x.id === tgt); return +(1 + (l ? l.km : 10) * BOARDS[BOARD].kmCost * .05).toFixed(1); }
      case 'freq': return .6; case 'priority': return .5; case 'hotel': return 4; case 'housing': return 3; case 'park': return 1.8;
      case 'gridlink': return 2; case 'solar': return 4; case 'wind': return 3.6; case 'peaker': return 2.2; case 'storage': return 3; case 'retrofit': return 1.6; case 'demand': return .4;
      case 'hub': return 2.5; case 'night': return .3; case 'contract': return 3;
      case 'advance': { const pk = nextPackage(S, tgt); return pk ? pk.cost : 0; }
      case 'fasttrack': { const b = S.builds.find(x => x.bid === tgt); return b ? +(b.cost * .5).toFixed(1) : 1; }
      case 'freight': { const k = corridorKm(tgt) * BOARDS[BOARD].kmCost; return +(1.4 + k * .06).toFixed(1); } case 'warehouse': return 2; case 'digital': return .5; case 'academy': return 2.5; case 'apprentice': return .5; case 'research': return 3; case 'permits': return 1.5; case 'framework': return 2; case 'incentive': return 3; case 'offerA': case 'offerB': return 0;
      case 'route': { const ns = String(tgt || '').split('>'); let c = 0; for (let k = 1; k < ns.length; k++) { const a = ns[k - 1], b = ns[k]; if (S.links.some(l => l.kind === 'brt' && l.built && [l.a, l.b].sort().join() === [a, b].sort().join())) continue; c += 1 + km(NODE_DEF[a], NODE_DEF[b]) * .08 * BOARDS[BOARD].kmCost; } return +c.toFixed(1); }
      case 'shelter': return 1; case 'medic': return .8; case 'reroute': return .5; case 'clear': return 1; case 'generator': return 1; case 'microgrid': return 1.2; case 'alert': return 1;
    }
    return a.cost || 1;
  };
  const durOf = (S, id, tgt) => {
    let d = {metro: (id === 'metro' && corridorKm(tgt) * BOARDS[BOARD].kmCost > 20 ? 4 : 3) - (BOARDS[BOARD].intercity && S.coup && (S.coup.cityCaps || []).includes('interchange') ? 1 : 0), brt:1, road:1, hotel:2, housing:2, park:1, gridlink:1, solar:2, wind:2, route:1, freight:2, warehouse:1, academy:2, research:2, permits:1, framework:2, peaker:1, storage:1, retrofit:1, hub:1}[id] || 0;
    if (id === 'advance') { const pk = nextPackage(S, tgt); d = pk ? pk.dur - (pk.k === 'systems' && S.research ? 1 : 0) : 0; }
    if (d > 1 && S.hubs && hubNear(S, id, tgt)) d -= 1;
    return d;
  };
  const crewsOf = (S, id, tgt) => { if (id === 'advance') { const pk = nextPackage(S, tgt) || {}; return pk.k === 'systems' && M(S.mission).skilledSystems ? 0 : pk.crews || 0; } return ACTIONS[id].crews; };
  function corridorKm(tgt){ if (!tgt) return 10; const [a, b] = tgt.split(':').pop().split('-'); return km(NODE_DEF[a], NODE_DEF[b]); }
  function hubNear(S, id, tgt){
    const nodesOf = () => { if (!tgt) return []; if (tgt.includes('-')) return tgt.split('-'); if (tgt.includes(':')) return tgt.split(':')[1].split('-'); return [tgt]; };
    const ns = nodesOf(); return S.hubs.some(h => ns.includes(h) || S.links.some(l => l.kind === 'road' && ((l.a === h && ns.includes(l.b)) || (l.b === h && ns.includes(l.a)))));
  }

  /* ============================= MISSIONS ============================ */
  const PKG = [{k:'site', name:L('Site preparation','تجهيز الموقع'), dur:1, crews:1, cost:1.5},
               {k:'structure', name:L('Structure','الهيكل'), dur:2, crews:2, cost:4, materials:true},
               {k:'systems', name:L('Systems & opening','الأنظمة والافتتاح'), dur:2, crews:1, cost:2}];
  const MISSIONS = [
    { id:'m1', chapter:'riyadh', arc:'A', hud:['mobility'], n:1, date:L('2026','2026'), turns:6, turnLabel:L('Month','شهر'), turnStep:2, startMonth:0, year:2026, budget:14, crews:2,
      title:L('Connect for the Opening','اربط المدينة للافتتاح'),
      brief:L('A preview event for Expo 2030 is coming. Visitors stay in City Centre hotels and travel between the City Centre and two sites: the Expo site and King Salman Airport. On the final turn (the event), each site needs an access score of 72 or more. The access score (0–100) rates how quickly trips from that site reach the City Centre by road and transit, including event crowds. A transit line only carries these trips if it connects to the City Centre, directly or through another line.','فعالية تمهيدية لإكسبو 2030 قادمة. يقيم الزوار في فنادق وسط المدينة ويتنقلون بينه وبين موقعين: موقع إكسبو ومطار الملك سلمان. في الجولة الأخيرة (يوم الفعالية) يحتاج كل موقع إلى درجة وصول 72 أو أكثر. درجة الوصول (0–100) تقيس سرعة وصول الرحلات من الموقع إلى وسط المدينة بالطرق والنقل العام، مع زحام الفعالية. لا يحمل خط النقل العام هذه الرحلات إلا إذا اتصل بوسط المدينة، مباشرة أو عبر خط آخر.'),
      objective:L('Event day: Expo and Airport access to the City Centre ≥ 72 each (final turn)','يوم الفعالية: وصول إكسبو والمطار إلى وسط المدينة ≥ 72 لكل منهما (الجولة الأخيرة)'),
      // The goal is the LOWER of the two sites' access scores (nodeMob: trips from the site to the City Centre, 0–100) after the final turn.
      goal:{sites:['expo','ksip'], to:'core', target:72},
      actions:['metro','brt','route','road','freq','priority','park'],
      visitors:{event:{expo:[0,0,10,25,45,65], ksip:[0,0,6,15,25,35]}},
      primary:S => { const v = Math.min(S.m.nodeMob.expo, S.m.nodeMob.ksip); return {value:v, target:72, met:v >= 72, fmt:Math.round(v)}; },
      optional:[
        {id:'budget', label:L('Finish with 3 credits or more unspent','أنهِ بـ 3 أرصدة أو أكثر غير مصروفة'), test:S => S.budget >= 3},
        {id:'trust', label:L('Public trust ≥ 60','الثقة العامة ≥ 60'), test:S => S.m.trust >= 60},
        {id:'link', label:L('Airport to Expo within 40 minutes by transit','من المطار إلى إكسبو خلال 40 دقيقة بالنقل العام'), test:S => { const tm = transitBetween(S, 'ksip', 'expo'); return tm != null && tm <= 40; },
         measure:S => { const tm = transitBetween(S, 'ksip', 'expo'); return tm == null ? null : Math.round(tm); }, unit:L('min','دقيقة'),
         note:L('Optional and separate from the main goal: it times a direct transit trip between the Airport and Expo. The main goal times trips from each site to the City Centre.','هدف اختياري منفصل عن الهدف الرئيسي: يقيس رحلة مباشرة بالنقل العام بين المطار وإكسبو، بينما يقيس الهدف الرئيسي الرحلات من كل موقع إلى وسط المدينة.')}
      ],
      hints:[],   // result advice is generated from the playthrough by accessAdvice()
      tease:L('Next: tens of thousands of visitors want to stay — can Riyadh host them and stay liveable?','التالي: عشرات الآلاف من الزوار يريدون الإقامة — هل تستطيع الرياض استضافتهم مع بقائها مريحة للعيش؟')
    },
    { id:'m2', chapter:'riyadh', arc:'D', hud:['visitors'], n:2, date:L('2027','2027'), turns:6, turnLabel:L('Month','شهر'), turnStep:2, year:2027, budget:18, crews:3,
      title:L('Welcome the World','أهلًا بالعالم'),
      brief:L('Riyadh Season is growing fast. Build places for visitors to stay and ways to reach Diriyah, Qiddiya and Expo, while protecting everyday life for residents.','موسم الرياض ينمو بسرعة. ابنِ أماكن لإقامة الزوار وطرقًا للوصول إلى الدرعية والقدية وإكسبو، مع حماية الحياة اليومية للسكان.'),
      objective:L('Host ≥ 85k visitors at the season peak with public trust ≥ 58','استضف ≥ 85 ألف زائر في ذروة الموسم مع ثقة عامة ≥ 58'),
      actions:['hotel','metro','brt','route','road','park','housing','freq','priority','hub'],
      start:{links:[['brt','core','expo']]},
      visitors:{season:[30,45,60,75,90,100]},
      primary:S => { const ok = S.m.visitorsServed >= 85 && S.m.trust >= 58; return {value:S.m.visitorsServed, target:85, met:ok, fmt:Math.round(S.m.visitorsServed) + 'k', extra:S.m.trust < 58 ? 'trust' : null}; },
      optional:[
        {id:'sus', label:L('Sustainability ≥ 55','الاستدامة ≥ 55'), test:S => S.m.sustainability >= 55},
        {id:'both', label:L('Visitors staying at both Diriyah and Qiddiya','زوار يقيمون في الدرعية والقدية معًا'), test:S => S.nodes.diriyah.hotel > 0 && S.nodes.qiddiya.hotel > 0 && S.m.nodeMob.diriyah >= 50 && S.m.nodeMob.qiddiya >= 50},
        {id:'budget', label:L('Finish with 2 credits or more unspent','أنهِ برصيدين أو أكثر'), test:S => S.budget >= 2}
      ],
      hints:[
        {when:S => S.m.hotelsUnserved > 0, text:L('Some hotels stood half-empty because their district was poorly connected. Beds only count when mobility there is 50+.','بعض الفنادق بقيت نصف فارغة لضعف اتصال أحيائها؛ الأسرّة تُحتسب فقط عندما يكون التنقل 50+.')},
        {when:S => S.m.trust < 58, text:L('Residents felt the crowds. Add a green corridor or transit to keep daily life comfortable.','شعر السكان بالزحام. أضف ممرًا أخضر أو نقلًا عامًا لتبقى الحياة اليومية مريحة.')},
        {when:S => S.m.visitorsServed < 85, text:L('There were not enough beds. Hospitality districts take 2 turns, so start them early.','الأسرّة لم تكفِ. أحياء الضيافة تستغرق جولتين، فابدأها مبكرًا.')}
      ],
      tease:L('Next: the city keeps growing — can the grid keep up without burning more fuel?','التالي: المدينة تواصل النمو — هل تواكبها الشبكة دون حرق مزيد من الوقود؟')
    },
    { id:'m3', chapter:'riyadh', arc:'B', hud:['sustainability','resilience'], n:3, date:L('2028','2028'), turns:7, turnLabel:L('Month','شهر'), turnStep:2, year:2028, budget:24, crews:3,
      title:L('Power the Next District','طاقة للحي التالي'),
      brief:L('Homes and jobs are growing 4% every turn, and New Murabba switches on halfway through. Keep the lights on at the evening peak and cut emissions as the city grows.','المنازل والوظائف تنمو 4٪ كل جولة، والمربع الجديد يبدأ التشغيل في منتصف المهمة. أبقِ الأنوار مضاءة في ذروة المساء وخفّض الانبعاثات مع نمو المدينة.'),
      objective:L('No outages in the last 3 turns and sustainability ≥ 62','لا انقطاعات في آخر 3 جولات والاستدامة ≥ 62'),
      actions:['gridlink','solar','peaker','storage','retrofit','demand','metro','brt','route','park'],
      energy:{fossil:11.2}, growth:.04, events:{3:{murabbaJobs:60}},
      primary:S => { const recent = S.outageHistory.slice(-3).every(x => !x); const ok = recent && S.m.sustainability >= 62; return {value:S.m.sustainability, target:62, met:ok, fmt:Math.round(S.m.sustainability), extra:recent ? null : 'outage'}; },
      optional:[
        {id:'renew', label:L('Renewable share ≥ 35%','حصة المتجددة ≥ 35٪'), test:S => S.m.renewShare >= .35},
        {id:'trust', label:L('Public trust ≥ 60','الثقة العامة ≥ 60'), test:S => S.m.trust >= 60},
        {id:'nopeaker', label:L('No gas peakers built','بدون محطات ذروة غازية'), test:S => !S.peakers}
      ],
      hints:[
        {when:S => S.outageHistory.slice(-3).some(x => x), text:L('Evening peaks caused outages. Solar fades at dusk, so pair it with storage, demand response or efficiency, or accept a peaker and its emissions.','تسببت ذروة المساء في انقطاعات. تخفت الشمس عند الغروب، فادمجها مع التخزين أو الاستجابة للطلب أو الكفاءة، أو اقبل محطة ذروة وانبعاثاتها.')},
        {when:S => S.m.sustainability < 62, text:L('Emissions stayed high. Transit that takes cars off the ring and retrofits both cut them.','ظلت الانبعاثات مرتفعة. النقل العام الذي يخفف السيارات على الحلقة، وتحديث الكفاءة، يخفضانها معًا.')},
        {when:S => S.solar > 0 && !S.gridlink, text:L('Solar was built but never connected. Build the grid connection first.','بُنيت الطاقة الشمسية دون ربطها؛ ابنِ الربط بالشبكة أولًا.')}
      ],
      tease:L('Next: three flagship projects share the same crews — deliver them together.','التالي: ثلاثة مشاريع رائدة تتشارك الأطقم نفسها — أنجزها معًا.')
    },
    { id:'m4', chapter:'riyadh', arc:'A', hud:['delivery'], n:7, date:L('2029','2029'), turns:8, turnLabel:L('Month','شهر'), turnStep:2, year:2029, budget:30, crews:4,
      title:L('Deliver Together','إنجاز مشترك'),
      brief:L('Sports Boulevard, King Salman Park and New Murabba must all open. They share crews, their materials travel by road, and they depend on each other: the Boulevard needs the Park’s structure, and Murabba needs a transit link to open.','يجب افتتاح المسار الرياضي وحديقة الملك سلمان والمربع الجديد. تتشارك المشاريع الأطقم، وتصل موادها بالطرق، وتعتمد على بعضها: المسار يحتاج هيكل الحديقة، والمربع يحتاج خط نقل عام ليفتتح.'),
      objective:L('Open all three projects by the final turn with public trust ≥ 50','افتتح المشاريع الثلاثة قبل الجولة الأخيرة مع ثقة عامة ≥ 50'),
      actions:['advance','road','brt','route','metro','hub','night','contract','fasttrack','park'],
      projects:{sports:{node:'sports', dep:{systems:{proj:'park', stage:'structure'}}}, park:{node:'park'}, murabba:{node:'murabba', dep:{systems:{transit:'murabba'}}}},
      primary:S => { const n = Object.values(S.projects).filter(p => p.done).length; const early = n === 3 && S.allDoneTurn != null ? (S.maxTurns - S.allDoneTurn) * .5 : 0; return {value:n + early, target:3, met:n === 3 && S.m.trust >= 50, fmt:n + '/3', extra:S.m.trust < 50 ? 'trust' : null}; },
      optional:[
        {id:'early', label:L('All three open with a turn to spare','افتتاح الثلاثة قبل الموعد بجولة'), test:S => S.allDoneTurn != null && S.allDoneTurn < S.maxTurns},
        {id:'budget', label:L('Finish with 3 credits or more unspent','أنهِ بـ 3 أرصدة أو أكثر'), test:S => S.budget >= 3},
        {id:'trust', label:L('Public trust ≥ 58','الثقة العامة ≥ 58'), test:S => S.m.trust >= 58}
      ],
      hints:[
        {when:S => Object.values(S.projects).some(p => p.waitMaterials > 1), text:L('Structures stalled waiting for materials. Congested roads deliver less, so widen the access road, add a logistics hub, or use night deliveries.','توقفت الهياكل بانتظار المواد؛ الطرق المزدحمة توصل أقل. وسّع طريق الوصول أو أضف مركزًا لوجستيًا أو التوصيل الليلي.')},
        {when:S => !S.projects.murabba.done && !transitPath(S, 'murabba'), text:L('New Murabba could not open without a transit link. Build BRT or metro to it in time.','لم يستطع المربع الجديد الافتتاح دون خط نقل عام؛ ابنِ حافلات سريعة أو مترو إليه في الوقت المناسب.')},
        {when:S => true, text:L('Crews were the bottleneck. Start the Park’s structure early, because the Boulevard depends on it.','كانت الأطقم عنق الزجاجة. ابدأ هيكل الحديقة مبكرًا لأن المسار الرياضي يعتمد عليه.')}
      ],
      tease:L('Next: a sandstorm rolls in days before Expo opens. Protect people first.','التالي: عاصفة رملية قبل أيام من افتتاح إكسبو. احمِ الناس أولًا.')
    },
    { id:'m5', chapter:'riyadh', arc:'B', hud:['people','services'], n:8, date:L('2030','2030'), turns:6, turnLabel:L('Phase','مرحلة'), storm:true, year:2030, budget:11, crews:0, points:3,
      title:L('Sandstorm Over Riyadh','عاصفة رملية فوق الرياض'),
      brief:L('A sandstorm will cross Riyadh over six phases, days before Expo opens. You get 3 response actions per phase. Open shelters before the storm arrives, reroute traffic off roads it will hit, and keep essential services powered. The order matters.','ستعبر عاصفة رملية الرياض خلال ست مراحل قبل أيام من افتتاح إكسبو. لديك 3 إجراءات استجابة في كل مرحلة. افتح الملاجئ قبل وصول العاصفة، وحوّل حركة المرور عن الطرق التي ستصيبها، وأبقِ الخدمات الأساسية تعمل. الترتيب مهم.'),
      objective:L('Protect ≥ 85% of people at risk and keep ≥ 65% of services running in hit districts','احمِ ≥ 85٪ من المعرّضين للخطر وحافظ على ≥ 65٪ من الخدمات في الأحياء المتأثرة'),
      actions:['shelter','medic','reroute','clear','generator','microgrid','alert'],
      start:{links:[['metro','core','expo'],['metro','core','ksip'],['brt','core','east']]},
      stormPath:[[47.05,24.45],[46.92,24.58],[46.78,24.68],[46.62,24.78],[46.48,24.86],[46.32,24.95]], stormRadius:13, severity:[.5,.85,1,1,.75,.4],
      primary:S => { const ok = S.m.protected >= 85 && S.m.services >= 65; return {value:S.m.protected, target:85, met:ok, fmt:Math.round(S.m.protected) + '%', extra:S.m.services < 65 ? 'services' : null}; },
      optional:[
        {id:'stranded', label:L('Fewer than 2,000 vehicles stranded','أقل من 2000 مركبة عالقة'), test:S => S.stranded < 2},
        {id:'services', label:L('Services ≥ 80%','الخدمات ≥ 80٪'), test:S => S.m.services >= 80},
        {id:'budget', label:L('Use 9 credits or less of the response budget','استخدم 9 أرصدة أو أقل من ميزانية الاستجابة'), test:S => S.budget0 - S.budget <= 9}
      ],
      hints:[
        {when:S => S.m.protected < 85, text:L('People were caught outdoors. Shelters must be open in the phase the storm reaches a district or earlier, so follow the forecast cone.','بقي أشخاص في الخارج. يجب أن تكون الملاجئ مفتوحة في مرحلة وصول العاصفة إلى الحي أو قبلها؛ تابع مخروط التوقع.')},
        {when:S => S.stranded > .05, text:L('Vehicles were stranded on roads the storm closed. Reroute before the storm hits a road, not after.','علقت مركبات على طرق أغلقتها العاصفة. حوّل الحركة قبل وصول العاصفة إلى الطريق لا بعده.')},
        {when:S => S.m.services < 65, text:L('Power dropped in populated districts. Put generators where most people live along the path.','انقطعت الكهرباء في أحياء مكتظة. ضع المولدات حيث يسكن معظم الناس على مسار العاصفة.')}
      ],
      tease:L('Riyadh is connected. Chapter 2 — Makkah & the West — is now open.','الرياض متصلة. الفصل الثاني — مكة والغرب — مفتوح الآن.')
    },
    { id:'w1', chapter:'west', n:1, date:L('2031','2031'), turns:6, turnLabel:L('Week','أسبوع'), turnStep:0, year:2031, budget:10, crews:3,
      title:L('Pilgrim Flow','انسيابية ضيوف الرحمن'),
      brief:L('Hajj season is approaching. Pilgrims land at King Abdulaziz Airport and must reach Makkah and the Holy Sites safely and comfortably, while Jeddah residents keep moving too.','موسم الحج يقترب. يصل ضيوف الرحمن إلى مطار الملك عبدالعزيز ويجب أن يصلوا إلى مكة والمشاعر بأمان وراحة، مع استمرار تنقل سكان جدة.'),
      objective:L('Airport and Holy Sites mobility ≥ 68 at the Hajj peak with public trust ≥ 55','تنقل المطار والمشاعر ≥ 68 في ذروة الحج مع ثقة عامة ≥ 55'),
      actions:['metro','brt','route','road','freq','priority','park'],
      visitors:{event:{kaia:[0,6,16,30,48,64], mashaer:[0,0,12,30,55,80]}},
      primary:S => { const v = Math.min(S.m.nodeMob.kaia, S.m.nodeMob.mashaer); return {value:v, target:68, met:v >= 68 && S.m.trust >= 55, fmt:Math.round(v), extra:S.m.trust < 55 ? 'trust' : null}; },
      optional:[
        {id:'shade', label:L('Shade corridor at the Holy Sites','ممر مظلل في المشاعر'), test:S => !!S.parks.mashaer},
        {id:'budget', label:L('Finish with 3 credits or more unspent','أنهِ بـ 3 أرصدة أو أكثر'), test:S => S.budget >= 3},
        {id:'jeddah', label:L('Jeddah Central mobility ≥ 60','تنقل وسط جدة ≥ 60'), test:S => S.m.nodeMob.jeddah >= 60}
      ],
      hints:[
        {when:S => S.m.nodeMob.mashaer < 68, text:L('The Holy Sites had one road. A shuttle or rail line from Makkah Central carries pilgrims without cars.','كان للمشاعر طريق واحد. حافلات ترددية أو قطار من وسط مكة ينقل الحجاج دون سيارات.')},
        {when:S => S.m.nodeMob.kaia < 68, text:L('Airport arrivals queued behind Jeddah traffic. A direct airport–Makkah line skips the city entirely.','تكدّس القادمون من المطار خلف زحام جدة. خط مباشر من المطار إلى مكة يتجاوز المدينة كليًا.')},
        {when:S => S.m.trust < 55, text:L('Residents felt left behind. Keep Jeddah moving as well.','شعر السكان بالتهميش. أبقِ جدة تتحرك أيضًا.')}
      ],
      tease:L('Next: winter rain bands head for Jeddah. Keep people safe and the city moving.','التالي: أمطار شتوية غزيرة تتجه إلى جدة. احمِ الناس وأبقِ المدينة تتحرك.')
    },
    { id:'w2', chapter:'west', n:2, date:L('2031','2031'), turns:6, turnLabel:L('Phase','مرحلة'), storm:true, hazard:'rain', year:2031, budget:10, crews:0,
      title:L('Jeddah Rainfall','أمطار جدة'),
      brief:L('Heavy rain bands will cross Jeddah from the sea over six phases. Low roads and underpasses flood. Open shelters before the water arrives, reroute traffic off roads that will flood, and keep essential services powered.','ستعبر أمطار غزيرة جدة من البحر خلال ست مراحل. تغمر المياه الطرق المنخفضة والأنفاق. افتح الملاجئ قبل وصول المياه، وحوّل الحركة عن الطرق التي ستُغمر، وأبقِ الخدمات الأساسية تعمل.'),
      objective:L('Protect ≥ 85% of people at risk and keep ≥ 65% of services running in hit districts','احمِ ≥ 85٪ من المعرّضين للخطر وحافظ على ≥ 65٪ من الخدمات في الأحياء المتأثرة'),
      actions:['shelter','medic','reroute','clear','generator','microgrid','alert'],
      stormPath:[[38.98,21.33],[39.12,21.40],[39.19,21.47],[39.20,21.56],[39.16,21.67],[39.12,21.78]], stormRadius:9, severity:[.5,.9,1,1,.8,.45],
      primary:S => { const ok = S.m.protected >= 85 && S.m.services >= 65; return {value:S.m.protected, target:85, met:ok, fmt:Math.round(S.m.protected) + '%', extra:S.m.services < 65 ? 'services' : null}; },
      optional:[
        {id:'stranded', label:L('Fewer than 2,000 vehicles stranded','أقل من 2000 مركبة عالقة'), test:S => S.stranded < 2},
        {id:'balad', label:L('Al-Balad heritage district fully protected','حماية كاملة لمنطقة البلد التاريخية'), test:S => S.nodes.balad.shelter && S.nodes.balad.medic},
        {id:'services', label:L('Services ≥ 80%','الخدمات ≥ 80٪'), test:S => S.m.services >= 80}
      ],
      hints:[
        {when:S => S.m.protected < 85, text:L('People were caught in the water. Follow the forecast cone and open shelters one phase ahead.','علق أشخاص في المياه. تابع مخروط التوقع وافتح الملاجئ قبل مرحلة.')},
        {when:S => S.stranded >= 2, text:L('Vehicles were trapped on flooding roads. Reroute before the rain reaches them.','علقت مركبات على طرق غمرتها المياه. حوّل الحركة قبل وصول المطر.')},
        {when:S => S.m.services < 65, text:L('Power dropped where most people live. Put generators in South and North Jeddah first.','انقطعت الكهرباء حيث يسكن معظم الناس. ضع المولدات في جنوب وشمال جدة أولًا.')}
      ],
      tease:L('The West is ready. NEOM, the East and the South are open too.','الغرب جاهز. نيوم والشرقية والجنوب مفتوحة أيضًا.')
    },

    // ===== Riyadh arc C — Global supply-chain hub =====
    { id:'c1', chapter:'riyadh', arc:'C', hud:['freight','reliability'], n:4, date:L('2028','2028'), turns:6, turnLabel:L('Month','شهر'), turnStep:2, year:2028, budget:16, crews:2,
      title:L('Three Continents, One Network','ثلاث قارات، شبكة واحدة'),
      brief:L('Containers arrive from the Gulf ports (Asia), the Red Sea ports (Africa and Europe) and air cargo at King Salman Airport. Move them reliably to Riyadh Dry Port. Trucks on city roads cost trust; rail costs more but is reliable.','تصل الحاويات من موانئ الخليج (آسيا) وموانئ البحر الأحمر (أفريقيا وأوروبا) والشحن الجوي في مطار الملك سلمان. انقلها بموثوقية إلى ميناء الرياض الجاف. الشاحنات في طرق المدينة تكلف الثقة؛ القطار أغلى لكنه موثوق.'),
      objective:L('Move ≥ 85% of freight demand with reliability ≥ 70 and public trust ≥ 52','انقل ≥ 85٪ من طلب الشحن بموثوقية ≥ 70 وثقة عامة ≥ 52'),
      actions:['freight','warehouse','digital','road','hub','brt'],
      freight:{demand:{eastgate:[2,2.5,3,3.5,4,4.5], westgate:[1.5,2,2.5,3,3.5,4], ksip:[1,1.2,1.5,1.8,2.1,2.4]}},
      primary:S => { const v = S.m.freightShare * 100, ok = v >= 85 && S.m.reliability >= 70 && S.m.trust >= 52; return {value:v, target:85, met:ok, fmt:Math.round(v) + '%', extra:S.m.reliability < 70 ? 'reliability' : S.m.trust < 52 ? 'trust' : null}; },
      optional:[
        {id:'three', label:L('All three gateways on rail','البوابات الثلاث على القطار'), test:S => Object.values(S.m.freight || {}).every(f => f.mode === 'rail')},
        {id:'digital', label:L('Digital logistics platform running at the end','تشغيل منصة اللوجستيات الرقمية في النهاية'), test:S => !!S.ops.digital},
        {id:'budget', label:L('Finish with 3 credits or more unspent','أنهِ بـ 3 أرصدة أو أكثر'), test:S => S.budget >= 3}
      ],
      hints:[
        {when:S => S.m.freightShare < .85, text:L('Freight queued on congested roads. A freight rail link carries far more than spare road space.','تكدّس الشحن على طرق مزدحمة. خط قطار الشحن ينقل أكثر بكثير من السعة الفائضة في الطرق.')},
        {when:S => S.m.reliability < 70, text:L('Reliability was low. Rail, a digital platform and warehouses each add reliability.','كانت الموثوقية منخفضة. القطار والمنصة الرقمية والمستودعات تضيف كل منها موثوقية.')},
        {when:S => S.m.trust < 52, text:L('Too many trucks crossed the city. Moving freight to rail restores trust.','عبرت شاحنات كثيرة المدينة. نقل الشحن إلى القطار يعيد الثقة.')}
      ],
      tease:L('Next: skills are the bottleneck. Train the people who will build and run the new projects.','التالي: المهارات هي عنق الزجاجة. درّب من سيبنون المشاريع الجديدة ويشغلونها.')
    },
    // ===== Riyadh arc E — Human capital =====
    { id:'t1', chapter:'riyadh', arc:'E', hud:['skilled','delivery'], n:5, date:L('2028','2028'), turns:8, turnLabel:L('Month','شهر'), turnStep:2, year:2028, budget:26, crews:4, skilledSystems:true,
      title:L('Talent Powers Delivery','المواهب تدفع الإنجاز'),
      brief:L('Three projects — a solar plant, the dry-port logistics centre and an advanced-industry campus in New Murabba — can be built by general crews, but their systems need skilled crews. You start with none. Academies take time before they train anyone, so plan the pipeline.','ثلاثة مشاريع — محطة شمسية ومركز لوجستي في الميناء الجاف وحرم للصناعات المتقدمة في المربع الجديد — تبنيها الأطقم العامة، لكن أنظمتها تحتاج أطقمًا ماهرة. تبدأ دون أي طاقم ماهر. الأكاديميات تحتاج وقتًا قبل أن تدرّب أحدًا، فخطط للمسار.'),
      objective:L('Open at least 2 of the 3 projects by the final turn with public trust ≥ 52','افتتح مشروعين على الأقل من الثلاثة قبل الجولة الأخيرة مع ثقة عامة ≥ 52'),
      actions:['advance','academy','apprentice','research','contract','fasttrack','park','brt'],
      projects:{solar:{node:'sudair'}, logistics:{node:'dryport'}, industry:{node:'murabba'}},
      primary:S => { const n = Object.values(S.projects).filter(p => p.done).length; return {value:n, target:2, met:n >= 2 && S.m.trust >= 52, fmt:n + '/3', extra:S.m.trust < 52 ? 'trust' : null}; },
      optional:[
        {id:'all3', label:L('All three projects open','افتتاح المشاريع الثلاثة'), test:S => Object.values(S.projects).every(p => p.done)},
        {id:'lab', label:L('Research lab opened','افتتاح مختبر الأبحاث'), test:S => !!S.research},
        {id:'jobs', label:L('Apprenticeships running at the end','استمرار التلمذة المهنية في النهاية'), test:S => !!S.ops.apprentice}
      ],
      hints:[
        {when:S => Object.values(S.projects).some(p => p.stage === 2 && !p.done), text:L('Projects reached their systems stage but no skilled crew was free. Open an academy in the first turns, because graduates arrive later.','وصلت المشاريع إلى مرحلة الأنظمة دون طاقم ماهر متاح. افتح أكاديمية في الجولات الأولى لأن الخريجين يصلون لاحقًا.')},
        {when:S => S.m.trust < 52, text:L('Construction disruption wore down trust. A green corridor helps.','أرهق إزعاج البناء الثقة. ممر أخضر يساعد.')}
      ],
      tease:L('Next: prepare Qiddiya for private investment — and choose between two very different offers.','التالي: جهّز القدية للاستثمار الخاص — واختر بين عرضين مختلفين تمامًا.')
    },
    // ===== Riyadh arc D — Private-sector opportunity =====
    { id:'d1', chapter:'riyadh', arc:'D', hud:['readiness'], n:6, date:L('2029','2029'), turns:7, turnLabel:L('Month','شهر'), turnStep:2, year:2029, budget:14, crews:2,
      invest:{node:'qiddiya'},
      title:L('Unlock the Investment','أطلق الاستثمار'),
      brief:L('Qiddiya needs a private partner. Investors look for four things: transit access, local talent, clear processes and public confidence. Raise readiness to 62 with transit access and two fictional offers appear: fast capital, or a slower local partnership that builds skills and jobs. Neither represents a real investor.','تحتاج القدية إلى شريك خاص. يبحث المستثمرون عن أربعة أمور: الوصول بالنقل العام والمواهب المحلية والإجراءات الواضحة وثقة الجمهور. ارفع الجاهزية إلى 62 مع وصول بالنقل العام ليظهر عرضان خياليان: رأس مال سريع، أو شراكة محلية أبطأ تبني المهارات والوظائف. لا يمثل أي منهما مستثمرًا حقيقيًا.'),
      objective:L('Secure an offer and open the Qiddiya project by the final turn, with trust ≥ 55 and credits ≥ 0','أمّن عرضًا وافتتح مشروع القدية قبل الجولة الأخيرة مع ثقة ≥ 55 وأرصدة ≥ 0'),
      actions:['brt','route','metro','academy','apprentice','permits','framework','incentive','offerA','offerB','park'],
      primary:S => { const ok = !!S.invest.opened && S.m.trust >= 55 && S.budget >= 0; return {value:S.m.readiness || 0, target:62, met:ok, fmt:(S.invest.opened ? '✓ ' : '') + Math.round(S.m.readiness || 0), extra:!S.invest.opened ? 'notOpened' : null}; },
      optional:[
        {id:'local', label:L('Chose the local-partnership offer','اختيار عرض الشراكة المحلية'), test:S => S.invest.offer === 'B'},
        {id:'noIncentive', label:L('Secured an offer without a tax incentive','تأمين عرض دون حافز ضريبي'), test:S => !!S.invest.offer && !S.invest.did_incentive},
        {id:'budget', label:L('Finish with 5 credits or more','أنهِ بـ 5 أرصدة أو أكثر'), test:S => S.budget >= 5}
      ],
      hints:[
        {when:S => !transitPath(S, 'qiddiya'), text:L('Qiddiya had no transit access. Link Diriyah to Qiddiya and Diriyah to the City Centre.','لم يكن للقدية وصول بالنقل العام. اربط الدرعية بالقدية والدرعية بوسط المدينة.')},
        {when:S => (S.m.readinessParts || {}).process < 40, text:L('Processes were unclear. One-stop permits act quickly; the investor framework takes longer.','كانت الإجراءات غير واضحة. التراخيص الموحدة سريعة الأثر؛ إطار المستثمر يستغرق وقتًا أطول.')},
        {when:S => S.invest.offer === 'B' && !S.invest.opened, text:L('The local partnership needs 2 turns to open. Accept it earlier next time.','الشراكة المحلية تحتاج جولتين لتفتتح. اقبلها مبكرًا في المرة القادمة.')}
      ],
      tease:L('Next: deliver three linked flagship projects with the capabilities you have built.','التالي: أنجز ثلاثة مشاريع رائدة مترابطة بالقدرات التي بنيتها.')
    },
    // ===== Riyadh arc A finale — Connect the Momentum (Kingdom board) =====
    { id:'a1', chapter:'riyadh', arc:'A', hud:['mobility'], board:'kingdom', n:9, date:L('2030','2030'), turns:5, turnLabel:L('Half-year','نصف سنة'), turnStep:6, year:2028, budget:22, crews:3,
      names:{metro:L('High-speed rail line','خط قطار سريع'), brt:L('Express coach corridor','ممر حافلات سريعة بين المدن')},
      title:L('Connect the Momentum','اربط الزخم'),
      brief:L('Riyadh’s projects gain momentum when they connect to projects in other regions. Before the 2030 milestone, link Riyadh by transit to both the Western region (Jeddah) and the Eastern Province (Dammam) without exhausting your credits or losing public trust.','تكتسب مشاريع الرياض زخمًا عندما ترتبط بمشاريع في مناطق أخرى. قبل محطة 2030 اربط الرياض بالنقل العام بالمنطقة الغربية (جدة) والمنطقة الشرقية (الدمام) دون استنزاف أرصدتك أو خسارة ثقة الجمهور.'),
      objective:L('Jeddah and Dammam both connected to Riyadh by transit, with trust ≥ 50 and credits ≥ 0','ربط جدة والدمام بالرياض بالنقل العام مع ثقة ≥ 50 وأرصدة ≥ 0'),
      actions:['metro','brt','route','road','freq','park'],
      visitors:{event:{makkah:[20,25,30,35,40], madinah:[8,10,12,14,16]}},
      primary:S => { const n = (transitPath(S, 'jeddah') ? 1 : 0) + (transitPath(S, 'dammam') ? 1 : 0); return {value:n + Math.max(0, (S.m.mobility - 45) / 20), target:2, met:n === 2 && S.m.trust >= 50 && S.budget >= 0, fmt:n + '/2', extra:S.m.trust < 50 ? 'trust' : null}; },
      optional:[
        {id:'hsr', label:L('Jeddah within 5 hours of Riyadh by transit','جدة ضمن 5 ساعات من الرياض بالنقل العام'), test:S => { const p = transitPath(S, 'jeddah'); return !!p && p.time <= 300; }},
        {id:'third', label:L('A third region connected (North or South)','ربط منطقة ثالثة (الشمال أو الجنوب)'), test:S => !!(transitPath(S, 'qassim') || transitPath(S, 'abha'))},
        {id:'budget', label:L('Finish with 5 credits or more','أنهِ بـ 5 أرصدة أو أكثر'), test:S => S.budget >= 5}
      ],
      hints:[
        {when:S => !transitPath(S, 'jeddah') || !transitPath(S, 'dammam'), text:L('One region stayed unconnected. High-speed rail takes 4 half-years; express coaches take one.','بقيت منطقة غير متصلة. القطار السريع يستغرق 4 أنصاف سنة؛ الحافلات السريعة تستغرق نصف سنة.')},
        {when:S => S.budget < 0, text:L('Credits ran out. Mix one rail line with a coach corridor.','نفدت الأرصدة. ادمج خط قطار واحدًا مع ممر حافلات.')}
      ],
      tease:L('Riyadh’s arcs are complete. The other regions are open for your strategy.','اكتملت مسارات الرياض. المناطق الأخرى مفتوحة لاستراتيجيتك.')
    },
    // ======================= NEOM & NORTHWEST =======================
    { id:'n1', chapter:'neom', n:1, date:L('2031','2031'), turns:8, turnLabel:L('Month','شهر'), turnStep:2, year:2031, budget:30, crews:4,
      title:L('Building from Zero','البناء من الصفر'),
      brief:L('Everything in NEOM arrives by sea at Oxagon Port. Open the first module of THE LINE, the Green Hydrogen plant and Trojena. THE LINE needs the hydrogen plant’s structure first, and Trojena can only open once transit reaches it through THE LINE.','كل شيء في نيوم يصل بحرًا إلى ميناء أوكساجون. افتتح الوحدة الأولى من ذا لاين ومصنع الهيدروجين الأخضر وتروجينا. ذا لاين يحتاج هيكل مصنع الهيدروجين أولًا، ولا تُفتتح تروجينا إلا بوصول النقل العام إليها عبر ذا لاين.'),
      objective:L('Open all three projects by the final turn with public trust ≥ 50','افتتح المشاريع الثلاثة قبل الجولة الأخيرة مع ثقة عامة ≥ 50'),
      actions:['advance','road','brt','route','metro','hub','night','contract','fasttrack','park'],
      projects:{line:{node:'line', dep:{systems:{proj:'hydrogen', stage:'structure'}}}, hydrogen:{node:'hydrogen'}, trojena:{node:'trojena', dep:{systems:{transit:'trojena'}}}},
      primary:S => { const n = Object.values(S.projects).filter(p => p.done).length; const early = n === 3 && S.allDoneTurn != null ? (S.maxTurns - S.allDoneTurn) * .5 : 0; return {value:n + early, target:3, met:n === 3 && S.m.trust >= 50, fmt:n + '/3', extra:S.m.trust < 50 ? 'trust' : null}; },
      optional:[
        {id:'early', label:L('All three open with a turn to spare','افتتاح الثلاثة قبل الموعد بجولة'), test:S => S.allDoneTurn != null && S.allDoneTurn < S.maxTurns},
        {id:'budget', label:L('Finish with 3 credits or more unspent','أنهِ بـ 3 أرصدة أو أكثر'), test:S => S.budget >= 3},
        {id:'rail', label:L('THE LINE within 90 minutes of the port by transit','ذا لاين ضمن 90 دقيقة من الميناء بالنقل العام'), test:S => { const p = transitPath(S, 'line'); return !!p && p.time <= 90; }}
      ],
      hints:[
        {when:S => Object.values(S.projects).some(p => p.waitMaterials > 1), text:L('Structures waited for materials from the port. Roads to Trojena are narrow, so a logistics hub, night deliveries or a wider road keep supplies moving.','انتظرت الهياكل المواد من الميناء. الطرق إلى تروجينا ضيقة؛ مركز لوجستي أو التوصيل الليلي أو توسعة الطريق تُبقي الإمدادات تتدفق.')},
        {when:S => !S.projects.trojena.done && !transitPath(S, 'trojena'), text:L('Trojena needs transit to open. Connect the port to THE LINE, then THE LINE to Trojena.','تروجينا تحتاج نقلًا عامًا لتُفتتح. اربط الميناء بذا لاين، ثم ذا لاين بتروجينا.')},
        {when:S => true, text:L('Start the hydrogen plant early, because THE LINE depends on it.','ابدأ مصنع الهيدروجين مبكرًا، فذا لاين يعتمد عليه.')}
      ],
      tease:L('Next: NEOM wants to run on clean power alone — can the grid stay on at night?','التالي: نيوم تريد العمل بالطاقة النظيفة وحدها — هل تبقى الشبكة تعمل ليلًا؟')
    },
    { id:'n2', chapter:'neom', n:2, date:L('2032','2032'), turns:7, turnLabel:L('Month','شهر'), turnStep:2, year:2032, budget:24, crews:3,
      title:L('Clean Power, Day and Night','طاقة نظيفة ليلًا ونهارًا'),
      brief:L('The hydrogen plant and THE LINE are drawing more power every turn, and the old diesel backup is small. Keep the lights on at the evening peak with at least half the power from renewables.','مصنع الهيدروجين وذا لاين يستهلكان طاقة أكثر كل جولة، والاحتياطي القديم بالديزل صغير. أبقِ الأنوار مضاءة في ذروة المساء مع نصف الطاقة على الأقل من المصادر المتجددة.'),
      objective:L('No outages in the last 3 turns and renewable share ≥ 50%','لا انقطاعات في آخر 3 جولات وحصة المتجددة ≥ 50٪'),
      actions:['gridlink','solar','wind','storage','peaker','retrofit','demand','brt','route','park'],
      energy:{fossil:5.6, industry:1.5, industryGrowth:.3}, growth:.05, events:{3:{industry:1.0, text:L('The first electrolyser line starts: +1 unit of industrial demand.','بدء تشغيل أول خط للتحليل الكهربائي: زيادة وحدة واحدة في الطلب الصناعي.')}},
      primary:S => { const recent = S.outageHistory.slice(-3).every(x => !x); const v = S.m.renewShare * 100; return {value:v, target:50, met:recent && v >= 50, fmt:Math.round(v) + '%', extra:recent ? null : 'outage'}; },
      optional:[
        {id:'nopeaker', label:L('No gas peakers built','بدون محطات ذروة غازية'), test:S => !S.peakers},
        {id:'renew70', label:L('Renewable share ≥ 70%','حصة المتجددة ≥ 70٪'), test:S => S.m.renewShare >= .7},
        {id:'trust', label:L('Public trust ≥ 60','الثقة العامة ≥ 60'), test:S => S.m.trust >= 60}
      ],
      hints:[
        {when:S => S.outageHistory.slice(-3).some(x => x), text:L('The evening peak went dark. Solar fades at sunset, so wind farms, batteries or demand response carry the night.','أظلمت ذروة المساء. تخفت الشمس عند الغروب؛ مزارع الرياح أو البطاريات أو الاستجابة للطلب تحمل الليل.')},
        {when:S => S.m.renewShare < .5, text:L('Too much power still came from diesel. Connect the renewables site early and build more generation.','ما زالت الطاقة تأتي كثيرًا من الديزل. اربط موقع الطاقة المتجددة مبكرًا وابنِ مزيدًا من التوليد.')}
      ],
      tease:L('NEOM runs on sun and wind. The East’s industrial heartland faces the same challenge at a far bigger scale.','نيوم تعمل بالشمس والرياح. القلب الصناعي في الشرقية يواجه التحدي نفسه على نطاق أكبر بكثير.')
    },
    // ============================ THE EAST ===========================
    { id:'e1', chapter:'east', n:1, date:L('2031','2031'), turns:7, turnLabel:L('Month','شهر'), turnStep:2, year:2031, budget:26, crews:3,
      title:L('Industrial Energy Transition','تحوّل الطاقة الصناعي'),
      brief:L('Jubail’s industry and the growing Dammam–Khobar metro area need more power, and an old oil-fired plant retires on turn 4. Keep supply reliable while cutting emissions.','صناعة الجبيل ومنطقة الدمام–الخبر المتنامية تحتاج طاقة أكثر، ومحطة قديمة تعمل بالنفط تتقاعد في الجولة 4. حافظ على إمداد موثوق مع خفض الانبعاثات.'),
      objective:L('No outages in the last 3 turns and sustainability ≥ 60','لا انقطاعات في آخر 3 جولات والاستدامة ≥ 60'),
      actions:['gridlink','solar','wind','storage','peaker','retrofit','demand','metro','brt','route','park'],
      energy:{fossil:13, industry:3, industryGrowth:.25}, growth:.03, events:{4:{retire:2.5, text:L('The old oil-fired plant retires: 2.5 units of reliable supply are gone.','تقاعد المحطة القديمة العاملة بالنفط: خسارة 2.5 وحدة من الإمداد الموثوق.')}},
      primary:S => { const recent = S.outageHistory.slice(-3).every(x => !x); return {value:S.m.sustainability, target:60, met:recent && S.m.sustainability >= 60, fmt:Math.round(S.m.sustainability), extra:recent ? null : 'outage'}; },
      optional:[
        {id:'renew', label:L('Renewable share ≥ 30%','حصة المتجددة ≥ 30٪'), test:S => S.m.renewShare >= .3},
        {id:'transit', label:L('Khobar connected to Dammam by transit','ربط الخبر بالدمام بالنقل العام'), test:S => !!transitPath(S, 'khobar')},
        {id:'budget', label:L('Finish with 3 credits or more unspent','أنهِ بـ 3 أرصدة أو أكثر'), test:S => S.budget >= 3}
      ],
      hints:[
        {when:S => S.outageHistory.slice(-3).some(x => x), text:L('Supply fell short after the old plant retired. Plan replacement capacity before turn 4, not after.','نقص الإمداد بعد تقاعد المحطة القديمة. خطط لسعة بديلة قبل الجولة 4 لا بعدها.')},
        {when:S => S.m.sustainability < 60, text:L('Emissions stayed high. Renewables plus transit between Dammam and Khobar lower them together.','ظلت الانبعاثات مرتفعة. المتجددة مع النقل العام بين الدمام والخبر تخفضانها معًا.')}
      ],
      tease:L('Next: a summer shamal dust storm sweeps down the Gulf coast.','التالي: عاصفة شمال ترابية صيفية تجتاح ساحل الخليج.')
    },
    { id:'e2', chapter:'east', n:2, date:L('2032','2032'), turns:6, turnLabel:L('Phase','مرحلة'), storm:true, hazard:'dust', year:2032, budget:13, crews:0,
      title:L('Shamal Dust Storm','عاصفة الشمال الترابية'),
      brief:L('A shamal wind drives dust from the north-west down the coast, from Jubail through Qatif and Dammam to Khobar. Shelter people before it arrives, reroute traffic off roads it will close, and keep power on where most people live.','رياح الشمال تدفع الغبار من الشمال الغربي على طول الساحل من الجبيل عبر القطيف والدمام إلى الخبر. احمِ الناس قبل وصولها، وحوّل الحركة عن الطرق التي ستُغلق، وأبقِ الكهرباء حيث يسكن معظم الناس.'),
      objective:L('Protect ≥ 85% of people at risk and keep ≥ 65% of services running in hit districts','احمِ ≥ 85٪ من المعرّضين للخطر وحافظ على ≥ 65٪ من الخدمات في الأحياء المتأثرة'),
      actions:['shelter','medic','reroute','clear','generator','microgrid','alert'],
      stormPath:[[49.42,27.18],[49.64,27.00],[49.92,26.70],[50.04,26.52],[50.15,26.33],[50.26,26.17]], stormRadius:12, severity:[.5,.85,1,1,.8,.45],
      primary:S => { const ok = S.m.protected >= 85 && S.m.services >= 65; return {value:S.m.protected, target:85, met:ok, fmt:Math.round(S.m.protected) + '%', extra:S.m.services < 65 ? 'services' : null}; },
      optional:[
        {id:'stranded', label:L('Fewer than 2,000 vehicles stranded','أقل من 2000 مركبة عالقة'), test:S => S.stranded < 2},
        {id:'khobar', label:L('Al Khobar fully protected','حماية كاملة للخبر'), test:S => S.nodes.khobar.shelter && S.nodes.khobar.medic},
        {id:'services', label:L('Services ≥ 80%','الخدمات ≥ 80٪'), test:S => S.m.services >= 80}
      ],
      hints:[
        {when:S => S.m.protected < 85, text:L('People were caught outdoors. The storm moves south-east, so shelter the next district before it arrives.','بقي أشخاص في الخارج. العاصفة تتحرك جنوبًا شرقًا؛ احمِ الحي التالي قبل وصولها.')},
        {when:S => S.stranded >= 2, text:L('Vehicles were caught on closed roads. Reroute ahead of the storm.','علقت مركبات على طرق مغلقة. حوّل الحركة قبل وصول العاصفة.')},
        {when:S => S.m.services < 65, text:L('Power failed in Khobar and Qatif. Put generators where most people live.','انقطعت الكهرباء في الخبر والقطيف. ضع المولدات حيث يسكن معظم الناس.')}
      ],
      tease:L('The East is resilient. Next, the mountains of Aseer and the southern coast.','الشرقية مرنة. التالي: جبال عسير والساحل الجنوبي.')
    },
    // ========================== ASEER & SOUTH ========================
    { id:'s1', chapter:'south', n:1, date:L('2031','2031'), turns:6, turnLabel:L('Month','شهر'), turnStep:1, startMonth:4, year:2031, budget:18, crews:3,
      title:L('Mountain Summer','صيف الجبال'),
      brief:L('Summer visitors head for Aseer’s cool mountains, but the roads are steep and narrow. Build places to stay and ways to reach Soudah and Rijal Almaa, while keeping Abha and Khamis Mushait comfortable for residents.','زوار الصيف يتجهون إلى جبال عسير الباردة، لكن الطرق شديدة الانحدار وضيقة. ابنِ أماكن للإقامة وطرقًا للوصول إلى السودة ورجال ألمع، مع إبقاء أبها وخميس مشيط مريحتين للسكان.'),
      objective:L('Host ≥ 75k visitors at the summer peak with public trust ≥ 56','استضف ≥ 75 ألف زائر في ذروة الصيف مع ثقة عامة ≥ 56'),
      actions:['hotel','metro','brt','route','road','park','housing','freq','priority','hub'],
      visitors:{season:[25,40,55,70,85,95]},
      primary:S => { const ok = S.m.visitorsServed >= 75 && S.m.trust >= 56; return {value:S.m.visitorsServed, target:75, met:ok, fmt:Math.round(S.m.visitorsServed) + 'k', extra:S.m.trust < 56 ? 'trust' : null}; },
      optional:[
        {id:'soudah', label:L('Visitors staying at Soudah Peaks','زوار يقيمون في قمم السودة'), test:S => S.nodes.soudah.hotel > 0 && S.m.nodeMob.soudah >= 50},
        {id:'cable', label:L('Soudah reachable by transit (cable car or shuttle)','الوصول إلى السودة بالنقل العام (تلفريك أو حافلات)'), test:S => !!transitPath(S, 'soudah')},
        {id:'sus', label:L('Sustainability ≥ 55','الاستدامة ≥ 55'), test:S => S.m.sustainability >= 55}
      ],
      hints:[
        {when:S => S.m.hotelsUnserved > 0, text:L('Mountain hotels stayed half empty because the roads up were jammed. Beds only fill when mobility is 50+.','بقيت فنادق الجبال نصف فارغة لازدحام الطرق الصاعدة؛ الأسرّة تمتلئ فقط عندما يكون التنقل 50+.')},
        {when:S => S.m.trust < 56, text:L('Residents felt the summer crowds. A green corridor or better transit in Abha helps.','شعر السكان بزحام الصيف. ممر أخضر أو نقل أفضل في أبها يساعد.')},
        {when:S => S.m.visitorsServed < 75, text:L('There were not enough beds. Start hospitality districts early, because they take 2 turns.','لم تكفِ الأسرّة. ابدأ أحياء الضيافة مبكرًا لأنها تستغرق جولتين.')}
      ],
      tease:L('Next: autumn rains bring flash floods from the escarpment down to Jazan.','التالي: أمطار الخريف تجلب سيولًا مفاجئة من الجرف إلى جازان.')
    },
    { id:'s2', chapter:'south', n:2, date:L('2031','2031'), turns:6, turnLabel:L('Phase','مرحلة'), storm:true, hazard:'rain', year:2031, budget:9, crews:0,
      title:L('Flash Floods: Jazan to Abha','سيول مفاجئة: من جازان إلى أبها'),
      brief:L('Heavy rain moves from the Jazan coast up the escarpment to Abha and Khamis Mushait. Wadis flood fast. Shelter people ahead of the water, close roads before they flood, and keep services running.','أمطار غزيرة تتحرك من ساحل جازان صعودًا عبر الجرف إلى أبها وخميس مشيط، والأودية تفيض بسرعة. احمِ الناس قبل وصول المياه، وأغلق الطرق قبل أن تُغمر، وأبقِ الخدمات تعمل.'),
      objective:L('Protect ≥ 85% of people at risk and keep ≥ 65% of services running in hit districts','احمِ ≥ 85٪ من المعرّضين للخطر وحافظ على ≥ 65٪ من الخدمات في الأحياء المتأثرة'),
      actions:['shelter','medic','reroute','clear','generator','microgrid','alert'],
      stormPath:[[42.50,16.80],[42.56,16.95],[42.55,17.30],[42.53,17.85],[42.60,18.22],[42.73,18.31]], stormRadius:14, severity:[.55,.9,.8,.9,1,.6],
      primary:S => { const ok = S.m.protected >= 85 && S.m.services >= 65; return {value:S.m.protected, target:85, met:ok, fmt:Math.round(S.m.protected) + '%', extra:S.m.services < 65 ? 'services' : null}; },
      optional:[
        {id:'stranded', label:L('Fewer than 2,000 vehicles stranded','أقل من 2000 مركبة عالقة'), test:S => S.stranded < 2},
        {id:'jazan', label:L('Jazan city fully protected','حماية كاملة لمدينة جازان'), test:S => S.nodes.jazanc.shelter && S.nodes.jazanc.medic},
        {id:'services', label:L('Services ≥ 80%','الخدمات ≥ 80٪'), test:S => S.m.services >= 80}
      ],
      hints:[
        {when:S => S.m.protected < 85, text:L('People were caught by fast-rising water. The rain climbs the escarpment, so shelter Khamis and Abha before it reaches them.','علق أشخاص في مياه ارتفعت بسرعة. المطر يصعد الجرف؛ احمِ خميس مشيط وأبها قبل وصوله.')},
        {when:S => S.stranded >= 2, text:L('Vehicles were trapped on the escarpment road. Close it before the rain arrives.','علقت مركبات على طريق الجرف. أغلقه قبل وصول المطر.')},
        {when:S => S.m.services < 65, text:L('Services failed in Khamis Mushait. Keep generators for the biggest districts.','تعطلت الخدمات في خميس مشيط. احتفظ بالمولدات لأكبر الأحياء.')}
      ],
      tease:L('Every region has its challenge. Beyond 2030, connect the whole Kingdom.','لكل منطقة تحديها. ما بعد 2030: اربط المملكة كلها.')
    },
    // ========================== BEYOND 2030 ==========================
    { id:'k1', chapter:'future', board:'kingdom', n:1, date:L('2035','2035'), turns:8, turnLabel:L('Half-year','نصف سنة'), turnStep:6, year:2031, budget:40, crews:3,
      title:L('Kingdom Connect 2035','ربط المملكة 2035'),
      brief:L('A future chapter after the 2030 milestone. Connect the regions you have transformed: high-speed rail and express coaches between Riyadh, the Holy Cities, the East, the North and the South. Every corridor competes for the same budget and crews.','فصل مستقبلي بعد محطة 2030. اربط المناطق التي حوّلتها: قطار سريع وحافلات سريعة بين الرياض والمدن المقدسة والشرقية والشمال والجنوب. كل ممر يتنافس على الميزانية والأطقم نفسها.'),
      objective:L('National mobility ≥ 58 and resilience ≥ 60 by 2035','التنقل الوطني ≥ 58 والمرونة ≥ 60 بحلول 2035'),
      names:{metro:L('High-speed rail line','خط قطار سريع'), brt:L('Express coach corridor','ممر حافلات سريعة بين المدن')},
      actions:['metro','brt','route','road','freq','park'],
      visitors:{event:{makkah:[20,25,30,35,40,45,50,55], madinah:[8,10,12,14,16,18,20,22], alula:[2,3,4,5,6,7,8,9]}},
      primary:S => { const ok = S.m.mobility >= 58 && S.m.resilience >= 60; return {value:S.m.mobility, target:58, met:ok, fmt:Math.round(S.m.mobility), extra:S.m.resilience < 60 ? 'resilience' : null}; },
      optional:[
        {id:'landbridge', label:L('Land bridge: Jeddah and Dammam both within 5 hours of Riyadh by transit','الجسر البري: جدة والدمام ضمن 5 ساعات من الرياض بالنقل العام'), test:S => ['jeddah','dammam'].every(n => { const p = transitPath(S, n); return !!p && p.time <= 300; })},
        {id:'south', label:L('The South connected by rail or coach','ربط الجنوب بالقطار أو الحافلات'), test:S => !!transitPath(S, 'abha')},
        {id:'budget', label:L('Finish with 5 credits or more unspent','أنهِ بـ 5 أرصدة أو أكثر'), test:S => S.budget >= 5}
      ],
      hints:[
        {when:S => S.m.mobility < 58, text:L('Long drives dominated. The busiest corridors — Riyadh with Jeddah–Makkah and Dammam — gain the most from rail.','غلبت الرحلات الطويلة بالسيارة. الممرات الأكثر ازدحامًا — الرياض مع جدة ومكة والدمام — تستفيد أكثر من القطار.')},
        {when:S => S.m.resilience < 60, text:L('Too many regions depended on a single road. Give more of them a second, transit, route.','اعتمدت مناطق كثيرة على طريق واحد. امنح المزيد منها مسارًا ثانيًا بالنقل العام.')}
      ],
      tease:L('The Kingdom is connected. Replay any mission with the daily and weekly challenges for fresh constraints.','المملكة متصلة. أعد لعب أي مهمة مع التحديات اليومية والأسبوعية لقيود جديدة.')
    }
  ];
  const CHAPTERS = [
    {id:'riyadh', name:L('Riyadh — The Connected City','الرياض — المدينة المتصلة'), status:'play', tier:'free', missions:['m1','m2','m3','c1','t1','d1','m4','m5','a1']},
    {id:'west', name:L('Makkah & the West — Pilgrim Flow','مكة والغرب — انسيابية ضيوف الرحمن'), status:'play', tier:'expansion', unlock:'m5', missions:['w1','w2'], blurb:L('Pilgrim flow to the Holy Sites and Jeddah rainfall. Unlocked by completing Riyadh.','انسيابية الحجاج إلى المشاعر وأمطار جدة. يُفتح بإكمال الرياض.')},
    {id:'neom', name:L('NEOM & the Northwest — Building from Zero','نيوم والشمال الغربي — البناء من الصفر'), status:'play', tier:'expansion', unlock:'m5', missions:['n1','n2'], blurb:L('Supply chains from the port, linked megaprojects and 24-hour clean power.','سلاسل إمداد من الميناء ومشاريع كبرى مترابطة وطاقة نظيفة على مدار الساعة.')},
    {id:'east', name:L('The East — Energy Transition','الشرقية — تحوّل الطاقة'), status:'play', tier:'expansion', unlock:'m5', missions:['e1','e2'], blurb:L('Industrial power, a retiring plant and a shamal dust storm.','طاقة صناعية ومحطة تتقاعد وعاصفة شمال ترابية.')},
    {id:'south', name:L('Aseer & the South — Mountains and Coast','عسير والجنوب — الجبال والساحل'), status:'play', tier:'expansion', unlock:'m5', missions:['s1','s2'], blurb:L('Mountain tourism on steep roads and flash floods from the escarpment.','سياحة جبلية على طرق شديدة الانحدار وسيول مفاجئة من الجرف.')},
    {id:'future', name:L('Beyond 2030 — Future Chapter','ما بعد 2030 — فصل المستقبل'), status:'play', tier:'expansion', unlockAny:['w2','n2','e2','s2'], unlockCount:2, missions:['k1'], blurb:L('Connect the whole Kingdom after the 2030 milestone. Opens after two regional chapters are complete.','اربط المملكة كلها بعد محطة 2030. يُفتح بعد إكمال فصلين إقليميين.')}
  ];
  const DAILY_MODS = [
    {id:'tight', name:L('Tight budget: −25%','ميزانية محدودة: −25٪'), apply:S => { S.budget = +(S.budget * .75).toFixed(1); S.budget0 = S.budget; }},
    {id:'heat', name:L('Heat wave: every build takes +1 turn','موجة حر: كل مشروع يستغرق جولة إضافية'), apply:S => { S.mods.heat = true; }},
    {id:'surge', name:L('Visitor surge: +25% demand','تدفق زوار: +25٪ طلب'), apply:S => { S.mods.surge = 1.25; }},
    {id:'noroads', name:L('Car-free pledge: no road widening','تعهد بلا سيارات: لا توسعة طرق'), apply:S => { S.mods.noroads = true; }},
    {id:'crew', name:L('Crews on loan: −1 crew','أطقم معارة: طاقم أقل'), apply:S => { S.mods.crew = -1; }}
  ];

  /* ============================== STATE ============================== */
  let S = null, W = null;
  const M = id => MISSIONS.find(m => m.id === id);
  const tIdx = () => Math.min(S.turn, S.maxTurns) - 1;
  function linkId(kind, a, b){ return `${kind}:${a}-${b}`; }
  function makeLink(kind, a, b, built){
    const k = km(NODE_DEF[a], NODE_DEF[b]);
    const base = {road:{cap:0, speed:1}, metro:{cap:8}, brt:{cap:3}, freight:{cap:5}}[kind];
    return {id:linkId(kind, a, b), kind, a, b, km:+k.toFixed(1), cap:base.cap, built, progress:built ? 1 : 0, closed:0, widen:0, busLane:0, load:0};
  }
  function init(missionId, opts = {}){
    const m = M(missionId); const up = opts.upgrades || []; useBoard(m.board || m.chapter || 'riyadh');
    S = {v:1, board:BOARD, mission:m.id, turn:1, maxTurns:m.turns, budget:m.budget, budget0:m.budget, crews0:m.crews + (up.includes('talent') && !m.storm ? 1 : 0),
      upgrades:up, nodes:{}, links:[], builds:[], plan:[], ops:{}, hubs:[], solar:0, wind:0, peakers:0, storage:0, gridlink:false, retrofits:{}, parks:{}, housing:{},
      contracts:[], outageHistory:[], history:[], log:[], snapshots:{}, decisions:[], mods:{}, completed:0, started:0, allDoneTurn:null,
      projects:{}, storm:null, stranded:0, done:false, result:null, daily:opts.daily || null, m:{}};
    for (const [id, n] of Object.entries(NODE_DEF)) S.nodes[id] = {pop:n.pop, jobs:n.jobs, hotel:id === 'core' ? 35 : 0, hotelLv:0, visitors:0, shelter:0, medic:0, power:0};
    for (const [a, b, cap] of ROADS) { const l = makeLink('road', a, b, true); l.cap = cap; S.links.push(l); }
    for (const [kind, a, b] of (m.start && m.start.links) || []) S.links.push(makeLink(kind, a, b, true));
    for (const [a, b] of CORRIDORS) for (const kind of ['metro','brt']) if (!S.links.some(l => l.id === linkId(kind, a, b))) S.links.push(makeLink(kind, a, b, false));
    if (m.freight) for (const [a, b] of FREIGHT[BOARD] || []) S.links.push(makeLink('freight', a, b, false));
    S.coup = Object.assign({adoption:.05, priceThreshold:3, skilledBonus:0, techVisibility:false, cityCaps:[]}, opts.couplings || {});
    const cc = k => (S.coup.cityCaps || []).includes(k);
    S.invest = {process:0, talent:0, offer:null, openAt:null, incentive:0}; S.academies = []; S.grad = 0; S.research = false; S.pricePressure = 0; S.warehouses = [];
    S.skilled0 = m.skilledSystems ? 0 + (up.includes('talent') ? 1 : 0) + (S.coup.skilledBonus || 0) + (cc('academy') ? 1 : 0) : 0;
    if (m.energy) { S.fossil = m.energy.fossil; S.industry = m.energy.industry || 0; } else S.fossil = 30;
    if (m.projects) for (const [pid, p] of Object.entries(m.projects)) S.projects[pid] = {node:p.node, stage:0, active:null, progress:0, done:false, waitMaterials:0, dep:p.dep || {}};
    if (m.storm) S.storm = {phase:0, path:m.stormPath, radius:m.stormRadius, sev:m.severity, hitNodes:{}, blocked:{}, alert:false, atRisk:0, protectedP:0, svcSum:0, svcN:0, mobSum:0, mobN:0, log:[]};
    if (opts.daily) for (const id of opts.daily.mods) { const md = DAILY_MODS.find(x => x.id === id); if (md) md.apply(S); }
    compute(); snapshot();
    return S;
  }
  const crewsTotal = () => S.crews0 + (S.mods.crew || 0) + S.contracts.filter(c => c.until >= S.turn).length;
  const crewsBusy = () => S.builds.reduce((a, b) => a + b.crews, 0);
  const skilledTotal = () => (S.skilled0 || 0) + Math.floor(S.grad || 0);
  const skilledBusy = () => S.builds.filter(b => b.skilled).length;
  const planned = key => S.plan.reduce((a, p) => a + p[key], 0);
  const has = u => S.upgrades.includes(u);

  /* ============================ NETWORK MODEL ======================== */
  function transitPath(St, from){
    // Dijkstra over built, open transit links from `from` to core
    const s = St || S, dist = {[from]:0}, prev = {}, q = new Set(Object.keys(NODE_DEF));
    while (q.size) { let u = null; for (const x of q) if (dist[x] != null && (u == null || dist[x] < dist[u])) u = x; if (u == null) break; q.delete(u); if (u === 'core') break;
      for (const l of s.links) { if (l.kind === 'road' || l.kind === 'freight' || !l.built || l.closed) continue; const v = l.a === u ? l.b : l.b === u ? l.a : null; if (!v || !q.has(v)) continue; const t = linkTime(s, l); if (dist[v] == null || dist[u] + t < dist[v]) { dist[v] = dist[u] + t; prev[v] = {u, l}; } } }
    if (dist.core == null || from === 'core') return null;
    const links = []; let c = 'core'; while (c !== from) { links.push(prev[c].l); c = prev[c].u; }
    return {time:dist.core, links};
  }
  function transitBetween(St, from, to){   // quickest transit trip between any two places (minutes), or null
    const s = St || S, dist = {[from]:0}, q = new Set(Object.keys(NODE_DEF));
    while (q.size) { let u = null; for (const x of q) if (dist[x] != null && (u == null || dist[x] < dist[u])) u = x; if (u == null) break; q.delete(u); if (u === to) break;
      for (const l of s.links) { if (l.kind === 'road' || l.kind === 'freight' || !l.built || l.closed) continue; const v = l.a === u ? l.b : l.b === u ? l.a : null; if (!v || !q.has(v)) continue; const t = linkTime(s, l); if (dist[v] == null || dist[u] + t < dist[v]) dist[v] = dist[u] + t; } }
    return dist[to] ?? null;
  }
  function linkTime(s, l){
    const wait = s.ops.freq ? .6 : 1;
    if (BOARDS[BOARD].intercity) { if (l.kind === 'metro') return l.km / 4.5 + 25 * wait; if (l.kind === 'brt') return l.km / 1.35 + 20 * wait; }   // high-speed rail / express coaches
    if (l.kind === 'metro') return l.km / 1.2 + 4 * wait;
    if (l.kind === 'brt') return l.km / (s.ops.priority ? .85 : .65) + 5 * wait;
    return l.km * 1.1 + 3;
  }
  function linkCap(s, l){
    if (l.kind === 'metro') return l.cap * (s.ops.freq ? 1.4 : 1);
    if (l.kind === 'brt') return l.cap * (s.ops.freq ? 1.4 : 1) * (s.ops.priority ? 1.5 : 1);
    return Math.max(.4, l.cap + l.widen * 3.5 - l.busLane * .8 * (s.ops.priority ? 1.3 : 1));
  }
  function roadPath(s, from){
    const dist = {[from]:0}, prev = {}, q = new Set(Object.keys(NODE_DEF));
    while (q.size) { let u = null; for (const x of q) if (dist[x] != null && (u == null || dist[x] < dist[u])) u = x; if (u == null) break; q.delete(u); if (u === 'core') break;
      for (const l of s.links) { if (l.kind !== 'road' || l.closed) continue; const v = l.a === u ? l.b : l.b === u ? l.a : null; if (!v || !q.has(v)) continue; const t = l.km * 1.1 + 3; if (dist[v] == null || dist[u] + t < dist[v]) { dist[v] = dist[u] + t; prev[v] = {u, l}; } } }
    if (dist.core == null) return null;
    const links = []; let c = 'core'; while (c !== from) { links.push(prev[c].l); c = prev[c].u; }
    return {free:dist.core, links};
  }

  function compute(){
    const m = M(S.mission), N = S.nodes, out = {nodeMob:{}, nodeDemand:{}, transitTrips:{}, roadTrips:{}};
    // --- visitors
    let visitorsServed = 0, hotelsUnserved = 0; const prevMob = S.m.nodeMob || {};
    for (const id in N) N[id].visitors = 0;
    if (m.visitors && m.visitors.event) for (const [id, sched] of Object.entries(m.visitors.event)) N[id].visitors = (sched[tIdx()] || 0) * (S.mods.surge || 1);
    if (m.visitors && m.visitors.season) {
      const demand = (m.visitors.season[tIdx()] || 0) * (S.mods.surge || 1);
      let H = 10; for (const [id, n] of Object.entries(N)) { if (!n.hotel) continue; const ok = (prevMob[id] ?? 60) >= 50; H += n.hotel * (ok ? 1 : .35); if (!ok && n.hotel > 0 && id !== 'core') hotelsUnserved++; }
      visitorsServed = Math.min(demand, H); out.visitorDemand = demand; out.hostCap = H;
      const attr = Object.entries(NODE_DEF).filter(([id, n]) => n.attract);
      const wsum = attr.reduce((a, [id, n]) => a + n.attract * (1 + (N[id].hotel > 0 ? .6 : 0)), 0);
      for (const [id, n] of attr) N[id].visitors = visitorsServed * n.attract * (1 + (N[id].hotel > 0 ? .6 : 0)) / wsum;
    }
    // --- demand
    const alertF = S.storm && S.storm.alert ? .6 : 1;
    for (const [id, n] of Object.entries(N)) {
      if (id === 'core' || NODE_DEF[id].freightOnly) continue;
      const widen = S.links.filter(l => l.kind === 'road' && (l.a === id || l.b === id)).reduce((a, l) => a + l.widen, 0);
      out.nodeDemand[id] = (((n.pop * .012 + n.jobs * .008) * (NODE_DEF[id].local ?? 1) + n.visitors * .05) * (1 + .12 * widen)) * alertF;   // new lanes induce new trips
    }
    // --- transit assignment
    for (const l of S.links) l.load = 0;
    const tPaths = {}, desire = {};
    for (const id in out.nodeDemand) {
      const tp = transitPath(S, id); tPaths[id] = tp; if (!tp) { desire[id] = 0; continue; }
      const rp = roadPath(S, id); const roadT = rp ? rp.free + RING.base : 999;
      desire[id] = out.nodeDemand[id] * ((tp.time < roadT * 1.3 ? .65 : .35) + ((S.coup && S.coup.adoption) || 0));
      for (const l of tp.links) l.load += desire[id];
    }
    for (const id in out.nodeDemand) {
      const tp = tPaths[id]; let r = 1; if (tp) for (const l of tp.links) r = Math.min(r, linkCap(S, l) / Math.max(1e-6, l.load));
      out.transitTrips[id] = desire[id] * Math.min(1, r);
    }
    for (const l of S.links) if (l.kind !== 'road') l.load = 0;
    for (const id in out.nodeDemand) if (tPaths[id]) for (const l of tPaths[id].links) l.load += out.transitTrips[id];
    // --- road assignment (vehicles reroute automatically when a road is closed)
    const rPaths = {}; let ringLoad = 0, stuck = 0;
    for (const id in out.nodeDemand) {
      const rt = out.nodeDemand[id] - out.transitTrips[id]; out.roadTrips[id] = rt;
      const rp = roadPath(S, id); rPaths[id] = rp;
      if (!rp) { stuck += rt; continue; }
      for (const l of rp.links) l.load += rt; ringLoad += rt;
    }
    const ringVC = ringLoad / RING.cap, ringT = RING.base * (1 + 1.1 * ringVC * ringVC);
    let wsum = 0, msum = 0, vkt = 0;
    for (const id in out.nodeDemand) {
      const d = out.nodeDemand[id]; const rp = rPaths[id];
      let roadT = 999; if (rp) { roadT = ringT; for (const l of rp.links) { const vc = l.load / linkCap(S, l); roadT += (l.km * 1.1 + 3) * Math.min(5, 1 + 1.1 * vc * vc); } }
      const tp = tPaths[id], tt = out.transitTrips[id], rt = out.roadTrips[id];
      const Tact = d > 0 ? (tt * (tp ? tp.time : 0) + rt * roadT) / d : 30;
      const Tref = rp ? rp.free + RING.base : 60;
      const mob = rp || tp ? 100 * Math.min(1, 1.35 * Tref / (Tact + .35 * Tref)) : 0;
      out.nodeMob[id] = NODE_DEF[id].energySite ? 100 : mob;
      (out.nodeTime = out.nodeTime || {})[id] = {transit:tp ? tp.time : null, road:rp ? roadT : null, free:Tref, transitShare:d > 0 ? tt / d : 0};   // minutes to the City Centre (explanations only)
      if (!NODE_DEF[id].energySite) { wsum += d; msum += d * mob; }
      vkt += rt * (rp ? rp.free : 30) / 10 * (BOARDS[BOARD].vkt || 1);
    }
    out.mobility = wsum ? msum / wsum : 50; out.ringVC = ringVC; out.vkt = vkt; out.stuck = stuck;
    // --- energy
    const popJobs = Object.values(N).reduce((a, n) => a + n.pop + n.jobs, 0);
    let E = .0062 * popJobs + .25 * Object.values(N).reduce((a, n) => a + n.hotelLv, 0) + .5 * S.links.filter(l => l.kind === 'metro' && l.built).length + .1 * S.links.filter(l => l.kind === 'brt' && l.built).length;
    E += S.industry || 0;   // industrial load (hydrogen, petrochemicals) on some boards
    const retro = Object.keys(S.retrofits).reduce((a, id) => a + (N[id].pop + N[id].jobs) * .0062 * .15, 0); E -= retro;
    const solarOn = S.gridlink ? S.solar : 0, windOn = S.gridlink ? (S.wind || 0) : 0;
    const peak = E * 1.18 * (S.ops.demand ? .92 : 1);
    const peakSupply = S.fossil + ((S.coup && (S.coup.cityCaps || []).includes('smartgrid')) ? .8 : 0) + S.peakers * 2.5 + S.storage * 2 + solarOn * 3 * (S.storage ? .45 : .15) + windOn * 2.2 * .75;
    const outage = Math.max(0, peak - peakSupply);
    const renewable = Math.min(E, solarOn * 3 * .85 + windOn * 2.2 * .8); const fossilUsed = Math.max(0, E - renewable);
    out.energy = {E, peak, peakSupply, outage, renewable, fossilUsed}; out.renewShare = E ? renewable / E : 0;
    // --- builds disruption
    const disruptive = S.builds.filter(b => b.node && N[b.node] && N[b.node].pop + N[b.node].jobs > 40);
    const projectBuilds = Object.values(S.projects).filter(p => p.active === 'structure');
    // --- indicators, each the sum of named causes
    const C = {};
    const parksN = Object.keys(S.parks).length, housingN = Object.keys(S.housing).length;
    C.mobility = [{label:L('Network travel times','أزمنة التنقل في الشبكة'), v:out.mobility}];
    C.trust = [
      {label:L('Baseline confidence','الثقة الأساسية'), v:56},
      {label:L('How easily people move','سهولة تنقل الناس'), v:.45 * (out.mobility - 55)},
      ...(parksN ? [{label:L('Green corridors','الممرات الخضراء'), v:parksN * 2.5}] : []),
      ...(housingN ? [{label:L('Affordable homes','المساكن الميسّرة'), v:housingN * 2}] : []),
      ...(disruptive.length + projectBuilds.length ? [{label:L('Construction disruption','إزعاج أعمال البناء'), v:-(disruptive.length * 1.6 + projectBuilds.length * 2.6) * (S.ops.night ? .5 : 1)}] : []),
      ...(outage > 0 ? [{label:L('Power outages','انقطاعات الكهرباء'), v:-Math.min(14, 5 + outage * 4)}] : []),
      ...(visitorsServed > 50 ? [{label:L('Crowding','الازدحام'), v:-(visitorsServed - 50) * .2 * (parksN ? .55 : 1)}] : []),
      ...(visitorsServed > 0 ? [{label:L('Pride in hosting visitors','الفخر باستضافة الزوار'), v:Math.min(5, visitorsServed * .05)}] : []),
      ...(S.ops.demand ? [{label:L('Demand-response requests','طلبات الاستجابة للطلب'), v:-1.5}] : []),
      ...(S.storm ? [{label:L('People kept safe','سلامة الناس'), v:((S.storm.atRisk ? S.storm.protectedP / S.storm.atRisk : 1) - .85) * 40}] : [])
    ];
    C.sustainability = [
      {label:L('Baseline','الأساس'), v:90},
      {label:L('Car travel emissions','انبعاثات السيارات'), v:-out.vkt * .55},
      {label:L('Fossil electricity','كهرباء أحفورية'), v:-out.energy.fossilUsed * 1.3},
      ...(S.peakers ? [{label:L('Gas peakers','محطات الذروة الغازية'), v:-S.peakers * 3}] : []),
      ...(renewable ? [{label:L('Clean power share','حصة الطاقة النظيفة'), v:out.renewShare * 28}] : []),
      ...(parksN ? [{label:L('Green corridors','الممرات الخضراء'), v:parksN * 2}] : [])
    ];
    const redundant = Object.keys(out.nodeDemand).filter(id => tPaths[id] && rPaths[id]).length;
    C.resilience = [
      {label:L('Existing networks','الشبكات القائمة'), v:48},
      {label:L('Districts with a transit alternative','أحياء لها بديل نقل عام'), v:redundant * 3},
      ...(S.storage ? [{label:L('Grid batteries','بطاريات الشبكة'), v:S.storage * 4}] : []),
      ...(S.gridlink && (S.solar || S.wind) ? [{label:L('Diverse power sources','مصادر طاقة متنوعة'), v:3 + S.solar + (S.wind || 0) * 1.5}] : []),
      ...(S.hubs.length ? [{label:L('Logistics hubs','المراكز اللوجستية'), v:S.hubs.length * 3}] : []),
      ...(outage > 0 ? [{label:L('Supply shortfall at peak','عجز الإمداد وقت الذروة'), v:-6}] : [])
    ];
    const act = S.builds.length, comp = S.completed;
    C.delivery = [{label:L('Builds completed','المشاريع المنجزة'), v:comp + act ? 100 * comp / (comp + act * .6) : 60}];
    if (m.projects) C.delivery = [{label:L('Project packages complete','حزم المشاريع المكتملة'), v:100 * Object.values(S.projects).reduce((a, p) => a + p.stage, 0) / 9}];
    C.budget = [{label:L('Budget remaining','الميزانية المتبقية'), v:clamp(50 + 50 * S.budget / (.3 * S.budget0), 0, 100)}];
    for (const k of Object.keys(C)) out[k] = clamp(C[k].reduce((a, c) => a + c.v, 0), 0, 100);
    if (S.storm) { const st = S.storm; out.protected = st.atRisk ? 100 * st.protectedP / st.atRisk : 100; out.services = st.svcN ? st.svcSum / st.svcN : 100; out.mobCont = st.mobN ? st.mobSum / st.mobN : out.mobility; }
    if (m.freight) {
      const fr = m.freight.demand, t = tIdx(); let dem = 0, served = 0, onRail = 0, roadFreight = 0; const dig = S.ops.digital ? 1.15 : 1;
      const fpath = from => { const seen = new Set([from]), qd = [[from, 99, []]]; while (qd.length) { const [u, cap, ls] = qd.shift(); if (u === 'dryport') return {cap, links:ls}; for (const l of S.links) { if (l.kind !== 'freight' || !l.built || l.closed) continue; const v = l.a === u ? l.b : l.b === u ? l.a : null; if (!v || seen.has(v)) continue; seen.add(v); qd.push([v, Math.min(cap, l.cap), ls.concat(l)]); } } return null; };
      out.freight = {};
      for (const [o, sched] of Object.entries(fr)) {
        const d = (sched[t] || 0) * (S.mods.surge || 1); dem += d;
        const fp = fpath(o); let cap = 0, mode = 'road';
        if (fp) { cap = fp.cap * dig; mode = 'rail'; onRail++; for (const l of fp.links) l.load = (l.load || 0) + Math.min(d, cap); }
        else { const rp = (() => { const dist = {[o]:0}, prev = {}, qq = new Set(Object.keys(NODE_DEF)); while (qq.size) { let u = null; for (const x of qq) if (dist[x] != null && (u == null || dist[x] < dist[u])) u = x; if (u == null) break; qq.delete(u); if (u === 'dryport') break; for (const l of S.links) { if (l.kind !== 'road' || l.closed) continue; const v = l.a === u ? l.b : l.b === u ? l.a : null; if (!v || !qq.has(v)) continue; const tt = l.km; if (dist[v] == null || dist[u] + tt < dist[v]) { dist[v] = dist[u] + tt; prev[v] = {u, l}; } } } if (dist.dryport == null) return null; const ls = []; let c = 'dryport'; while (c !== o) { ls.push(prev[c].l); c = prev[c].u; } return ls; })();
          cap = rp ? Math.max(0, Math.min(...rp.map(l => linkCap(S, l) - l.load))) * .6 * dig : 0; }
        cap += S.warehouses.includes(o) || S.warehouses.includes('dryport') ? 1 : 0;
        const sv = Math.min(d, cap); served += sv; if (mode === 'road') roadFreight += sv; out.freight[o] = {demand:d, served:sv, mode};
      }
      out.freightShare = dem ? served / dem : 1;
      const congested = Object.values(out.freight).filter(f => f.mode === 'road' && f.served < f.demand * .8).length;
      out.reliability = clamp(42 + onRail * 12 + (S.ops.digital ? 15 : 0) + S.warehouses.length * 6 + (S.hubs.length ? 5 : 0) + ((S.coup.cityCaps || []).includes('railyard') ? 8 : 0) - congested * 8, 0, 100);
      if (roadFreight > .5) C.trust.push({label:L('Truck traffic through the city','حركة الشاحنات داخل المدينة'), v:-Math.min(5, roadFreight * .9)});
      if (onRail) C.sustainability.push({label:L('Freight moved by rail','شحن بالقطار'), v:onRail * 1.5});
      C.resilience.push({label:L('Freight network reliability','موثوقية شبكة الشحن'), v:(out.reliability - 50) * .08});
      out.trust = clamp(C.trust.reduce((a, c) => a + c.v, 0), 0, 100); out.sustainability = clamp(C.sustainability.reduce((a, c) => a + c.v, 0), 0, 100); out.resilience = clamp(C.resilience.reduce((a, c) => a + c.v, 0), 0, 100);
    }
    if (m.invest) {
      const iv = S.invest, node = m.invest.node;
      const parts = {infra:transitPath(S, node) ? 100 : 35, talent:clamp(iv.talent, 0, 100), process:clamp(iv.process, 0, 100), confidence:clamp(out.trust, 0, 100)};
      out.readinessParts = parts; out.readiness = clamp(parts.infra * .3 + parts.process * .3 + parts.talent * .2 + parts.confidence * .2 + iv.incentive * 8 + ((S.coup.cityCaps || []).includes('investor') ? 6 : 0), 0, 100);
    }
    if (m.skilledSystems) out.skilled = skilledTotal();
    out.contrib = C; out.visitorsServed = visitorsServed; out.hotelsUnserved = hotelsUnserved; out.tPaths = Object.fromEntries(Object.entries(tPaths).map(([k, v]) => [k, v ? v.links.map(l => l.id) : null]));
    S.m = out; return out;
  }

  /* ============================== PLANNING =========================== */
  function validTargets(id){
    const a = ACTIONS[id]; const m = M(S.mission);
    if (a.target === 'corridor') return S.links.filter(l => l.kind === id && !l.built && !S.builds.some(b => b.target === l.id) && !S.plan.some(p => p.target === l.id)).map(l => l.id);
    if (a.target === 'road') {
      if (id === 'road') return S.mods.noroads ? [] : S.links.filter(l => l.kind === 'road' && l.widen < 1 && !S.builds.some(b => b.target === l.id) && !S.plan.some(p => p.target === l.id)).map(l => l.id);
      if (id === 'reroute') return S.links.filter(l => l.kind === 'road' && !l.closed && !S.plan.some(p => p.target === l.id)).map(l => l.id);
      if (id === 'clear') return S.links.filter(l => l.kind === 'road' && l.closed && (S.storm.blocked[l.id] != null || l.rerouted) && !S.plan.some(p => p.target === l.id)).map(l => l.id);
    }
    if (a.target === 'node') {
      const ok = {hotel:n => !NODE_DEF[n].energySite && S.nodes[n].hotelLv < 2, housing:n => !NODE_DEF[n].energySite && !NODE_DEF[n].core && !S.housing[n] && S.nodes[n].pop >= 40,
        park:n => !S.parks[n] && !NODE_DEF[n].energySite, retrofit:n => !S.retrofits[n] && S.nodes[n].pop + S.nodes[n].jobs > 50, hub:n => !S.hubs.includes(n) && !NODE_DEF[n].core && !NODE_DEF[n].energySite,
        warehouse:n => (NODE_DEF[n].freightHub || NODE_DEF[n].freightOnly || n === 'ksip') && !S.warehouses.includes(n), academy:n => !S.academies.includes(n) && S.nodes[n].pop + S.nodes[n].jobs >= 40 && !NODE_DEF[n].core, research:n => !S.research && ['murabba','core','ksip','expo'].includes(n),
        shelter:n => !S.nodes[n].shelter && S.nodes[n].pop > 0, medic:n => !S.nodes[n].medic && S.nodes[n].pop > 0, generator:n => !S.nodes[n].power && S.nodes[n].pop + S.nodes[n].jobs > 20, microgrid:n => S.nodes[n].power < 2 && S.nodes[n].pop + S.nodes[n].jobs > 20}[id] || (() => true);
      return Object.keys(NODE_DEF).filter(n => ok(n) && !S.plan.some(p => p.id === id && p.target === n) && !S.builds.some(b => b.action === id && b.target === n));
    }
    if (a.target === 'project') return Object.entries(S.projects).filter(([pid, p]) => !p.done && !p.active && !S.plan.some(x => x.target === pid) && canAdvance(pid).ok).map(([pid]) => pid);
    if (a.target === 'route') return [];
    if (a.target === 'build') return S.builds.filter(b => b.turnsLeft > 1 && !b.fast && !S.plan.some(p => p.target === b.bid)).map(b => b.bid);
    return [null];
  }
  function nextPackage(s, pid){ const p = s.projects[pid]; return p && !p.done ? PKG[p.stage] : null; }
  function canAdvance(pid){
    const p = S.projects[pid], pk = PKG[p.stage]; if (!pk) return {ok:false};
    const dep = p.dep[pk.k];
    if (dep && dep.proj) { const o = S.projects[dep.proj]; const need = PKG.findIndex(x => x.k === dep.stage) + 1; if (o.stage < need) return {ok:false, why:L(`Needs ${NODE_DEF[o.node].name.en} ${PKG[need - 1].name.en.toLowerCase()} first`, `يتطلب إنجاز ${PKG[need - 1].name.ar} في ${NODE_DEF[o.node].name.ar} أولًا`)}; }
    if (dep && dep.transit && !transitPath(S, dep.transit)) return {ok:false, why:L('Needs a transit link to the city centre first','يتطلب خط نقل عام إلى وسط المدينة أولًا')};
    return {ok:true};
  }
  function check(id, target){
    const a = ACTIONS[id], m = M(S.mission);
    if (!m.actions.includes(id)) return {ok:false, why:L('Not available in this mission','غير متاح في هذه المهمة')};
    if (a.req && !has(a.req)) return {ok:false, why:L(`Requires the ${UPGRADES[a.req].name.en} upgrade`, `يتطلب ترقية ${UPGRADES[a.req].name.ar}`), locked:a.req};
    if (a.once && (id === 'gridlink' ? (S.gridlink || S.builds.some(b => b.action === 'gridlink')) : id === 'alert' ? S.storm.alert : id === 'research' ? (S.research || S.builds.some(b => b.action === 'research')) : ['permits','framework','incentive'].includes(id) ? (S.invest['did_' + id] || S.builds.some(b => b.action === id)) : false)) return {ok:false, why:L('Already done','تم بالفعل')};
    if (a.once && S.plan.some(p => p.id === id)) return {ok:false, why:L('Already in your plan','موجود في خطتك')};
    if ((id === 'solar' || id === 'wind') && !S.gridlink && !S.builds.some(b => b.action === 'gridlink') && !S.plan.some(p => p.id === 'gridlink')) return {ok:false, why:L('Build the grid connection first','ابنِ الربط بالشبكة أولًا')};
    if (a.toggle && S.ops[id]) return {ok:true, toggleOff:true};
    if (id === 'alert' && S.storm && S.storm.phase > 2) return {ok:false, why:L('Too late: alerts only help in the first two phases','فات الأوان: الإنذار يفيد في أول مرحلتين فقط')};
    if (a.target === 'route') { if (target == null) return {ok:true, needsTarget:true}; const rv = routeValid(target); if (!rv.ok) return rv; }
    const tg = validTargets(id); if (a.target !== 'none' && a.target !== 'route' && target == null) return {ok:tg.length > 0, needsTarget:true, why:tg.length ? null : L('No valid places for this right now','لا أماكن مناسبة لهذا الآن')};
    if (a.target !== 'none' && a.target !== 'route' && !tg.includes(target)) return {ok:false, why:L('Not a valid target','هدف غير صالح')};
    const cost = costOf(S, id, target), crews = crewsOf(S, id, target);
    if (S.budget - planned('cost') < cost - 1e-9) return {ok:false, why:L(`Needs ${cost} credits — only ${(S.budget - planned('cost')).toFixed(1)} left`, `يتطلب ${cost} رصيد — المتبقي ${(S.budget - planned('cost')).toFixed(1)} رصيد`)};
    if (crews && crewsTotal() - crewsBusy() - planned('crews') < crews) return {ok:false, why:L(`Needs ${crews} free crew${crews > 1 ? 's' : ''} — all crews are busy`, `يتطلب ${crews} من الأطقم الشاغرة — جميع الأطقم مشغولة`)};
    if (S.storm && S.plan.length >= respPoints()) return {ok:false, why:L('No response actions left this phase','لا إجراءات استجابة متبقية في هذه المرحلة')};
    if (id === 'advance') { const c = canAdvance(target); if (!c.ok) return c; const pk = nextPackage(S, target); if (pk && pk.k === 'systems' && m.skilledSystems && skilledTotal() - skilledBusy() - S.plan.filter(p => p.skilled).length < 1) return {ok:false, why:L('Needs a free skilled crew — train more at an academy','يتطلب طاقمًا ماهرًا متاحًا — درّب المزيد في أكاديمية')}; }
    if ((id === 'offerA' || id === 'offerB') && (S.invest.offer || (S.m.readiness || 0) < 62 || (S.m.readinessParts || {}).infra < 100)) return {ok:false, why:S.invest.offer ? L('An offer has already been accepted','تم قبول عرض بالفعل') : (S.m.readinessParts || {}).infra < 100 ? L('Investors need transit access to the site first','يحتاج المستثمرون أولًا إلى وصول بالنقل العام إلى الموقع') : L(`Offers arrive when investment readiness reaches 62 (now ${Math.round(S.m.readiness || 0)})`, `تصل العروض عندما تبلغ جاهزية الاستثمار 62 (الآن ${Math.round(S.m.readiness || 0)})`)};
    if (['offerA','offerB'].includes(id) && S.plan.some(p => p.id === 'offerA' || p.id === 'offerB')) return {ok:false, why:L('Only one offer can be accepted','يمكن قبول عرض واحد فقط')};
    // Prices: too many builds at once push up costs for new ones
    const dur0 = durOf(S, id, target), inFlight = S.builds.length + S.plan.filter(p => p.dur > 0).length;
    let finalCost = cost, pressure = false;
    if (dur0 > 0 && inFlight >= (S.coup ? S.coup.priceThreshold : 3)) { finalCost = +(cost * 1.1).toFixed(1); pressure = true; if (S.budget - planned('cost') < finalCost - 1e-9) return {ok:false, why:L(`Needs ${finalCost} credits with price pressure — only ${(S.budget - planned('cost')).toFixed(1)} left`, `يتطلب ${finalCost} رصيدًا مع ضغط الأسعار — المتبقي ${(S.budget - planned('cost')).toFixed(1)}`)}; }
    return {ok:true, cost:finalCost, crews, pressure, skilled:id === 'advance' && m.skilledSystems && (nextPackage(S, target) || {}).k === 'systems', dur:dur0 + (S.mods.heat && dur0 ? 1 : 0)};
  }
  // A custom route must follow existing roads between consecutive stops and add at least one new segment.
  function routeValid(tgt){
    const ns = String(tgt).split('>'); if (ns.length < 2 || ns.some(n => !NODE_DEF[n])) return {ok:false, why:L('Choose at least two stops','اختر محطتين على الأقل')};
    if (new Set(ns).size !== ns.length) return {ok:false, why:L('A stop can only be used once','لا تُستخدم المحطة إلا مرة واحدة')};
    let fresh = 0;
    for (let k = 1; k < ns.length; k++) { const p = [ns[k - 1], ns[k]].sort().join();
      if (!S.links.some(l => l.kind === 'road' && [l.a, l.b].sort().join() === p)) return {ok:false, why:L(`No road between ${NODE_DEF[ns[k - 1]].name.en} and ${NODE_DEF[ns[k]].name.en}`, `لا يوجد طريق بين ${NODE_DEF[ns[k - 1]].name.ar} و${NODE_DEF[ns[k]].name.ar}`)};
      if (!S.links.some(l => l.kind === 'brt' && l.built && [l.a, l.b].sort().join() === p)) fresh++; }
    return fresh ? {ok:true} : {ok:false, why:L('Every segment of this route already has a bus lane','كل أجزاء هذا المسار لديها مسار حافلات بالفعل')};
  }
  const roadNeighbours = n => S.links.filter(l => l.kind === 'road' && (l.a === n || l.b === n)).map(l => l.a === n ? l.b : l.a);
  const respPoints = () => 3 + (has('talent') ? 1 : 0);
  function addPlan(id, target){
    const c = check(id, target); if (!c.ok) return c;
    if (c.toggleOff) { S.ops[id] = false; log(L(`${ACTIONS[id].name.en} switched off`, `تم إيقاف ${ACTIONS[id].name.ar}`)); compute(); return {ok:true, off:true}; }
    S.plan.push({id, target, cost:c.cost, crews:c.crews || 0, dur:c.dur, skilled:!!c.skilled, pressure:!!c.pressure}); return {ok:true};
  }
  function removePlan(i){ S.plan.splice(i, 1); }

  /* ============================== TURN =============================== */
  function applyNow(id, target, b){
    const N = S.nodes;
    switch (id) {
      case 'freight': { const l = S.links.find(x => x.id === target); l.built = true; l.progress = 1; break; }
      case 'route': { const ns = String(target).split('>'); for (let k = 1; k < ns.length; k++) { const a = ns[k - 1], b = ns[k], p = [a, b].sort().join(); let l = S.links.find(x => x.kind === 'brt' && [x.a, x.b].sort().join() === p); if (!l) { l = makeLink('brt', a, b, false); S.links.push(l); } l.built = true; l.progress = 1; const r = S.links.find(x => x.kind === 'road' && [x.a, x.b].sort().join() === p); if (r) r.busLane = 1; } break; }
      case 'metro': case 'brt': { const l = S.links.find(x => x.id === target); l.built = true; l.progress = 1; if (id === 'brt') { const r = S.links.find(x => x.kind === 'road' && [x.a, x.b].sort().join() === [l.a, l.b].sort().join()); if (r) r.busLane = 1; } break; }
      case 'road': { const l = S.links.find(x => x.id === target); l.widen = 1; break; }
      case 'hotel': N[target].hotel += 20; N[target].hotelLv++; N[target].jobs += 12; break;
      case 'housing': S.housing[target] = true; N[target].pop += 30; break;
      case 'park': S.parks[target] = true; break;
      case 'gridlink': S.gridlink = true; break;
      case 'solar': S.solar++; break;
      case 'wind': S.wind = (S.wind || 0) + 1; break;
      case 'peaker': S.peakers++; break;
      case 'storage': S.storage++; break;
      case 'retrofit': S.retrofits[target] = true; break;
      case 'hub': S.hubs.push(target); break;
      case 'warehouse': S.warehouses.push(target); break;
      case 'academy': S.academies.push(target); break;
      case 'research': S.research = true; S.researchAt = target; break;
      case 'permits': S.invest.process += 40; break;
      case 'framework': S.invest.process += 35; break;
    }
  }
  function endTurn(){
    if (S.done) return null;
    snapshot();
    const m = M(S.mission), before = clone(S.m), events = [];
    S.decisions.push({turn:S.turn, actions:S.plan.map(p => ({id:p.id, target:p.target}))});
    // 1) commit plan
    for (const p of S.plan) {
      S.budget -= p.cost;
      const a = ACTIONS[p.id];
      if (p.pressure) S.pricePressure++;
      if (a.toggle) { S.ops[p.id] = true; events.push({type:'op', id:p.id}); continue; }
      if (['permits','framework','incentive','offerA','offerB'].includes(p.id)) S.invest['did_' + p.id] = true;
      if (p.id === 'incentive') { S.invest.incentive = 1; events.push({type:'event', text:L('Investor incentive announced: readiness +8.','إعلان حافز للمستثمرين: الجاهزية +8.')}); continue; }
      if (p.id === 'offerA' || p.id === 'offerB') { const A = p.id === 'offerA'; S.invest.offer = A ? 'A' : 'B'; S.budget += (A ? 10 : 5) - S.invest.incentive * 2; if (!A) S.invest.talent += 20; S.invest.openAt = S.turn + (A ? 1 : 2); S.nodes[M(S.mission).invest.node].jobs += A ? 8 : 20; events.push({type:'event', text:A ? L('Offer A accepted: fast capital arrives; the project opens next turn.','قُبل العرض أ: وصل رأس مال سريع؛ يُفتتح المشروع في الجولة التالية.') : L('Offer B accepted: a local partnership forms; the project opens in 2 turns.','قُبل العرض ب: تشكّلت شراكة محلية؛ يُفتتح المشروع بعد جولتين.')}); continue; }
      if (p.id === 'contract') { S.contracts.push({until:S.turn + 2}); continue; }
      if (p.id === 'fasttrack') { const b = S.builds.find(x => x.bid === p.target); if (b) { b.turnsLeft -= 1; b.fast = true; } continue; }
      if (p.id === 'advance') { const pr = S.projects[p.target]; const pk = PKG[pr.stage]; pr.active = pk.k; pr.left = p.dur; pr.dur = p.dur; S.builds.push({bid:'b' + S.turn + '-' + p.target, action:'advance', target:p.target, node:pr.node, turnsLeft:p.dur, dur:p.dur, crews:p.crews, skilled:p.skilled, cost:p.cost, project:true}); S.started++; continue; }
      if (a.cat === 'response') { stormAction(p.id, p.target); continue; }
      if (p.dur > 0) { const node = a.target === 'route' ? String(p.target).split('>').pop() : a.target === 'node' ? p.target : a.target === 'corridor' || a.target === 'road' ? (p.target.split(':')[1] || '').split('-')[1] : a.cat === 'energy' ? (BOARDS[BOARD].energy || {}).site : null; S.builds.push({bid:'b' + S.turn + '-' + p.id + '-' + (p.target || ''), action:p.id, target:p.target, node, turnsLeft:p.dur, dur:p.dur, crews:p.crews, cost:p.cost}); S.started++; }
      else applyNow(p.id, p.target);
    }
    S.plan = [];
    // 2) operations running cost
    for (const [id, on] of Object.entries(S.ops)) if (on) S.budget -= costOf(S, id);
    // 3) storm advances (mission 5)
    if (S.storm) stormPhase(events);
    // 4) builds progress; materials for project structures
    compute();
    for (const b of [...S.builds]) {
      if (b.project) {
        const pr = S.projects[b.target];
        if (pr.active === 'structure') {
          const rpth = roadPath(S, pr.node);
          const spare = rpth && rpth.links.length ? Math.max(0, Math.min(...rpth.links.map(l => linkCap(S, l) - l.load))) : 0;
          const deliver = spare * 1.1 + (S.hubs.includes(pr.node) || S.hubs.some(h => S.links.some(l => l.kind === 'road' && ((l.a === h && l.b === pr.node) || (l.b === h && l.a === pr.node)))) ? 2.5 : 0) + (S.ops.night ? 1.5 : 0);
          const f = clamp(deliver / 2, 0, 1);
          if (f < .99) { pr.waitMaterials++; events.push({type:'materials', project:b.target, f}); }
          b.partial = (b.partial || 0) + f; if (b.partial >= 1) { b.partial -= 1; b.turnsLeft--; }
        } else b.turnsLeft--;
        pr.progress = 1 - b.turnsLeft / b.dur;
      } else { b.turnsLeft--; b.progress = 1 - b.turnsLeft / b.dur;
        const l = S.links.find(x => x.id === b.target); if (l && l.kind !== 'road') l.progress = b.progress; }
      if (b.turnsLeft <= 0) {
        S.builds.splice(S.builds.indexOf(b), 1); S.completed++;
        if (b.project) { const pr = S.projects[b.target]; pr.stage++; pr.active = null; pr.progress = 0; if (pr.stage >= 3) { pr.done = true; events.push({type:'open', project:b.target, node:pr.node}); } else events.push({type:'package', project:b.target, stage:pr.stage}); }
        else { applyNow(b.action, b.target, b); events.push({type:'complete', action:b.action, target:b.target, node:b.node}); }
      }
    }
    if (m.projects && S.allDoneTurn == null && Object.values(S.projects).every(p => p.done)) S.allDoneTurn = S.turn;
    // 4b) training pipelines (Education → Labor Market) and investment openings
    if (S.academies.length) { S.grad += .5 * S.academies.length; S.invest.talent += 15 * S.academies.length; }
    if (S.ops.apprentice) { S.grad += .25; S.invest.talent += 6; }
    if (S.invest.openAt != null && S.turn >= S.invest.openAt && !S.invest.opened) { S.invest.opened = true; const nd = M(S.mission).invest.node; events.push({type:'open', node:nd, project:null}); }
    // 5) growth & scripted events
    if (m.growth) for (const [id, n] of Object.entries(S.nodes)) { n.pop *= 1 + m.growth; n.jobs *= 1 + m.growth; }
    if (m.energy && m.energy.industryGrowth) S.industry += m.energy.industryGrowth;
    if (m.events && m.events[S.turn]) { const ev = m.events[S.turn]; if (ev.murabbaJobs) { S.nodes.murabba.jobs += ev.murabbaJobs; events.push({type:'event', text:L('New Murabba switches on: +60k jobs and more demand for power.','المربع الجديد يبدأ التشغيل: 60 ألف وظيفة إضافية وطلب أكبر على الطاقة.')}); }
      if (ev.industry) { S.industry += ev.industry; events.push({type:'event', text:ev.text}); }
      if (ev.retire) { S.fossil -= ev.retire; events.push({type:'event', text:ev.text}); } }
    // 6) revenue
    S.budget += .35 + (S.m.visitorsServed || 0) * .012;
    // 7) indicators with causes
    compute();
    S.outageHistory.push(S.m.energy.outage > 0);
    if (S.m.energy.outage > 0) events.push({type:'outage'});
    const deltas = explain(before, S.m);
    S.history.push({turn:S.turn, m:pick(S.m), budget:S.budget, events, deltas});
    S.turn++;
    let report = {events, deltas, turn:S.turn - 1};
    if (S.turn > S.maxTurns) { S.done = true; S.result = evaluate(); report.result = S.result; }
    return report;
  }
  const pick = m => ({mobility:m.mobility, trust:m.trust, sustainability:m.sustainability, resilience:m.resilience, delivery:m.delivery, budget:m.budget, visitorsServed:m.visitorsServed, protected:m.protected, services:m.services});
  function explain(a, b){
    const out = [];
    for (const k of ['mobility','trust','sustainability','resilience']) {
      const d = (b[k] || 0) - (a[k] || 0); if (Math.abs(d) < .8) continue;
      const ca = Object.fromEntries((a.contrib ? a.contrib[k] : []).map(c => [c.label.en, c.v]));
      const diffs = (b.contrib[k] || []).map(c => ({label:c.label, d:c.v - (ca[c.label.en] || 0)}));
      for (const c of a.contrib ? a.contrib[k] : []) if (!(b.contrib[k] || []).some(x => x.label.en === c.label.en)) diffs.push({label:c.label, d:-c.v});
      diffs.sort((x, y) => Math.abs(y.d) - Math.abs(x.d));
      out.push({k, d, causes:diffs.filter(x => Math.abs(x.d) > .3).slice(0, 2)});
    }
    return out;
  }

  /* ============================== STORM ============================== */
  function stormCenter(ph){ const p = S.storm.path[clamp(ph, 0, S.storm.path.length - 1)]; return {lon:p[0], lat:p[1]}; }
  function stormAction(id, target){
    const N = S.nodes, st = S.storm;
    if (id === 'shelter') N[target].shelter = 1;
    if (id === 'medic') N[target].medic = 1;
    if (id === 'generator') N[target].power = Math.max(N[target].power, 1);
    if (id === 'microgrid') N[target].power = 2;
    if (id === 'alert') st.alert = true;
    if (id === 'reroute') { const l = S.links.find(x => x.id === target); l.closed = 1; l.rerouted = true; }
    if (id === 'clear') { const l = S.links.find(x => x.id === target); if (!stormOver(l, st.phase + 1)) { l.closed = 0; l.rerouted = false; delete st.blocked[l.id]; } else st.log.push({clearFailed:l.id}); }
  }
  function stormOver(l, ph){ const c = stormCenter(ph - 1); const mid = {lon:(NODE_DEF[l.a].lon + NODE_DEF[l.b].lon) / 2, lat:(NODE_DEF[l.a].lat + NODE_DEF[l.b].lat) / 2}; return km(mid, c) < S.storm.radius * 1.1; }
  function stormPhase(events){
    const st = S.storm; st.phase++; const ph = st.phase, sev = st.sev[ph - 1] || 0, c = stormCenter(ph - 1);
    // reopen blocked roads that the storm has left for 2 phases
    for (const [id, since] of Object.entries(st.blocked)) if (ph - since >= 2) { const l = S.links.find(x => x.id === id); l.closed = 0; l.rerouted = false; delete st.blocked[id]; }
    // roads hit this phase close; unrerouted traffic is stranded
    compute();
    for (const l of S.links.filter(x => x.kind === 'road')) {
      if (!stormOver(l, ph)) continue;
      if (l.closed && l.rerouted) { st.blocked[l.id] = ph; if (l.rerouted === true) events.push({type:'roadClosed', link:l.id, rerouted:true}); l.rerouted = 'passed'; continue; }   // pre-closed in time: reopens after the storm passes
      if (!l.closed) { const stranded = l.load * sev * .5; S.stranded += stranded; st.atRisk += stranded * 1.5; st.log.push({phase:ph, stranded:l.id, n:stranded}); }
      l.closed = 1; st.blocked[l.id] = ph; events.push({type:'roadClosed', link:l.id, rerouted:false});
    }
    // people & services in districts under the storm
    let svc = 0, svcW = 0;
    for (const [id, n] of Object.entries(S.nodes)) {
      const d = km(NODE_DEF[id], c), hit = d < st.radius * 1.2, w = n.pop + n.jobs;
      if (hit && n.pop > 0) {
        const risk = n.pop * .06 * sev * (st.alert ? .6 : 1);
        const prot = Math.min(1, (n.shelter ? .86 : 0) + (n.medic ? .16 : 0));
        st.atRisk += risk; st.protectedP += risk * prot; st.hitNodes[id] = (st.hitNodes[id] || 0) + 1;
        events.push({type:'hit', node:id, protected:prot, risk});
      }
      if (hit && w > 20) { const cont = n.power >= 2 ? 1 : n.power ? .82 : 1 - .8 * sev; svc += cont * w; svcW += w; }
    }
    st.svcSum += 100 * svc; st.svcN += svcW;   // services measured only where the storm actually hits
  }

  /* ============================ EVALUATION =========================== */
  function evaluate(){
    const m = M(S.mission); compute();
    const pr = m.primary(S);
    const measures = m.storm
      ? {people:S.m.protected, services:S.m.services, mobility:S.m.mobCont ?? S.m.mobility, budget:S.m.budget, trust:S.m.trust}
      : {objective:0, delivery:S.m.delivery, budget:S.m.budget, trust:S.m.trust, sustainability:S.m.sustainability, resilience:S.m.resilience};
    const objScore = pr.met ? clamp(72 + 28 * (pr.value - pr.target) / (pr.target * .25), 72, 100) : clamp(70 * pr.value / pr.target, 0, 69);
    if (!m.storm) measures.objective = objScore;
    const W8 = m.storm ? {people:.45, services:.25, mobility:.1, budget:.1, trust:.1} : {objective:.4, trust:.15, budget:.15, sustainability:.1, resilience:.1, delivery:.1};
    const composite = Object.entries(W8).reduce((a, [k, w]) => a + w * measures[k], 0);
    const lowest = Math.min(...Object.values(measures));
    let medal = null;
    if (pr.met) { medal = 'bronze'; if (composite >= 64 && lowest >= 40) medal = 'silver'; if (composite >= 78 && lowest >= 50) medal = 'gold'; }
    const capped = pr.met && lowest < 50 && composite >= 78;
    const stars = m.optional.map(o => o.test(S));
    const gb = m.goal ? goalBreakdown() : null, adv = gb && !pr.met ? accessAdvice(m, gb) : null;
    const hints = pr.met ? [] : adv ? adv.hints : m.hints.filter(h => h.when(S)).slice(0, 2).map(h => h.text);
    const weak = Object.entries(measures).filter(([k, v]) => v < 50).map(([k]) => k);
    const extra = {mobility:S.m.mobility, visitors:S.m.visitorsServed || 0, renewShare:(S.gridlink && (S.solar || S.wind)) ? S.m.renewShare : 0, freightShare:m.freight ? S.m.freightShare : undefined, reliability:S.m.reliability,
      digital:!!S.ops.digital, twin:has('twin'), offer:S.invest.offer, permits:!!S.invest.did_permits, framework:!!S.invest.did_framework, incentive:!!S.invest.did_incentive, academies:S.academies.length, skilled:skilledTotal(),
      apprentice:!!S.ops.apprentice || !!S.decisions.some(d => d.actions.some(a => a.id === 'apprentice')), research:!!S.research, pricePressure:S.pricePressure, builds:S.completed, projectsOpened:Object.values(S.projects).filter(p => p.done).length + (S.invest.opened ? 1 : 0)};
    return {mission:m.id, extra, primary:pr, measures, composite:Math.round(composite), medal, stars, hints, weak, capped, budgetLeft:+S.budget.toFixed(1), decisions:clone(S.decisions), built:legacy(),
      ...(gb ? {goal:gb, next:adv ? adv.next : null} : {}), optMeasures:m.optional.map(o => o.measure ? o.measure(S) : null)};
  }
  function legacy(){ return {links:S.links.filter(l => l.kind !== 'road' && l.built).map(l => [l.kind, l.a, l.b]).concat(S.links.filter(l => l.kind === 'road' && l.widen).map(l => ['wide', l.a, l.b])),
    sites:[...Object.entries(S.nodes).filter(([id, n]) => n.hotelLv).map(([id, n]) => ['hotel', id, n.hotelLv]), ...Object.keys(S.parks).map(id => ['park', id]), ...Object.keys(S.housing).map(id => ['housing', id]),
      ...(S.solar && S.gridlink ? [['solar', (BOARDS[BOARD].energy || {}).site, S.solar]] : []), ...(S.wind && S.gridlink ? [['wind', (BOARDS[BOARD].energy || {}).site, S.wind]] : []), ...(S.storage ? [['storage', (BOARDS[BOARD].energy || {}).site, S.storage]] : []), ...S.hubs.map(id => ['hub', id]), ...Object.entries(S.projects).filter(([k, p]) => p.done).map(([k, p]) => ['opened', p.node]), ...(S.invest && S.invest.opened ? [['opened', M(S.mission).invest.node]] : []), ...S.academies.map(id => ['academy', id]), ...(S.research ? [['research', S.researchAt]] : []), ...S.warehouses.map(id => ['warehouse', id])].concat([])}; }

  /* ======================== GOAL EXPLANATIONS ======================== */
  // Missions with goal:{sites, to, target} score the LOWEST access score among `sites`. A site's access score
  // (S.m.nodeMob, 0–100) rates trips from that site to `to` (the City Centre) by road and transit; transitPath only
  // follows built lines that connect to the City Centre, so a line between two goal sites carries goal trips only
  // once one of them has its own line to the City Centre.
  const linkEnds = id => (String(id).split(':')[1] || '').split('-');
  const samePair = (id, p) => { const [a, b] = linkEnds(id); return (a === p[0] && b === p[1]) || (a === p[1] && b === p[0]); };
  const transitKinds = {metro:'metro', brt:'brt', route:'brt'};
  function transitPairs(id, target){
    if (id === 'route') { const ns = String(target).split('>'); return ns.slice(1).map((n, k) => [ns[k], n]); }
    return id === 'metro' || id === 'brt' ? [linkEnds(target)] : [];
  }
  function linkLabel(id){
    const kind = String(id).split(':')[0], [a, b] = linkEnds(id), k = (ACTIONS[kind] || {}).name || L(kind, kind);
    return L(`${k.en} ${NODE_DEF[a].name.en} ↔ ${NODE_DEF[b].name.en}`, `${k.ar} ${NODE_DEF[a].name.ar} ↔ ${NODE_DEF[b].name.ar}`);
  }
  const orList = (ids, lang) => ids.map(x => NODE_DEF[x].name[lang]).join(lang === 'en' ? ' or ' : ' أو ');
  function goalBreakdown(){
    const m = M(S.mission); if (!m.goal || !S.m.nodeMob) return null;
    const g = m.goal, nt = S.m.nodeTime || {};
    const sites = g.sites.map(id => { const tm = nt[id] || {}; return {id, value:S.m.nodeMob[id], met:S.m.nodeMob[id] >= g.target,
      transitMin:tm.transit != null ? Math.round(tm.transit) : null, roadMin:tm.road != null ? Math.round(tm.road) : null, freeMin:Math.round(tm.free || 0),
      transitShare:tm.transitShare || 0, path:(S.m.tPaths || {})[id] || null, visitors:+(S.nodes[id].visitors || 0).toFixed(1)}; });
    const weakest = sites.reduce((a, b) => b.value < a.value ? b : a);
    return {target:g.target, to:g.to, value:weakest.value, weakest:weakest.id, sites, ringPct:Math.round((S.m.ringVC || 0) * 100)};
  }

  // What one candidate action does to the goal by the event, and why — shown BEFORE the player spends credits and crews.
  let impactBase = null;
  function routeImpact(id, target){
    const m = M(S.mission); if (!m.goal || !ACTIONS[id]) return null;
    const c = check(id, target); if (!c.ok) return {ok:false, why:c.why};
    const g = m.goal, saved = S, base = clone(S), pairs = transitPairs(id, target);
    const run = withAction => {
      S = clone(base); S.snapshots = {};
      if (withAction) addPlan(id, target);
      let opens = null;
      const pending = () => S.builds.some(b => b.action === id && String(b.target) === String(target));
      while (!S.done) { endTurn(); S.plan = []; if (withAction && opens == null && !pending()) opens = S.turn; }
      return {goal:goalBreakdown(), stars:m.optional.map(o => !!o.test(S)), opens, unfinished:withAction && pending(), ringPct:Math.round(S.m.ringVC * 100)};
    };
    const key = JSON.stringify([S.mission, S.turn, S.plan, S.builds, S.ops, S.budget, S.links.map(l => [l.built, l.widen])]);
    let w, wo;
    try { w = run(true); wo = impactBase && impactBase.key === key ? impactBase.wo : run(false); impactBase = {key, wo}; } finally { S = saved; }
    const site = (r, sid) => r.goal.sites.find(x => x.id === sid);
    const d = w.goal.value - wo.goal.value;
    const sd = Object.fromEntries(g.sites.map(sid => [sid, site(w, sid).value - site(wo, sid).value]));
    const isTransit = !!transitKinds[id], isOps = id === 'freq' || id === 'priority';
    const usedBy = isTransit ? g.sites.filter(sid => (site(w, sid).path || []).some(lid => pairs.some(p => samePair(lid, p)))) : [];
    const touches = isTransit ? g.sites.filter(sid => pairs.some(p => p.includes(sid))) : [];
    const reachesCore = pairs.some(p => p.includes(g.to));
    const r0 = v => Math.round(v), sg = v => (v >= 0 ? '+' : '−') + Math.abs(Math.round(v));
    const nmE = sid => NODE_DEF[sid].name.en, nmA = sid => NODE_DEF[sid].name.ar;
    let code;
    if (w.unfinished) code = 'late';
    else if (isTransit && !usedBy.length && d < .5) code = touches.length && !reachesCore ? 'noCore' : 'offGoal';
    else if (isOps && !g.sites.some(sid => site(w, sid).path)) code = 'noTransit';
    else if (d < 1 && sd[w.goal.weakest] < 1 && Math.max(...Object.values(sd)) >= 1) code = 'capped';   // another site improved, but the binding site did not
    else if (d >= .5) code = 'helps';
    else if (d <= -.5) code = 'hurts';
    else code = 'none';
    const reasons = [], wk = w.goal.weakest, wkv = r0(w.goal.value);
    if (code === 'late') reasons.push(L(`Opens too late: it needs ${c.dur} turns and would still be under construction at the event (turn ${S.maxTurns}).`, `يُفتتح متأخرًا: يحتاج ${c.dur} جولات وسيبقى قيد البناء عند الفعالية (الجولة ${S.maxTurns}).`));
    if (code === 'noCore') {
      const need = touches.filter(sid => !site(w, sid).path);
      reasons.push(L(`Does not reach the City Centre. The goal times trips from each site to the City Centre, so this line carries none of them until ${orList(need.length ? need : touches, 'en')} has its own line to the City Centre (built or in your plan). Add that first, or together.`,
        `لا يصل إلى وسط المدينة. يقيس الهدف الرحلات من كل موقع إلى وسط المدينة، لذلك لن يحمل هذا الخط أيًا منها حتى يحصل ${orList(need.length ? need : touches, 'ar')} على خط خاص به إلى وسط المدينة (منفّذ أو في خطتك). أضف ذلك أولًا أو معه.`));
    }
    if (code === 'offGoal') reasons.push(L(`Serves neither ${g.sites.map(nmE).join(' nor ')}, so it cannot change the goal: only trips from those sites to the City Centre count.`, `لا يخدم ${g.sites.map(nmA).join(' ولا ')}، لذلك لا يغيّر الهدف: تُحتسب فقط الرحلات من هذين الموقعين إلى وسط المدينة.`));
    if (code === 'noTransit') reasons.push(L(`No goal site has a transit line to the City Centre yet, so there is nothing for this to speed up.`, `لا يوجد لأي موقع من مواقع الهدف خط نقل عام إلى وسط المدينة بعد، فلا شيء لتسريعه.`));
    if (code === 'helps') {
      for (const sid of g.sites) { const a = site(w, sid), b = site(wo, sid);
        if (a.path && !b.path && a.transitMin != null) reasons.push(L(`Gives ${nmE(sid)} a ${a.transitMin}-minute transit trip to the City Centre, so event visitors avoid the jammed ring (${nmE(sid)} ${r0(b.value)} → ${r0(a.value)}).`, `يمنح ${nmA(sid)} رحلة نقل عام إلى وسط المدينة مدتها ${a.transitMin} دقيقة، فيتجنب زوار الفعالية الحلقة المزدحمة (${nmA(sid)} ${r0(b.value)} ← ${r0(a.value)}).`));
        else if (Math.abs(sd[sid]) >= 1) reasons.push(L(`${nmE(sid)} access at the event ${r0(b.value)} → ${r0(a.value)}.`, `وصول ${nmA(sid)} يوم الفعالية ${r0(b.value)} ← ${r0(a.value)}.`)); }
      if (id === 'road') reasons.push(L(`More car capacity on this road, but new lanes also attract extra car trips (central ring at ${w.ringPct}% of capacity at the event).`, `سعة أكبر للسيارات على هذا الطريق، لكن المسارات الجديدة تجذب رحلات سيارات إضافية (الحلقة المركزية عند ${w.ringPct}٪ من سعتها يوم الفعالية).`));
      else if (isTransit && !usedBy.length) reasons.push(L(`It carries no Expo or Airport trips itself, but it takes other cars off the central ring.`, `لا يحمل رحلات إكسبو أو المطار بنفسه، لكنه يخفف السيارات الأخرى عن الحلقة المركزية.`));
    }
    if (code === 'hurts') reasons.push(id === 'road'
      ? L(`New lanes attract extra car trips: the central ring reaches ${w.ringPct}% of capacity at the event, so ${nmE(wk)} ends at ${wkv} instead of ${r0(site(wo, wk).value)}.`, `المسارات الجديدة تجذب رحلات سيارات إضافية: تصل الحلقة المركزية إلى ${w.ringPct}٪ من سعتها يوم الفعالية، فينتهي ${nmA(wk)} عند ${wkv} بدلًا من ${r0(site(wo, wk).value)}.`)
      : L(`Lowers the goal: ${nmE(wk)} ends at ${wkv} instead of ${r0(site(wo, wk).value)}.`, `يخفض الهدف: ينتهي ${nmA(wk)} عند ${wkv} بدلًا من ${r0(site(wo, wk).value)}.`));
    if (code === 'capped') { const up = g.sites.filter(sid => sd[sid] >= 1);
      reasons.push(L(`${up.map(sid => `${nmE(sid)} ${sg(sd[sid])}`).join(', ')}, but the goal is the lower of the two sites and ${nmE(wk)} stays at ${wkv}.`, `${up.map(sid => `${nmA(sid)} ${sg(sd[sid])}`).join('، ')}، لكن الهدف هو الموقع الأدنى، ويبقى ${nmA(wk)} عند ${wkv}.`)); }
    if (code === 'none') reasons.push(L(`No measurable change to either site's access at the event.`, `لا تغيير ملموس في وصول أي من الموقعين يوم الفعالية.`));
    if (code !== 'late' && w.goal.value < g.target && code !== 'capped' && code !== 'hurts') reasons.push(L(`Still short: the goal is the lower site, and ${nmE(wk)} would end at ${wkv} of ${g.target}.`, `ما زال غير كافٍ: الهدف هو الموقع الأدنى، وسينتهي ${nmA(wk)} عند ${wkv} من ${g.target}.`));
    const gained = m.optional.filter((o, i) => w.stars[i] && !wo.stars[i]).map(o => o.label), lost = m.optional.filter((o, i) => !w.stars[i] && wo.stars[i]).map(o => o.label);
    for (const o of gained) reasons.push(L(`Also meets the optional ★ “${o.en}” — separate from the main goal.`, `ويحقق أيضًا الهدف الاختياري ★ «${o.ar}» — وهو منفصل عن الهدف الرئيسي.`));
    for (const o of lost) reasons.push(L(`Loses the optional ★ “${o.en}”.`, `يُفقد الهدف الاختياري ★ «${o.ar}».`));
    return {ok:true, code, before:wo.goal.value, after:w.goal.value, delta:d, target:g.target, met:w.goal.value >= g.target, weakest:wk,
      sites:g.sites.map(sid => ({id:sid, before:site(wo, sid).value, after:site(w, sid).value})), cost:c.cost, crews:c.crews || 0, dur:c.dur || 0,
      opens:w.opens, eventTurn:S.maxTurns, reasons, starsGained:gained, starsLost:lost};
  }

  // Result advice built from what actually happened in this playthrough (never blames an action the player did not take).
  function accessAdvice(m, gb){
    const g = m.goal, hints = [], short = gb.sites.filter(x => !x.met).sort((a, b) => a.value - b.value);
    const nmE = sid => NODE_DEF[sid].name.en, nmA = sid => NODE_DEF[sid].name.ar, r0 = Math.round;
    const builtT = S.links.filter(l => (l.kind === 'metro' || l.kind === 'brt') && l.built);
    const usedIds = new Set(Object.values(S.m.tPaths || {}).flat().filter(Boolean));
    let next = null; const told = new Set();
    short.forEach((x, i) => {
      const o = gb.sites.find(y => y.id !== x.id), v = r0(x.value);
      const lead = i === 0 && o ? (o.value > x.value
        ? L(`${nmE(x.id)} was the weak link: its access to the City Centre finished at ${v}/${g.target}, and the goal takes the lower site (${nmE(o.id)} finished at ${r0(o.value)}).`, `كان ${nmA(x.id)} الحلقة الأضعف: انتهى وصوله إلى وسط المدينة عند ${v}/${g.target}، والهدف يأخذ الموقع الأدنى (انتهى ${nmA(o.id)} عند ${r0(o.value)}).`)
        : L(`${nmE(x.id)} finished at ${v}/${g.target}.`, `انتهى ${nmA(x.id)} عند ${v}/${g.target}.`))
        : L(`${nmE(x.id)} also missed: ${v}/${g.target}.`, `لم يبلغ ${nmA(x.id)} الهدف أيضًا: ${v}/${g.target}.`);
      let why;
      if (!x.path) {
        const dangling = builtT.filter(l => (l.a === x.id || l.b === x.id) && !usedIds.has(l.id));
        const dl = dangling.filter(l => !told.has(l.id)).map(l => (told.add(l.id), linkLabel(l.id)));
        why = L(`${dl.length ? `Your ${dl.map(q => q.en).join(', ')} opened, but it does not reach the City Centre, so it carried none of these trips. ` : ''}With no transit line to the City Centre, event visitors went by road through the central ring (${gb.ringPct}% of capacity): about ${x.roadMin} min instead of ${x.freeMin} min uncongested.`,
          `${dl.length ? `افتُتح ${dl.map(q => q.ar).join('، ')}، لكنه لا يصل إلى وسط المدينة فلم يحمل أيًا من هذه الرحلات. ` : ''}بلا خط نقل عام إلى وسط المدينة، سلك زوار الفعالية الطرق عبر الحلقة المركزية (${gb.ringPct}٪ من سعتها): نحو ${x.roadMin} دقيقة بدلًا من ${x.freeMin} دقيقة دون زحام.`);
        const brt = `brt:${g.to}-${x.id}`, metro = `metro:${g.to}-${x.id}`, hasB = S.links.some(l => l.id === brt), hasM = S.links.some(l => l.id === metro);
        if (!next && (hasB || hasM)) { const db = hasB ? durOf(S, 'brt', brt) : null, dm = hasM ? durOf(S, 'metro', metro) : null;
          next = L(`Connect ${nmE(x.id)} to the City Centre: ${[db != null ? `Bus rapid transit opens after ${db} turn${db > 1 ? 's' : ''}` : '', dm != null ? `a metro after ${dm} turns (start it early)` : ''].filter(Boolean).join(', or ')}.${dangling.length ? ' Your existing line then starts to count too.' : ''}`,
            `اربط ${nmA(x.id)} بوسط المدينة: ${[db != null ? `تُفتتح حافلات التردد السريع بعد ${db} جولة` : '', dm != null ? `والمترو بعد ${dm} جولات (ابدأه مبكرًا)` : ''].filter(Boolean).join(' ')}.${dangling.length ? ' عندها يبدأ خطك الحالي في الاحتساب أيضًا.' : ''}`); }
      } else {
        why = L(`It had transit to the City Centre (${x.transitMin} min), but at the event peak only ${r0(x.transitShare * 100)}% of its trips used it; the rest drove through the central ring (${gb.ringPct}% of capacity).`,
          `كان لديه نقل عام إلى وسط المدينة (${x.transitMin} دقيقة)، لكن ${r0(x.transitShare * 100)}٪ فقط من رحلاته استخدمته في ذروة الفعالية؛ والباقي عبر الحلقة المركزية (${gb.ringPct}٪ من سعتها).`);
        if (!next) next = L(`Give ${nmE(x.id)}'s line more capacity: boost transit frequency, or add a faster second line to the City Centre.`, `زد سعة خط ${nmA(x.id)}: عزّز تردد النقل العام، أو أضف خطًا ثانيًا أسرع إلى وسط المدينة.`);
      }
      hints.push(L(`${lead.en} ${why.en}`, `${lead.ar} ${why.ar}`));
    });
    for (const b of S.builds.filter(b => transitKinds[b.action] || b.action === 'road'))
      hints.push(L(`${linkLabel(b.target).en} was still under construction at the event (${b.turnsLeft} turn${b.turnsLeft > 1 ? 's' : ''} left).`, `كان ${linkLabel(b.target).ar} لا يزال قيد البناء يوم الفعالية (بقي ${b.turnsLeft} جولة).`));
    const widened = S.links.filter(l => l.kind === 'road' && l.widen > 0);
    if (widened.length && (S.m.ringVC || 0) > 1.05) hints.push(L(`Your road widening (${widened.map(l => `${nmE(l.a)} ↔ ${nmE(l.b)}`).join(', ')}) attracted extra car trips into the central ring, which reached ${gb.ringPct}% of capacity. Transit to the City Centre takes cars off it instead.`,
      `توسعة الطرق التي نفذتها (${widened.map(l => `${nmA(l.a)} ↔ ${nmA(l.b)}`).join('، ')}) جذبت رحلات سيارات إضافية إلى الحلقة المركزية التي بلغت ${gb.ringPct}٪ من سعتها. النقل العام إلى وسط المدينة يخفف عنها بدلًا من ذلك.`));
    return {hints, next};
  }

  /* ============================== FORECAST =========================== */
  // Runs the deterministic model forward on a copy: with vs without the candidate action.
  function forecast(id, target){
    const saved = S, base = clone(S);
    const run = withAction => {
      S = clone(base); S.snapshots = {}; if (withAction) { const r = addPlan(id, target); if (!r.ok) { S = saved; return null; } }
      const dur = withAction ? (S.plan[S.plan.length - 1] || {}).dur || 0 : 0;
      const horizon = S.maxTurns - S.turn + 1;   // forecast to the end; Digital Twin adds exact figures + medal prediction
      for (let i = 0; i < horizon && !S.done; i++) { const keepPlan = i === 0; if (!keepPlan) S.plan = []; endTurn(); }
      const out = {m:pick(S.m), turns:horizon, result:S.done ? S.result : null, nodeMob:clone(S.m.nodeMob)}; return out;
    };
    const w = run(true), wo = run(false); S = saved;
    if (!w) return null;
    const delta = {}; for (const k of Object.keys(w.m)) if (w.m[k] != null && wo.m[k] != null) delta[k] = w.m[k] - wo.m[k];
    const nodeDelta = {}; for (const k in w.nodeMob) nodeDelta[k] = w.nodeMob[k] - (wo.nodeMob[k] || 0);
    return {delta, nodeDelta, exact:has('twin'), turns:w.turns, result:has('twin') ? w.result : null};
  }

  // Where the mission ends if the player adds nothing else (used for the objective meter).
  function projectEnd(){
    const saved = S; S = clone(saved); S.snapshots = {}; S.plan = saved.plan.slice();
    while (!S.done) { endTurn(); S.plan = []; }
    const r = S.result; S = saved; return r;
  }
  /* ============================ SAVE / REWIND ======================== */
  function snapshot(){ const c = clone(S); delete c.snapshots; S.snapshots[S.turn] = JSON.stringify(c); }
  function rewind(turn){ useBoard(S.board); const snaps = S.snapshots; const txt = snaps[turn]; if (!txt) return false; const keep = {}; for (const t in snaps) if (+t <= turn) keep[t] = snaps[t]; S = JSON.parse(txt); S.snapshots = keep; S.plan = []; S.done = false; S.result = null; S.decisions = S.decisions.filter(d => d.turn < turn); compute(); return true; }
  function serialize(){ return JSON.stringify(S); }
  function load(t){ S = JSON.parse(t); useBoard(S.board || 'riyadh'); compute(); return S; }
  function log(text){ S.log.push({turn:S.turn, text}); }

  /* =============================== API =============================== */
  window.VisionMissions = {
    boardOf:mid => { const m = M(mid); return m ? (m.board || m.chapter || 'riyadh') : 'riyadh'; }, get NODE_DEF(){ return NODE_DEF; }, get ROADS(){ return ROADS; }, get CORRIDORS(){ return CORRIDORS; }, get board(){ return BOARD; }, BOARDS, setBoard:useBoard, ACTIONS, UPGRADES, MISSIONS, CHAPTERS, DAILY_MODS, PKG,
    setWorld:w => { W = w; }, init, get state(){ return S; }, set state(v){ S = v; },
    check, addPlan, removePlan, validTargets, routeValid:t => routeValid(t), roadNeighbours:n => roadNeighbours(n), endTurn, forecast, projectEnd, evaluate, rewind, serialize, load, compute,
    goalBreakdown, routeImpact, linkLabel,
    costOf:(id, t) => costOf(S, id, t), durOf:(id, t) => durOf(S, id, t), crewsTotal, crewsBusy, respPoints, transitBetween:(a, b) => transitBetween(S, a, b), transitPath:id => transitPath(S, id), canAdvance, nextPackage:pid => nextPackage(S, pid),
    upgradeAvailable, stormCenter, mission:M, linkCap:l => linkCap(S, l), km
  };
})();
