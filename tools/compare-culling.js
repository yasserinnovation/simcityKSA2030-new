// Compare fixed-time PNG captures of the identical scene, culling off versus on.
const fs=require('fs'),path=require('path'),zlib=require('zlib');
const dir=path.resolve(__dirname,'../docs/visual-slice-v16');
function png(file){const b=fs.readFileSync(file);let o=8,w,h,bpp,id=[];
  while(o<b.length){const n=b.readUInt32BE(o),t=b.toString('ascii',o+4,o+8),d=b.subarray(o+8,o+8+n);if(t==='IHDR'){w=d.readUInt32BE(0);h=d.readUInt32BE(4);if(d[8]!==8||![2,6].includes(d[9])||d[12])throw Error('Unsupported PNG');bpp=d[9]===6?4:3;}if(t==='IDAT')id.push(d);o+=n+12;}
  const raw=zlib.inflateSync(Buffer.concat(id)),stride=w*bpp,px=Buffer.alloc(h*stride);
  for(let y=0;y<h;y++){const filter=raw[y*(stride+1)];for(let x=0;x<stride;x++){const a=x>=bpp?px[y*stride+x-bpp]:0,b=y?px[(y-1)*stride+x]:0,c=y&&x>=bpp?px[(y-1)*stride+x-bpp]:0;let v=raw[y*(stride+1)+x+1];if(filter===1)v+=a;else if(filter===2)v+=b;else if(filter===3)v+=(a+b)>>1;else if(filter===4){const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);v+=pa<=pb&&pa<=pc?a:pb<=pc?b:c;}else if(filter!==0)throw Error('Unsupported filter');px[y*stride+x]=v&255;}}
  return {w,h,bpp,px};
}
const images={};
for(const name of fs.readdirSync(path.join(dir,'after')).filter(n=>n.endsWith('.png'))){const beforePath=path.join(dir,'unculled',name);if(!fs.existsSync(beforePath))continue;const a=png(beforePath),b=png(path.join(dir,'after',name));if(a.w!==b.w||a.h!==b.h)throw Error('Dimensions differ');let changed=0,sum=0,max=0;
  for(let p=0;p<a.w*a.h;p++){let delta=0;for(let c=0;c<3;c++){const d=Math.abs(a.px[p*a.bpp+c]-b.px[p*b.bpp+c]);delta=Math.max(delta,d);sum+=d;max=Math.max(max,d);}if(delta>6)changed++;}
  images[name]={meanChannelDifference:sum/(a.w*a.h*3),pixelsChangedOver6:changed,changedFraction:changed/(a.w*a.h),maxChannelDifference:max};
}
fs.writeFileSync(path.join(dir,'culling-pixel-comparison.json'),JSON.stringify(images,null,2));
console.log(JSON.stringify(images));
