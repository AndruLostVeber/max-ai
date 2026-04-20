// ══ VOICE — toggleV(), startVoice(), stopVoice(), sendOrStopVoice(),
//            fileToBase64(), handleF() ══

let vOn={H:false,B:false};
let vTimerInt={H:null,B:null};
let vSeconds={H:0,B:0};
let vMediaRec={H:null,B:null};
let vChunks={H:[],B:[]};
let vBlob={H:null,B:null};

function toggleV(id){ if(vOn[id]) stopVoice(id); else startVoice(id); }

function startVoice(id){
  vOn[id]=true; vSeconds[id]=0; vChunks[id]=[]; vBlob[id]=null;
  document.getElementById('vBtn'+id).classList.add('on');
  document.getElementById('vWave'+id).classList.add('on');
  const timer=document.getElementById('vTimer'+id);
  timer.textContent='00:00'; timer.classList.add('on');
  document.getElementById('send'+id).classList.add('voice-mode');
  vTimerInt[id]=setInterval(()=>{ vSeconds[id]++; document.getElementById('vTimer'+id).textContent=fmtTime(vSeconds[id]); },1000);
  if(navigator.mediaDevices&&navigator.mediaDevices.getUserMedia){
    navigator.mediaDevices.getUserMedia({audio:true}).then(stream=>{
      const mr=new MediaRecorder(stream);
      vMediaRec[id]=mr;
      mr.ondataavailable=e=>{ if(e.data.size>0) vChunks[id].push(e.data); };
      mr.start();
    }).catch(()=>{ vMediaRec[id]=null; toast('Нет доступа к микрофону','err'); });
  }
}

function stopVoice(id){
  vOn[id]=false;
  clearInterval(vTimerInt[id]);
  const dur=vSeconds[id];
  document.getElementById('vBtn'+id).classList.remove('on');
  document.getElementById('vWave'+id).classList.remove('on');
  document.getElementById('vTimer'+id).classList.remove('on');
  document.getElementById('send'+id).classList.remove('voice-mode');
  const chipsId=id==='H'?'fChipsHero':'fChipsBot';
  const finalize=blob=>{
    vBlob[id]=blob;
    const chips=document.getElementById(chipsId);
    chips.querySelector('.v-chip')?.remove();
    const ch=document.createElement('div'); ch.className='f-chip v-chip';
    ch.innerHTML=`<svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" viewBox="0 0 24 24"><path d="M12 1a3 3 0 00-3 3v7a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M5 10a7 7 0 0014 0"/><line x1="12" y1="17" x2="12" y2="21"/></svg>Голосовое<span class="v-chip-dur">${fmtTime(dur)}</span><button onclick="this.parentElement.remove();vBlob['${id}']=null">×</button>`;
    chips.appendChild(ch);
  };
  if(vMediaRec[id]&&vMediaRec[id].state!=='inactive'){
    vMediaRec[id].onstop=()=>{
      const blob=new Blob(vChunks[id],{type:'audio/webm'});
      finalize(blob);
      vMediaRec[id].stream.getTracks().forEach(t=>t.stop());
      vMediaRec[id]=null;
    };
    vMediaRec[id].stop();
  } else { finalize(null); }
}

function sendOrStopVoice(id){ if(vOn[id]) stopVoice(id); else doSend(id==='H'?'hero':'bot'); }

function stopGeneration(){
  const abortCtrl = typeof getConversationAbortController === 'function'
    ? getConversationAbortController()
    : null;
  if (abortCtrl) abortCtrl.abort();
}

function setSendStop(streaming){
  ['H','B'].forEach(id=>{
    const btn=document.getElementById('send'+id);
    if(!btn) return;
    if(streaming){
      btn.classList.add('stop-mode');
      btn.querySelector('.ico-send').style.display='none';
      btn.querySelector('.ico-voice-stop').style.display='flex';
      btn.onclick=stopGeneration;
    } else {
      btn.classList.remove('stop-mode');
      btn.querySelector('.ico-send').style.display='flex';
      btn.querySelector('.ico-voice-stop').style.display='none';
      btn.onclick=()=>sendOrStopVoice(id);
    }
  });
}

// Map<chipElement, File> — keeps File objects for upload
const chipFileMap = new WeakMap();

function fileToBase64(file){
  return new Promise((res,rej)=>{
    const fr=new FileReader();
    fr.onload=()=>res(fr.result.split(',')[1]);
    fr.onerror=rej;
    fr.readAsDataURL(file);
  });
}

async function handleF(files, chipsId){
  const c=document.getElementById(chipsId);
  for(const f of Array.from(files)){
    const ch=document.createElement('div');
    ch.className='f-chip';
    ch.dataset.name=f.name;
    ch.dataset.mime=f.type||'application/octet-stream';
    const ext=f.name.split('.').pop().toLowerCase();
    const isImg=['jpg','jpeg','png','gif','webp','svg'].includes(ext);
    ch.dataset.isImage=isImg?'1':'0';

    ch.innerHTML=`<svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>${esc(f.name)}<span class="chip-status" style="margin-left:3px;font-size:10px;color:var(--dim)">⏳</span><button onclick="this.parentElement.remove()">×</button>`;
    c.appendChild(ch);

    chipFileMap.set(ch, f);

    if(!isImg){
      const st=ch.querySelector('.chip-status');
      const PARSE_EXTS=['pdf','docx','xlsx','xls','csv'];
      if(ext==='txt'||ext==='md'){
        try {
          const text=await f.text();
          ch.dataset.textContent=text.slice(0,40000);
          if(st){ st.textContent='✓'; st.style.color='#22C55E'; }
        } catch { if(st){ st.textContent='✗'; st.style.color='var(--red)'; } }
      } else if(PARSE_EXTS.includes(ext)){
        try {
          const fd=new FormData(); fd.append('file',f);
          const r=await fetch(`${API}/parse`,{method:'POST',headers:{...authHeaders()},body:fd});
          if(!r.ok) throw new Error(await r.text());
          const d=await r.json();
          ch.dataset.textContent=d.text||'';
          if(st){ st.textContent=`✓ ${Math.round((d.chars||0)/1000)}k`; st.style.color='#22C55E'; }
        } catch(e) { if(st){ st.textContent='✗'; st.style.color='var(--red)'; } console.error('parse:',e); }
      } else {
        if(st){ st.textContent='✓'; st.style.color='#22C55E'; }
      }
    } else {
      try {
        const b64=await fileToBase64(f);
        ch.dataset.b64=b64;
        const st=ch.querySelector('.chip-status');
        if(st){ st.textContent='✓'; st.style.color='#22C55E'; }
      } catch { const st=ch.querySelector('.chip-status'); if(st){ st.textContent='✗'; st.style.color='var(--red)'; } }
    }
  }
}
