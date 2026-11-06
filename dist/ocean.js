import * as THREE from './vendor/three.module.js';
import { createWater } from './water.js?v=github-assessment-1';
const canvas=document.querySelector('#ocean'),root=document.documentElement;
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t);};
const compact=matchMedia('(pointer:coarse)').matches||innerWidth<700;
let progress=0,paused=matchMedia('(prefers-reduced-motion: reduce)').matches;
let ocean,molecules,time=0,visible=!document.hidden,heroVisible=true,preparingMolecules=false;
let frameId=0,layoutDirty=true,redraw=true,lastDraw=performance.now();
let renderScale=1,meanInterval=16.67,slowTime=0,stableTime=0;
document.body.dataset.renderProfile=compact?'mobile':'desktop';

function createMolecules(){
 const mc=document.querySelector('#molecules');
 const renderer=new THREE.WebGLRenderer({canvas:mc,alpha:true,antialias:true,powerPreference:'default'});
 renderer.setClearColor(0x000000,0);
 renderer.outputEncoding=THREE.sRGBEncoding;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.94;
 const scene=new THREE.Scene();scene.fog=new THREE.Fog(0x0b1c37,13,35);
 const camera=new THREE.PerspectiveCamera(40,innerWidth/innerHeight,.1,60);camera.position.z=14;
 scene.add(new THREE.HemisphereLight(0xc9ddff,0x101f3b,.95));
 const key=new THREE.DirectionalLight(0xe8f0ff,2.0);key.position.set(-4,8,7);scene.add(key);
 const rim=new THREE.DirectionalLight(0x8eb6ef,1.4);rim.position.set(5,-1,3);scene.add(rim);
 const sphere=new THREE.SphereGeometry(1,compact?20:32,compact?14:24),bondGeometry=new THREE.CylinderGeometry(.11,.11,1,compact?8:12);
 const oxygen=new THREE.MeshStandardMaterial({color:0x6f97cc,metalness:.06,roughness:.27});
 const hydrogen=new THREE.MeshStandardMaterial({color:0xdce7f7,metalness:0,roughness:.32});
 const bondMaterial=new THREE.MeshStandardMaterial({color:0x738daf,roughness:.40,metalness:.04});
 const objects=[];
 // Geometry is schematic: two O–H bonds enclosing 104.5°, not a molecular dynamics model.
 const positions=[[-5.7,3.7,2.8,1.22], [5.6,3.0,.5,1.02],[-4.8,-3.6,2.2,1.55],[5.6,-3.5,4,1.45],[-2.3,2.4,-4,.6],[2.2,-2.1,-3,.7],[-.8,-.4,5,.66],[3.4,.7,-6,.65],[-4.3,.5,-7,.55],[.8,3.5,-5,.55],[1.8,-4.2,-2,.75]];
 const oxygenDraw=new THREE.InstancedMesh(sphere,oxygen,positions.length);
 const hydrogenDraw=new THREE.InstancedMesh(sphere,hydrogen,positions.length*2);
 const bondDraw=new THREE.InstancedMesh(bondGeometry,bondMaterial,positions.length*2);
 for(const draw of [oxygenDraw,hydrogenDraw,bondDraw]){draw.frustumCulled=false;draw.instanceMatrix.setUsage(THREE.DynamicDrawUsage);scene.add(draw);}
 const vertical=new THREE.Vector3(0,1,0);
 for(let i=0;i<positions.length;i++){
   const [x,y,z,size]=positions[i],group=new THREE.Group();const o=new THREE.Mesh(sphere,oxygen);o.scale.setScalar(.68);group.add(o);
   for(const sign of [-1,1]){
     const point=new THREE.Vector3(sign*Math.sin(52.25*Math.PI/180),Math.cos(52.25*Math.PI/180),0).multiplyScalar(1.12);
     const h=new THREE.Mesh(sphere,hydrogen);h.position.copy(point);h.scale.setScalar(.39);group.add(h);
     const bond=new THREE.Mesh(bondGeometry,bondMaterial);bond.position.copy(point).multiplyScalar(.5);bond.scale.y=point.length();bond.quaternion.setFromUnitVectors(vertical,point.clone().normalize());group.add(bond);
   }
   group.scale.setScalar(size);group.position.set(x,y,z);group.rotation.set(i*.37,i*.72,i*.89);objects.push({group,base:new THREE.Vector3(x,y,z),i,size});
 }
 function resize(){
   const ratio=Math.min(devicePixelRatio,compact?1.1:1.4,Math.sqrt((compact?420000:1800000)/(innerWidth*innerHeight)))*renderScale;
   renderer.setPixelRatio(ratio);renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();
 }resize();
 return {resize,setResolutionScale(){resize();},warm(){renderer.compile(scene,camera);},render(){
   const p=smooth(.44,.88,progress);
   const mobile=innerWidth<700;
   for(const {group,base,i,size} of objects){
     group.scale.setScalar(i===6?(mobile?.28:.44):size*(mobile?.62:1));
     const xDrift=(Math.sin(time*(.17+i*.004)+i*2)*1.6+Math.cos(time*.11+i)*.45)*(mobile?.58:1);
     const yDrift=Math.cos(time*(.15+i*.003)+i*1.7)*1.05+Math.sin(time*.23+i)*.35;
     const zDrift=Math.sin(time*.12+i*.71)*1.15;
     group.position.set(base.x*(mobile?.46:1)+xDrift,base.y+yDrift,base.z+zDrift-7*(1-p));
     group.rotation.x=i*.37+Math.sin(time*.13+i*.7)*.28;
     group.rotation.y=i*.72+time*(.10+(i%4)*.018);
     group.rotation.z=i*.89+Math.sin(time*.17+i)*.45;
     group.updateMatrixWorld(true);
     oxygenDraw.setMatrixAt(i,group.children[0].matrixWorld);
     hydrogenDraw.setMatrixAt(i*2,group.children[1].matrixWorld);hydrogenDraw.setMatrixAt(i*2+1,group.children[3].matrixWorld);
     bondDraw.setMatrixAt(i*2,group.children[2].matrixWorld);bondDraw.setMatrixAt(i*2+1,group.children[4].matrixWorld);
   }
   for(const draw of [oxygenDraw,hydrogenDraw,bondDraw])draw.instanceMatrix.needsUpdate=true;
   renderer.render(scene,camera);
   mc.dataset.drawCalls=String(renderer.info.render.calls);
 }};
}


