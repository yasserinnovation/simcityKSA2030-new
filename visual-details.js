// V16 detail pass. Locally authored geometry, no branding or external assets.
// All architecture uses existing project stages; small service props remain instanced.
(() => {
  'use strict';
  window.VisionSlice = {init(K, protos) {
    const {G, addBox:box, addRod:rod, addCylinder:cylinder, addDisc:disc,
      addQuad:quad, addStrip:strip, sig, inst} = K;
    const stone=[.83,.79,.70], metal=[.68,.70,.71], ink=[.18,.21,.24], leaf=[.29,.48,.30];
    const extend = (key, fn) => {const build=protos[key].build;protos[key].build=c=>{build(c);fn(c);};};
    extend('jet',()=>{
      // Individual cabin windows, door outlines, winglets and engine intake rims.
      for(const s of [-1,1]) {
        for(let x=-.27;x<.32;x+=.029) box(x,.093,s*.050,.011,.012,.0025,ink);
        for(const x of [-.29,.31]) {
          box(x,.060,s*.044,.002,.057,.003,metal);
          box(x+.020,.060,s*.044,.002,.057,.003,metal);
          box(x+.010,.115,s*.044,.022,.002,.003,metal);
        }
        rod([-.172,.082,s*.47],[-.195,.144,s*.479],.009,[.70,.75,.78]);
        for(let j=0;j<12;j++) {
          const a=j/12*Math.PI*2,b=(j+1)/12*Math.PI*2;
          rod([.141,.046+Math.cos(a)*.027,s*.17+Math.sin(a)*.027],
              [.141,.046+Math.cos(b)*.027,s*.17+Math.sin(b)*.027],.004,metal);
        }
      }
    });
    // Wheels with exposed hubs, tow bars and recognizable equipment fittings.
    for(const [key,len,width,radius] of [
      ['tug',.0026,.0016,.00040],['bagcart',.0024,.0015,.00032],
      ['pushback',.0042,.0024,.00047],['belt',.0042,.0017,.00038],
      ['catering',.0052,.0018,.00043],['van',.0034,.0016,.00040],
      ['gpu',.0022,.0014,.00032],['bus',.010,.0024,.00048],['stairs',.004,.0016,.00036]
    ]) extend(key,()=>{
      for(const x of [-len*.31,len*.31]) for(const s of [-1,1]) {
        // Side-facing wheel rings built from rods; no extra draw call per wheel.
        const z=s*(width*.5+.00010);
        for(let j=0;j<8;j++) {
          const a=j/8*Math.PI*2,b=(j+1)/8*Math.PI*2;
          rod([x+Math.cos(a)*radius,radius+Math.sin(a)*radius,z],
              [x+Math.cos(b)*radius,radius+Math.sin(b)*radius,z],radius*.48,ink);
        }
        box(x,radius*.65,z,.00028,.00028,.00010,metal);
      }
      if(key==='bagcart'||key==='gpu') rod([len*.5,.0004,0],[len*.5+.001,.0004,0],.00018,metal);
      if(key==='belt') {
        for(const s of [-1,1]) rod([-.0018,.00135,s*.0005],[.0028,.00365,s*.0005],.00018,metal);
        for(let i=0;i<7;i++) box(-.0015+i*.00065,.00125+i*.00033,0,.00016,.00018,.0008,metal);
      }
      if(key==='gpu') rod([.001,.001,0],[.0028,.0002,.0004],.00016,ink);
      if(key==='bus') for(let x=-.004;x<.004;x+=.0012) box(x,.0013,.00127,.00012,.0007,.00010,metal);
    });
    extend('ride',()=>{
      // Paired seats, raised restraints and visible wheel bogies.
      for(const x of [-.0008,.0005]) for(const s of [-1,1]) {
        box(x,.0011,s*.00046,.0008,.0006,.00060,ink);
        rod([x-.00025,.00155,s*.00046],[x+.00025,.00155,s*.00046],.00016,metal);
        box(x,-.00030,s*.0010,.00065,.00045,.00035,ink);
      }
    });
    function airport(p) {
      const X=d=>p.x+d,Z=d=>p.z+d,ys=G+.00545;
      // Subtle concrete panel joints instead of a single featureless apron.
      for(let x=-.09;x<.094;x+=.009) strip([X(x),Z(.017)],[X(x),Z(.0505)],.000065,ys,[.64,.65,.65]);
      for(let z=.018;z<.051;z+=.008) strip([X(-.09),Z(z)],[X(.094),Z(z)],.000065,ys,[.64,.65,.65]);
      sig('ksip',()=>{
        // Gate concourses join the main hall to the existing bridge rotundas.
        for(const sx of [-.062,-.037,-.012,.013,.038]) {
          box(X(sx+.0095),G+.0052,Z(.050),.006,.005,.009,[.42,.57,.63]);
          box(X(sx+.0095),G+.0102,Z(.050),.007,.00065,.010,[.90,.89,.84]);
          for(const s of [-1,1]) for(let z=.046;z<.054;z+=.002)
            box(X(sx+.0095+s*.0031),G+.0052,Z(z),.0003,.005,.00035,stone);
          box(X(sx+.0095),G+.0052,Z(.047),.001,.002,.001,stone);
        }
        // Roof seams and repeated slender ribs emphasize the shell construction.
        for(let x=-.074;x<.054;x+=.01885) {
          rod([X(x),G+.013,Z(.048)],[X(x),G+.016,Z(.063)],.00032,metal);
          rod([X(x),G+.016,Z(.063)],[X(x),G+.0143,Z(.081)],.00032,metal);
        }
        // Landside planted islands: placed outside the curb and access lane.
        for(const x of [-.064,-.043,.027,.046]) {
          box(X(x),G+.005,Z(.094),.011,.0008,.0024,stone);
          box(X(x),G+.0058,Z(.094),.009,.0010,.0017,leaf);
          for(const dx of [-.003,0,.003]) K.addTree(X(x+dx),Z(.094),.026,leaf);
        }
        // Hangar cladding, vents and fire-station service doors.
        for(let z=.021;z<.046;z+=.003) box(X(-.0845),G+.001,Z(z),.0002,.005,.00035,metal);
        for(const x of [-.097,-.092,-.087]) box(X(x),G+.0063,Z(.066),.002,.001,.003,metal);
      });
      sig('ksip',()=>{
        // Apron floodlight pylons away from wings, taxi lanes and runway strips.
        for(const x of [-.081,.054,.092]) {
          box(X(x),G+.0052,Z(.049),.00065,.013,.00065,metal);
          box(X(x),G+.0182,Z(.049),.005,.0007,.0006,metal);
          for(const dx of [-.0016,0,.0016]) box(X(x+dx),G+.0179,Z(.0486),.001,.0007,.0007,[.94,.92,.83]);
        }
      },'props');
    }
    function park(p) {
      const X=d=>p.x+d,Z=d=>p.z+d,y=G+.0038;
      sig('qiddiya',()=>{
        // Connected shaded queue pockets with kerbs and explicit entry/exit walks.
        for(const [dx,dz,rot] of [[-.006,-.024,.9],[.03,.01,0]]) {
          const at=(u,v)=>[X(dx+u*Math.cos(rot)-v*Math.sin(rot)),Z(dz+u*Math.sin(rot)+v*Math.cos(rot))];
          const a=at(-.008,-.006),b=at(.008,-.006),c=at(.008,.006),d=at(-.008,.006);
          quad([a[0],y,a[1]],[d[0],y,d[1]],[c[0],y,c[1]],[b[0],y,b[1]],[.76,.73,.65]);
          for(const v of [-.006,.006]) {const a=at(-.008,v),b=at(.008,v);rod([a[0],y+.0003,a[1]],[b[0],y+.0003,b[1]],.0005,stone);}
          const gate=at(.008,0);strip(gate,[X(.0),Z(-.004)],.0013,y+.00005,[.87,.82,.71]);
        }
        // Organized planted borders along the arrival spine, with breaks at paths.
        for(let i=0;i<7;i++) for(const s of [-1,1]) {
          const x=.054-i*.004,z=-.026+i*.002+s*.006;
          box(X(x),y,Z(z),.003,.0007,.002,stone);
          box(X(x),y+.0007,Z(z),.0027,.0012,.0017,leaf);
        }
        // Layered raised gardens fill unused pockets without swallowing the rides.
        for(const [x,z,w,d] of [[-.047,.012,.012,.006],[.008,.042,.019,.007],[.064,.013,.010,.012]]) {
          box(X(x),G+.0035,Z(z),w,.001,d,stone);
          box(X(x),G+.0045,Z(z),w-.001,.0006,d-.001,[.41,.58,.34]);
          for(let i=-1;i<=1;i++) {cylinder(X(x+i*w*.27),G+.0051,Z(z),.0014,.0012,leaf,7);}
        }
        // Coaster station approach and maintenance walk connect into the path network.
        strip([X(.018),Z(-.033)],[X(.012),Z(-.010)],.0015,y+.00006,[.88,.82,.69]);
        // Shade pavilion on the south arrival loop, a readable architectural anchor.
        for(const x of [-.013,.013]) for(const z of [.053,.061]) box(X(x),y,Z(z),.00065,.0055,.00065,stone);
        for(let x=-.015;x<=.015;x+=.002) box(X(x),y+.0055,Z(.057),.0007,.00055,.011,[.77,.65,.46]);
      });
      sig('qiddiya',()=>{
        // Queue uprights and alternate-end switchback links, all above site ground.
        for(const [dx,dz,rot] of [[-.006,-.024,.9],[.03,.01,0]]) {
          const at=(u,v)=>[X(dx+u*Math.cos(rot)-v*Math.sin(rot)),Z(dz+u*Math.sin(rot)+v*Math.cos(rot))];
          for(let r=0;r<4;r++) {
            const v=-.0036+r*.0024;
            for(const u of [-.006,0,.006]) {const [x,z]=at(u,v);box(x,y,z,.00025,.0017,.00025,metal);}
            if(r<3) {const a=at(r%2?-.006:.006,v),b=at(r%2?-.006:.006,v+.0024);rod([a[0],y+.0015,a[1]],[b[0],y+.0015,b[1]],.00022,metal);}
          }
        }
        for(const x of [-.009,0,.009]) inst('bench',X(x),y,Z(.057),0,1);
      },'props');
    }
    return {airport,park};
  }};
})();
