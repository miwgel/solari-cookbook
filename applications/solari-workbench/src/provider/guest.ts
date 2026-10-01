// These programs run only in the owned remote guest; never in the local service.
export const FILES = String.raw`
import os,sys,json,stat,hashlib,base64
root,mode,p=sys.argv[1:4]
def checked(p):
 if not p or p.startswith('/') or '\\' in p or any(x in ('','.','..') for x in p.split('/')): raise ValueError('invalid path')
 cur=root
 for part in p.split('/'):
  cur=os.path.join(cur,part)
  if os.path.lexists(cur):
   s=os.lstat(cur)
   if stat.S_ISLNK(s.st_mode) or (not stat.S_ISDIR(s.st_mode) and (not stat.S_ISREG(s.st_mode) or s.st_nlink!=1)): raise ValueError('unsupported file type')
 return cur
def read(p):
 full=checked(p)
 with open(full,'rb') as f:
  s=os.fstat(f.fileno())
  if s.st_size>10485760: raise ValueError('file too large')
  b=f.read(10485761)
  t=os.fstat(f.fileno())
  if len(b)>10485760 or (s.st_mtime_ns,s.st_ctime_ns,s.st_size)!=(t.st_mtime_ns,t.st_ctime_ns,t.st_size): raise ValueError('source changed')
  return b,493 if s.st_mode & 73 else 420
if mode=='list':
 out=[]
 for base,dirs,files in os.walk(root,followlinks=False):
  dirs[:]=[d for d in dirs if d not in ['node_modules','.git','.ssh','.codex','.aws','.config','.workbench','dist','build','coverage','runtime','artifacts','scratch']]
  for n in dirs+files:
   rel=os.path.relpath(os.path.join(base,n),root)
   if os.path.islink(os.path.join(base,n)): raise ValueError('symlinks unsupported')
  for n in files:
   rel=os.path.relpath(os.path.join(base,n),root)
   if n=='.env' or (n.startswith('.env.') and n!='.env.example') or n.endswith(('.pem','.key','.log','.sqlite')): continue
   out.append(rel)
   if len(out)>20000: raise ValueError('too many files')
 print(json.dumps(sorted(out)))
elif mode=='read':
 b,m=read(p);print(json.dumps({'data':base64.b64encode(b).decode(),'mode':m,'sha256':hashlib.sha256(b).hexdigest()}))
elif mode=='write':
 full=checked(p);os.makedirs(os.path.dirname(full),exist_ok=True)
 fd=os.open(full,os.O_WRONLY|os.O_CREAT|os.O_TRUNC|os.O_NOFOLLOW,420)
 with os.fdopen(fd,'wb') as f:f.write(base64.b64decode(sys.argv[4]))
 print('{}')
elif mode=='delete':os.unlink(checked(p));print('{}')
`;
export const COMMAND = String.raw`
import sys,json,subprocess,os,selectors,time,signal
cfg=json.loads(sys.argv[1]);base=sys.argv[2];cwd=os.path.join(base,sys.argv[3]);env=os.environ.copy()
env.update({'WORKBENCH_RUNTIME':os.path.join(base,'runtime'),'WORKBENCH_ARTIFACTS':os.path.join(base,'artifacts'),'WORKBENCH_RUN_MARKER':os.path.basename(base)})
p=subprocess.Popen([cfg['program']]+cfg['args'],cwd=cwd,env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE,start_new_session=True)
s=selectors.DefaultSelector();s.register(p.stdout,selectors.EVENT_READ,'stdout');s.register(p.stderr,selectors.EVENT_READ,'stderr');out={'stdout':bytearray(),'stderr':bytearray()};end=time.monotonic()+cfg['timeoutMs']/1000;truncated=False;timed=False;size=0
while s.get_map() or p.poll() is None:
 remaining=end-time.monotonic()
 if remaining<=0:
  try:os.killpg(p.pid,signal.SIGKILL)
  except ProcessLookupError:pass
  timed=True;break
 if not s.get_map():time.sleep(min(.05,remaining));continue
 for key,_ in s.select(min(.1,remaining)):
  data=os.read(key.fileobj.fileno(),65536)
  if not data:s.unregister(key.fileobj);continue
  room=max(0,5242880-size);retained=data[:room];out[key.data].extend(retained);size+=len(retained);truncated=truncated or len(data)>room
s.close();code=p.wait();print(json.dumps({'exitCode':124 if timed else code,'stdout':out['stdout'].decode('utf-8','replace'),'stderr':out['stderr'].decode('utf-8','replace'),'truncated':truncated}))
`;

