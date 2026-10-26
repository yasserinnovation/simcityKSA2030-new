// A busy port must never open a stale copy. Test real processes and sockets, without opening browsers.
const assert=require('node:assert/strict'),http=require('node:http'),path=require('node:path');
const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),launch=(program='node',args=[])=>{
  const child=spawn(program,[path.join(root,program==='node'?'tools/serve.js':'tools/serve.py'),...args],{env:{...process.env,VN_NO_BROWSER:'1'}});
  let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);
  return {child,output:()=>({stdout,stderr}),done:new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>resolve({code,stdout,stderr}));})};
};
const listen=s=>new Promise((resolve,reject)=>{s.on('error',reject);s.listen(0,'127.0.0.1',()=>resolve(s.address().port));});
const close=s=>new Promise(r=>s.close(r));
const get=(port,url)=>new Promise((resolve,reject)=>{http.get({hostname:'127.0.0.1',port,path:url},r=>{let data='';r.on('data',b=>data+=b);r.on('end',()=>resolve({status:r.statusCode,headers:r.headers,data}));}).on('error',reject);});
const ready=p=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Launch timeout '+JSON.stringify(p.output()))),5000);p.child.stdout.on('data',()=>{if(p.output().stdout.includes('Ctrl+C to stop')){clearTimeout(timer);resolve();}});p.child.once('close',()=>{clearTimeout(timer);reject(new Error(JSON.stringify(p.output())));});});
(async()=>{
  // Simulate both a pre-V27 server (no identity endpoint) and a different extracted directory.
  for(const identity of [null,{service:'vision-nexus-2030',build:'v27-atlas',rootId:'another-folder'}]){
    const old=http.createServer((req,res)=>{res.end(identity?JSON.stringify(identity):'old game');}),port=await listen(old);
    try{for(const program of ['node','python3']){const result=await launch(program,[String(port),'--open']).done;
      assert.equal(result.code,1,result.stderr);assert.match(result.stderr,/NOT opened/);assert.doesNotMatch(result.stdout,/Opening verified/);}}
    finally{await close(old);}
  }
  console.log('PASS both launchers refuse old servers and different folders without opening them');
  for(const program of ['node','python3']){
    const probe=http.createServer(),port=await listen(probe);await close(probe);
    const running=launch(program,[String(port),'--open']);
    try{await ready(running);const identity=await get(port,'/__vision_build');assert.equal(JSON.parse(identity.data).build,'v27-atlas');
      const page=await get(port,'/index.html');assert.equal(page.status,200);assert.match(page.data,/V27 · Kingdom Atlas/);assert.match(page.headers['cache-control'],/no-cache/);
      assert.equal((await get(port,'/kingdom-atlas.js')).status,200);
      const reuse=await launch(program,[String(port),'--open']).done;assert.equal(reuse.code,0,reuse.stderr);assert.match(reuse.stdout,/Already running this copy/);assert.match(reuse.stdout,/Opening verified/);
      assert.match(running.output().stdout,/Opening verified/);
    }finally{running.child.kill();await running.done;}
  }
  console.log('PASS both launchers serve V27 and safely reuse the identical running copy');
  const probe=http.createServer(),port=await listen(probe);await close(probe);const running=launch('node',[String(port)]);
  try{await ready(running);assert.equal((await get(port,'/%zz')).status,400);assert.equal((await get(port,'/%2e%2e%2fboot.js')).status,403);assert.equal((await get(port,'/index.html')).status,200);}
  finally{running.child.kill();await running.done;}
  console.log('PASS malformed URLs and directory traversal do not crash the server');
})().catch(e=>{console.error(e);process.exitCode=1;});
