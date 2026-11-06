import { RGBELoader } from './vendor/RGBELoader.js';
import { FloatType } from './vendor/three.module.js';

// Fourier ocean synthesis: Tessendorf (2001), Phillips wind spectrum.
// Stockham FFT layout adapted from David Li, MIT; see vendor/DAVID-LI-LICENSE.txt.
// Interaction: nonlinear Saint-Venant equations, conservative Rusanov flux.
const G=9.81, DOMAIN=16, H=3.0, WIND=6.2;
const VERTEX=`#version 300 es
out vec2 uv;
void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));uv=p;gl_Position=vec4(p*2.-1.,0.,1.);}`;
const PREFIX=`#version 300 es
precision highp float;precision highp int;
in vec2 uv;out vec4 result;
const float PI=3.141592653589793;
`;
const SPECTRUM=PREFIX+`
uniform sampler2D initial;uniform float time,size;
vec2 cmul(vec2 a,vec2 b){return vec2(a.x*b.x-a.y*b.y,a.x*b.y+a.y*b.x);}
vec2 timesI(vec2 a){return vec2(-a.y,a.x);}
void main(){
 ivec2 c=ivec2(gl_FragCoord.xy),r=textureSize(initial,0);
 vec2 k=2.*PI*vec2(c.x<r.x/2?c.x:c.x-r.x,c.y<r.y/2?c.y:c.y-r.y)/size;
 float len=length(k);if(len==0.){result=vec4(0);return;}
 // Gravity-capillary dispersion with finite depth. Units: metres, seconds.
 float omega=sqrt((9.81*len+.000074*len*len*len)*tanh(len*3.));
 float phase=mod(omega*time,2.*PI);vec2 e=vec2(cos(phase),sin(phase));
 vec2 a=texelFetch(initial,c,0).rg,b=texelFetch(initial,(r-c)%r,0).rg;b.y=-b.y;
 vec2 height=cmul(a,e)+cmul(b,vec2(e.x,-e.y));
 vec2 dx=timesI(height)*(k.x/len)*.95,dz=timesI(height)*(k.y/len)*.95;
 result=vec4(dx+timesI(height),dz);
}`;
const FFT=PREFIX+`
uniform sampler2D source;uniform int axis,stage;
vec2 cmul(vec2 a,vec2 b){return vec2(a.x*b.x-a.y*b.y,a.x*b.y+a.y*b.x);}
void main(){
 ivec2 c=ivec2(gl_FragCoord.xy);int n=textureSize(source,0).x;
 int index=axis==0?c.x:c.y;
 int ei=(index/stage)*(stage/2)+(index%(stage/2));
 ivec2 a=axis==0?ivec2(ei,c.y):ivec2(c.x,ei);
 ivec2 b=axis==0?ivec2(ei+n/2,c.y):ivec2(c.x,ei+n/2);
 vec4 even=texelFetch(source,a,0),odd=texelFetch(source,b,0);
 float phi=2.*PI*float(index)/float(stage);vec2 w=vec2(cos(phi),sin(phi));
 result=vec4(even.xy+cmul(w,odd.xy),even.zw+cmul(w,odd.zw));
}`;
const FLUID=PREFIX+`
uniform sampler2D state,original;uniform vec4 impulse;uniform vec2 momentum;
uniform float dt;uniform bool absorbing,corrector;
const float H=3.0,g=9.81,dx=16./float(SIM_RES);
vec3 flux(vec3 q,int axis){
 float h=H+q.x;vec2 v=q.yz/h;
 float pressure=.5*g*(h*h-H*H);
 return axis==0?vec3(q.y,q.y*v.x+pressure,q.z*v.x):vec3(q.z,q.y*v.y,q.z*v.y+pressure);
}
vec3 rusanov(vec3 a,vec3 b,int axis){
 float ha=H+a.x,hb=H+b.x;
 float speed=max(abs(axis==0?a.y/ha:a.z/ha)+sqrt(g*ha),abs(axis==0?b.y/hb:b.z/hb)+sqrt(g*hb));
 return .5*(flux(a,axis)+flux(b,axis)-speed*(b-a));
}
vec3 slope(vec3 a,vec3 b,vec3 c){
 vec3 x=1.4*(b-a),y=.5*(c-a),z=1.4*(c-b);
 vec3 same=step(vec3(0),x*y)*step(vec3(0),y*z);
 return same*sign(y)*min(min(abs(x),abs(y)),abs(z));
}
vec3 cell(ivec2 p){ivec2 n=textureSize(state,0);return texelFetch(state,(p+n)%n,0).xyz;}
void main(){
 ivec2 c=ivec2(gl_FragCoord.xy),n=textureSize(state,0);
 vec3 q=cell(c),l=cell(c+ivec2(-1,0)),r=cell(c+ivec2(1,0)),b=cell(c+ivec2(0,-1)),t=cell(c+ivec2(0,1));
 vec3 sx=slope(l,q,r),sz=slope(b,q,t);
 vec3 sl=slope(cell(c+ivec2(-2,0)),l,q),sr=slope(q,r,cell(c+ivec2(2,0)));
 vec3 sb=slope(cell(c+ivec2(0,-2)),b,q),st=slope(q,t,cell(c+ivec2(0,2)));
 q-=dt/dx*(rusanov(q+.5*sx,r-.5*sr,0)-rusanov(l+.5*sl,q-.5*sx,0)+rusanov(q+.5*sz,t-.5*st,1)-rusanov(b+.5*sb,q-.5*sz,1));
 // MUSCL reconstruction with SSP-RK2 time integration reduces artificial viscosity.
 if(corrector)q=.5*(q+texelFetch(original,c,0).xyz);
 float radius=length((uv-impulse.xy)*16.);
 float rr=radius*radius/(impulse.w*impulse.w);
 float shape=exp(-.5*rr);
 // A displacement source with zero net volume (Mexican-hat impulse).
 if(corrector){
   float change=impulse.z*(1.-.5*rr)*shape;
   // Limit only external forcing so repeated taps cannot remove the water column.
   q.x+=max(change,.08-H-q.x);
   if(dot(momentum,momentum)>0.)q.yz+=.18*shape*(5.*momentum-q.yz);
   if(absorbing){float edge=min(min(uv.x,uv.y),min(1.-uv.x,1.-uv.y));q*=exp(-dt*10.*(1.-smoothstep(0.,.085,edge)));}
 }
 result=vec4(q,1.);
}`;