// A guest-local supervisor owns output pipes after the readiness request returns.
// It stores at most 5 MiB total; the app does not inherit pipes that the client closes.
export const APP_SUPERVISOR = String.raw`
import sys,json,subprocess,os,selectors,time
base=sys.argv[1];cfg=json.loads(sys.argv[2]);logs=base+'/runtime/.workbench-app'
def status(value):
 p=logs+'/status.json';t=p+'.tmp'
 with open(t,'w') as f:json.dump(value,f)
 os.replace(t,p)
env=os.environ.copy();env.update({'WORKBENCH_RUNTIME':base+'/runtime','WORKBENCH_ARTIFACTS':base+'/artifacts','WORKBENCH_RUN_MARKER':os.path.basename(base)})
state={'pid':None,'supervisorPid':os.getpid(),'state':'starting','exitCode':None,'truncated':False}
try:
 p=subprocess.Popen([cfg['program']]+cfg['args'],cwd=base+'/source',env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
 state.update({'pid':p.pid,'state':'running'});status(state)
 s=selectors.DefaultSelector();s.register(p.stdout,selectors.EVENT_READ,'stdout');s.register(p.stderr,selectors.EVENT_READ,'stderr');size=0
 with open(logs+'/stdout.log','wb',buffering=0) as out,open(logs+'/stderr.log','wb',buffering=0) as err:
  handles={'stdout':out,'stderr':err}
  while s.get_map() or p.poll() is None:
   if not s.get_map():time.sleep(.05);continue
   for key,_ in s.select(.1):
    data=os.read(key.fileobj.fileno(),65536)
    if not data:s.unregister(key.fileobj);continue
    room=max(0,5242880-size);chunk=data[:room];handles[key.data].write(chunk);size+=len(chunk)
    if len(data)>room and not state['truncated']:state['truncated']=True;status(state)
  state.update({'state':'exited','exitCode':p.wait()});status(state)
except Exception:
 state.update({'state':'failed','exitCode':127});status(state)
`;

export const START =
  String.raw`
import sys,os,json,subprocess,time,urllib.request,signal
base=sys.argv[1];cfg=json.loads(sys.argv[2]);logs=base+'/runtime/.workbench-app';os.makedirs(logs,exist_ok=True)
# Persist a launch intent before spawning. An interrupted launch is never silently repeated.
fd=os.open(logs+'/launch.json',os.O_WRONLY|os.O_CREAT|os.O_EXCL,384)
with os.fdopen(fd,'w') as f:json.dump({'state':'launch-requested'},f)
SUPERVISOR=` +
  JSON.stringify(APP_SUPERVISOR) +
  String.raw`
supervisor=subprocess.Popen([sys.executable,'-c',SUPERVISOR,base,json.dumps(cfg['start'])],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,start_new_session=True)
end=time.monotonic()+cfg['ready']['timeoutMs']/1000;state={};ready=False;timed=False
while time.monotonic()<end:
 try:
  with open(logs+'/status.json') as f:state=json.load(f)
 except (FileNotFoundError,json.JSONDecodeError):pass
 if state.get('state') in ('failed','exited'):break
 if state.get('state')=='running':
  try:
   with urllib.request.urlopen(cfg['ready']['url'],timeout=min(1,max(.01,end-time.monotonic()))) as r:
    if r.status==200:
     with open(logs+'/status.json') as f:state=json.load(f)
     if state.get('state')=='running':ready=True;break
  except Exception:pass
 if supervisor.poll() is not None:break
 time.sleep(.05)
if not ready:
 timed=time.monotonic()>=end
 try:os.killpg(supervisor.pid,signal.SIGKILL)
 except ProcessLookupError:pass
 supervisor.wait(timeout=2)
def log(name):
 try:
  with open(logs+'/'+name+'.log','rb') as f:return f.read(5242880).decode('utf-8','replace')
 except FileNotFoundError:return ''
print(json.dumps({'ready':ready,'pid':state.get('pid'),'supervisorPid':supervisor.pid,'exitCode':None if ready else (124 if timed else state.get('exitCode',127)),'stdout':log('stdout'),'stderr':log('stderr'),'truncated':state.get('truncated',False)}))
`;
