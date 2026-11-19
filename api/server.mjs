/**
 * Optional, local-only SQL Server-backed API.
 * Serves the same web interface as GitHub Pages, but persists synthetic workflow
 * records in a real Microsoft SQL Server database using transactional updates.
 * NOT for clinical use or public internet deployment; intentionally no auth.
 */
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import sql from 'mssql';
import {newState,checkState,addCase,perform} from '../docs/core.mjs';

const dirname=path.dirname(fileURLToPath(import.meta.url));
const webRoot=path.resolve(dirname,'../docs');
const PORT=Number(process.env.PORT||8080);
const dbConfig={
  user:process.env.MSSQL_USER||'sa',
  password:process.env.MSSQL_PASSWORD,
  server:process.env.MSSQL_HOST||'127.0.0.1',
  port:Number(process.env.MSSQL_PORT||1433),
  database:process.env.MSSQL_DATABASE||'master',
  options:{encrypt:true,trustServerCertificate:true},
  pool:{max:8,min:0,idleTimeoutMillis:30000},
  connectionTimeout:5000,requestTimeout:15000
};
if(!dbConfig.password)throw new Error('MSSQL_PASSWORD is required');
const pool=await sql.connect(dbConfig);
await pool.request().query(`
IF OBJECT_ID('dbo.GenflowWorkspace','U') IS NULL
CREATE TABLE dbo.GenflowWorkspace(
 WorkspaceId NVARCHAR(30) NOT NULL PRIMARY KEY,
 StateJson NVARCHAR(MAX) NOT NULL,
 UpdatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
 CONSTRAINT CK_Genflow_JSON CHECK(ISJSON(StateJson)=1)
)`);
const initial=JSON.stringify(newState());
await pool.request().input('payload',sql.NVarChar(sql.MAX),initial).query(`
IF NOT EXISTS (SELECT 1 FROM dbo.GenflowWorkspace WHERE WorkspaceId='local-demo')
INSERT INTO dbo.GenflowWorkspace (WorkspaceId,StateJson) VALUES ('local-demo',@payload)`);

async function loadState(){
 const r=await pool.request().query("SELECT StateJson FROM dbo.GenflowWorkspace WHERE WorkspaceId='local-demo'");
 const s=JSON.parse(r.recordset[0].StateJson);
 if(!checkState(s))throw new Error('Stored state has an unsupported schema version');
 return s;
}
async function updateState(change){
 const tx=new sql.Transaction(pool);await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
 try{
  const result=await new sql.Request(tx).query("SELECT StateJson FROM dbo.GenflowWorkspace WITH (UPDLOCK,HOLDLOCK) WHERE WorkspaceId='local-demo'");
  const s=JSON.parse(result.recordset[0].StateJson);
  if(!checkState(s))throw new Error('Unsupported workspace state version');
  const outcome=change(s);
  await new sql.Request(tx).input('payload',sql.NVarChar(sql.MAX),JSON.stringify(s)).query("UPDATE dbo.GenflowWorkspace SET StateJson=@payload,UpdatedAt=SYSUTCDATETIME() WHERE WorkspaceId='local-demo'");
  await tx.commit();return {state:s,outcome};
 }catch(e){try{await tx.rollback();}catch{}throw e;}
}
function send(res,status,payload){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(payload));}
async function receive(req){return await new Promise((resolve,reject)=>{
 let chunks=[],size=0;req.on('data',chunk=>{size+=chunk.length;if(size>32768){reject(new Error('Request too large'));req.destroy();return;}chunks.push(chunk);});req.on('end',()=>{try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch{reject(new Error('Invalid JSON'));}});req.on('error',reject);
});}
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.ico':'image/x-icon'};
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url||'/',`http://${req.headers.host||'localhost'}`), pathname=url.pathname;
  if(req.method==='GET'&&pathname==='/api/health')return send(res,200,{ok:true,mode:'sqlserver',syntheticData:true});
  if(req.method==='GET'&&pathname==='/api/state')return send(res,200,{state:await loadState()});
  if(req.method==='POST'&&pathname==='/api/cases'){
   const body=await receive(req),data=await updateState(s=>addCase(s,{patientId:body.patientId,testCode:body.testCode,priority:body.priority}));
   return send(res,201,data);
  }
  const match=pathname.match(/^\/api\/cases\/(GL-\d+)\/actions$/);
  if(req.method==='POST'&&match){
   const body=await receive(req);
   if(!['receive','start','result','verify','deliver','retry'].includes(body.action))return send(res,422,{error:'Unsupported workflow action'});
   const data=await updateState(s=>perform(s,match[1],body.action,{result:body.result,patientOverride:body.patientOverride}));
   return send(res,200,data);
  }
  if(req.method==='POST'&&pathname==='/api/reset'){
   const data=await updateState(s=>{Object.assign(s,newState());return {ok:true};});return send(res,200,data);
  }
  if(pathname.startsWith('/api/'))return send(res,404,{error:'Unknown API endpoint'});
  if(req.method!=='GET'&&req.method!=='HEAD')return send(res,405,{error:'Method not allowed'});
  const clean=pathname==='/'?'index.html':decodeURIComponent(pathname).replace(/^\/+/,''), full=path.resolve(webRoot,clean);
  if(!(full===webRoot||full.startsWith(webRoot+path.sep)))return send(res,403,{error:'Access denied'});
  const content=await readFile(full);res.writeHead(200,{'Content-Type':mime[path.extname(full)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:content);
 }catch(e){const isMissing=e.code==='ENOENT';send(res,isMissing?404:422,{error:isMissing?'Not found':e.message});}
});
server.listen(PORT,'0.0.0.0',()=>console.log(`Genflow local SQL Server workbench listening on http://127.0.0.1:${PORT}`));