// Persistent Eulerian whitecap coverage: production from surface compression
// and convergent flow; advection, diffusion and decay after the crest passes.
const FOAM=PREFIX+`
uniform sampler2D previous,swell,detail,flow;
uniform float dt;
vec3 ocean(vec2 p){return texture(swell,p/24.).xyz+texture(detail,p/3.).xyz;}
void main(){
 vec2 p=(uv-.5)*16.;float e=16./float(SIM_RES);
 vec3 d=ocean(p),xp=ocean(p+vec2(e,0)),xm=ocean(p-vec2(e,0));
 vec3 zp=ocean(p+vec2(0,e)),zm=ocean(p-vec2(0,e));
 vec3 ddx=(xp-xm)/(2.*e),ddz=(zp-zm)/(2.*e);
 float J=(1.+ddx.x)*(1.+ddz.z)-ddx.z*ddz.x;
 vec4 old=texture(previous,uv);vec3 q=texture(flow,uv).xyz;
 vec2 velocity=q.yz/(3.+q.x)+clamp((d.xz-old.gb)/max(dt,.004),vec2(-2.),vec2(2.))*.55+vec2(.12,.04);
 vec2 back=uv-velocity*dt/16.;
 float oldFoam=texture(previous,back).r;
 float texelSize=1./float(SIM_RES);
 float diffuse=(texture(previous,back+vec2(texelSize,0)).r+texture(previous,back-vec2(texelSize,0)).r+texture(previous,back+vec2(0,texelSize)).r+texture(previous,back-vec2(0,texelSize)).r)*.25;
 oldFoam=mix(oldFoam,diffuse,min(.025,dt*.18));
 float compression=1.-smoothstep(.28,.66,J);
 float crest=smoothstep(.10,.36,d.y);
 vec2 texel=vec2(texelSize,0.);
 vec3 qxp=texture(flow,uv+texel).xyz,qxm=texture(flow,uv-texel).xyz;
 vec3 qzp=texture(flow,uv+texel.yx).xyz,qzm=texture(flow,uv-texel.yx).xyz;
 float convergence=-((qxp.y/(3.+qxp.x)-qxm.y/(3.+qxm.x))+(qzp.z/(3.+qzp.x)-qzm.z/(3.+qzm.x)))/(2.*e);
 float curvature=max(0.,-(qxp.x+qxm.x+qzp.x+qzm.x-4.*q.x)/(e*e));
 float collision=smoothstep(.75,2.8,convergence)+smoothstep(5.,14.,curvature)*smoothstep(.03,.10,q.x);
 float source=compression*crest*5.5+collision*2.6;
 // Brief breaking crests leave a decaying streak, never a stamped bubble ring.
 float coverage=oldFoam*exp(-dt/1.15)+(1.-oldFoam)*(1.-exp(-source*dt));
 result=vec4(clamp(coverage,0.,1.),d.x,d.z,d.y);
}`;

