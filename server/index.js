import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import {rateLimit} from 'express-rate-limit'
import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import nodemailer from 'nodemailer'
import {createServer} from 'node:http'
import {Server} from 'socket.io'
import {roles,statuses,priorities,scope,canManage,canAssign} from './access.js'

const env = process.env
if (!env.MONGO_URI || (env.JWT_SECRET || '').length < 32) throw Error('Set MONGO_URI and a JWT_SECRET of at least 32 characters.')
const origin = env.CLIENT_ORIGIN || 'http://localhost:5173'
const app = express()
const http = createServer(app)
const io = new Server(http,{cors:{origin}})
app.use(cors({origin}),express.json({limit:'32kb'}))
const userSchema = new mongoose.Schema({
  name:{type:String,required:true,maxlength:80},email:{type:String,unique:true,required:true},
  passwordHash:{type:String,select:false,required:true},role:{type:String,enum:roles,required:true}
},{timestamps:true})
const User = mongoose.model('User',userSchema)
const ref = {type:mongoose.Schema.Types.ObjectId,ref:'User',required:true}
const taskSchema = new mongoose.Schema({
  title:{type:String,trim:true,required:true,maxlength:160},description:{type:String,maxlength:3000,default:''},
  creator:ref,assignee:ref,status:{type:String,enum:statuses,default:'Pending',required:true},
  priority:{type:String,enum:priorities,default:'Medium',required:true},dueDate:{type:Date,required:true}
},{timestamps:true,optimisticConcurrency:true})
for (const field of ['creator','assignee','status']) taskSchema.index({[field]:1,updatedAt:-1})
const Task = mongoose.model('Task',taskSchema)
function fail(status,message){throw Object.assign(Error(message),{status})}
function publicUser(u){return {id:u.id,name:u.name,role:u.role}}
function session(u){return {user:publicUser(u),token:jwt.sign({sub:u.id},env.JWT_SECRET,{expiresIn:'8h',algorithm:'HS256'})}}
async function identify(token){
  let claims
  try { claims=jwt.verify(token,env.JWT_SECRET,{algorithms:['HS256']}) } catch {fail(401,'Please sign in again.')}
  const u=await User.findById(claims.sub)
  if(!u) fail(401,'Account unavailable.')
  return {user:u,expires:claims.exp}
}
io.use(async(socket,next)=>{
  try {socket.data=await identify(socket.handshake.auth.token);next()} catch {next(Error('Unauthorized'))}
})
io.on('connection',socket=>{
  const u=socket.data.user
  socket.join('user:'+u.id)
  if(u.role==='admin') socket.join('admins')
  const timer=setTimeout(()=>socket.disconnect(true),Math.max(0,socket.data.expires*1000-Date.now()))
  socket.on('disconnect',()=>clearTimeout(timer))
})
const mail=env.SMTP_HOST && nodemailer.createTransport({host:env.SMTP_HOST,port:Number(env.SMTP_PORT||587),secure:Number(env.SMTP_PORT)===465,
  auth:env.SMTP_USER?{user:env.SMTP_USER,pass:env.SMTP_PASS}:undefined})
