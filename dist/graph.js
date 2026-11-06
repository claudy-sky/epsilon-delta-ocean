const svg=document.querySelector('#limit-graph'),epsilon=document.querySelector('#epsilon'),factor=document.querySelector('#delta-factor');
const ns='http://www.w3.org/2000/svg';
function el(tag,attrs,text){const e=document.createElementNS(ns,tag);for(const [k,v]of Object.entries(attrs))e.setAttribute(k,v);if(text)e.textContent=text;svg.append(e);return e;}
function update(){
 for(const child of [...svg.children])if(!['title','desc'].includes(child.tagName))child.remove();
 const eps=+epsilon.value,delta=eps/3*+factor.value,valid=+factor.value<=1;
 const width=innerWidth<700?500:760,right=width-56,plotWidth=right-64;
 svg.setAttribute('viewBox',`0 0 ${width} 420`);
 const x=v=>64+(v-.5)/3*plotWidth,y=v=>360-(v-2.5)/9*316;
 const line=(x1,y1,x2,y2,stroke,width=1,dash)=>el('line',{x1,y1,x2,y2,stroke,'stroke-width':width,...dash?{'stroke-dasharray':dash}:{}});
 el('rect',{x:64,y:y(7+eps),width:plotWidth,height:y(7-eps)-y(7+eps),fill:'#7cb6ec','fill-opacity':.12});
 el('rect',{x:x(2-delta),y:44,width:x(2+delta)-x(2-delta),height:316,fill:'#d3ae7b','fill-opacity':.13});
 for(let i=3;i<=11;i++)line(64,y(i),right,y(i),'#2d4364');
 for(const s of [-1,1]){line(64,y(7+s*eps),right,y(7+s*eps),'#94c8f5',1.4);line(x(2+s*delta),44,x(2+s*delta),360,'#e1bd8f',1.4,'5 6');}
 line(x(2),44,x(2),360,'#728bac',1,'2 7');line(64,y(7),right,y(7),'#728bac',1,'2 7');
 line(x(.5),y(2.5),x(3.5),y(11.5),'#d4e6fc',3);
 const sign=valid?'#99d5c6':'#efb482';
 line(x(2-delta),y(7-3*delta),x(2+delta),y(7+3*delta),sign,6);
 el('circle',{cx:x(2),cy:y(7),r:5,fill:'#d4e6fc',stroke:'#102441','stroke-width':2});
 const text=(xx,yy,txt,color='#c4d5ed',anchor='start',size=13)=>el('text',{x:xx,y:yy,fill:color,'font-family':'sans-serif','font-size':size,'text-anchor':anchor},txt);
 text(right-6,25,'f(x) = 3x + 1','#d4e6fc','end',15);text(x(2),391,'a = 2',undefined,'middle');text(54,y(7)+4,'L = 7',undefined,'end');
 text(right-5,y(7+eps)-8,'7 + ε','#94c8f5','end');text(right-5,y(7-eps)+20,'7 − ε','#94c8f5','end');
 text(x(2-delta)-7,414,'2 − δ','#e1bd8f','end',12);text(x(2+delta)+7,414,'2 + δ','#e1bd8f','start',12);
 document.querySelector('#epsilon-value').value=eps.toFixed(2);document.querySelector('#delta-value').value=delta.toFixed(3);
 factor.setAttribute('aria-valuetext',`델타 ${delta.toFixed(3)}, 입실론의 3분의 1에 대한 비율 ${(+factor.value).toFixed(2)}`);
 const status=document.querySelector('#experiment-status');
 status.textContent=valid?`✓ 조건을 만족합니다. δ = ${delta.toFixed(3)} ≤ ε/3 = ${(eps/3).toFixed(3)}이므로, 선택한 입력 범위의 모든 x에서 출력 오차가 ε보다 작습니다.`:`△ 입력 범위가 너무 넓습니다. δ = ${delta.toFixed(3)} > ε/3 = ${(eps/3).toFixed(3)}이므로, 범위 안에 출력 오차가 ε 이상인 x가 있습니다.`;
 status.style.color=sign;
 svg.querySelector('desc').textContent=`보기 16의 f(x)=3x+1. a=2, L=7, ε=${eps.toFixed(2)}, δ=${delta.toFixed(3)}. ${valid?'모든 입력이 출력 오차 조건을 만족합니다.':'입력 범위 안에 출력 오차 조건을 만족하지 않는 점이 있습니다.'}`;
}
epsilon.addEventListener('input',update);factor.addEventListener('input',update);addEventListener('resize',update);update();