const RENDER=PREFIX+`
uniform sampler2D swell,detail,interaction,environment,foam;
uniform vec2 resolution;uniform float zoom,exposure,envRotation,time;
uniform vec3 cameraPosition,forward,up,sunDirection;
uniform vec3 sunIrradiance,skyIrradiance;
vec3 displacement(vec2 p){
 vec3 d=texture(swell,p/24.).xyz+texture(detail,p/3.).xyz;
 vec2 v=p/16.+.5;
 float edge=smoothstep(0.,.04,min(min(v.x,v.y),min(1.-v.x,1.-v.y)));
 d.y+=texture(interaction,clamp(v,vec2(.002),vec2(.998))).x*edge;
 return d;
}
float surfaceHeight(vec2 p){
 #if MOBILE_QUALITY
 return displacement(p).y;
 #else
 vec2 q=p;for(int i=0;i<2;i++)q=p-displacement(q).xz;
 return displacement(q).y;
 #endif
}
vec3 env(vec3 dir,float lod){
 float lon=atan(dir.z,dir.x)/(2.*PI)+.5+envRotation;
 float lat=acos(clamp(dir.y,-1.,1.))/PI;
 return textureLod(environment,vec2(lon,lat),lod).rgb;
}
float fresnel(float cosI){
 float sinT2=(1.-cosI*cosI)/(1.333*1.333);
 float cosT=sqrt(max(0.,1.-sinT2));
 float rs=(cosI-1.333*cosT)/(cosI+1.333*cosT);
 float rp=(1.333*cosI-cosT)/(1.333*cosI+cosT);
 return .5*(rs*rs+rp*rp);
}
vec3 tonemap(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
float fbm(vec2 p){
 #if MOBILE_QUALITY
 return noise(p)*.7+noise(p*2.07+17.)*.3;
 #else
 return noise(p)*.57+noise(p*2.07+17.)*.28+noise(p*4.31-9.)*.15;
 #endif
}
void main(){
 vec2 screen=uv*2.-1.;screen.x*=resolution.x/resolution.y;
 vec3 rd=normalize(forward+vec3(1,0,0)*screen.x*.40+up*screen.y*.40);
 float t=-cameraPosition.y/rd.y;vec3 p=cameraPosition+rd*t;
 #if MOBILE_QUALITY
 for(int i=0;i<2;i++){t+=(surfaceHeight(p.xz)-p.y)/rd.y;p=cameraPosition+rd*t;}
 vec2 q=p.xz;q=p.xz-displacement(q).xz;
 #else
 for(int i=0;i<5;i++){t+=(surfaceHeight(p.xz)-p.y)/rd.y;p=cameraPosition+rd*t;}
 vec2 q=p.xz;for(int i=0;i<3;i++)q=p.xz-displacement(q).xz;
 #endif
 // Normals are derived from the SAME displaced surface being intersected.
 float eps=3./float(SIM_RES);
 vec3 tx=vec3(2.*eps,0,0)+displacement(q+vec2(eps,0))-displacement(q-vec2(eps,0));
 vec3 tz=vec3(0,0,2.*eps)+displacement(q+vec2(0,eps))-displacement(q-vec2(0,eps));
 vec3 normal=normalize(cross(tz,tx));if(normal.y<0.)normal=-normal;
 vec3 view=-rd;float nv=max(.001,dot(normal,view));
 vec3 reflected=reflect(rd,normal);
 // Pixel footprint filters unresolved surface slopes; no hand-painted glitter.
 float variance=max(dot(dFdx(normal),dFdx(normal)),dot(dFdy(normal),dFdy(normal)));
 float roughness=sqrt(.045*.045+min(.08,variance)*.18);
 float lod=clamp(roughness*7.,0.,3.);
 vec3 reflectedSky=env(reflected,lod);
 float F=fresnel(nv);
 // Energy-conserving GGX sun response. Sun irradiance is measured from the HDR.
 vec3 halfVector=normalize(view+sunDirection);
 float nh=max(0.,dot(normal,halfVector)),nl=max(.001,dot(normal,sunDirection));
 float vh=max(.001,dot(view,halfVector));
 float alpha=max(.00465,roughness),aa=alpha*alpha;
 float D=aa/(PI*pow(nh*nh*(aa-1.)+1.,2.));
 float gv=2.*nv/(nv+sqrt(aa+(1.-aa)*nv*nv));
 float gl=2.*nl/(nl+sqrt(aa+(1.-aa)*nl*nl));
 vec3 specular=sunIrradiance*fresnel(vh)*D*gv*gl/(4.*nv);
 // Snell refraction plus wavelength-dependent attenuation through 3 m water.
 vec3 refracted=refract(rd,normal,1./1.333);
 float depth=3.0;float path=(depth+p.y)/max(.2,-refracted.y);
 vec3 attenuation=exp(-vec3(.42,.23,.12)*(path+depth));
 vec3 sand=vec3(.035,.055,.09);
 vec3 bottom=sand*(skyIrradiance+sunIrradiance*max(.0,sunDirection.y))/PI;
 vec3 volume=vec3(.006,.023,.065)*(skyIrradiance+sunIrradiance*.16);
 vec3 below=bottom*attenuation+volume*(1.-attenuation);
 vec3 radiance=F*reflectedSky+(1.-F)*below+specular;
 vec2 fc=q/16.+.5;float edge=smoothstep(0.,.05,min(min(fc.x,fc.y),min(1.-fc.x,1.-fc.y)));
 float cover=texture(foam,clamp(fc,vec2(.002),vec2(.998))).r*edge;
 vec2 foamPoint=q-vec2(.19,.07)*time;
 vec2 wind=normalize(vec2(.934,.357)),across=vec2(-wind.y,wind.x);
 vec2 stretched=vec2(dot(foamPoint,wind)*9.,dot(foamPoint,across)*43.);
 vec2 warp=vec2(fbm(foamPoint*5.),fbm(foamPoint*5.+31.))-.5;
 float shreds=fbm(stretched+warp*3.2);
 // Unblurred crests and wind-torn filaments, rather than circular bubble cells.
 float jacobian=(tx.x*tz.z-tx.z*tz.x)/(4.*eps*eps);
 float activeCrest=(1.-smoothstep(.24,.62,jacobian))*smoothstep(.10,.38,p.y);
 float fresh=activeCrest*smoothstep(.28,.61,shreds);
 float trail=smoothstep(.18,.58,cover)*smoothstep(.48,.70,shreds+cover*.18);
 float froth=clamp(max(fresh,trail)*.96,0.,.96);
 vec3 foamLight=vec3(.91,.94,.98)*(skyIrradiance+sunIrradiance*max(0.,sunDirection.y)) / PI;
 radiance=mix(radiance,foamLight,froth);
 vec3 color=tonemap(radiance*exposure);
 color=mix(color*12.92,1.055*pow(color,vec3(1./2.4))-.055,step(vec3(.0031308),color));
 result=vec4(color,1.);
}`;

