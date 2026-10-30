const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DAY,completeRelease,planArtifacts}=require('./artifact-retention.cjs');
const now=Date.parse('2026-10-30T20:00:00Z');
const artifact=(id,name,age,run=id)=>({id,name,created_at:new Date(now-age).toISOString(),size_in_bytes:100,workflow_run:{id:run}});
const finished=(id,extra={})=>[id,{status:'completed',conclusion:'success',head_branch:'preview',head_sha:'abcdef012345',...extra}];
test('retain latest temporary copy, remove superseded and 24-hour-old files',()=>{
 const items=[artifact(1,'preview',1000),artifact(2,'preview',2000),artifact(3,'other',DAY)];
 assert.deepEqual(planArtifacts(items,new Map([finished(1),finished(2),finished(3)]),[],now).map(a=>a.id),[2,3]);
});
test('never touch active, unknown, future-dated or invalid-dated artifacts',()=>{
 const items=[artifact(1,'preview',2*DAY),artifact(2,'preview',3*DAY),artifact(3,'future',-1),{...artifact(4,'invalid',0),created_at:'invalid'}];
 const runs=new Map([[1,{status:'in_progress'}],finished(3),finished(4)]);
 assert.deepEqual(planArtifacts(items,runs,[],now),[]);
});
test('completed Pages uploads are disposable; incomplete deployments remain for 24 hours',()=>{
 const items=[artifact(1,'github-pages',1000),artifact(2,'github-pages',2000)];
 const selected=planArtifacts(items,new Map([finished(1),finished(2,{conclusion:'failure'})]),[],now);
 assert.equal(selected.find(a=>a.id===1).reason,'completed Pages bundle');
});
test('only matching complete published releases make fresh build downloads redundant',()=>{
 const assets=['slot.sp-System.zip','slot.sp-SD2.zip','SHA256SUMS','build-info.json'].map(name=>({name,size:1}));
 const release={draft:false,tag_name:'build-2026.10.30-abcdef0',target_commitish:'main',assets};
 assert.ok(completeRelease(release));assert.ok(!completeRelease({...release,assets:assets.slice(1)}));
 assert.ok(!completeRelease({...release,draft:true}));
 const items=[artifact(1,'release-downloads',1000)];const runs=new Map([finished(1,{head_branch:'main'})]);
 assert.equal(planArtifacts(items,runs,[release],now)[0].reason,'copied to release assets');
 assert.equal(planArtifacts(items,runs,[{...release,tag_name:'other'}],now).length,0);
});