async function announce(task,action,oldAssignee){
  const rooms=['admins',...new Set([task.creator,task.assignee,oldAssignee].filter(Boolean).map(id=>'user:'+id))]
  io.to(rooms).emit('tasks:changed')
  if(mail && action!=='deleted'){
    const recipient=await User.findById(task.assignee)
    await mail.sendMail({from:env.MAIL_FROM,to:recipient.email,subject:'Task '+action+' | '+task.title,
      text:[task.title,'Status: '+task.status,'Priority: '+task.priority,'Due: '+task.dueDate.toISOString().slice(0,10),task.description].join('\n')})
  }
}
function notify(...args){announce(...args).catch(()=>console.error('Task notification failed. Check SMTP and database connectivity.'))}
const authLimit=rateLimit({windowMs:15*60*1000,limit:60,message:{error:'Too many attempts. Try again later.'}})
app.use('/api/auth',authLimit)
app.post('/api/auth/register',async(req,res)=>{
  const {name,email,password,role='user',inviteCode}=req.body||{}
  if(typeof name!=='string'||!name.trim()||name.trim().length>80||typeof email!=='string'||email.length>254||!/^\S+@\S+\.\S+$/.test(email.trim())||typeof password!=='string'||password.length<8||Buffer.byteLength(password)>72||!roles.includes(role)) fail(400,'Enter a name, valid email, role and password of 8 or more characters (maximum 72 bytes).')
  const invite=role==='admin'?env.ADMIN_INVITE_CODE:env.MANAGER_INVITE_CODE
  if(role!=='user'&&(!invite||invite!==inviteCode)) fail(403,'Invalid role invitation.')
  const u=await User.create({name:name.trim(),email:email.trim().toLowerCase(),passwordHash:await bcrypt.hash(password,12),role})
  res.status(201).json(session(u))
})
app.post('/api/auth/login',async(req,res)=>{
  const {email,password}=req.body||{}
  const u=typeof email==='string' && await User.findOne({email:email.trim().toLowerCase()}).select('+passwordHash')
  if(!u||typeof password!=='string'||!await bcrypt.compare(password,u.passwordHash)) fail(401,'Email or password is incorrect.')
  res.json(session(u))
})
app.get('/health',(_,res)=>res.sendStatus(mongoose.connection.readyState===1?200:503))
app.use('/api',async(req,res,next)=>{req.user=(await identify(req.headers.authorization?.split(' ')[1])).user;next()})
function page(query){const p=Number(query.page||1),limit=Number(query.limit||12)
  if(!Number.isSafeInteger(p)||p<1||p>100000||!Number.isInteger(limit)||limit<1||limit>100) fail(400,'Invalid pagination.')
  return {skip:(p-1)*limit,limit}
}
function search(value){return {$regex:String(value).slice(0,100).replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),$options:'i'}}
app.get('/api/users',async(req,res)=>{
  const {skip,limit}=page(req.query)
  let filter={}
  if(req.user.role!=='admin'){
    if(req.query.assignable!=='1') fail(403,'Administrator access required.')
    filter=req.user.role==='manager'?{$or:[{_id:req.user.id},{role:'user'}]}:{_id:req.user.id}
  }
  if(req.query.q) filter.name=search(req.query.q)
  const [rows,total]=await Promise.all([User.find(filter).select('name role'+(req.user.role==='admin'?' email':'')).sort({name:1,_id:1}).skip(skip).limit(limit),User.countDocuments(filter)])
  res.json({items:rows,total})
})
app.get('/api/tasks',async(req,res)=>{
  const filter=scope(req.user),{skip,limit}=page(req.query)
  for(const [key,allowed] of [['status',statuses],['priority',priorities]]) if(req.query[key]){
    if(!allowed.includes(req.query[key])) fail(400,'Invalid filter.')
    filter[key]=req.query[key]
  }
  if(req.query.q) filter.title=search(req.query.q)
  const [items,total]=await Promise.all([Task.find(filter).populate('assignee','name role').sort({updatedAt:-1,_id:1}).skip(skip).limit(limit),Task.countDocuments(filter)])
  res.json({items,total})
})
async function assignee(user,id){
  if(!mongoose.isObjectIdOrHexString(id)) fail(400,'Choose a valid assignee.')
  const target=await User.findById(id)
  if(!target||!canAssign(user,target)) fail(403,'Assignment is outside your role.')
  return target._id
}
const editable=['title','description','priority','dueDate','assignee','status']
function changes(body,allowed){
  if(!body||Array.isArray(body)||!Object.keys(body).length||Object.keys(body).some(k=>!allowed.includes(k))) fail(400,'Invalid task fields.')
  for(const value of Object.values(body)) if(typeof value!=='string') fail(400,'Task fields must be text.')
  if('dueDate' in body && (!/^\d{4}-\d{2}-\d{2}$/.test(body.dueDate)||!Number.isFinite(Date.parse(body.dueDate))||new Date(body.dueDate).toISOString().slice(0,10)!==body.dueDate)) fail(400,'Enter a valid due date.')
  return {...body}
}
app.post('/api/tasks',async(req,res)=>{
  const data=changes(req.body,editable)
  data.assignee=await assignee(req.user,data.assignee||req.user.id)
  const task=await Task.create({...data,creator:req.user.id})
  notify(task,'assigned');res.status(201).json(task)
})
app.param('id',async(req,res,next,id)=>{
  if(!mongoose.isObjectIdOrHexString(id)) fail(404,'Task unavailable.')
  req.task=await Task.findOne({...scope(req.user),_id:id})
  if(!req.task) fail(404,'Task unavailable.')
  next()
})
app.patch('/api/tasks/:id',async(req,res)=>{
  const task=req.task,old=String(task.assignee)
  const data=changes(req.body,canManage(req.user,task)?editable:['status'])
  if(data.assignee) data.assignee=await assignee(req.user,data.assignee)
  task.set(data);await task.save()
  notify(task,String(task.assignee)===old?'updated':'assigned',old);res.json(task)
})
app.delete('/api/tasks/:id',async(req,res)=>{
  if(!canManage(req.user,req.task)) fail(403,'Only the creator or an administrator can delete this task.')
  const deleted=await Task.deleteOne({_id:req.task.id,__v:req.task.__v})
  if(!deleted.deletedCount) fail(409,'Task changed. Refresh and retry.')
  notify(req.task,'deleted');res.sendStatus(204)
})
app.use((err,req,res,next)=>{
  const status=err.code===11000?409:err.name==='VersionError'?409:err.name==='ValidationError'||err.name==='CastError'?400:err.status||500
  if(status===500) console.error(err.name)
  res.status(status).json({error:err.code===11000?'Email already registered.':status===500?'Server error.':err.message})
})
await mongoose.connect(env.MONGO_URI)
await Promise.all([User.init(),Task.init()])
http.listen(Number(env.PORT||4000),()=>console.log('Taskdesk API ready'))

