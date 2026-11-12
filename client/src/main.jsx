import React,{useState,useEffect} from 'react'
import {createRoot} from 'react-dom/client'
import {io} from 'socket.io-client'
import {api,base,statuses,priorities} from './api'
import './style.css'

function Brand(){return <div className="brand"><span aria-hidden="true">▦</span> Taskdesk</div>}
function Auth({onLogin}){
  const [register,mode]=useState(false),[role,setRole]=useState('user'),[error,err]=useState(''),[busy,setBusy]=useState(false)
  async function submit(e){e.preventDefault();setBusy(true);err('')
    try{onLogin(await api('/auth/'+(register?'register':'login'),null,'POST',Object.fromEntries(new FormData(e.target))))}
    catch(ex){err(ex.message)}finally{setBusy(false)}
  }
  return <main className="auth"><section className="cover"><Brand/><div><p className="eyebrow">TEAM WORKSPACE</p><h1>Every task in<br/>one place.</h1><div className="sample" aria-hidden="true">{statuses.map((s,i)=><div key={s}><i className={'dot d'+i}/>{s}<span className="line"/></div>)}</div></div></section><section className="authform"><form onSubmit={submit}><h2>{register?'Create your account':'Welcome back'}</h2><p>{register?'Choose your workspace role.':'Sign in to your workspace.'}</p>{register&&<label>Name<input name="name" autoComplete="name" required maxLength="80"/></label>}<label>Email<input name="email" type="email" autoComplete="email" required/></label><label>Password<input name="password" type="password" autoComplete={register?'new-password':'current-password'} required minLength={register?8:1}/></label>{register&&<><label>Role<select name="role" value={role} onChange={e=>setRole(e.target.value)}>{['user','manager','admin'].map(r=><option key={r}>{r}</option>)}</select></label>{role!=='user'&&<label>Role invitation code<input name="inviteCode" type="password" required/></label>}</>}{error&&<p role="alert">{error}</p>}<button className="primary wide" disabled={busy}>{busy?'Please wait…':register?'Create account':'Sign in'}</button><button type="button" className="link wide" onClick={()=>{mode(!register);err('')}}>{register?'Already registered? Sign in':'Create an account'}</button></form></section></main>
}
function useRows(path,token,revision){
  const [result,set]=useState({items:[],total:0}),[error,err]=useState(''),[loading,load]=useState(true)
  useEffect(()=>{const c=new AbortController();load(true);err('')
    api(path,token,'GET',null,c.signal).then(set).catch(e=>{if(!c.signal.aborted)err(e.message)}).finally(()=>{if(!c.signal.aborted)load(false)})
    return ()=>c.abort()
  },[path,token,revision])
  return {result,error,loading}
}
function Pager({page,setPage,total,size}){return total>size&&<div className="pager"><button aria-label="Previous page" disabled={page===1} onClick={()=>setPage(page-1)}>‹</button><small>{page} / {Math.ceil(total/size)}</small><button aria-label="Next page" disabled={page*size>=total} onClick={()=>setPage(page+1)}>›</button></div>}
function Lane({status,index,token,revision,search,priority,edit,move}){
  const [page,setPage]=useState(1),[over,hover]=useState(false)
  const params=new URLSearchParams({status,q:search,priority,page,limit:6})
  const {result,error,loading}=useRows('/tasks?'+params,token,revision)
  useEffect(()=>{if(!loading&&!error&&page>1&&result.total<=(page-1)*6)setPage(Math.max(1,Math.ceil(result.total/6)))},[loading,error,result,page])
  return <section className={'lane '+(over?'over':'')} onDragOver={e=>{e.preventDefault();hover(true)}} onDragLeave={()=>hover(false)} onDrop={e=>{e.preventDefault();hover(false);const id=e.dataTransfer.getData('text/plain');if(id)move(id,status)}}><header><i className={'dot d'+index}/><h3>{status}</h3><span className="count">{result.total}</span></header>{error?<p role="alert">{error}</p>:loading&&!result.items.length?<p className="empty">Loading…</p>:!result.items.length?<p className="empty">No tasks here</p>:result.items.map(t=><button className="card" key={t._id} draggable onDragStart={e=>e.dataTransfer.setData('text/plain',t._id)} onClick={()=>edit(t)}><span className={'priority '+t.priority}>{t.priority}</span><h4>{t.title}</h4>{t.description&&<p>{t.description}</p>}<footer><span>{t.assignee?.name}</span><time dateTime={t.dueDate}>{new Date(t.dueDate).toLocaleDateString(undefined,{month:'short',day:'numeric',timeZone:'UTC'})}</time></footer></button>)}<Pager page={page} setPage={setPage} total={result.total} size={6}/></section>
}
function Editor({task,session,close,refresh}){
  const {user,token}=session,existing=!!task._id,full=!existing||user.role==='admin'||task.creator===user.id
  const [search,q]=useState(''),[selected,select]=useState(task.assignee?._id||user.id),[busy,wait]=useState(false),[error,err]=useState(''),[confirm,ask]=useState(false)
  const {result,error:peopleError}=useRows('/users?assignable=1&limit=100&q='+encodeURIComponent(search),token,0)
  useEffect(()=>{const escape=e=>{if(e.key==='Escape')close()};window.addEventListener('keydown',escape);return()=>window.removeEventListener('keydown',escape)},[close])
  async function submit(e){e.preventDefault();const body=Object.fromEntries(new FormData(e.currentTarget));await save(existing?'PATCH':'POST',body)}
  async function save(method,body){wait(true);err('')
    try{await api('/tasks'+(existing?'/'+task._id:''),token,method,body);refresh();close()}catch(e){err(e.message)}finally{wait(false)}
  }
  return <dialog open aria-modal="true" aria-labelledby="editorTitle" className="overlay"><form onSubmit={submit} className="sheet"><header><h2 id="editorTitle">{existing?'Task details':'New task'}</h2><button type="button" aria-label="Close" onClick={close}>×</button></header><fieldset disabled={!full}><label>Title<input name="title" autoFocus required maxLength="160" defaultValue={task.title}/></label><label>Description<textarea name="description" maxLength="3000" defaultValue={task.description}/></label><div className="pair"><label>Due date<input type="date" name="dueDate" required defaultValue={task.dueDate?.slice(0,10)}/></label><label>Priority<select name="priority" defaultValue={task.priority||'Medium'}>{priorities.map(p=><option key={p}>{p}</option>)}</select></label></div>{full&&user.role!=='user'&&<label>Find assignee<input placeholder="Search by name" value={search} onChange={e=>q(e.target.value)}/></label>}<label>Assignee<select name="assignee" value={selected} onChange={e=>select(e.target.value)}>{!result.items.some(u=>u._id===selected)&&<option value={selected}>{selected===user.id?user.name:task.assignee?._id===selected?task.assignee.name:'Selected member'}</option>}{result.items.map(u=><option key={u._id} value={u._id}>{u.name} ({u.role})</option>)}</select></label></fieldset><label>Status<select name="status" defaultValue={task.status||statuses[0]}>{statuses.map(s=><option key={s}>{s}</option>)}</select></label>{(error||peopleError)&&<p role="alert">{error||peopleError}</p>}<footer>{existing&&full&&<button type="button" className="danger" disabled={busy} onClick={()=>confirm?save('DELETE'):ask(true)}>{confirm?'Confirm deletion':'Delete task'}</button>}<button className="primary" disabled={busy}>{busy?'Saving…':existing?'Save changes':'Create task'}</button></footer></form></dialog>
}
function Members({token,search}){
  const [page,set]=useState(1),{result,error,loading}=useRows('/users?limit=12&page='+page+'&q='+encodeURIComponent(search),token,0)
  return <section className="members">{error?<p role="alert">{error}</p>:loading?<p>Loading…</p>:!result.total?<p>No members found.</p>:result.items.map(u=><article key={u._id}><b>{u.name}</b><span>{u.email}</span><small>{u.role}</small></article>)}<Pager page={page} setPage={set} total={result.total} size={12}/></section>
}
function Board({session,logout}){
  const [view,show]=useState('board'),[task,edit]=useState(null),[revision,bump]=useState(0),[search,q]=useState(''),[priority,filter]=useState(''),[error,err]=useState(''),[live,online]=useState(false)
  const refresh=()=>bump(n=>n+1)
  useEffect(()=>{const socket=io(base,{auth:{token:session.token}})
    socket.on('connect',()=>{online(true);refresh()});socket.on('disconnect',()=>online(false));socket.on('tasks:changed',refresh)
    return ()=>socket.disconnect()
  },[session.token])
  async function move(id,status){err('');try{await api('/tasks/'+id,session.token,'PATCH',{status});refresh()}catch(e){err(e.message)}}
  return <div className="app"><aside><Brand/><nav><p className="eyebrow">WORKSPACE</p><button className={view==='board'?'active':''} onClick={()=>{show('board');q('')}}>▦　Task board</button>{session.user.role==='admin'&&<button className={view==='team'?'active':''} onClick={()=>{show('team');q('')}}>◎　Team members</button>}</nav><div className="profile"><strong>{session.user.name}</strong><small>{session.user.role}</small><button onClick={logout}>Sign out</button></div></aside><main className="workspace"><header className="top"><span>Workspace / {view==='board'?'Board':'Team'}</span><small>{live?'● Live updates':'○ Connecting'}</small></header><div className="content"><div className="heading"><div><p className="eyebrow">{session.user.role.toUpperCase()} WORKSPACE</p><h1>{view==='board'?'Task board':'Team members'}</h1></div>{view==='board'&&<button className="primary" onClick={()=>edit({})}>+ New task</button>}</div><div className="tools"><input aria-label="Search" placeholder={view==='board'?'Search tasks…':'Search members…'} value={search} onChange={e=>q(e.target.value)}/>{view==='board'&&<select aria-label="Priority filter" value={priority} onChange={e=>filter(e.target.value)}><option value="">All priorities</option>{priorities.map(p=><option key={p}>{p}</option>)}</select>}</div>{error&&<p role="alert">{error}</p>}{view==='board'?<div className="board">{statuses.map((s,i)=><Lane key={s+search+priority} index={i} status={s} token={session.token} {...{revision,search,priority,edit,move}}/>)}</div>:<Members key={search} token={session.token} search={search}/>}</div></main>{task&&<Editor task={task} session={session} close={()=>edit(null)} refresh={refresh}/>}</div>
}
function App(){const [session,set]=useState(()=>{try{return JSON.parse(sessionStorage.getItem('taskdesk'))}catch{return null}})
  function login(s){sessionStorage.setItem('taskdesk',JSON.stringify(s));set(s)}
  function logout(){sessionStorage.removeItem('taskdesk');set(null)}
  useEffect(()=>{window.addEventListener('session-expired',logout);return()=>window.removeEventListener('session-expired',logout)},[])
  return session?<Board session={session} logout={logout}/>:<Auth onLogin={login}/>
}
createRoot(document.getElementById('root')).render(<App/>)

