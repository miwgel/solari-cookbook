import http from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {applyPriority} from './bulk.js';
const root=process.env.WORKBENCH_RUNTIME;
if(!root)throw new Error('Set WORKBENCH_RUNTIME to a disposable runtime directory.');
await mkdir(root,{recursive:true});
const dataPath=join(root,'tasks.json');const markerPath=join(root,'marker.txt');
const seed=()=>[{id:'A',title:'Review sketch',priority:'normal'},{id:'B',title:'Polish keyboard flow',priority:'normal'},{id:'C',title:'Write release notes',priority:'normal'}];
let tasks;try{tasks=JSON.parse(await readFile(dataPath,'utf8'));}catch{tasks=seed();await writeFile(dataPath,JSON.stringify(tasks));}
try{await readFile(markerPath);}catch{await writeFile(markerPath,randomUUID());}
const bootNonce=randomUUID();let memoryMarker='initial';
const publicRoot=new URL('../public/',import.meta.url);
const server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://127.0.0.1');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');const json=(v,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(v));};
if(req.method==='GET'&&url.pathname==='/health')return json({ready:true,run:process.env.WORKBENCH_RUN_MARKER??'fixture'});
if(req.method==='GET'&&url.pathname==='/api/tasks')return json(tasks);
if(req.method==='GET'&&url.pathname==='/api/probes')return json({bootNonce,memoryMarker,diskMarker:await readFile(markerPath,'utf8'),run:process.env.WORKBENCH_RUN_MARKER??'fixture'});
if(req.method==='POST'){let text='';for await(const c of req){text+=c;if(text.length>16000)return json({error:'Too large'},413);}const b=JSON.parse(text||'{}');if(url.pathname==='/api/bulk'){if(!Array.isArray(b.selectedIds)||!Array.isArray(b.visibleIds)||!['normal','high','low'].includes(b.priority))return json({error:'Invalid bulk edit'},400);tasks=applyPriority(tasks,b.selectedIds,b.visibleIds,b.priority);}else if(url.pathname==='/api/reset'){tasks=seed();}else if(url.pathname==='/api/marker'){memoryMarker=String(b.marker).slice(0,100);await writeFile(markerPath,memoryMarker);}else return json({error:'Not found'},404);await writeFile(dataPath,JSON.stringify(tasks));return json(tasks);}
const files={'/':['index.html','text/html'],'/app.js':['app.js','text/javascript'],'/style.css':['style.css','text/css']};const f=files[url.pathname];if(!f)return json({error:'Not found'},404);res.writeHead(200,{'Content-Type':f[1]});res.end(await readFile(new URL(f[0],publicRoot)));
}catch{res.writeHead(500);res.end('Fixture request failed');}});
server.listen(Number(process.env.PORT??3000),'127.0.0.1');