export function createWater(canvas,{seed:requestedSeed,quality='auto'}={}){
 const mobile=quality==='mobile'||(quality==='auto'&&(matchMedia('(pointer:coarse)').matches||innerWidth<700));
 const N=mobile?128:256,DT=mobile?1/120:1/240;
 let resolutionScale=1;
 const gl=canvas.getContext('webgl2',{alpha:false,antialias:false,powerPreference:'high-performance'});
 if(!gl||!gl.getExtension('EXT_color_buffer_float'))throw Error('WebGL2 floating-point buffers are unavailable');
 gl.getExtension('OES_texture_float_linear');gl.bindVertexArray(gl.createVertexArray());
 function program(fragment,names){
   const p=gl.createProgram();for(const [type,src]of [[gl.VERTEX_SHADER,VERTEX],[gl.FRAGMENT_SHADER,fragment]]){
     const shader=gl.createShader(type);
     const source=src.replace('#version 300 es',`#version 300 es\n#define SIM_RES ${N}\n#define MOBILE_QUALITY ${mobile?1:0}`);
     gl.shaderSource(shader,source);gl.compileShader(shader);
     if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));gl.attachShader(p,shader);
   }gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));
   return {p,u:Object.fromEntries(names.map(k=>[k,gl.getUniformLocation(p,k)]))};
 }
 function texture(width,height,data=null,{repeat=true,linear=false,half=false}={}){
   const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);
   gl.texImage2D(gl.TEXTURE_2D,0,half?gl.RGBA16F:gl.RGBA32F,width,height,0,gl.RGBA,gl.FLOAT,data);
   gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,linear?gl.LINEAR:gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,linear?gl.LINEAR:gl.NEAREST);
   gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,repeat?gl.REPEAT:gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,repeat?gl.REPEAT:gl.CLAMP_TO_EDGE);
   return t;
 }
 function target(){const t=texture(N,N),f=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,f);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,t,0);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Float framebuffer is incomplete');return {t,f};}
 function bind(t,unit){gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,t);}
 function pass(shader,out){gl.useProgram(shader.p);gl.bindFramebuffer(gl.FRAMEBUFFER,out?.f??null);gl.viewport(0,0,N,N);}
 function draw(){gl.drawArrays(gl.TRIANGLES,0,3);}
 const spectrum=program(SPECTRUM,['initial','time','size']);
 const fft=program(FFT,['source','axis','stage']);
 const fluid=program(FLUID,['state','original','impulse','momentum','dt','absorbing','corrector']);
 const foaming=program(FOAM,['previous','swell','detail','flow','dt']);
 const shading=program(RENDER,['swell','detail','interaction','environment','foam','time','resolution','zoom','exposure','envRotation','cameraPosition','forward','up','sunDirection','sunIrradiance','skyIrradiance']);
 let seed=requestedSeed??crypto.getRandomValues(new Uint32Array(1))[0];
 function rand(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return (seed+.5)/4294967296;}
 function gaussian(){return Math.sqrt(-2*Math.log(rand()))*Math.cos(2*Math.PI*rand());}
 function cascade(size,high){
   const data=new Float32Array(N*N*4),wind=[.934,.357],crosswind=[-.43,.903],L=WIND*WIND/G,dk=2*Math.PI/size;
   let variance=0;
   for(let j=0;j<N;j++)for(let i=0;i<N;i++){
     const kx=(i<N/2?i:i-N)*dk,kz=(j<N/2?j:j-N)*dk,k=Math.hypot(kx,kz);if(k===0||i===N/2||j===N/2)continue;
     const kd=(kx*wind[0]+kz*wind[1])/k;
     const kc=(kx*crosswind[0]+kz*crosswind[1])/k;
     let band=Math.max(0,Math.min(1,(k-12)/10));band=band*band*(3-2*band);band=high?band:1-band;
     const P=.0018*Math.exp(-1/(k*k*L*L))/(k**4)*(.68*kd*kd+.32*kc*kc)*Math.exp(-k*k*.009**2)*band;
     const amplitude=Math.sqrt(P*.5)*dk;
     const offset=(j*N+i)*4;data[offset]=gaussian()*amplitude;data[offset+1]=gaussian()*amplitude;variance+=2*P*dk*dk;
   }
   const initial=texture(N,N,data),a=target(),b=target();
   return {initial,initialData:data,a,b,size,expectedRMS:Math.sqrt(variance),output:a,lastTime:0};
 }
 const large=cascade(24,false),small=cascade(3,true);
 let flow=[target(),target(),target()],flowIndex=0,accumulator=0,events=[],lastPointer=null,drops=0,wakes=0;
 let foamFields=[target(),target()],foamIndex=0,nextSeaEvent=.6,collisions=0;
 for(const f of foamFields){gl.bindFramebuffer(gl.FRAMEBUFFER,f.f);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.bindTexture(gl.TEXTURE_2D,f.t);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);}
 function resetFlow(){for(const t of flow){gl.bindFramebuffer(gl.FRAMEBUFFER,t.f);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);}flowIndex=0;}
 resetFlow();
 function runFFT(c,time){
   c.lastTime=time;
   pass(spectrum,c.a);bind(c.initial,0);gl.uniform1i(spectrum.u.initial,0);gl.uniform1f(spectrum.u.time,time);gl.uniform1f(spectrum.u.size,c.size);draw();
   let current=c.a,next=c.b;
   for(let axis=0;axis<2;axis++)for(let stage=2;stage<=N;stage*=2){
     pass(fft,next);bind(current.t,0);gl.uniform1i(fft.u.source,0);gl.uniform1i(fft.u.axis,axis);gl.uniform1i(fft.u.stage,stage);draw();
     [current,next]=[next,current];
   }
   c.output=current;gl.bindTexture(gl.TEXTURE_2D,current.t);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
 }
 function step(event,absorbing=true){
   const base=flow[flowIndex],interim=flow[(flowIndex+1)%3],out=flow[(flowIndex+2)%3];
   pass(fluid,interim);bind(base.t,0);bind(base.t,1);
   gl.uniform1i(fluid.u.state,0);gl.uniform1i(fluid.u.original,1);gl.uniform1i(fluid.u.corrector,0);gl.uniform1f(fluid.u.dt,DT);gl.uniform1i(fluid.u.absorbing,absorbing?1:0);draw();
   pass(fluid,out);bind(interim.t,0);bind(base.t,1);gl.uniform1i(fluid.u.corrector,1);
   gl.uniform4f(fluid.u.impulse,event?.p[0]??0,event?.p[1]??0,event?.height??0,event?.radius??.15);
   gl.uniform2f(fluid.u.momentum,event?.momentum?.[0]??0,event?.momentum?.[1]??0);draw();flowIndex=(flowIndex+2)%3;
 }
 function updateFoam(delta){
   const next=foamFields[1-foamIndex];pass(foaming,next);
   bind(foamFields[foamIndex].t,0);bind(large.output.t,1);bind(small.output.t,2);bind(flow[flowIndex].t,3);
   for(const [name,unit]of [['previous',0],['swell',1],['detail',2],['flow',3]])gl.uniform1i(foaming.u[name],unit);
   gl.uniform1f(foaming.u.dt,Math.min(delta,.05));
   draw();foamIndex=1-foamIndex;
 }
 function seaPacket(time){
   if(time<nextSeaEvent)return;
   const angle=rand()*Math.PI*2,center=[.39+rand()*.22,.38+rand()*.24],span=.075+rand()*.06;
   const direction=[Math.cos(angle),Math.sin(angle)];
   for(const side of [-1,1])events.push({p:[center[0]+direction[0]*span*side,center[1]+direction[1]*span*side],radius:.45+rand()*.2,height:.18+rand()*.18,momentum:direction.map(v=>-side*v*.5)});
   nextSeaEvent=time+.75+rand()*1.55;collisions++;
 }
 // The light source is an unclipped measured outdoor sky, not a painted pattern.
 let envTex=texture(2,2,new Float32Array([.5,.8,1,1,.5,.8,1,1,.5,.8,1,1,.5,.8,1,1]),{linear:true,half:true});
 let sky=[2.675,2.904,3.421],sun=[-.366,.391,-.844],sunE=[.01026,.00908,.00774],exposure=.36,envRotation=0,environmentLoaded=false;
 const ready=fetch(new URL('./assets/overcast-sky.hdr',import.meta.url)).then(r=>{if(!r.ok)throw Error('HDR sky failed to load');return r.arrayBuffer();}).then(buffer=>{
   const hdr=new RGBELoader().setDataType(FloatType).parse(buffer),data=hdr.data,w=hdr.width,h=hdr.height;
   let maxL=0,maxIndex=0;for(let i=0;i<w*h;i++){const l=.2126*data[4*i]+.7152*data[4*i+1]+.0722*data[4*i+2];if(l>maxL){maxL=l;maxIndex=i;}}
   const sy=Math.floor(maxIndex/w),sx=maxIndex%w;
   const lat=(sy+.5)/h*Math.PI,lon=((sx+.5)/w-.5)*2*Math.PI;
   const desired=-1.98;envRotation=(lon-desired)/(2*Math.PI);
   sun=[Math.sin(lat)*Math.cos(desired),Math.cos(lat),Math.sin(lat)*Math.sin(desired)];
   let E=[0,0,0],ambient=[0,0,0],solid=2*Math.PI*Math.PI/(w*h);
   const cleaned=new Float32Array(data);
   for(let y=0;y<h;y++)for(let x=0;x<w;x++){
     const i=y*w+x,theta=(y+.5)/h*Math.PI,phi=((x+.5)/w-.5)*2*Math.PI;
     const d=[Math.sin(theta)*Math.cos(phi),Math.cos(theta),Math.sin(theta)*Math.sin(phi)];
     const toward=d[0]*(Math.sin(lat)*Math.cos(lon))+d[1]*Math.cos(lat)+d[2]*(Math.sin(lat)*Math.sin(lon));
     const l=.2126*data[4*i]+.7152*data[4*i+1]+.0722*data[4*i+2];
     const isSun=toward>Math.cos(.028)&&l>maxL*.007;
     for(let c=0;c<3;c++){
       if(isSun){E[c]+=data[4*i+c]*Math.sin(theta)*solid;cleaned[4*i+c]=Math.min(data[4*i+c],maxL*.00025);}
       else if(theta<Math.PI/2)ambient[c]+=data[4*i+c]*Math.cos(theta)*Math.sin(theta)*solid;
     }
   }
   // Normalize the measured illumination to a display exposure. Radiometric ratios remain intact.
   const normalization=3/Math.max(.001,(ambient[0]+ambient[1]+ambient[2])/3);
   for(let i=0;i<cleaned.length;i++)if(i%4!==3)cleaned[i]*=normalization;
   sunE=E.map(v=>v*normalization);sky=ambient.map(v=>v*normalization);
   envTex=texture(w,h,cleaned,{linear:true,half:true});gl.bindTexture(gl.TEXTURE_2D,envTex);gl.generateMipmap(gl.TEXTURE_2D);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
   exposure=.36;environmentLoaded=true;
 }).catch(error=>{console.warn('Measured environment unavailable; analytic illumination retained.',error.message);});
 let lastZoom=0,lastPaused=false,inputEnabled=true;
 function camera(zoom){
   // The field of view stays constant as the camera approaches the water.
   const distance=Math.max(1.7,6.3*Math.exp(-zoom*2.4)),position=[0,distance,distance*.57];
   const len=Math.hypot(1,.57),forward=[0,-1/len,-.57/len],up=[0,.57/len,-1/len];
   return {position,forward,up};
 }
 function point(x,y){
   const {position,forward,up}=camera(lastZoom),sx=(2*x/innerWidth-1)*innerWidth/innerHeight,sy=1-2*y/innerHeight;
   const ray=[sx*.40,forward[1]+sy*.40*up[1],forward[2]+sy*.40*up[2]];
   const t=-position[1]/ray[1];return [(position[0]+ray[0]*t)/DOMAIN+.5,(position[2]+ray[2]*t)/DOMAIN+.5];
 }
 canvas.addEventListener('pointermove',e=>{
   if(!inputEnabled||lastPaused||lastZoom>.85)return;const p=point(e.clientX,e.clientY),now=e.timeStamp;
   if(lastPointer){const elapsed=Math.max(.008,(now-lastPointer.time)/1000),vx=(p[0]-lastPointer.p[0])*DOMAIN/elapsed,vz=(p[1]-lastPointer.p[1])*DOMAIN/elapsed;
     if(Math.hypot(vx,vz)>.03&&Math.hypot(vx,vz)<100){const scale=.065/Math.max(1,Math.hypot(vx,vz)/5);events.push({p,radius:.25,height:-.012,momentum:[vx*scale,vz*scale]});wakes++;}}
   lastPointer={p,time:now};
 });
 canvas.addEventListener('pointerleave',()=>lastPointer=null);
 canvas.addEventListener('pointerdown',e=>{if(!inputEnabled||lastPaused||lastZoom>.85)return;const p=point(e.clientX,e.clientY);events.unshift({p,radius:.32,height:-.42});drops++;});
 function resize(){
   const dpr=Math.min(devicePixelRatio,mobile?1.1:1.4)*resolutionScale;
   const budget=mobile?420000:1800000;
   const ratio=Math.min(dpr,Math.sqrt(budget/(innerWidth*innerHeight)));
   canvas.width=Math.max(1,Math.round(innerWidth*ratio));canvas.height=Math.max(1,Math.round(innerHeight*ratio));
   canvas.dataset.grid=String(N);canvas.dataset.quality=mobile?'mobile':'desktop';
   canvas.dataset.pixels=String(canvas.width*canvas.height);
 }resize();
 runFFT(large,0);runFFT(small,0);
 function read(target){const data=new Float32Array(N*N*4);gl.bindFramebuffer(gl.FRAMEBUFFER,target.f);gl.readPixels(0,0,N,N,gl.RGBA,gl.FLOAT,data);return data;}
 function spectralEnergy(c){
   let sum=0;const a=c.initialData,dk=2*Math.PI/c.size;
   for(let j=0;j<N;j++)for(let i=0;i<N;i++){
     const k=Math.hypot(i<N/2?i:i-N,j<N/2?j:j-N)*dk;if(!k)continue;
     const phase=Math.sqrt((G*k+.000074*k*k*k)*Math.tanh(k*3))*c.lastTime,cos=Math.cos(phase),sin=Math.sin(phase);
     const offset=(j*N+i)*4,mirror=(((N-j)%N)*N+(N-i)%N)*4;
     const ar=a[offset],ai=a[offset+1],br=a[mirror],bi=-a[mirror+1];
     const re=ar*cos-ai*sin+br*cos+bi*sin,im=ar*sin+ai*cos-br*sin+bi*cos;
     sum+=re*re+im*im;
   }return Math.sqrt(sum);
 }
 const api={
   ready,resize,
   setActive(value){if(!value&&inputEnabled){events.length=0;lastPointer=null;}inputEnabled=value;},
   setResolutionScale(value){resolutionScale=Math.max(.65,Math.min(1,value));resize();},
   render(delta,time,zoom,paused){
     lastZoom=zoom;lastPaused=paused;
     if(!paused){runFFT(large,time);runFFT(small,time);seaPacket(time);accumulator=Math.min(accumulator+delta,.045);
       while(accumulator>=DT){step(events.shift());accumulator-=DT;}events=events.slice(-16);updateFoam(delta);}
     // Filter only for rendering; texelFetch in the solver remains exact.
     bind(flow[flowIndex].t,2);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
     gl.useProgram(shading.p);gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,canvas.width,canvas.height);
     bind(large.output.t,0);bind(small.output.t,1);bind(flow[flowIndex].t,2);bind(envTex,3);bind(foamFields[foamIndex].t,4);
     for(const [k,unit]of [['swell',0],['detail',1],['interaction',2],['environment',3],['foam',4]])gl.uniform1i(shading.u[k],unit);
     const c=camera(zoom);gl.uniform3fv(shading.u.cameraPosition,c.position);gl.uniform3fv(shading.u.forward,c.forward);gl.uniform3fv(shading.u.up,c.up);
     gl.uniform3fv(shading.u.sunDirection,sun);gl.uniform3fv(shading.u.sunIrradiance,sunE);gl.uniform3fv(shading.u.skyIrradiance,sky);
     gl.uniform2f(shading.u.resolution,canvas.width,canvas.height);gl.uniform1f(shading.u.zoom,zoom);gl.uniform1f(shading.u.time,time);gl.uniform1f(shading.u.exposure,exposure);gl.uniform1f(shading.u.envRotation,envRotation);draw();
   },
   stats(){return {grid:N,quality:mobile?'mobile':'desktop',timeStep:DT,pixels:canvas.width*canvas.height,resolutionScale,cascades:[24,3],wind:WIND,environmentLoaded,skyIrradiance:sky,sunIrradiance:sunE,sunDirection:sun,drops,wakes,collisions};},
   async benchmark(){
     const ext=gl.getExtension('EXT_disjoint_timer_query_webgl2');
     if(!ext)return {timingMeasured:false,reason:'GPU timing extension unavailable; no FPS or speedup inferred',...api.stats()};
     for(let i=0;i<3;i++)api.render(1/60,8+i/60,0,false);
     const query=gl.createQuery();gl.beginQuery(ext.TIME_ELAPSED_EXT,query);
     for(let i=0;i<4;i++)api.render(1/60,9+i/60,0,false);
     gl.endQuery(ext.TIME_ELAPSED_EXT);
     return await new Promise(resolve=>{
       let attempts=0;
       function poll(){
         if(gl.getQueryParameter(query,gl.QUERY_RESULT_AVAILABLE)){
           const disjoint=gl.getParameter(ext.GPU_DISJOINT_EXT),ns=gl.getQueryParameter(query,gl.QUERY_RESULT);
           gl.deleteQuery(query);
           resolve({timingMeasured:!disjoint&&ns>0,gpuFrameMs:!disjoint&&ns>0?ns/1e6/4:null,...api.stats()});
         }else if(++attempts>120){gl.deleteQuery(query);resolve({timingMeasured:false,reason:'GPU timing timed out',...api.stats()});}
         else requestAnimationFrame(poll);
       }requestAnimationFrame(poll);
     });
   },
   validate(){
     const spectrumData=read(large.output);let rms=0,finite=true;
     for(let i=0;i<spectrumData.length;i+=4){rms+=spectrumData[i+1]**2;for(let c=0;c<4;c++)finite&&=Number.isFinite(spectrumData[i+c]);}
     rms=Math.sqrt(rms/(N*N));
     resetFlow();step({p:[.5,.5],radius:.32,height:-.42},false);
     const before=read(flow[flowIndex]);let initialMass=0,initialEnergy=0;
     for(let i=0;i<before.length;i+=4){initialMass+=before[i];initialEnergy+=G*.5*before[i]**2+(before[i+1]**2+before[i+2]**2)/(2*(H+before[i]));}
     const durationSteps=Math.round(1/DT);
     for(let i=0;i<durationSteps;i++)step(undefined,false);
     const after=read(flow[flowIndex]);let mass=0,energy=0,maxVelocity=0,maxHeight=0,radialMoment=0,absoluteHeight=0;
     for(let j=0;j<N;j++)for(let i=0;i<N;i++){
       const a=(j*N+i)*4,h=after[a],mx=after[a+1],mz=after[a+2];
       mass+=h;energy+=G*.5*h*h+(mx*mx+mz*mz)/(2*(H+h));
       maxVelocity=Math.max(maxVelocity,Math.hypot(mx,mz)/(H+h));maxHeight=Math.max(maxHeight,Math.abs(h));
       radialMoment+=Math.abs(h)*Math.hypot(i+.5-N/2,j+.5-N/2)*DOMAIN/N;
       absoluteHeight+=Math.abs(h);
       finite&&=Number.isFinite(h+mx+mz)&&H+h>0;
     }
     const result={finite,spectrumRMS:rms,expectedSpectrumRMS:spectralEnergy(large),ensembleSpectrumRMS:large.expectedRMS,massDriftCubicMetres:(mass-initialMass)*(DOMAIN/N)**2,energyRatio:energy/initialEnergy,maxVelocity,maxHeight,waveRadius:radialMoment/absoluteHeight,linearTheoryRadius:Math.sqrt(G*H)*durationSteps*DT,seconds:durationSteps*DT,gpuError:gl.getError()};
     resetFlow();
     const rapidInterval=Math.round(.05/DT);
     for(let i=0;i<Math.round(2/DT);i++)step(i%rapidInterval===0?{p:[.5,.5],radius:.32,height:-.42}:undefined,true);
     const stress=read(flow[flowIndex]);let minDepth=Infinity,stressFinite=true;
     for(let i=0;i<stress.length;i+=4){minDepth=Math.min(minDepth,H+stress[i]);stressFinite&&=Number.isFinite(stress[i]+stress[i+1]+stress[i+2]);}
     result.rapid40Taps={finite:stressFinite,minDepth};
     const originalTime=large.lastTime;
     for(let i=0;i<24;i++){runFFT(large,originalTime+i/30);runFFT(small,originalTime+i/30);updateFoam(1/30);}
     const f=read(foamFields[foamIndex]);let foamFinite=true,foamMax=0,foamMin=1,foamMean=0;
     for(let i=0;i<f.length;i+=4){foamFinite&&=Number.isFinite(f[i]);foamMax=Math.max(foamMax,f[i]);foamMin=Math.min(foamMin,f[i]);foamMean+=f[i]/(N*N);}
     result.foam={finite:foamFinite,min:foamMin,max:foamMax,mean:foamMean};
     resetFlow();result.gpuError=gl.getError();return result;
   }
 };return api;
}
