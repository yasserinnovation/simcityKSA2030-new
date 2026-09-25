// Vision Nexus 2030 — world data.
// Every position is a real latitude/longitude. The engine projects them onto the map,
// so geography stays correct: north is up, the Red Sea is west, the Arabian Gulf is east.
// Projects inside dense cities use an "anchor" city + "spread" factor so markers stay
// readable while keeping their true direction from the city centre.
window.VISION_DATA = {
  projection: {lon0: 45.2, lat0: 24.2, scale: 0.5},

  // Kingdom of Saudi Arabia outline (approximate), [lon, lat].
  saudi: [
    [34.97,29.52],[36.07,29.19],[37.60,30.35],[37.98,31.10],[38.95,31.95],[39.20,32.16],
    [40.40,31.95],[42.10,31.10],[44.70,29.20],[46.55,29.10],[47.45,28.99],[48.42,28.54],
    [48.62,28.10],[49.25,27.52],[49.65,27.00],[50.02,26.62],[50.12,26.25],[50.28,25.85],
    [50.52,25.40],[50.78,24.76],[51.25,24.35],[51.60,24.25],[52.00,22.95],[55.20,22.70],
    [55.65,22.00],[55.00,20.00],[52.00,19.00],[49.10,18.60],[48.20,17.90],[47.45,17.10],
    [46.35,17.25],[45.20,17.40],[44.20,17.35],[43.40,17.55],[43.15,17.20],[42.80,16.40],
    [42.55,16.90],[42.25,17.50],[41.90,17.80],[41.30,18.60],[40.95,19.10],[40.60,19.60],
    [40.15,20.20],[39.80,20.60],[39.35,21.10],[39.15,21.50],[39.10,22.30],[38.95,22.80],
    [38.80,23.10],[38.40,23.65],[38.05,24.10],[37.60,24.55],[37.30,25.00],[36.90,25.60],
    [36.50,26.20],[36.10,26.70],[35.70,27.10],[35.45,27.60],[35.20,28.00],[34.62,28.10],
    [34.80,28.60],[34.88,29.10]
  ],

  // Neighbouring land, drawn lower and muted so the Kingdom reads first.
  neighbours: [
    // Levant / Iraq edge (north of the Kingdom)
    [[34.97,29.52],[34.92,33.8],[48.0,33.8],[48.0,30.45],[48.02,29.95],[47.95,29.55],[48.15,29.30],[48.42,28.54],
     [47.45,28.99],[46.55,29.10],[44.70,29.20],[42.10,31.10],[40.40,31.95],[39.20,32.16],[38.95,31.95],
     [37.98,31.10],[37.60,30.35],[36.07,29.19]],
    // Qatar
    [[50.78,24.76],[50.85,25.50],[51.05,26.05],[51.25,26.15],[51.58,25.80],[51.62,25.20],[51.50,24.60],[51.25,24.35]],
    // UAE, Oman and Yemen (south and east of the Kingdom)
    [[51.60,24.25],[52.60,24.20],[53.60,24.10],[54.40,24.45],[55.30,25.25],[56.05,26.05],[56.40,26.35],[56.35,25.40],
     [56.40,24.80],[57.20,23.95],[58.60,23.60],[59.80,22.50],[59.30,21.40],[58.50,20.40],[57.75,19.60],[56.80,18.60],
     [56.30,17.90],[55.20,17.30],[54.00,16.95],[52.30,16.40],[51.30,15.40],[49.60,14.70],[48.50,14.00],
     [47.00,13.40],[45.00,12.80],[43.50,12.65],[43.25,13.40],[43.00,14.10],[42.75,15.20],[42.80,16.40],
     [43.15,17.20],[43.40,17.55],[44.20,17.35],[45.20,17.40],[46.35,17.25],[47.45,17.10],[48.20,17.90],
     [49.10,18.60],[52.00,19.00],[55.00,20.00],[55.65,22.00],[55.20,22.70],[52.00,22.95]],
    // Africa + Sinai
    [[29.0,9.0],[43.4,9.0],[43.3,11.6],[42.7,12.9],[41.6,13.8],[40.6,14.8],[39.7,15.6],[39.2,16.5],
     [38.6,17.6],[37.9,18.6],[37.3,19.6],[37.25,20.9],[36.9,22.0],[35.7,23.3],[35.5,24.0],[34.8,25.2],
     [34.2,26.2],[33.8,27.2],[33.3,28.0],[32.75,28.9],[32.55,29.95],[32.75,29.85],[33.2,29.1],[33.6,28.4],
     [34.25,27.73],[34.45,28.2],[34.62,28.8],[34.87,29.48],[34.9,33.8],[29.0,33.8]],
    // Iran
    [[48.0,33.8],[48.0,30.45],[48.55,29.95],[49.5,30.0],[50.2,29.4],[50.8,28.8],[51.4,27.9],[52.6,27.35],
     [53.8,26.75],[54.8,26.5],[55.6,26.75],[56.3,27.15],[56.9,26.9],[57.3,25.8],[58.9,25.5],[61.6,25.1],
     [62.5,25.1],[62.5,33.8]]
  ],

  labels: [
    {text:'Red Sea',lon:37.9,lat:21.0,kind:'sea'},{text:'Arabian Gulf',lon:52.2,lat:26.9,kind:'sea'},
    {text:'Arabian Sea',lon:58.4,lat:17.0,kind:'sea'},{text:'Gulf of Aden',lon:47.6,lat:12.4,kind:'sea'},
    {text:'Egypt',lon:31.6,lat:26.0,kind:'country'},{text:'Sudan',lon:33.8,lat:18.4,kind:'country'},
    {text:'Jordan',lon:37.2,lat:31.8,kind:'country'},{text:'Iraq',lon:43.8,lat:32.2,kind:'country'},
    {text:'Kuwait',lon:47.6,lat:29.4,kind:'country'},{text:'Iran',lon:54.5,lat:30.2,kind:'country'},
    {text:'Qatar',lon:51.25,lat:25.35,kind:'country'},{text:'UAE',lon:54.3,lat:23.3,kind:'country'},
    {text:'Oman',lon:57.0,lat:20.8,kind:'country'},{text:'Yemen',lon:47.0,lat:15.5,kind:'country'},
    {text:'Eritrea',lon:38.2,lat:15.2,kind:'country'},
    {text:'NEOM',lon:35.25,lat:28.55,kind:'place'},{text:'Aseer',lon:43.0,lat:19.3,kind:'place'}
  ],

  projects: [
    {id:'expo', name:'Expo 2030 Riyadh', region:'Riyadh', lat:24.93, lon:46.83, anchor:'Riyadh', color:[1.00,0.64,0.19], challenge:'Global destination · mobility · energy', stage:1, icon:'EXPO'},
    {id:'newmurabba', name:'New Murabba', region:'Riyadh', lat:24.84, lon:46.62, anchor:'Riyadh', color:[0.91,0.48,0.20], challenge:'New downtown · culture · digital city', stage:1, icon:'MUKAAB'},
    {id:'ksip', name:'King Salman International Airport', region:'Riyadh', lat:24.97, lon:46.68, anchor:'Riyadh', color:[0.30,0.69,0.90], challenge:'Global aviation · passenger experience', stage:1, icon:'AIR'},
    {id:'metro', name:'Riyadh Metro', region:'Riyadh', lat:24.62, lon:46.72, anchor:'Riyadh', color:[0.49,0.35,0.86], challenge:'Mass transit · accessibility · operations', stage:2, icon:'METRO'},
    {id:'park', name:'King Salman Park', region:'Riyadh', lat:24.74, lon:46.77, anchor:'Riyadh', color:[0.29,0.75,0.38], challenge:'Urban nature · culture · quality of life', stage:2, icon:'PARK'},
    {id:'sports', name:'Sports Boulevard', region:'Riyadh', lat:24.78, lon:46.55, anchor:'Riyadh', color:[0.92,0.32,0.28], challenge:'Active mobility · health · public realm', stage:1, icon:'SPORT'},
    {id:'qiddiya', name:'Qiddiya City', region:'Riyadh', lat:24.52, lon:46.36, anchor:'Riyadh', spread:1.6, color:[0.96,0.31,0.22], challenge:'Entertainment · mobility · visitor demand', stage:1, icon:'PLAY'},
    {id:'diriyah', name:'Diriyah', region:'Riyadh', lat:24.67, lon:46.50, anchor:'Riyadh', color:[0.72,0.42,0.20], challenge:'Heritage · culture · livability', stage:2, icon:'HERITAGE'},
    {id:'greenriyadh', name:'Green Riyadh', region:'Riyadh', lat:24.57, lon:46.88, anchor:'Riyadh', color:[0.20,0.72,0.34], challenge:'Shade · biodiversity · urban comfort', stage:2, icon:'GREEN'},
    {id:'roshn', name:'ROSHN Communities', region:'Riyadh · National', lat:24.90, lon:46.46, anchor:'Riyadh', color:[0.32,0.72,0.45], challenge:'Housing · walkability · community services', stage:2, icon:'HOME'},

    {id:'neom', name:'THE LINE', region:'NEOM', lat:28.25, lon:35.45, color:[0.15,0.72,0.82], challenge:'Advanced urbanism · clean systems', stage:1, icon:'LINE'},
    {id:'oxagon', name:'Oxagon', region:'NEOM', lat:27.50, lon:35.62, color:[0.16,0.62,0.83], challenge:'Port · industry · hydrogen', stage:1, icon:'PORT'},
    {id:'trojena', name:'Trojena', region:'NEOM', lat:28.72, lon:35.35, color:[0.50,0.72,0.91], challenge:'Mountain destination · water · climate', stage:1, icon:'MOUNTAIN'},
    {id:'sindalah', name:'Sindalah', region:'NEOM', lat:27.62, lon:35.05, color:[0.20,0.80,0.83], challenge:'Island tourism · marine stewardship', stage:2, icon:'ISLAND'},
    {id:'hydrogen', name:'NEOM Green Hydrogen', region:'NEOM', lat:27.90, lon:36.00, color:[0.26,0.78,0.48], challenge:'Hydrogen · renewables · export', stage:1, icon:'H2'},
    {id:'redsea', name:'The Red Sea', region:'West Coast', lat:25.55, lon:36.80, color:[0.18,0.64,0.91], challenge:'Regeneration · marine ecology · tourism', stage:2, icon:'REEF'},
    {id:'amaala', name:'AMAALA', region:'Tabuk Coast', lat:26.72, lon:36.28, color:[0.24,0.75,0.78], challenge:'Wellness tourism · coastal ecology', stage:1, icon:'COAST'},
    {id:'alula', name:'Journey Through Time · AlUla', region:'AlUla', lat:26.62, lon:37.92, color:[0.91,0.48,0.25], challenge:'Heritage · archaeology · visitor capacity', stage:2, icon:'ROCK'},

    {id:'madinah', name:'Rua Al Madinah', region:'Madinah', lat:24.47, lon:39.61, color:[0.38,0.75,0.52], challenge:'Hospitality · sacred destination · access', stage:1, icon:'HOSPITALITY'},
    {id:'hajj', name:'Hajj & Pilgrim Experience', region:'Makkah', lat:21.37, lon:39.96, anchor:'Makkah', color:[0.25,0.75,0.48], challenge:'Crowds · safety · sacred journey', stage:2, icon:'HAJJ'},
    {id:'masar', name:'Masar Makkah', region:'Makkah', lat:21.48, lon:39.78, anchor:'Makkah', color:[0.82,0.59,0.24], challenge:'Pilgrim mobility · hospitality · services', stage:1, icon:'ROUTE'},
    {id:'haramain', name:'Haramain High Speed Railway', region:'Western Corridor', lat:23.30, lon:39.30, color:[0.55,0.38,0.85], challenge:'Rail capacity · reliability · integration', stage:2, icon:'RAIL'},
    {id:'jeddahcentral', name:'Jeddah Central', region:'Jeddah', lat:21.50, lon:39.20, color:[0.19,0.62,0.88], challenge:'Waterfront · culture · mobility', stage:1, icon:'WATERFRONT'},
    {id:'ceer', name:'Ceer Automotive Cluster', region:'KAEC', lat:22.50, lon:39.20, color:[0.64,0.36,0.86], challenge:'EV industry · local supply chain', stage:1, icon:'EV'},
    {id:'lucid', name:'Electric Vehicle Manufacturing', region:'KAEC', lat:22.20, lon:39.32, color:[0.41,0.48,0.86], challenge:'Advanced manufacturing · talent', stage:1, icon:'FACTORY'},

    {id:'soudah', name:'Soudah Peaks', region:'Aseer', lat:18.27, lon:42.37, color:[0.25,0.62,0.38], challenge:'Mountain ecology · local tourism', stage:1, icon:'PEAKS'},
    {id:'jazan', name:'Jazan City for Primary Industries', region:'Jazan', lat:17.25, lon:42.55, color:[0.23,0.61,0.76], challenge:'Industry · port · regional growth', stage:2, icon:'INDUSTRY'},
    {id:'eastern', name:'Energy & Industry East', region:'Eastern Province', lat:26.95, lon:49.50, color:[0.96,0.60,0.19], challenge:'Energy transition · logistics', stage:2, icon:'ENERGY'},
    {id:'renewables', name:'Renewable Energy Program', region:'Sudair · National', lat:25.55, lon:45.55, color:[0.94,0.70,0.20], challenge:'Solar · wind · storage · grid', stage:2, icon:'SOLAR'},
    {id:'green', name:'Saudi Green Initiative', region:'Al-Ahsa · National', lat:25.30, lon:49.40, color:[0.20,0.76,0.34], challenge:'Nature · carbon · clean energy', stage:2, icon:'NATURE'}
  ],

  cities: [
    {name:'Riyadh',lat:24.71,lon:46.68,size:1.0,palette:'city',capital:true},
    {name:'Jeddah',lat:21.54,lon:39.20,size:.50,palette:'coast',dx:-34},
    {name:'Makkah',lat:21.42,lon:39.83,size:.36,palette:'sacred',dx:34,priority:9},
    {name:'Madinah',lat:24.47,lon:39.61,size:.42,palette:'sacred'},
    {name:'Dammam',lat:26.43,lon:50.05,size:.50,palette:'coast'},
    {name:'Tabuk',lat:28.38,lon:36.57,size:.34,palette:'desert'},
    {name:'Abha',lat:18.22,lon:42.51,size:.32,palette:'green'},
    {name:'Jazan',lat:16.89,lon:42.58,size:.28,palette:'coast'},
    {name:'AlUla',lat:26.62,lon:37.92,size:.22,palette:'desert'},
    {name:'Buraydah',lat:26.33,lon:43.97,size:.30,palette:'desert'},
    {name:'Hail',lat:27.52,lon:41.69,size:.26,palette:'desert'},
    {name:'Sakakah',lat:29.97,lon:40.21,size:.22,palette:'desert'},
    {name:'Taif',lat:21.27,lon:40.42,size:.26,palette:'green',dx:26,dy:24},
    {name:'Najran',lat:17.49,lon:44.13,size:.22,palette:'desert'},
    {name:'Hofuf',lat:25.38,lon:49.59,size:.26,palette:'desert'}
  ],

  // Road and rail networks as polylines of city names or [lon, lat] waypoints.
  roads: [
    ['Riyadh','Hofuf','Dammam'],['Riyadh',[45.4,23.4],'Taif','Makkah','Jeddah'],['Jeddah',[39.12,22.6],[39.3,23.6],'Madinah'],
    ['Riyadh','Buraydah','Hail','Sakakah'],['Madinah','AlUla','Tabuk',[35.55,28.15]],['Madinah','Buraydah'],
    ['Jeddah',[40.3,19.9],[41.4,18.7],'Jazan'],['Taif',[41.5,20.0],'Abha','Jazan'],['Abha','Najran'],['Riyadh',[45.2,20.5],'Najran'],
    ['Tabuk',[36.0,27.3],[35.65,27.55]]
  ],
  rails: [
    ['Makkah','Jeddah',[39.18,22.4],[39.38,23.6],'Madinah'],['Riyadh','Hofuf','Dammam'],
    ['Riyadh','Buraydah','Hail',[40.7,29.4],'Sakakah']
  ],

  regions: {
    kingdom:{name:'All Saudi Arabia',lat:23.7,lon:45.3,dist:15.2,el:1.18,az:0},
    riyadh:{name:'Riyadh Region',lat:24.66,lon:46.66,dist:2.7,el:0.95,az:0.30},
    west:{name:'Makkah & Western Corridor',lat:22.5,lon:39.6,dist:4.8,el:1.0,az:0.26},
    northwest:{name:'NEOM, AlUla & Red Sea',lat:27.3,lon:36.6,dist:5.0,el:1.0,az:0.26},
    east:{name:'Eastern Province',lat:26.1,lon:49.6,dist:4.2,el:1.0,az:0.28},
    south:{name:'Aseer & Jazan',lat:17.7,lon:42.8,dist:4.0,el:1.0,az:0.28}
  },

  // Dependencies: advancing one project spills delivery progress into its partners.
  links: [
    ['neom','oxagon'],['neom','hydrogen'],['oxagon','hydrogen'],['trojena','neom'],['sindalah','redsea'],['amaala','redsea'],
    ['redsea','alula'],['alula','madinah'],['madinah','haramain'],['haramain','hajj'],['haramain','jeddahcentral'],
    ['hajj','masar'],['ceer','lucid'],['lucid','haramain'],['jeddahcentral','expo'],['expo','ksip'],['expo','metro'],
    ['metro','newmurabba'],['park','greenriyadh'],['qiddiya','sports'],['diriyah','newmurabba'],['roshn','metro'],
    ['renewables','eastern'],['renewables','expo'],['green','greenriyadh'],['eastern','hydrogen'],['soudah','jazan']
  ],

  messages: [
    'Saudi ambition continues through every challenge and every generation.',
    'Each completed connection makes the whole Kingdom stronger.',
    'National progress is larger than any single project, leader or moment.',
    'Resilience grows when people, places and systems learn together.',
    'Infrastructure builds places. People, capability and purpose build the future.',
    'The Kingdom keeps moving—turning pressure into capability and ambition into action.',
    'A delayed milestone is not a lost vision; it is a call to redesign and recover.',
    'Every region contributes a distinct strength to the national journey.',
    'Today’s construction becomes tomorrow’s opportunity.',
    'Heritage and innovation grow stronger when they shape the future together.'
  ]
};