function onScroll(){
 const rect=document.querySelector('.journey').getBoundingClientRect();progress=clamp(-rect.top/(rect.height-innerHeight));
 heroVisible=rect.bottom>0&&rect.top<innerHeight;
 ocean?.setActive(heroVisible&&progress<(compact?.59:.64)&&!paused);
 root.style.setProperty('--surface-opacity',1-smooth(.13,.37,progress));
 root.style.setProperty('--title-scale',1+smooth(.02,.39,progress)*2.8);
 root.style.setProperty('--title-y',`${-smooth(.08,.4,progress)*40}px`);
 root.style.setProperty('--micro-opacity',smooth(.35,.62,progress));
 root.style.setProperty('--molecule-opacity',smooth(.43,.67,progress));
 root.style.setProperty('--definition-opacity',smooth(.65,.85,progress));
 root.style.setProperty('--definition-y',`${(1-smooth(.65,.85,progress))*50}px`);
 document.querySelector('.definition-reveal').inert=progress<.78;
 document.querySelector('.surface-copy').setAttribute('aria-hidden',String(progress>.5));
 root.style.setProperty('--header-ink','#e7effb');
 root.style.setProperty('--scene-ink','#e7effb');
 if(progress>.25&&!molecules&&!preparingMolecules){
  preparingMolecules=true;
  const prepare=()=>{
   if(!molecules&&visible&&heroVisible){try{molecules=createMolecules();molecules.warm();}catch(error){console.warn(error);}}
   preparingMolecules=false;
  };
  if('requestIdleCallback' in window)requestIdleCallback(prepare,{timeout:600});else setTimeout(prepare,0);
 }
}
const button=document.querySelector('#motion');
function syncPause(){button.setAttribute('aria-pressed',String(paused));button.setAttribute('aria-label',paused?'재생':'일시정지');button.innerHTML=paused?'▷':'Ⅱ';document.body.classList.toggle('paused',paused);}
button.addEventListener('click',()=>{paused=!paused;syncPause();invalidate();});syncPause();
function invalidate(layout=false){layoutDirty||=layout;redraw=true;if(!frameId&&visible)frameId=requestAnimationFrame(frame);}
addEventListener('scroll',()=>invalidate(true),{passive:true});
addEventListener('resize',()=>{ocean?.resize();molecules?.resize();invalidate(true);});
document.addEventListener('visibilitychange',()=>{
 visible=!document.hidden;lastDraw=performance.now();
 if(!visible){ocean?.setActive(false);cancelAnimationFrame(frameId);frameId=0;}else invalidate(true);
});
function adaptQuality(interval){
 if(interval>120)return;
 meanInterval=meanInterval*.94+interval*.06;
 slowTime=meanInterval>27?slowTime+interval:0;
 stableTime=meanInterval<19?stableTime+interval:0;
 let next=renderScale;
 if(slowTime>1800&&renderScale>.65){next=Math.max(.65,renderScale*.85);slowTime=0;stableTime=0;}
 else if(stableTime>10000&&renderScale<1){next=Math.min(1,renderScale+.08);stableTime=0;}
 if(next!==renderScale){renderScale=next;ocean?.setResolutionScale(renderScale);molecules?.setResolutionScale();}
 document.body.dataset.resolutionScale=renderScale.toFixed(2);
}
function frame(now){
 frameId=0;
 if(layoutDirty){onScroll();layoutDirty=false;}
 const animate=visible&&heroVisible&&!paused,interval=now-lastDraw;
 // ProMotion displays may request 120 callbacks/s; this scene submits at most 60.
 if(heroVisible&&visible&&(interval>=16.2||(redraw&&!animate))){
  const dt=Math.min(interval/1000,.05);lastDraw=now;
  if(animate){time+=dt;adaptQuality(interval);}
  try{
   if(progress<(compact?.59:.64)){
    if(!ocean){ocean=createWater(canvas,{quality:compact?'mobile':'desktop'});ocean.setResolutionScale(renderScale);}
    ocean.setActive(!paused);
    ocean.render(dt,time,smooth(.12,.58,progress),paused);
   }
   if(progress>(compact?.47:.42)){
    if(!molecules)molecules=createMolecules();
    molecules.render();
   }
  }catch(error){console.error(error);document.querySelector('#graphics-note').hidden=false;paused=true;syncPause();}
  redraw=false;
 }
 if(animate&&!frameId)frameId=requestAnimationFrame(frame);
}
invalidate(true);
