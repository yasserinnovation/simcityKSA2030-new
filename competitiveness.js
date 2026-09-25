// Vision Nexus 2030 — National competitiveness: observed baseline (read-only) + in-game scenario.
// Three kinds of information are kept strictly apart:
//   OBSERVED  — transcribed source figures (frozen; never modified by play)
//   SIMULATED — in-game Scenario Competitiveness Index and factor scores, driven only by mission results
//   FORECAST  — a game-generated estimate of possible direction (clearly labelled, never a rank)
(() => {
  'use strict';
  const L = (en, ar) => ({en, ar});
  const deepFreeze = o => { Object.values(o).forEach(v => { if (v && typeof v === 'object') deepFreeze(v); }); return Object.freeze(o); };

  /* ============================ OBSERVED ============================= */
  const SOURCE = {
    id:'imd-wcy-2026-sa', version:'1.0.0',
    label:L('IMD World Competitiveness Yearbook 2026 — Saudi Arabia one-page profile; challenges provided by the National Competitiveness Center',
            'الكتاب السنوي للتنافسية العالمية الصادر عن IMD لعام 2026 — ملف المملكة العربية السعودية في صفحة واحدة؛ التحديات مقدمة من المركز الوطني للتنافسية'),
    referenceYear:2026,
    disclaimer:L('Observed figures are transcribed from the source for context. Vision Nexus 2030 is an unofficial game: its simulated scores and forecasts are not endorsed by IMD or the National Competitiveness Center, and are not official statistics or rankings.',
                 'الأرقام المرصودة منقولة من المصدر للسياق. «رؤية نكسس 2030» لعبة غير رسمية: درجاتها المحاكاة وتوقعاتها غير معتمدة من IMD أو المركز الوطني للتنافسية، وليست إحصاءات أو تصنيفات رسمية.'),
    transcription:L('Values were transcribed from the Saudi Arabia 2026 profile PDF and accompanying slides as supplied by the player. Where slides round a figure, the more precise PDF value is used and the rounded slide value is kept as metadata.',
                    'نُقلت القيم من ملف المملكة لعام 2026 والشرائح المرفقة كما زوّدها اللاعب. عندما تقرّب الشرائح رقمًا تُستخدم قيمة الملف الأدق وتُحفظ القيمة المقرّبة كبيانات وصفية.')
  };
  const RANKS = {
    overall: {label:L('Overall','الترتيب العام'), of:70, unit:'rank', history:{2022:24, 2023:17, 2024:16, 2025:17, 2026:13}},
    emea:    {label:L('Europe–Middle East–Africa peer group','مجموعة أوروبا والشرق الأوسط وأفريقيا'), of:45, unit:'rank', history:{2022:17, 2023:12, 2024:10, 2025:11, 2026:8}},
    pop20m:  {label:L('Population above 20 million peer group','مجموعة الدول التي يزيد سكانها على 20 مليونًا'), of:32, unit:'rank', history:{2022:8, 2023:4, 2024:5, 2025:5, 2026:4}}
  };
  const DOMAINS = [
    {id:'econ', name:L('Economic Performance','الأداء الاقتصادي'), icon:'📈'},
    {id:'gov',  name:L('Government Efficiency','الكفاءة الحكومية'), icon:'🏛'},
    {id:'bus',  name:L('Business Efficiency','كفاءة الأعمال'), icon:'💼'},
    {id:'infra',name:L('Infrastructure','البنية التحتية'), icon:'🏗'}
  ];
  // score: out of 100 (2026); rank: 2026 rank among 70; change: previous-year annotation — not transcribed (screenshots not available to verify notation)
  const F = (id, domain, en, ar, score, rank) => ({id, domain, name:L(en, ar), score, rank, year:2026, unit:'score /100', change:null, changeNote:'not transcribed — notation unverified'});
  const FACTORS = [
    F('domestic','econ','Domestic Economy','الاقتصاد المحلي',58.7,9), F('trade','econ','International Trade','التجارة الدولية',55.5,20),
    F('investment','econ','International Investment','الاستثمار الدولي',55.1,18), F('employment','econ','Employment','التوظيف',55.7,22), F('prices','econ','Prices','الأسعار',57.6,16),
    F('pubfin','gov','Public Finance','المالية العامة',64.7,11), F('tax','gov','Tax Policy','السياسة الضريبية',64.3,10), F('institutional','gov','Institutional Framework','الإطار المؤسسي',55.3,28),
    F('legislation','gov','Business Legislation','تشريعات الأعمال',66.9,9), F('societal','gov','Societal Framework','الإطار المجتمعي',47.0,42),
    F('productivity','bus','Productivity & Efficiency','الإنتاجية والكفاءة',63.9,13), F('labor','bus','Labor Market','سوق العمل',61.9,6), F('finance','bus','Finance','التمويل',60.7,17),
    F('management','bus','Management Practices','الممارسات الإدارية',65.2,9), F('attitudes','bus','Attitudes & Values','المواقف والقيم',78.0,4),
    F('basic','infra','Basic Infrastructure','البنية التحتية الأساسية',64.1,3), F('tech','infra','Technological Infrastructure','البنية التحتية التقنية',55.1,29),
    F('science','infra','Scientific Infrastructure','البنية التحتية العلمية',50.1,29), F('health','infra','Health & Environment','الصحة والبيئة',47.6,43), F('education','infra','Education','التعليم',53.1,37)
  ];
  const FACTS = [
    {id:'capital', name:L('Capital','العاصمة'), value:L('Riyadh','الرياض'), year:null, rank:null},
    {id:'land', name:L('Land area','المساحة'), value:2150, unit:L('thousand km²','ألف كم²'), year:2025, rank:null, rankNote:L('Not listed in the PDF. The economy-facts slide shows 9th (slide attribution only).','غير مدرج في الملف. تُظهر شريحة الحقائق الاقتصادية المرتبة 9 (منسوبة للشريحة فقط).'), slide:'2,149.7', fixedGeography:true},
    {id:'fx', name:L('Exchange rate','سعر الصرف'), value:3.750, decimals:3, unit:L('SAR per US dollar','ريال لكل دولار أمريكي'), year:2025, rank:null, slide:'3.8'},
    {id:'population', name:L('Population / market size','السكان / حجم السوق'), value:37.07, decimals:2, unit:L('million','مليون'), year:2025, rank:25, slide:'37.1'},
    {id:'gdp', name:L('GDP','الناتج المحلي الإجمالي'), value:1276.9, decimals:1, unit:L('US$ billion','مليار دولار'), year:2025, rank:18},
    {id:'gdppc', name:L('GDP, PPP per capita','نصيب الفرد من الناتج (تعادل القوة الشرائية)'), value:73621, unit:L('US$','دولار'), year:2025, rank:18, slide:'73,620.9'},
    {id:'growth', name:L('Real GDP growth','نمو الناتج الحقيقي'), value:4.5, decimals:1, unit:'%', year:2025, rank:14},
    {id:'inflation', name:L('Consumer price inflation','تضخم أسعار المستهلك'), value:2.03, decimals:2, unit:'%', year:2025, rank:22, slide:'2.0%'},
    {id:'unemployment', name:L('Unemployment rate','معدل البطالة'), value:3.24, decimals:2, unit:'%', year:2025, rank:15, slide:'3.2%'},
    {id:'labor', name:L('Labor force','القوى العاملة'), value:17.86, decimals:2, unit:L('million','مليون'), year:2025, rank:25},
    {id:'current', name:L('Current account balance','رصيد الحساب الجاري'), value:-2.96, decimals:2, unit:L('% of GDP','٪ من الناتج'), year:2025, rank:53, slide:'−3.0%'},
    {id:'fdistock', name:L('Direct investment stocks inward','أرصدة الاستثمار المباشر الوارد'), value:255.0, decimals:1, unit:L('US$ billion','مليار دولار'), year:2024, rank:28},
    {id:'fdiflow', name:L('Direct investment flows inward','تدفقات الاستثمار المباشر الوارد'), value:1.25, decimals:2, unit:L('% of GDP','٪ من الناتج'), year:2024, rank:46}
  ];
  const CHALLENGES = [
    {arc:'A', name:L('Advance Vision 2030','المضي في رؤية 2030'), icon:'🧭'},
    {arc:'B', name:L('Promote renewable energy and reduce carbon emissions','تعزيز الطاقة المتجددة وخفض الانبعاثات الكربونية'), icon:'⚡'},
    {arc:'C', name:L('Strengthen the position as a global supply-chain hub','تعزيز المكانة كمركز عالمي لسلاسل الإمداد'), icon:'🚢'},
    {arc:'D', name:L('Create opportunities for local and foreign private-sector participation','إيجاد فرص لمشاركة القطاع الخاص المحلي والأجنبي'), icon:'🤝'},
    {arc:'E', name:L('Continue investing in human capital across sectors','مواصلة الاستثمار في رأس المال البشري عبر القطاعات'), icon:'🎓'}
  ];
  const OBSERVED = deepFreeze({SOURCE, RANKS, DOMAINS, FACTORS, FACTS, CHALLENGES});

  /* ======================= WHERE EACH FACTOR PLAYS ======================= */
  // Every factor has a game system and at least one mission/action where it matters.
  const ROLE = {
    domestic:{city:true, sys:L('Visitor spending and jobs from opened projects','إنفاق الزوار ووظائف المشاريع المفتتحة'), where:['m2','d1','s1']},
    trade:{city:true, sys:L('Freight throughput across ports, airports and rail','حركة الشحن عبر الموانئ والمطارات والقطارات'), where:['c1']},
    investment:{city:true, sys:L('Investment-readiness and fictional investment offers','جاهزية الاستثمار وعروض استثمار خيالية'), where:['d1']},
    employment:{city:true, sys:L('Jobs created by apprenticeships, opened projects and local-capability offers','الوظائف من التلمذة المهنية والمشاريع والعروض ذات القدرات المحلية'), where:['t1','d1','m4']},
    prices:{sys:L('Price pressure: running many builds at once raises new build costs by 10%','ضغط الأسعار: تنفيذ مشاريع كثيرة معًا يرفع تكلفة المشاريع الجديدة 10٪'), where:['m4','n1','t1']},
    pubfin:{city:true, sys:L('Investment credits left and recurring operating costs','أرصدة الاستثمار المتبقية وتكاليف التشغيل المتكررة'), where:['m1','m3','a1']},
    tax:{sys:L('Investor incentive action: helps readiness but reduces offer capital','حافز المستثمر: يرفع الجاهزية لكنه يقلل رأس مال العرض'), where:['d1']},
    institutional:{sys:L('One-stop permits: faster, clearer processes for investment','التراخيص الموحدة: إجراءات أسرع وأوضح للاستثمار'), where:['d1']},
    legislation:{sys:L('Investor-ready framework action (process readiness)','إطار جاهز للمستثمر (جاهزية الإجراءات)'), where:['d1']},
    societal:{city:true, sys:L('Public trust, inclusion and which communities benefit (housing, parks, access)','الثقة العامة والشمول والمجتمعات المستفيدة (إسكان وحدائق ووصول)'), where:['m2','m5','w2']},
    productivity:{city:true, sys:L('Travel times, freight reliability and on-time delivery','أزمنة التنقل وموثوقية الشحن والإنجاز في الوقت'), where:['m1','c1','t1']},
    labor:{city:true, sys:L('Skilled crews from training pipelines (skills bottleneck)','الأطقم الماهرة من مسارات التدريب (عنق زجاجة المهارات)'), where:['t1','m4']},
    finance:{sys:L('Offer terms: fast capital vs local capability','شروط العروض: رأس مال سريع مقابل قدرات محلية'), where:['d1']},
    management:{sys:L('Delivering packages on time without waits','إنجاز الحزم في موعدها دون انتظار'), where:['m4','n1','t1']},
    attitudes:{sys:L('Adoption: a strong starting position gives new transit lines higher uptake — but delivery is still required','التبني: نقطة البداية القوية ترفع الإقبال على خطوط النقل الجديدة — لكن الإنجاز ما زال مطلوبًا'), where:['m1','a1']},
    basic:{city:true, sys:L('Transit lines, widened roads and intercity links built','خطوط النقل والطرق الموسعة والروابط بين المدن'), where:['m1','a1','k1']},
    tech:{city:true, sys:L('Digital logistics platform and Digital Twin forecasts','منصة اللوجستيات الرقمية وتوقعات التوأم الرقمي'), where:['c1']},
    science:{sys:L('Research lab: shortens advanced systems work','مختبر الأبحاث: يختصر أعمال الأنظمة المتقدمة'), where:['t1']},
    health:{city:true, sys:L('Clean air, heat relief, parks and protection in storms','هواء نظيف وتخفيف الحرارة وحدائق وحماية أثناء العواصف'), where:['m3','m5','n2','e1']},
    education:{city:true, sys:L('Training academies (benefits arrive after a delay)','أكاديميات التدريب (تظهر فوائدها بعد تأخير)'), where:['t1','d1']}
  };

  /* ============================ SIMULATION ============================ */
  // A mission result becomes a set of factor deltas, each with a cause. Only the best result per
  // mission counts, so replays improve but never stack. Deltas are small and bounded.
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const q = (v, lo, hi) => clamp((v - lo) / (hi - lo), 0, 1);
  function deltasFor(res){
    const m = res.measures || {}, ex = res.extra || {}, out = [];
    const add = (f, v, why) => { if (Math.abs(v) >= .05) out.push({factor:f, delta:+v.toFixed(2), why}); };
    const medal = {gold:1, silver:.7, bronze:.45}[res.medal] || 0;
    if (!medal) return out;   // unfinished missions change nothing in the scenario
    const links = (res.built && res.built.links) || [], sites = (res.built && res.built.sites) || [];
    const transit = links.filter(l => l[0] === 'metro' || l[0] === 'brt' || l[0] === 'freight').length;
    if (transit) add('basic', Math.min(2.5, transit * .6) * medal, L(`${transit} transit or freight link(s) built`, `بناء ${transit} من روابط النقل أو الشحن`));
    if (m.trust != null) add('societal', (m.trust - 55) * .06 * medal, L(`Public trust finished at ${Math.round(m.trust)}`, `انتهت الثقة العامة عند ${Math.round(m.trust)}`));
    if (m.budget != null) add('pubfin', (m.budget - 60) * .02 * medal, L(`Investment credits handled responsibly (budget measure ${Math.round(m.budget)})`, `إدارة أرصدة الاستثمار (مؤشر الميزانية ${Math.round(m.budget)})`));
    if (m.sustainability != null) add('health', (m.sustainability - 55) * .05 * medal, L(`Sustainability finished at ${Math.round(m.sustainability)}`, `انتهت الاستدامة عند ${Math.round(m.sustainability)}`));
    if (m.people != null) add('health', (m.people - 80) * .05 * medal, L(`${Math.round(m.people)}% of people at risk protected`, `حماية ${Math.round(m.people)}٪ من المعرّضين للخطر`));
    if (m.delivery != null) add('management', (m.delivery - 70) * .03 * medal, L(`Delivery measure ${Math.round(m.delivery)}`, `مؤشر الإنجاز ${Math.round(m.delivery)}`));
    if (ex.mobility != null) add('productivity', (ex.mobility - 55) * .04 * medal, L(`Network mobility ${Math.round(ex.mobility)}`, `تنقل الشبكة ${Math.round(ex.mobility)}`));
    if (ex.visitors) add('domestic', Math.min(1.8, ex.visitors / 60) * medal, L(`${Math.round(ex.visitors)}k visitors hosted`, `استضافة ${Math.round(ex.visitors)} ألف زائر`));
    if (ex.renewShare) add('health', ex.renewShare * 1.5 * medal, L(`${Math.round(ex.renewShare * 100)}% of power from renewables`, `${Math.round(ex.renewShare * 100)}٪ من الطاقة من مصادر متجددة`));
    if (ex.freightShare != null) { add('trade', (ex.freightShare - .6) * 5 * medal, L(`${Math.round(ex.freightShare * 100)}% of freight demand moved`, `نقل ${Math.round(ex.freightShare * 100)}٪ من طلب الشحن`)); add('productivity', (ex.reliability - 60) * .03 * medal, L(`Freight reliability ${Math.round(ex.reliability)}`, `موثوقية الشحن ${Math.round(ex.reliability)}`)); }
    if (ex.digital) add('tech', 1.2 * medal, L('Digital logistics platform running','تشغيل منصة اللوجستيات الرقمية'));
    if (ex.twin) add('tech', .4 * medal, L('Digital Twin forecasting used','استخدام توقعات التوأم الرقمي'));
    if (ex.offer === 'A') { add('investment', 1.6 * medal, L('Fast-capital investment offer secured (fictional)','تأمين عرض استثمار برأس مال سريع (خيالي)')); add('finance', 1.1 * medal, L('Capital raised quickly','جمع رأس المال بسرعة')); }
    if (ex.offer === 'B') { add('investment', 1.1 * medal, L('Local-partnership investment offer secured (fictional)','تأمين عرض استثمار بشراكة محلية (خيالي)')); add('employment', 1.2 * medal, L('Local jobs and suppliers from the partnership','وظائف وموردون محليون من الشراكة')); add('finance', .5 * medal, L('Blended financing','تمويل مختلط')); }
    if (ex.permits) add('institutional', 1.1 * medal, L('One-stop permits introduced','إطلاق التراخيص الموحدة'));
    if (ex.framework) add('legislation', .9 * medal, L('Investor-ready framework adopted','اعتماد إطار جاهز للمستثمر'));
    if (ex.incentive) add('tax', .6 * medal, L('Targeted investor incentive used','استخدام حافز استثماري موجّه'));
    if (ex.academies) { add('education', Math.min(2.4, ex.academies * .9) * medal, L(`${ex.academies} training academy/academies opened`, `افتتاح ${ex.academies} من أكاديميات التدريب`)); add('labor', Math.min(1.8, (ex.skilled || 0) * .4) * medal, L(`${ex.skilled || 0} skilled crews trained`, `تدريب ${ex.skilled || 0} من الأطقم الماهرة`)); }
    if (ex.apprentice) add('employment', .8 * medal, L('Apprenticeships created jobs','التلمذة المهنية أوجدت وظائف'));
    if (ex.research) add('science', 1.4 * medal, L('Research lab unlocked faster advanced systems','مختبر الأبحاث سرّع الأنظمة المتقدمة'));
    if (ex.pricePressure) add('prices', -Math.min(1.2, ex.pricePressure * .3), L(`${ex.pricePressure} turn(s) of price pressure from too many parallel builds`, `${ex.pricePressure} جولة من ضغط الأسعار بسبب مشاريع متوازية كثيرة`));
    else if (medal && ex.builds) add('prices', .3 * medal, L('Builds paced without price pressure','وتيرة بناء دون ضغط أسعار'));
    if (ex.projectsOpened) add('employment', Math.min(1.5, ex.projectsOpened * .4) * medal, L(`${ex.projectsOpened} project(s) opened`, `افتتاح ${ex.projectsOpened} من المشاريع`));
    return out;
  }
  // Scenario = observed 2026 factor score + sum of best-result deltas (capped at ±8 per factor).
  function scenario(profile){
    const byF = {}; for (const f of FACTORS) byF[f.id] = {delta:0, causes:[]};
    for (const [mid, rec] of Object.entries((profile && profile.missions) || {})) for (const d of (rec.compDeltas || [])) { if (!byF[d.factor]) continue; byF[d.factor].delta += d.delta; byF[d.factor].causes.push({mission:mid, delta:d.delta, why:d.why}); }
    if (profile && profile.city && profile.city.deltas) for (const d of profile.city.deltas) { if (!byF[d.factor]) continue; byF[d.factor].delta += d.delta; byF[d.factor].causes.push({mission:'city', delta:d.delta, why:d.why}); }   // City Builder outcomes (simulated)
    const factors = FACTORS.map(f => { const b = byF[f.id], dd = clamp(b.delta, -8, 8); return {id:f.id, domain:f.domain, baseline:f.score, delta:+dd.toFixed(2), current:+clamp(f.score + dd, 0, 100).toFixed(1), causes:b.causes}; });
    const avg = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
    const baseIndex = avg(FACTORS.map(f => f.score)), index = avg(factors.map(f => f.current));
    const domains = DOMAINS.map(d => ({id:d.id, baseline:+avg(FACTORS.filter(f => f.domain === d.id).map(f => f.score)).toFixed(1), current:+avg(factors.filter(f => f.domain === d.id).map(f => f.current)).toFixed(1)}));
    return {factors, domains, baseIndex:+baseIndex.toFixed(1), index:+index.toFixed(1)};
  }
  // Forecast: if the player keeps winning arcs at their current average effect, where could the index go by 2030?
  function forecast(profile){
    const sc = scenario(profile), done = Object.values((profile && profile.missions) || {}).filter(r => r.medal && r.compDeltas).length;
    const gained = sc.index - sc.baseIndex, perMission = done ? gained / done : .25, remaining = Math.max(0, 9 - done);
    const mid = sc.index + perMission * remaining * .8;
    return {year:2030, low:+(sc.index + perMission * remaining * .4).toFixed(1), mid:+mid.toFixed(1), high:+(sc.index + perMission * remaining * 1.1).toFixed(1), assumptions:L('Assumes the remaining Riyadh arc missions are completed with your average effect so far. Game estimate only — not a projection of any official statistic or rank.','يفترض إكمال بقية مهام مسارات الرياض بمتوسط أثرك حتى الآن. تقدير من اللعبة فقط — ليس إسقاطًا لأي إحصاء أو ترتيب رسمي.')};
  }
  // Live gameplay couplings (documented, small): the observed starting strengths shape play.
  function couplings(profile){
    const sc = scenario(profile), f = id => sc.factors.find(x => x.id === id).current;
    const city = (profile && profile.city) || {};
    return {
      cityCaps: city.caps || [],
      adoption: clamp((f('attitudes') - 50) / 560, 0, .08) + Math.min(.03, (city.transitShare || 0) * .15),   // your City Builder bus habit adds a little uptake    // Attitudes & Values → transit uptake bonus (≈ +5% at the 2026 baseline)
      priceThreshold: f('prices') >= 60 ? 4 : 3,                // Prices → how many parallel builds before price pressure starts
      skilledBonus: f('labor') >= 64 ? 1 : 0,                   // Labor Market → an extra skilled crew once strengthened
      techVisibility: f('tech') >= 58                           // Technological Infrastructure → freight reliability readout without the Logistics upgrade
    };
  }
  window.VisionCompetitiveness = {OBSERVED, ROLE, deltasFor, scenario, forecast, couplings};
})();
