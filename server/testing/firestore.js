// In-memory Firestore double for HTTP authorization and event processing tests.
export const records=new Map()
const clone=value=>value===undefined?undefined:structuredClone(value)
function snapshot(path){return {exists:records.has(path),id:path.split('/').at(-1),ref:doc(path),data:()=>clone(records.get(path))}}
function doc(path){return {path,get:async()=>snapshot(path),set:async(data,opts)=>write(path,data,opts),create:async data=>{if(records.has(path))throw Error('Document already exists');write(path,data)},delete:async()=>records.delete(path),update:async data=>write(path,data,{merge:true}),collection:name=>collection(`${path}/${name}`)}}
function write(path,data,opts){records.set(path,opts?.merge?{...records.get(path),...clone(data)}:clone(data))}
function collection(path,filters=[],order='__name__',direction='asc',maximum=Infinity,cursor=null){
  function rows(){let result=[...records.keys()].filter(key=>key.startsWith(`${path}/`) && key.split('/').length===path.split('/').length+1).map(snapshot)
    for(const [field,value] of filters)result=result.filter(row=>row.data()[field]===value)
    const value=row=>order==='__name__'?row.id:row.data()[order]
    result.sort((a,b)=>(value(a)>value(b)?1:value(a)<value(b)?-1:0)*(direction==='desc'?-1:1))
    if(cursor!==null)result=result.filter(row=>value(row)>cursor)
    return result.slice(0,maximum)
  }
  return {doc:id=>doc(`${path}/${id}`),where:(field,op,value)=>{if(op!=='==')throw Error('Unsupported query');return collection(path,[...filters,[field,value]],order,direction,maximum,cursor)},orderBy:(field,dir='asc')=>collection(path,filters,typeof field==='string'?field:'__name__',dir,maximum,cursor),limit:n=>collection(path,filters,order,direction,n,cursor),startAfter:value=>collection(path,filters,order,direction,maximum,value),get:async()=>({docs:rows()}),count:()=>({get:async()=>({data:()=>({count:rows().length})})}),aggregate:()=>({get:async()=>({data:()=>({sessions:rows().length,durationMs:rows().reduce((sum,row)=>sum+(row.data().durationMs || 0),0)})})})}
}
export const db={collection,runTransaction:async fn=>{const writes=[];const result=await fn({get:async ref=>snapshot(ref.path),set:(ref,data,opts)=>writes.push(()=>write(ref.path,data,opts)),update:(ref,data)=>writes.push(()=>write(ref.path,data,{merge:true})),create:(ref,data)=>writes.push(()=>{if(records.has(ref.path))throw Error('Document already exists');write(ref.path,data)})});writes.forEach(write=>write());return result}}
export const adminAuth={verifyIdToken:async token=>{if(!['owner','other','admin'].includes(token))throw Object.assign(Error('Invalid token'),{code:'auth/argument-error'});return {uid:token,email:`${token}@example.test`}}}
