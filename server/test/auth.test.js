import { test, beforeEach, mock } from 'node:test'
import assert from 'node:assert/strict'
let verify, calls
mock.module('../src/config/firebase.js', {namedExports:{adminAuth:{verifyIdToken:token=>{calls++;return verify(token)}}}})
const {optionalAuth,requireAuth}=await import('../src/middleware/auth.js')
beforeEach(()=>{calls=0;verify=async()=>({uid:'verified-user'})})
async function request(authorization,required=true){
  const req={headers:{...(authorization===undefined?{}:{authorization})}}
  const result={status:200,body:null,access:false}
  const res={status(code){result.status=code;return this},json(body){result.body=body;return this}}
  await optionalAuth(req,res,()=>{if(required)requireAuth(req,res,()=>{result.access=true});else result.access=true})
  return {...result,user:req.user}
}
test('missing authentication is optional for guests but required for account access',async()=>{
  assert.equal((await request(undefined,false)).access,true)
  const account=await request()
  assert.equal(account.status,401)
  assert.equal(account.body.code,'AUTH_REQUIRED')
  assert.equal(calls,0)
})
test('only a verified Firebase ID token grants authenticated access',async()=>{
  verify=async token=>{assert.equal(token,'id-token');return {uid:'verified-user'}}
  const allowed=await request('Bearer id-token')
  assert.equal(allowed.access,true)
  assert.equal(allowed.user.uid,'verified-user')
  for(const header of ['Bearer ','Basic abc','Bearer a b'])assert.equal((await request(header)).status,401)
  assert.equal(calls,1)
})
test('invalid, revoked and expired tokens are denied, including on optional-auth routes',async()=>{
  for(const code of ['auth/argument-error','auth/invalid-id-token','auth/id-token-revoked','auth/user-disabled','auth/id-token-expired']){
    verify=async()=>{throw Object.assign(Error('Invalid session'),{code})}
    const result=await request('Bearer invalid',false)
    assert.equal(result.status,401)
    assert.equal(result.access,false)
    assert.equal(result.user,null)
    assert.equal(result.body.code,code==='auth/id-token-expired'?'AUTH_TOKEN_EXPIRED':'AUTH_TOKEN_INVALID')
  }
})
test('missing project/credentials or a network outage return 503 instead of a misleading 401',async()=>{
  const logs=[]
  const log=mock.method(console,'error',message=>logs.push(message))
  try{
    for(const error of [Error('Unable to detect a Project Id'),Object.assign(Error('private credential details'),{code:'app/invalid-credential'}),Object.assign(Error('Error fetching public keys: private URL'),{code:'auth/argument-error'})]){
      verify=async()=>{throw error}
      const result=await request('Bearer private-token')
      assert.equal(result.status,503)
      assert.equal(result.body.code,'AUTH_SERVICE_UNAVAILABLE')
      assert.equal(result.access,false)
      assert.equal(result.user,null)
      assert.match(result.body.message,/Firebase Admin/)
      assert.doesNotMatch(JSON.stringify(result.body),/private/)
    }
    assert.doesNotMatch(logs.join(' '),/private/)
  }finally{log.mock.restore()}
})
