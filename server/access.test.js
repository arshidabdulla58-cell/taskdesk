import test from 'node:test'
import assert from 'node:assert/strict'
import {scope,canAssign,canManage} from './access.js'
const admin={id:'a',role:'admin'},manager={id:'m',role:'manager'},user={id:'u',role:'user'}
test('task visibility matches each dashboard',()=>{
  assert.deepEqual(scope(admin),{})
  assert.deepEqual(scope(manager),{$or:[{creator:'m'},{assignee:'m'}]})
  assert.deepEqual(scope(user),{assignee:'u'})
})
test('assignment hierarchy is enforced',()=>{
  assert.ok(canAssign(admin,manager)&&canAssign(manager,user)&&canAssign(user,user))
  assert.ok(!canAssign(manager,admin)&&!canAssign(user,manager)&&!canAssign(user,{id:'v',role:'user'}))
})
test('assigned work only grants progress edits',()=>{
  const task={creator:'m',assignee:'u'}
  assert.ok(canManage(admin,task)&&canManage(manager,task))
  assert.equal(canManage(user,task),false)
})

