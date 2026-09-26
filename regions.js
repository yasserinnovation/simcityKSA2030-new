// Vision Nexus 2030 — regional plans for the Eastern Province, Western Corridor, NEOM / Northwest and Southwest.
// Pure data + small geometry helpers (no WebGL), consumed by layout.js and drawn by engine.js.
//  • Each region is a GEOGRAPHICALLY INFORMED GAME ILLUSTRATION, not a GIS map: landmarks keep their real compass
//    relationships and sit on the real coastline of the national map, but spacing is adjusted so every landmark reads
//    at the default camera distance. North is up in every region (same world frame as the Kingdom and Riyadh views).
//  • Coastal landmarks are placed relative to the drawn coastline (coastW / coastE), so land stays land and sea stays sea.
//  • Only the drawing moves: missions, challenges and the national simulation keep using lon/lat and their own world
//    positions, so outcomes and saves are unchanged.
//  • Reference compositions (project root, exact file names): estern.png, western.png, neom.png, south.png.
(() => {
  'use strict';
  const D = window.VISION_DATA;
  const PJ = D.projection, KX = PJ.scale * Math.cos(PJ.lat0 * Math.PI / 180), KZ = PJ.scale;
  const geo = (lon, lat) => [(lon - PJ.lon0) * KX, -(lat - PJ.lat0) * KZ];
  const SA = D.saudi.map(([lo, la]) => geo(lo, la));
  const crossings = z => { const xs = []; for (let i = 0, j = SA.length - 1; i < SA.length; j = i++) { const [xi, zi] = SA[i], [xj, zj] = SA[j]; if ((zi > z) !== (zj > z)) xs.push(xi + (z - zi) / (zj - zi) * (xj - xi)); } return xs.sort((a, b) => a - b); };
  const coastW = z => crossings(z)[0];                                  // Red Sea shore (west side of the Kingdom)
  const coastE = z => { const xs = crossings(z); return xs[xs.length - 1]; };   // Arabian Gulf shore (east side)
  const W = (z, inland) => [coastW(z) + inland, z];                    // a point `inland` east of the Red Sea shore
  const E = (z, inland) => [coastE(z) - inland, z];                    // a point `inland` west of the Gulf shore
  const N = (en, ar) => ({en, ar});

  const PLANS = {
    // ------------------------------------------------------------------ EASTERN PROVINCE (estern.png)
    east: {
      name:N('Eastern Province', 'المنطقة الشرقية'), reference:'estern.png',
      bounds:{x0:1.70, x1:2.62, z0:-1.74, z1:-.32}, camera:{x:2.08, z:-1.04, dist:2.55}, kingdomLabel:[1.55, -1.62],
      projects:{
        eastern:{at:E(-1.48, .05), r:.08, cl:'Dammam', label:N('Jubail · Energy & Industry', 'الجبيل · الطاقة والصناعة')},
        green:  {at:[1.99, -.50], r:.095, cl:'Dammam', label:N('Al Ahsa Oasis', 'واحة الأحساء')}
      },
      places:{
        qatif:  {name:N('Al Qatif · Tarout', 'القطيف · تاروت'), at:E(-1.26, .05), r:.05},
        dammam: {name:N('Dammam', 'الدمام'), city:'Dammam', at:E(-1.06, .06), r:.058, projects:['eastern']},
        dhahran:{name:N('Dhahran', 'الظهران'), at:[2.02, -.92], r:.062},
        khobar: {name:N('Al Khobar', 'الخبر'), at:E(-.83, .07), r:.056},
        hofuf:  {name:N('Hofuf', 'الهفوف'), city:'Hofuf', at:[1.845, -.455], r:.04, projects:['green']}
      },
      roads:[
        {id:'eCoast', kind:'road', w:.018, name:N('Coastal Highway', 'الطريق الساحلي'), pts:[[1.75,-1.72],[1.815,-1.56],[1.83,-1.47],[1.87,-1.38],[1.98,-1.30],[2.02,-1.27],[2.075,-1.16],[2.09,-1.07],[2.13,-.97],[2.16,-.87],[2.20,-.75],[2.29,-.62],[2.37,-.50]]},
        {id:'eInland', kind:'road', w:.016, name:N('Dammam–Al Ahsa Highway', 'طريق الدمام – الأحساء'), pts:[[2.09,-1.07],[2.00,-1.02],[1.935,-.955],[1.905,-.80],[1.90,-.66],[1.875,-.52],[1.86,-.495]]},
        {id:'eRail', kind:'rail', w:.008, name:N('Dammam–Al Ahsa Railway', 'سكة الدمام – الأحساء'), pts:[[2.075,-1.115],[1.98,-1.055],[1.905,-.975],[1.878,-.81],[1.872,-.66],[1.852,-.50]]},
        {id:'eWest', kind:'road', w:.016, pts:[[1.70,-.455],[1.805,-.455]]},
        {id:'eWestRail', kind:'rail', w:.008, pts:[[1.70,-.43],[1.815,-.43]]},
        {id:'eCauseway', kind:'causeway', w:.009, name:N('King Fahd Causeway', 'جسر الملك فهد'), pts:[[2.31,-.855],[2.355,-.885],[2.385,-.905]]}
      ],
      gates:[{pt:[1.70,-.455], kind:'road', cities:['Hofuf','Dammam']}, {pt:[1.70,-.43], kind:'rail', cities:['Hofuf','Dammam']}],
      isles:[[2.232,-1.25,.024], [2.275,-1.31,.012], [2.28,-1.19,.01], [2.43,-.98,.012]],
      decor:{hills:[[1.73,-1.62,.05],[1.75,-1.35,.06],[1.74,-1.05,.05],[1.76,-.80,.05],[1.72,-.62,.045],[1.79,-1.70,.04]]}
    },
    // ------------------------------------------------------------------ WESTERN CORRIDOR (western.png)
    west: {
      name:N('Western Corridor', 'الممر الغربي'), reference:'western.png',
      bounds:{x0:-3.45, x1:-1.95, z0:-.42, z1:1.84}, camera:{x:-2.36, z:.60, dist:3.6, phoneFit:1.1}, kingdomLabel:[-1.85, .45],
      projects:{
        madinah:      {at:[-2.472, -.115], r:.04, cl:'Madinah'},
        ceer:         {at:W(.80, .06), r:.06, cl:'Jeddah', label:N('KAEC / Ceer', 'مدينة الملك عبدالله الاقتصادية / سير')},
        lucid:        {at:W(.98, .05), r:.045, cl:'Jeddah'},
        jeddahcentral:{at:[-2.738, 1.335], r:.034, cl:'Jeddah', pad:[-2.734, 1.352]},
        masar:        {at:[-2.52, 1.396], ribbon:{pts:[[-2.49,1.40],[-2.52,1.396],[-2.555,1.39]], hw:.018}, pad:[-2.52, 1.396], cl:'Makkah'},
        hajj:         {at:[-2.255, 1.43], r:.05, cl:'Makkah', label:N('Holy Sites · Hajj', 'المشاعر المقدسة · الحج')},
        haramain:     {at:[-2.66, .45], ribbon:{pts:[[-2.62,-.04],[-2.655,.30],[-2.635,.62],[-2.628,.86],[-2.628,1.06],[-2.595,1.215],[-2.56,1.30],[-2.47,1.335]], hw:.016}, pad:[-2.655, .45], cl:'Jeddah'}
      },
      places:{
        madinah:{name:N('Madinah', 'المدينة المنورة'), city:'Madinah', at:[-2.585, -.12], r:.055, projects:['madinah','haramain']},
        jeddah: {name:N('Jeddah', 'جدة'), city:'Jeddah', at:[-2.685, 1.235], r:.06, projects:['jeddahcentral','haramain']},
        makkah: {name:N('Makkah', 'مكة المكرمة'), city:'Makkah', at:[-2.40, 1.40], r:.055, projects:['masar','hajj','haramain']},
        taif:   {name:N('Taif', 'الطائف'), city:'Taif', at:[-2.08, 1.47], r:.058}
      },
      roads:[
        {id:'wNorth', kind:'road', w:.016, name:N('Madinah–Jeddah Highway', 'طريق المدينة – جدة'), pts:[[-2.53,-.075],[-2.595,.30],[-2.59,.70],[-2.585,1.08],[-2.63,1.19]]},
        {id:'wMakkah', kind:'road', w:.016, name:N('Jeddah–Makkah Highway', 'طريق جدة – مكة'), pts:[[-2.635,1.27],[-2.59,1.36],[-2.57,1.388]]},
        {id:'wTaif', kind:'road', w:.012, name:N('Taif Mountain Road', 'طريق الطائف الجبلي'), pts:[[-2.35,1.375],[-2.32,1.35],[-2.28,1.36],[-2.24,1.345],[-2.20,1.37],[-2.18,1.40],[-2.16,1.39],[-2.15,1.43],[-2.136,1.458]]},
        {id:'wHajj', kind:'road', w:.01, pts:[[-2.346,1.41],[-2.305,1.425]]},
        {id:'wSouth', kind:'road', w:.014, pts:[[-2.66,1.345],[-2.655,1.40],[-2.645,1.50],[-2.615,1.58],[-2.54,1.70],[-2.42,1.84]]},
        {id:'wMadNW', kind:'road', w:.014, pts:[[-2.625,-.155],[-2.68,-.28],[-2.73,-.42]]},
        {id:'wMadNE', kind:'road', w:.014, pts:[[-2.535,-.155],[-2.44,-.28],[-2.36,-.42]]},
        {id:'wTaifE', kind:'road', w:.014, pts:[[-2.024,1.47],[-1.95,1.46]]},
        {id:'wTaifS', kind:'road', w:.014, pts:[[-2.075,1.528],[-2.06,1.66],[-2.05,1.84]]}
      ],
      gates:[{pt:[-2.73,-.42], kind:'road', cities:['Madinah']}, {pt:[-2.36,-.42], kind:'road', cities:['Madinah']},
             {pt:[-1.95,1.46], kind:'road', cities:['Taif','Makkah','Jeddah']}, {pt:[-2.05,1.84], kind:'road', cities:['Taif']},
             {pt:[-2.42,1.84], kind:'road', cities:['Jeddah']}],
      isles:[[-2.86,1.08,.012],[-2.84,1.62,.01]],
      decor:{}
    },
    // ------------------------------------------------------------------ NEOM / NORTHWEST (neom.png)
    northwest: {
      name:N('NEOM & Northwest', 'نيوم والشمال الغربي'), reference:'neom.png',
      bounds:{x0:-4.92, x1:-3.12, z0:-2.62, z1:-.46}, camera:{x:-4.02, z:-1.60, dist:3.7, phoneFit:1.2}, kingdomLabel:[-3.25, -2.45],
      heading:{text:N('NEOM', 'نيوم'), at:[-4.62, -2.14]},
      projects:{
        neom:     {at:[-4.44, -2.10], ribbon:{pts:[[-4.765,-2.02],[-4.44,-2.10],[-4.12,-2.18]], hw:.008}, pad:[-4.44, -2.098], cl:'Tabuk'},
        trojena:  {at:[-4.40, -2.36], r:.085, cl:'Tabuk'},
        sindalah: {at:[-4.66, -1.66], r:.045, cl:'Tabuk', sea:true},
        oxagon:   {at:W(-1.64, 0), r:.085, cl:'Tabuk', pad:[-4.37, -1.62]},
        hydrogen: {at:[-4.245, -1.735], r:.065, cl:'Tabuk', label:N('Green Hydrogen', 'الهيدروجين الأخضر')},
        amaala:   {at:W(-1.22, .005), r:.065, cl:'Tabuk', pad:[-4.09, -1.23]},
        redsea:   {at:[-3.90, -.66], r:.085, cl:'Tabuk', sea:true, label:N('The Red Sea Destination', 'وجهة البحر الأحمر')},
        alula:    {at:[-3.33, -1.20], r:.10, cl:'AlUla'}
      },
      places:{
        tabuk:{name:N('Tabuk', 'تبوك'), city:'Tabuk', at:[-3.94, -2.09], r:.06}
      },
      roads:[
        {id:'nOxagon', kind:'road', w:.014, pts:[[-4.00,-2.08],[-4.08,-1.95],[-4.17,-1.82],[-4.30,-1.815],[-4.39,-1.73]]},
        {id:'nAlUla', kind:'road', w:.014, pts:[[-3.905,-2.04],[-3.75,-1.75],[-3.55,-1.45],[-3.40,-1.28]]},
        {id:'nMadinah', kind:'road', w:.014, pts:[[-3.26,-1.12],[-3.20,-.98],[-3.12,-.86]]},
        {id:'nCoast', kind:'road', w:.012, pts:[[-4.37,-1.575],[-4.26,-1.43],[-4.13,-1.33],[-4.03,-1.25],[-3.95,-1.05],[-3.85,-.86],[-3.745,-.635]]},
        {id:'nTrojena', kind:'road', w:.01, pts:[[-4.08,-1.95],[-4.05,-2.12],[-4.10,-2.26],[-4.16,-2.25],[-4.20,-2.30],[-4.26,-2.29],[-4.315,-2.35]]},
        {id:'nBoatS', kind:'boat', pts:[[-4.45,-1.60],[-4.56,-1.62],[-4.625,-1.64]]},
        {id:'nBoatR', kind:'boat', pts:[[-3.745,-.635],[-3.80,-.64],[-3.83,-.655]]},
        {id:'nBoatA', kind:'boat', pts:[[-4.19,-1.21],[-4.10,-1.00],[-3.97,-.78],[-3.92,-.71]]}
      ],
      gates:[{pt:[-3.12,-.86], kind:'road', cities:['AlUla','Tabuk']}],
      isles:[],
      decor:{}
    },
    // ------------------------------------------------------------------ SOUTHWEST (south.png)
    south: {
      name:N('Southwest · Aseer & Jazan', 'الجنوب الغربي · عسير وجازان'), reference:'south.png',
      bounds:{x0:-1.98, x1:-.28, z0:2.50, z1:3.90}, camera:{x:-1.05, z:3.12, dist:2.9}, kingdomLabel:[-.55, 2.78],
      heading:{text:N('Aseer', 'عسير'), at:[-1.13, 2.74]},
      projects:{
        jazan: {at:W(3.20, .075), r:.075, cl:'Jazan', label:N('Jazan Industrial City', 'مدينة جازان الصناعية')},
        soudah:{at:[-1.40, 2.90], r:.065, cl:'Abha'}
      },
      places:{
        abha:  {name:N('Abha', 'أبها'), city:'Abha', at:[-1.22, 2.985], r:.06, projects:['soudah']},
        jazanc:{name:N('Jazan', 'جازان'), city:'Jazan', at:W(3.60, .035), r:.058, projects:['jazan']},
        najran:{name:N('Najran', 'نجران'), city:'Najran', at:[-.52, 3.36], r:.065}
      },
      roads:[
        {id:'sCoast', kind:'road', w:.016, name:N('Coastal Road', 'الطريق الساحلي'), pts:[[-1.87,2.52],[-1.75,2.72],[-1.62,2.92],[-1.50,3.02],[-1.36,3.10],[-1.325,3.20],[-1.28,3.34],[-1.20,3.47],[-1.125,3.56],[-1.10,3.72]]},
        {id:'sAbha', kind:'road', w:.012, name:N('Mountain Road', 'الطريق الجبلي'), pts:[[-1.53,3.03],[-1.51,2.985],[-1.48,3.02],[-1.45,3.00],[-1.42,3.025],[-1.38,3.005],[-1.34,3.015],[-1.281,2.99]]},
        {id:'sSoudah', kind:'road', w:.008, pts:[[-1.42,3.025],[-1.405,2.966]]},
        {id:'sNajran', kind:'road', w:.016, name:N('Abha–Najran Highway', 'طريق أبها – نجران'), pts:[[-1.16,2.995],[-1.00,3.08],[-.80,3.20],[-.66,3.30],[-.585,3.355]]},
        {id:'sNorth', kind:'road', w:.014, pts:[[-1.38,2.50],[-1.32,2.70],[-1.25,2.85],[-1.225,2.925]]},
        {id:'sEast', kind:'road', w:.014, pts:[[-.28,3.22],[-.465,3.31]]}
      ],
      gates:[{pt:[-1.87,2.52], kind:'road', cities:['Jazan']}, {pt:[-1.38,2.50], kind:'road', cities:['Abha','Jazan']}, {pt:[-.28,3.22], kind:'road', cities:['Najran']}],
      isles:[],
      decor:{}
    }
  };

  // Mission-only sites drawn on these plans (board:node → plan position). Simulation keeps lon/lat; only drawing uses these.
  const EP = PLANS.east.places, WP = PLANS.west.places, SP = PLANS.south.places, NP = PLANS.northwest.places;
  const SITES = {
    'kingdom:jeddah':WP.jeddah.at, 'kingdom:makkah':WP.makkah.at, 'kingdom:madinah':WP.madinah.at, 'kingdom:dammam':EP.dammam.at,
    'kingdom:tabuk':NP.tabuk.at, 'kingdom:abha':SP.abha.at, 'kingdom:jazan':SP.jazanc.at, 'kingdom:hofuf':EP.hofuf.at, 'kingdom:alula':PLANS.northwest.projects.alula.at,
    'east:core':EP.dammam.at, 'east:khobar':EP.khobar.at, 'east:dhahran':EP.dhahran.at, 'east:qatif':EP.qatif.at,
    'east:dport':E(-1.123, .008), 'east:kfia':[1.965, -1.19], 'east:hofuf':EP.hofuf.at,
    'west:core':WP.makkah.at, 'west:kaia':[-2.712, 1.115], 'west:jport':W(1.56, .006), 'west:north':[-2.70, 1.195], 'west:south':[-2.66, 1.40],
    'west:balad':[-2.70, 1.375], 'west:taif':WP.taif.at,
    'south:core':SP.abha.at, 'south:rijal':[-1.53, 2.93], 'south:khamis':[-1.06, 2.985], 'south:abhair':[-1.10, 3.10], 'south:jazanc':SP.jazanc.at, 'south:najran':SP.najran.at,
    'neom:tabuk':NP.tabuk.at, 'neom:nsolar':[-4.165, -1.66]
  };
  // Timed-challenge assets drawn on these plans (the simulation keeps its own positions — see game.js / layout planWarp).
  const CHALLENGE = {
    rainfall:{underpass:[-2.64, 1.28], kaia:[-2.712, 1.115], albalad:[-2.70, 1.375], desal:[-2.62, 1.58], 'hhr-jeddah':[-2.595, 1.215], 'jc-site':[-2.738, 1.335], _base:[-2.52, 1.16]},
    hajj:{haram:[-2.40, 1.395], jamarat:[-2.358, 1.398], mina:[-2.329, 1.408], mashaer:[-2.30, 1.429], health:[-2.281, 1.45], arafat:[-2.252, 1.471], _base:[-2.28, 1.56]}   // a scaled copy of the simulated layout (never folds)
  };

  window.VisionRegions = {PLANS, SITES, CHALLENGE, coastW, coastE, geo, crossings};
})();
