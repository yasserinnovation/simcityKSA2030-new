// Dependency-free, offline launcher. Keep the origin stable so browser saves survive upgrades.
// node tools/serve.js [port] [--open]
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const root=fs.realpathSync(path.resolve(__dirname,'..'));
const build=(fs.readFileSync(path.join(root,'boot.js'),'utf8').match(/const BUILD = '([^']+)'/)||[])[1]||'unknown';
const identity={service:'vision-nexus-2030',build,rootId:crypto.createHash('sha256').update(root).digest('hex')};
const TYPES={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8',
  '.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.glb':'model/gltf-binary','.gltf':'model/gltf+json',
  '.bin':'application/octet-stream','.hdr':'application/octet-stream','.ktx2':'image/ktx2','.wasm':'application/wasm','.mp4':'video/mp4','.webp':'image/webp','.woff2':'font/woff2'};
function handler(req,res){
  let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://local').pathname);}catch{res.writeHead(400);return res.end('Bad URL');}
  if(pathname==='/__vision_build'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});return res.end(JSON.stringify(identity));}
  if(pathname.endsWith('/'))pathname+='index.html';
  const file=path.resolve(root,'.'+pathname),relative=path.relative(root,file);
  if(relative.startsWith('..')||path.isAbsolute(relative)){res.writeHead(403);return res.end('Forbidden');}
  fs.readFile(file,(error,data)=>{if(error){res.writeHead(404,{'Content-Type':'text/plain'});return res.end('Not found');}
    res.writeHead(200,{'Content-Type':TYPES[path.extname(file).toLowerCase()]||'application/octet-stream','Cache-Control':'no-cache'});res.end(data);
  });
}
function openBrowser(url){
  console.log('Opening verified game: '+url);
  if(process.env.VN_NO_BROWSER==='1')return;
  const command=process.platform==='win32'?'cmd':process.platform==='darwin'?'open':'xdg-open';
  const args=process.platform==='win32'?['/c','start','',url]:[url];
  const child=spawn(command,args,{stdio:'ignore',detached:true});child.on('error',()=>console.log('Open this address in your browser: '+url));child.unref();
}
function probe(port){return new Promise(resolve=>{
  const request=http.get({hostname:'127.0.0.1',port,path:'/__vision_build',timeout:1600},res=>{let data='';res.on('data',chunk=>{data+=chunk;if(data.length>4096)request.destroy();});res.on('end',()=>{try{resolve(JSON.parse(data));}catch{resolve(null);}});});
  request.on('timeout',()=>request.destroy());request.on('error',()=>resolve(null));
});}
function start(port=8123,open=false){
  const url=`http://127.0.0.1:${port}/index.html`,server=http.createServer(handler);
  server.on('error',async error=>{
    if(error.code==='EADDRINUSE'){
      const running=await probe(port);
      if(running?.service===identity.service&&running.rootId===identity.rootId&&running.build===identity.build){
        console.log(`Already running this copy (${build}) at ${url}`);if(open)openBrowser(url);return;
      }
      console.error(`\nPort ${port} is serving another copy or application. This is ${build}.`);
      console.error('The game was NOT opened. Close the previous game server window (Ctrl+C), then launch this folder again.');
      console.error(`Keep http://127.0.0.1:${port} to retain browser saves. Do not change ports to work around this message.\n`);
    }else console.error('Could not start the game: '+error.message);
    process.exitCode=1;
  });
  server.listen(port,'127.0.0.1',()=>{
    console.log(`Vision Nexus 2030 ${build} -> ${url} (Ctrl+C to stop)`);
    if(open)openBrowser(url);
  });return server;
}
if(require.main===module){const port=Number(process.argv.find(a=>/^\d+$/.test(a)))||8123;start(port,process.argv.includes('--open'));}
module.exports={start,handler,identity};
