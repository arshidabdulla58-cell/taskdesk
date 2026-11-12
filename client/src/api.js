export const base=(import.meta.env.VITE_API_URL || 'http://localhost:4000').replace(/\/$/,'')
export const statuses=['Pending','In Progress','Completed']
export const priorities=['Low','Medium','High']
export async function api(path,token,method='GET',body,signal){
  const response=await fetch(base+'/api'+path,{method,signal,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined})
  if(!response.ok){
    if(response.status===401 && token) window.dispatchEvent(new Event('session-expired'))
    throw Error((await response.json().catch(()=>({}))).error || 'Request failed. Try again.')
  }
  return response.status===204?null:response.json()
}

