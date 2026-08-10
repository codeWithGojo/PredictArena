function factorial(n){if(n<=1)return 1;let r=1;for(let i=2;i<=n;i++)r*=i;return r;}
function poissonP(k,l){return(Math.exp(-l)*Math.pow(l,k))/factorial(k);}

function predictFootball(home,away,hStr=1,aStr=1,homeAdv=.28){
  const hx=Math.max(.45,hStr*1.38+homeAdv), ax=Math.max(.35,aStr*1.18);
  let hw=0,dr=0,aw=0,best={h:0,a:0,p:0}, matrix=[];
  for(let h=0;h<=5;h++)for(let a=0;a<=5;a++){
    const p=poissonP(h,hx)*poissonP(a,ax); matrix.push({h,a,p});
    if(h>a)hw+=p; else if(h===a)dr+=p; else aw+=p;
    if(p>best.p)best={h,a,p};
  }
  let over=0; matrix.forEach(s=>{if(s.h+s.a>2.5)over+=s.p;});
  const t=hw+dr+aw; hw/=t; dr/=t; aw/=t;
  const conf=Math.min(92,Math.max(40,Math.round((best.p*100+Math.abs(hw-aw)*45)*.72)));
  return{home,away,homeWin:Math.round(hw*100),draw:Math.round(dr*100),awayWin:Math.round(aw*100),
    score:`${best.h} - ${best.a}`,over:Math.round(over*100),under:Math.round((1-over)*100),
    hx:hx.toFixed(2),ax:ax.toFixed(2),confidence:conf};
}

function predictNBA(home,away,hStr=1,aStr=1){
  const diff=(hStr-aStr)+.13, p=1/(1+Math.exp(-diff*3.4));
  const hs=Math.round(111+(hStr-1)*17+3.5), as=Math.round(111+(aStr-1)*17);
  return{home,away,homeWin:Math.round(p*100),awayWin:Math.round((1-p)*100),
    score:`${hs} - ${as}`,confidence:Math.min(88,Math.max(48,Math.round(Math.abs(p-.5)*155+45)))};
}

function predictEsports(a,b){
  const diff=(a.strength-b.strength)/18, p=1/(1+Math.exp(-diff*2.9));
  return{a:a.name,b:b.name,winA:Math.round(p*100),winB:Math.round((1-p)*100),
    confidence:Math.min(91,Math.max(52,Math.round(Math.abs(p-.5)*145+55))),
    formA:a.form,formB:b.form,noteA:a.note,noteB:b.note};
}

function formHtml(form){
  return form.map(r=>{
    if(r==="W")return'<span class="pill w">W</span>';
    if(r==="L")return'<span class="pill l">L</span>';
    return'<span class="pill d">D</span>';
  }).join(" ");
}
