// V24: original, procedural Saudi district architecture. No external assets.
// Pure drawing adapter: reads the real parcel state; never changes the simulation.
// All dimensions are fractions of one parcel. Ground is the raised city surface,
// not the national terrain below it. Details share the city's existing geometry batch.
(() => {
  'use strict';
  window.VisionCityArt = ({box, cylinder, ground, quality, palm}) => {
    const P = {stone:[.81,.74,.61], ivory:[.94,.90,.81], trim:[.69,.61,.48],
      glass:[.24,.43,.49], dark:[.16,.23,.25], bronze:[.52,.37,.22],
      paving:[.68,.65,.57], leaf:[.25,.43,.28], soil:[.56,.46,.34],
      roof:[.70,.72,.69], red:[.65,.22,.17], blue:[.28,.52,.60], solar:[.12,.26,.36]};
    const rich=quality!=='low', fine=quality==='high';
    return (t,x,z,s,i,j) => {
      if (!(t.k==='z' && t.st===3) && t.k!=='f') return false;
      // Match the original inactive-service cue. Building ownership/occupancy stays in city.js.
      const glass=t.pow&&t.occ>.1?[.241,.431,.491]:P.glass;
      const off=t.inactive?.55:1, C=c=>off===1?c:c.map(v=>v*off);
      const b=(a,y,c,w,h,d,col=P.stone,rot=0)=>box(x+a*s,ground+y*s,z+c*s,w*s,h*s,d*s,C(col),rot);
      const cy=(a,y,c,r,h,col=P.trim,n=10)=>cylinder(x+a*s,ground+y*s,z+c*s,r*s,h*s,C(col),n);
      const seed=((i*73856093)^(j*19349663))>>>0, variant=seed%4;
      const stone=[P.stone,P.ivory,[.86,.77,.65],[.76,.69,.58]][variant];
      const planter=(a,c,w=.13)=>{b(a,.015,c,w,.075,w,P.trim);b(a,.09,c,w*.82,.045,w*.82,P.leaf);};
      const bench=(a,c)=>{b(a,.11,c,.20,.025,.055,P.bronze);for(const dx of[-.075,.075])b(a+dx,.015,c,.016,.10,.04,P.dark);};
      const shade=(a,c,w,d,y=.45)=>{for(const dx of[-w*.46,w*.46])for(const dz of[-d*.42,d*.42])b(a+dx,.015,c+dz,.025,y,.025,P.bronze);
        b(a,y,c,w+.035,.03,d+.03,P.ivory);if(fine)for(let k=0;k<6;k++)b(a-w*.42+k*w*.168,y+.03,c,.025,.018,d,P.trim);};
      const windows=(w,d,h,start=.14,step=.25)=>{
        if(!rich)return;
        const cols=Math.max(2,Math.floor(w/.16));
        for(let y=start;y<h-.09;y+=step)for(let k=0;k<cols;k++){
          const u=(k+.5)/cols-.5;
          b(u*w,y,d/2+.007,w/cols*.65,Math.min(.14,step*.6),.012,glass);
          b(w/2+.007,y,u*d,.012,Math.min(.14,step*.6),d/cols*.65,glass);
        }
      };
      const roof=(w,d,h)=>{b(0,h,0,w+.035,.035,d+.035,P.ivory);
        if(rich){for(const a of[-1,1]){b(a*w/2,h,0,.025,.085,d,P.trim);b(0,h,a*d/2,w,.085,.025,P.trim);}
          b(-w*.24,h+.035,-d*.22,w*.24,.09,d*.28,P.roof);
          if(fine)for(let k=0;k<3;k++)b(w*.19,h+.045,-d*.2+k*.10,w*.3,.025,.08,P.solar);}};
      const entrance=(d,w=.16)=>{b(0,.01,d/2+.01,w,.23,.025,P.dark);b(0,.25,d/2+.06,w*1.5,.035,.16,P.ivory);};
      b(0,-.01,0,.94,.025,.94,P.paving);
      if(t.k==='z'){
        const lv=t.lv||1;
        if(t.zone==='R' && lv===1){
          // Najdi courtyard villa: tall enough to keep doors and windows above the parcel.
          b(-.10,.015,-.09,.58,.61,.56,stone); b(.22,.015,-.19,.20,.43,.36,stone);
          b(-.10,.625,-.09,.61,.045,.59,P.ivory);
          for(const a of[-1,1]){b(-.10+a*.29,.65,-.09,.026,.08,.58,stone);b(-.10,.65,-.09+a*.28,.58,.08,.026,stone);}
          b(-.12,.03,.195,.14,.29,.02,P.bronze);
          for(const a of[-.29,.09]){b(a,.29,.198,.10,.18,.02,glass);if(fine){for(let k=0;k<3;k++)b(a-.035+k*.035,.29,.215,.012,.18,.015,P.bronze);}}
          if(rich){b(.197,.24,-.12,.012,.17,.17,glass);cy(.06,.67,-.22,.055,.10,P.ivory,8);
            for(const a of[-1,1])b(a*.43,.01,0,.026,.19,.86,stone);b(0,.01,-.43,.86,.19,.026,stone);
            for(const a of[-.28,.28])b(a,.01,.43,.29,.19,.026,stone);
            b(0,.01,.32,.16,.012,.25,P.ivory);planter(.30,.25);if(palm&&(i+j)%3===0)palm(x+.30*s,z+.25*s,.12);shade(-.27,.29,.24,.19,.30);}
        } else if(t.zone==='I'){
          const h=.46+lv*.16;b(0,.01,-.07,.82,h,.65,[.68,.70,.68]);roof(.82,.65,h);
          for(const a of[-.25,0,.25]){b(a,.02,.265,.17,.26,.018,P.dark);b(a,.29,.28,.21,.04,.08,P.ivory);}
          if(rich){for(const a of[-.27,0,.27])b(a,.014,.38,.18,.012,.11,[.67,.54,.25]);cy(.31,h+.04,-.26,.045,.25,P.roof);}
        } else if(t.zone==='C' && lv===1){
          b(0,.01,-.06,.80,.49,.62,P.ivory);roof(.80,.62,.50);
          const accent=[P.blue,P.bronze,P.red,P.leaf][variant];
          for(const a of[-.25,0,.25])b(a,.035,.257,.21,.27,.018,glass);
          b(0,.32,.31,.84,.035,.18,accent); b(0,.39,.26,.55,.065,.018,accent);
          if(fine)for(let k=0;k<7;k++)b(-.30+k*.10,.322,.31,.035,.038,.18,P.ivory);
          if(rich){planter(-.37,.37,.09);bench(.22,.40);}
        } else {
          const tourist=t.zone==='T', mixed=t.zone==='M', residential=t.zone==='R';
          const h=tourist?(lv===1?.65:1.4+lv*.65):residential?(lv===2?1.05:2.45+(seed%10)*.12):mixed?.5+lv*.55:lv===2?1.5:3.0+(seed%10)*.12;
          const w=mixed?.72:.66, d=tourist?.62:w;
          b(0,.01,0,w,h,d,residential||tourist?stone:P.glass);roof(w,d,h);windows(w,d,h);
          if(!residential && rich){
            for(let y=.31;y<h-.1;y+=.27)b(0,y,0,w+.018,.022,d+.018,P.ivory);
            for(const a of[-.24,0,.24])b(a,.02,d/2+.012,.022,h-.04,.025,P.trim);
          }
          entrance(d);if(rich){planter(-.39,.35,.10);planter(.39,.35,.10);}
          if(tourist){b(.24,.025,.39,.28,.02,.15,P.blue);b(-.22,h+.08,0,.08,.12,.08,P.bronze);}
        }
        return true;
      }
      const f=t.fac;
      if(['school','training','clinic','emergency'].includes(f)){
        const accent=f==='clinic'||f==='emergency'?P.red:f==='training'?P.leaf:P.blue;
        b(0,.01,-.10,.84,.52,.54,P.ivory);roof(.84,.54,.53);windows(.84,.54,.52);entrance(.34);
        b(0,.42,.178,.84,.065,.018,accent);
        if(f==='clinic'){b(0,.60,-.1,.24,.025,.065,accent);b(0,.60,-.1,.065,.025,.24,accent);}
        else if(f==='emergency'){for(const a of[-.26,0,.26])b(a,.02,.18,.20,.25,.025,P.dark);b(.28,.56,-.18,.17,.30,.17,P.ivory);}
        else {shade(0,.32,.65,.17,.30);if(fine)cy(.37,.015,.35,.009,.65,P.dark,6);}
        if(rich){planter(-.36,.32,.10);planter(.36,.32,.10);}
      } else if(f==='park'){
        b(0,.01,0,.91,.025,.91,[.35,.49,.31]);b(0,.037,0,.91,.01,.12,P.ivory);b(0,.037,0,.12,.01,.91,P.ivory);
        cy(0,.05,0,.15,.05,P.stone,16);cy(0,.101,0,.12,.008,P.blue,16);cy(0,.11,0,.025,.09,P.ivory,8);
        shade(-.25,-.25,.29,.25,.37);if(rich&&palm)palm(x+.26*s,z-.26*s,.17);
        for(const[a,c]of[[.27,.27],[-.27,.27],[.27,-.27]]){planter(a,c,.18);if(rich){cy(a,.14,c,.02,.23,P.bronze,6);cy(a,.37,c,.11,.14,P.leaf,8);}}
        if(rich){bench(.25,.06);bench(-.25,.06);}
      } else if(f==='solar'){
        for(let a=-1;a<=1;a++)for(let c=-1;c<=1;c++){b(a*.29,.08,c*.28,.24,.025,.20,P.solar);if(rich){b(a*.29,.02,c*.28,.025,.06,.025,P.roof);b(a*.29,.107,c*.28,.008,.003,.20,P.ivory);}}
        b(.37,.02,.36,.12,.18,.12,P.ivory);
      } else if(f==='battery'){
        for(let a=-1;a<=1;a++){b(a*.28,.01,0,.22,.38,.64,P.ivory);b(a*.28,.29,0,.225,.045,.645,P.leaf);if(rich)for(let k=0;k<4;k++)b(a*.28,.07+k*.045,.326,.15,.012,.01,P.dark);}
      } else if(f==='pump'||f==='tower'){
        const h=f==='tower'?.95:.1;for(const a of[-.18,.18])for(const c of[-.18,.18])b(a,.01,c,.035,h,.035,P.roof);
        cy(0,h,0,.29,.30,P.ivory,16);cy(0,h+.12,0,.294,.045,P.blue,16);cy(0,h+.3,0,.30,.035,P.roof,16);
        if(rich)b(.32,.01,0,.14,.20,.23,P.stone);
      } else if(f==='gas'){
        b(-.12,.01,0,.58,.42,.60,P.roof);for(const a of[.19,.34]){cy(a,.01,-.15,.055,1.15,P.ivory,10);cy(a,.88,-.15,.057,.08,P.red,10);}windows(.58,.6,.42);
      } else if(f==='digital'){
        b(0,.01,0,.56,.38,.6,P.ivory);roof(.56,.6,.39);
        cy(0,.42,0,.018,.95,P.roof,6);for(const a of[-.12,.12]){b(a,1.06,0,.025,.27,.08,P.ivory);b(a/2,1.1,0,.12,.018,.02,P.dark);}
      } else if(f==='terminal'){
        for(let a=0;a<3;a++)for(let k=0;k<2;k++)b(-.3+a*.3,.01+k*.15,-.13,.25,.14,.40,[P.blue,P.red,P.bronze][a]);
        for(const a of[-.4,.4])b(a,.01,.27,.04,.80,.05,P.bronze);b(0,.81,.27,.87,.055,.07,P.bronze);
        if(rich){b(0,.61,.27,.02,.20,.02,P.dark);b(0,.59,.27,.12,.025,.10,P.roof);}
      } else if(f==='invest'){
        if(t.opened){b(0,.01,0,.69,3.2,.69,P.glass);windows(.69,.69,3.2);roof(.69,.69,3.2);entrance(.69);}
        else {for(const a of[-.4,.4])for(const c of[-.4,.4])b(a,.01,c,.03,.22,.03,P.bronze);b(0,.12,-.4,.8,.10,.025,P.blue);}
      } else return false;
      return true;
    };
  };
})();
