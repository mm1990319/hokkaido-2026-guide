const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const handlers={},saved=new Map();
const key=request=>typeof request==='string'?request:request.url.replace('https://example.com/guide/','./');
let online=true;
const cache={
  async addAll(paths){for(const path of paths)saved.set(path,new Response(path.split('?')[0].endsWith('data.json')?JSON.stringify({places:[]}):'cached '+path));},
  async add(path){saved.set(path,new Response('image'));},
  async match(request){return saved.get(key(request))?.clone();},
  async put(request,response){saved.set(key(request),response.clone());}
};
const context={URL,Response,AbortController,setTimeout,clearTimeout,
  self:{location:{origin:'https://example.com'},addEventListener:(name,handler)=>handlers[name]=handler,skipWaiting:async()=>{},clients:{claim:async()=>{}}},
  caches:{open:async()=>cache,keys:async()=>[],delete:async()=>{}},
  fetch:async()=>{if(!online)throw Error('offline');return new Response('latest');}
};
vm.runInNewContext(fs.readFileSync(require.resolve('../sw.js'),'utf8'),context);
async function main(){
  let work;handlers.install({waitUntil:p=>work=p});await work;
  for(const name of ['app','ledger','expenses'])assert([...saved.keys()].some(path=>path.includes(name+'.js?v=20261013-v10')));
  assert([...saved.keys()].includes('./data.json?v=20261013-v10'));
  assert(fs.readFileSync(require.resolve('../app.js'),'utf8').includes('fetch("./data.json?v=20261013-v10")'));
  let result;
  const request={url:'https://example.com/guide/data.json?v=20261013-v10',method:'GET',mode:'cors'};
  handlers.fetch({request,respondWith:p=>result=p});assert.equal(await (await result).text(),'latest');
  online=false;
  handlers.fetch({request,respondWith:p=>result=p});assert.equal(await (await result).text(),'latest');
  handlers.fetch({request:{url:'https://example.com/guide/?offline=1',method:'GET',mode:'navigate'},respondWith:p=>result=p});
  assert.equal(await (await result).text(),'cached ./index.html');
  console.log('Offline core assets, latest data and navigation fallback passed.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
