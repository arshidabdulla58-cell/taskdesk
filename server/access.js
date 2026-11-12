export const roles = ['admin','manager','user']
export const statuses = ['Pending','In Progress','Completed']
export const priorities = ['Low','Medium','High']
export function scope(user) {
  if (user.role === 'admin') return {}
  if (user.role === 'manager') return {$or:[{creator:user.id},{assignee:user.id}]}
  return {assignee:user.id}
}
export function canManage(user,task) {
  return user.role === 'admin' || String(task.creator) === user.id
}
export function canAssign(user,target) {
  return target.id === user.id || user.role === 'admin' || (user.role === 'manager' && target.role === 'user')
}

