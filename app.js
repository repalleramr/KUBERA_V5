const STORAGE_KEY = 'kubera-warhunt-v5pro-final-locked';

const romanMap = ['🌀', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'];

let audioCtx = null;
function initAudio() {
    if (!audioCtx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if(AudioContext) audioCtx = new AudioContext();
    }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}
function playTone(freq, type, duration, vol, delay=0) {
    try {
        if(!audioCtx) return;
        const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
        osc.type = type; osc.frequency.setValueAtTime(freq, audioCtx.currentTime + delay);
        gain.gain.setValueAtTime(vol, audioCtx.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + delay + duration);
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.start(audioCtx.currentTime + delay); osc.stop(audioCtx.currentTime + delay + duration);
    } catch(e) {}
}
function playSound(event) {
    initAudio();
    if(event === 'win') {
        playTone(523.25, 'sine', 0.1, 0.1, 0);      
        playTone(659.25, 'sine', 0.1, 0.1, 0.1);    
        playTone(783.99, 'sine', 0.15, 0.1, 0.2);   
        playTone(1046.50, 'sine', 0.3, 0.15, 0.3);  
    } else if (event === 'stun') {
        playTone(250, 'sawtooth', 0.2, 0.1, 0);     
        playTone(200, 'sawtooth', 0.3, 0.1, 0.15);  
    }
}

function triggerStagePopup(amount) {
    const popup = document.createElement('div');
    popup.className = 'stage-popup';
    popup.innerHTML = `ACHIEVED<br><span>💎 ${amount}</span>`;
    document.body.appendChild(popup);
    setTimeout(() => popup.remove(), 1800);
}

const defaultSettings = { bankroll: 0, targetDollar: 500, targetPercent: 1.67, stopLoss: 30000, min: 200, max: 3000, coin: 100, targetNum: 1000, doubleLadder: 'on', keypadMode: 'combined', maxSteps: 30, reserve: 20000, capRule: 'on', capReturn: 'on', stopLossPerNumber: -100, attackMode: 'classic', theme: 'warhunt', vaultBg: 'bg-molten' };
const titles = { sangram:'⚔ SANGRAM', vyuha:'🛡 VYUHA', granth:'📜 GRANTH', drishti:'👁 DRISHTI', sopana:'🪜 SOPANA', yantra:'⚙ YANTRA', medha:'🧠 MEDHA' };
const themePalette = { warhunt: { themeColor:'#050200' }, temple: { themeColor:'#140b05' }, vault: { themeColor:'#04110b' }, oracle: { themeColor:'#050816' }, crimson: { themeColor:'#130507' }, onyx: { themeColor:'#040405' }, sapphire: { themeColor:'#040a15' }, emerald: { themeColor:'#03110d' }, moon: { themeColor:'#0c0b14' }, thunder: { themeColor:'#060810' } };

function applyTheme(themeName){ const theme = themePalette[themeName] ? themeName : 'warhunt'; document.documentElement.dataset.theme = theme; const meta = document.querySelector('meta[name="theme-color"]'); if(meta) meta.setAttribute('content', themePalette[theme].themeColor); }
function applyBackground(bgName){ document.body.setAttribute('data-vault-bg', bgName || 'bg-molten'); }

let deferredPrompt = null; let historyStack = []; let redoStack = []; let pending = { Y: null, K: null }; let keypadBusy = false;
const q = id => document.getElementById(id);
const fmtMoney = n => '💎 ' + Number(n || 0).toLocaleString('en-IN');
const clone = obj => { try { return obj === undefined ? undefined : JSON.parse(JSON.stringify(obj)); } catch(e){ return obj; } };

function getAttackMode(){ return state?.settings?.attackMode || 'classic'; }
function attackThresholdForMode(mode){ return mode==='thirdstrike' ? 2 : mode==='fourthstrike' ? 3 : 1; }
function activateTrackedNumber(info){ info.status='A'; info.step=1; info.ladder=1; info.activeAt=state.currentChakra; info.prevLoss=0; }
function freshNumber(){ return { status:'I', step:0, ladder:1, activeAt:null, prevLoss:0, winningBet:0, lastNet:0, pendingSecond:false, watchCount:0 }; }

function askModal({ title, text, okLabel='OK', cancelLabel='Cancel', okClass='warn' }){
  return new Promise(resolve=>{
    if(q('confirmTitle')) q('confirmTitle').textContent = title;
    if(q('confirmText')) q('confirmText').textContent = text;
    const cancelBtn = q('confirmCancelBtn'); if(cancelBtn) cancelBtn.textContent = cancelLabel;
    const okBtn = q('confirmOkBtn'); if(okBtn) { okBtn.textContent = okLabel; okBtn.className = okClass === 'warn' ? 'epic-btn-red' : 'epic-btn-gold'; }
    const overlay = q('confirmOverlay');
    const cleanup = (result) => { if(overlay) { overlay.classList.add('hidden'); overlay.setAttribute('aria-hidden','true'); } if(okBtn) okBtn.onclick = null; if(cancelBtn) cancelBtn.onclick = null; if(overlay) overlay.onclick = null; resolve(result); };
    if(okBtn) okBtn.onclick = () => cleanup(true);
    if(cancelBtn) cancelBtn.onclick = () => cleanup(false);
    if(overlay) overlay.onclick = (e) => { if(e.target === overlay) cleanup(false); };
    if(overlay) { overlay.classList.remove('hidden'); overlay.setAttribute('aria-hidden','false'); }
  });
}
function askClearKumbh(){ return askModal({ title:'ABANDON RAID', text:'End current raid wave?', okLabel:'End Raid', cancelLabel:'Cancel', okClass:'warn' }); }
function askApplyYantra(){ return askModal({ title:'APPLY SETTINGS', text:'Lock in game settings?', okLabel:'Yes', cancelLabel:'No', okClass:'' }); }

function createSide(){ const s={}; for(let i=1;i<=9;i++) s[i]=freshNumber(); return s; }
function roundUpToCoin(value, coin){ const safeCoin = Math.max(1, Number(coin) || 100); return Math.max(safeCoin, Math.ceil(value / safeCoin) * safeCoin); }

function buildLadder(settings){
  const rows = []; let previousLoss = 0; let bet = roundUpToCoin(settings.min, settings.coin); let currentLevel = bet;
  for(let step=1; step<=settings.maxSteps; step++){
    bet = Math.min(settings.max, roundUpToCoin(bet, settings.coin)); const winReturn = bet * 9;
    rows.push({ step: `T${step}`, bet, winReturn, netProfit: winReturn - (previousLoss + bet), ifLoseTotal: -(previousLoss + bet) });
    previousLoss += bet;
    if(step < settings.maxSteps){
      if(((bet * 8) - previousLoss) < settings.targetNum){
        if(settings.doubleLadder === 'on'){ currentLevel = Math.min(settings.max, roundUpToCoin(currentLevel * 2, settings.coin)); bet = currentLevel; } 
        else { 
            let probe = bet; let safeLoop = 0;
            while((((probe * 8) - previousLoss) < settings.targetNum) && probe < settings.max && safeLoop < 1000){ 
                probe = Math.min(settings.max, roundUpToCoin(probe + settings.coin, settings.coin)); safeLoop++;
            } 
            bet = probe; currentLevel = bet; 
        }
      } else { bet = currentLevel; }
    }
  } return rows;
}

function freshState(){ const settings = { ...defaultSettings }; return { settings, liveBankroll: settings.bankroll, currentChakra: 0, numbers: { Y: createSide(), K: createSide() }, drishti: [], granth: [], currentKumbhId: null, summary: { totalAhuti: 0, maxExposure: 0 }, ladder: buildLadder(settings), activeTab: 'sangram' }; }
function validateState(st) { if (!st || !st.numbers || !st.numbers.Y || !st.numbers.K) return false; if (!st.numbers.Y[1] || typeof st.numbers.Y[1] !== 'object') return false; return true; }

function reviveState(raw){ 
    const base = freshState(); 
    const settings={...base.settings,...(raw.settings||{})}; 
    if(!Number.isFinite(Number(settings.stopLoss)) || Number(settings.stopLoss)<=0) settings.stopLoss = base.settings.stopLoss; 
    if(!Number.isFinite(Number(settings.stopLossPerNumber))) settings.stopLossPerNumber = base.settings.stopLossPerNumber; 
    if(!settings.doubleLadder) settings.doubleLadder = 'on'; 
    if(!settings.capReturn) settings.capReturn = 'on'; 
    if(!settings.theme || !themePalette[settings.theme]) settings.theme = base.settings.theme; 
    if(!settings.vaultBg) settings.vaultBg = base.settings.vaultBg; 
    return {
        ...base,
        ...raw,
        settings,
        numbers: raw.numbers || base.numbers,
        summary: { ...base.summary, ...(raw.summary||{}) },
        ladder: Array.isArray(raw.ladder) && raw.ladder.length ? raw.ladder : buildLadder(settings),
        granth: Array.isArray(raw.granth) ? raw.granth : [], 
        drishti: Array.isArray(raw.drishti) ? raw.drishti : [], 
        activeTab: raw.activeTab || 'sangram'
    }; 
}
function coreSnapshot(){ return { state: clone(state), pending: clone(pending) }; }
function historySnapshot(){ return JSON.stringify(coreSnapshot()); }
function persistedSnapshot(){ return JSON.stringify(coreSnapshot()); }
function restoreSnapshot(payload){ const snap = typeof payload==='string' ? JSON.parse(payload) : payload; state = reviveState(snap.state || snap); pending = snap.pending || {Y:null,K:null}; if(!Array.isArray(historyStack)) historyStack = []; if(!Array.isArray(redoStack)) redoStack = []; }

function loadState(){ 
    try { 
        const raw = localStorage.getItem(STORAGE_KEY); 
        if(!raw) return state = freshState(); 
        restoreSnapshot(JSON.parse(raw)); 
        if (!validateState(state)) state = freshState(); 
        if (!Array.isArray(state.granth)) state.granth = []; 
        if (!Array.isArray(state.drishti)) state.drishti = []; 
        historyStack = []; redoStack = []; 
    } catch(err) { state = freshState(); historyStack = []; redoStack = []; } 
}
let state = freshState(); loadState(); applyTheme(state.settings.theme || 'warhunt'); applyBackground(state.settings.vaultBg || 'bg-molten');

function saveState(){ try{ localStorage.setItem(STORAGE_KEY, persistedSnapshot()); } catch(err){} }
function currentKumbh(){ return state.granth.find(k => k.id === state.currentKumbhId) || null; }
function ensureKumbh(){ if(currentKumbh()) return currentKumbh(); const id=(state.granth.at(-1)?.id||0)+1; const k={id,rows:[]}; state.granth.push(k); state.currentKumbhId=id; return k; }
function secondLadderBet(step){ const start=roundUpToCoin(state.settings.max/4,state.settings.coin); if(step<=5) return start; if(step<=10) return Math.min(state.settings.max,start*2); if(step<=15) return Math.min(state.settings.max,start*3); return state.settings.max; }
function currentBetFor(info){ return info.ladder===2 ? secondLadderBet(info.step||1) : (state.ladder[Math.max(0,(info.step||1)-1)]?.bet || state.settings.max); }
function soldierStepNetProfit(info){ const bet=currentBetFor(info); return (bet*8) - (Number(info?.prevLoss) || 0); }

async function askCapDecision(side,num,info){ const stopLossPerNumber=Number(state.settings.stopLossPerNumber); if(state.settings.capRule!=='on' || info.ladder!==1 || !Number.isFinite(stopLossPerNumber)) return false; const stepNetProfit=soldierStepNetProfit(info); if(stepNetProfit>stopLossPerNumber) return false; return !!(await askModal({ title:'STUN LIMIT REACHED', text:`${romanMap[Number(num)]} drained ${stepNetProfit}. Limit is ${stopLossPerNumber}. Stun summon?`, okLabel:'Stun', cancelLabel:'Skip', okClass:'warn' })); }
async function askCapReturnDecision(side,num){ return !!(await askModal({ title:'REVIVE SUMMON', text:`${romanMap[Number(num)]} has recovered. Revive for battle?`, okLabel:'Revive', cancelLabel:'Keep Stunned', okClass:'warn' })); }
function nextExposureTotal(){ let total=0; ['Y','K'].forEach(side=>{ for(let n=1;n<=9;n++){ const info=state.numbers[side][n]; if(info.status==='A' || info.status==='B') total += currentBetFor(info); }}); return total; }
function previewNextAhutiFor(info){ if(!info || (info.status!=='A' && info.status!=='B')) return null; if(info.ladder===2){ return { stepLabel:`T${Math.max(1, Number(info.step)||1)}`, bet: secondLadderBet(Math.max(1, Number(info.step)||1)) }; } const step = Math.max(1, (Number(info.step)||0) + 1); return { stepLabel:`T${step}`, bet: state.ladder[Math.max(0, step-1)]?.bet || state.settings.max }; }
function nextPreviewExposureTotal(){ let total=0; ['Y','K'].forEach(side=>{ for(let n=1;n<=9;n++){ const preview=previewNextAhutiFor(state.numbers[side][n]); if(preview) total += preview.bet; }}); return total; }

function showToast(title,text,kind=''){ const layer=q('toastLayer'); if(!layer) return; const el=document.createElement('div'); el.className=`toast ${kind}`; el.innerHTML=`<div class="title">${title}</div><div>${text}</div>`; layer.appendChild(el); setTimeout(()=>el.remove(),3600); }
function glowKey(el){ if(!el) return; el.classList.remove('key-glow'); void el.offsetWidth; el.classList.add('key-glow'); setTimeout(()=>el.classList.remove('key-glow'),220); }

function statusCode(info){ 
    if(!info) return ''; 
    if(info.status === 'A' || info.status === 'B') return `T${Math.max(1, Number(info.step)||1)}`; 
    if(info.status === 'W') return (state?.settings?.attackMode==='thirdstrike'?'W2':state?.settings?.attackMode==='fourthstrike'?'W3':'W'); 
    return ''; 
}
function vijayDarshanaDisplay(info){ const bet=currentBetFor(info); return { bet, displayStep:Math.max(1,(Number(info.step)||1)-1), displayNet:(bet*8)-(Number(info.prevLoss)||0) }; }

// 🔥 RENDER BOARDS (EPIC MYTHOLOGY NUMBER STYLE) 🔥
function renderBoards(){
  ['Y','K'].forEach(side=>{
    const host=q(side==='Y'?'boardY':'boardK'); if(!host) return;
    const layout = [1, 2, 3, 4, 5, 6, 7, 8, 9, 'D1', 0, 'D2'];
    host.innerHTML = ''; // Re-render entirely since we removed Candy CSS
    
    layout.forEach(n => {
        const isDummy = typeof n === 'string';
        const isZero = n === 0;
        const info = (isDummy || isZero) ? null : (state?.numbers?.[side]?.[n] || freshNumber());
        const code = (isDummy || isZero) ? '' : statusCode(info); 
        const metaClass = (!isDummy && !isZero && info?.step) ? `step${Math.min(info.step, 6)}` : '';
        
        let classes = 'tile';
        if (info && info.status !== 'I') classes += ` state-${info.status}`;
        if (isDummy) classes += ' dummy';
        if (isZero) classes += ' zero';
        
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = classes.trim();
        btn.dataset.side = side; 
        btn.dataset.num = String(n);
        
        // Show numbers clearly. Dummy keys are empty/dots to match layout cleanly.
        let displayContent = (isDummy) ? '•' : n;

        if (!isDummy && !isZero && info && info.status === 'L') {
            displayContent = `👑<br><span style="font-size: 14px;">${info.lastNet || 0}</span>`;
            btn.style.background = 'linear-gradient(145deg, #aa5500, #552200)';
            btn.style.color = '#fff';
        } else if (!isDummy && !isZero && info && info.status === 'C') {
            displayContent = '⛓️';
            btn.style.background = 'linear-gradient(145deg, #550000, #220000)';
        }
        
        btn.innerHTML = `
            ${displayContent}
            <div class="meta ${metaClass}">${code}</div>
        `;
        host.appendChild(btn);
    });
  });
}

function renderVyuha(){ ['Y','K'].forEach(side=>{ const host=q(side==='Y'?'vyuhaY':'vyuhaK'); if(!host) return; host.innerHTML=''; for(let n=1;n<=9;n++){ const info=state.numbers[side][n]; const d=document.createElement('div'); d.className='state-cell'; d.innerHTML=`<div class="num" style="font-size:24px; color:var(--gold); text-shadow:0 2px 4px #000;">[ ${romanMap[Number(n)]} ]</div><div class="meta">${statusCode(info)||'Idle'}</div>`; host.appendChild(d);} }); }
function formatNextAhuti(side){ const groups=new Map(); for(let n=1;n<=9;n++){ const preview=previewNextAhutiFor(state.numbers[side][n]); if(preview){ if(!groups.has(preview.bet)) groups.set(preview.bet,[]); groups.get(preview.bet).push(`[ ${romanMap[Number(n)]} ] (Lv${preview.stepLabel.replace('T', '')})`); } } const parts=[...groups.entries()].sort((a,b)=>b[0]-a[0]).map(([bet,arr])=>`+ ${bet} ➔ ${arr.join(' & ')}`); return `${side === 'Y' ? 'YAKSHA' : 'KINNARA'}: ${parts.join(' | ') || 'Idle'}`; }

function renderSangram(){ 
    if(q('bankValue')) q('bankValue').textContent=`Stash: 💎 ${Number(state.liveBankroll).toLocaleString('en-IN')}`; 
    if(q('chakraValue')) q('chakraValue').textContent=`Wave : ${state.currentChakra}`; 
    if(q('nextY')) q('nextY').textContent=formatNextAhuti('Y'); 
    if(q('nextK')) q('nextK').textContent=formatNextAhuti('K'); 
    if(q('nextT')) q('nextT').textContent=`Total Queue: + ${nextPreviewExposureTotal()}`; 
    
    const lastRow = currentKumbh()?.rows?.at(-1); 
    let displayY = '-'; 
    let displayK = '-';
    
    if (lastRow) {
        if (lastRow.y !== '-' && lastRow.y !== '' && lastRow.y != null) displayY = lastRow.y;
        if (lastRow.k !== '-' && lastRow.k !== '' && lastRow.k != null) displayK = lastRow.k;
    }
    
    if(q('lastResultValue')) {
        q('lastResultValue').innerHTML = `<span style="color: #ffaa00;">${displayY}</span> <span style="font-size: 14px; color: #555;">VS</span> <span style="color: #42b7c8;">${displayK}</span>`; 
    }
}

function formatRoundInfoEntries(entries){ return entries.length ? entries.join(', ') : '-'; }

function sideStatsSummary(counts){ 
    const entries = Object.entries(counts).filter(([n])=>n!=='0'); 
    return { 
        hot: entries.filter(([,v])=>v>=4).map(([n,v])=> `${n}(${v})`), 
        cool: entries.filter(([,v])=>v<4).map(([n,v])=> `${n}(${v})`) 
    }; 
}

function kumbhInsights(rows){
  const sortedRows = [...(rows||[])].sort((a,b)=>(Number(a.chakra)||0)-(Number(b.chakra)||0));
  const rowMeta = new Map(); 
  const counts = { Y: Object.fromEntries(Array.from({length:10},(_,i)=>[String(i),0])), K: Object.fromEntries(Array.from({length:10},(_,i)=>[String(i),0])) };
  const lifecycle = { Y: Object.fromEntries(Array.from({length:10},(_,i)=>[String(i), {selectedRound:null, hitRound:null}])), K: Object.fromEntries(Array.from({length:10},(_,i)=>[String(i), {selectedRound:null, hitRound:null}])) };
  const details = { Y: [], K: [] };
  
  function processSide(side, value, chakra, meta){
    if(value === '-' || value === '' || value == null) return;
    const num = Number(value); if(!Number.isFinite(num) || num < 1 || num > 9) return;
    counts[side][String(num)] += 1;
    const life = lifecycle[side][String(num)];
    if(life.selectedRound === null){ life.selectedRound = chakra; meta[`${side==='Y'?'y':'k'}SelCode`] = `T1`; } 
    else if(life.hitRound === null){ const travel = chakra - life.selectedRound; life.hitRound = chakra; meta[`${side==='Y'?'y':'k'}HitCode`] = `T${travel}`; details[side].push({ side, number: num, selectedRound: life.selectedRound, hitRound: chakra, travelSteps: travel, selectCode: `T1`, hitCode: `T${travel}` }); }
  }
  for(const row of sortedRows){
    const chakra = Number(row.chakra)||0;
    const meta = { ySelCode:'-', yHitCode:'-', kSelCode:'-', kHitCode:'-', capped:Array.isArray(row.cap) ? row.cap : [], returned:Array.isArray(row.ret) ? row.ret : [] };
    processSide('Y', row.y, chakra, meta); processSide('K', row.k, chakra, meta); rowMeta.set(chakra, meta);
  }
  
  const yStats = Object.entries(counts.Y).filter(([n])=>n!=='0').map(([n,c])=>`<span class="pill">[${romanMap[Number(n)]}]: ${c}</span>`);
  const kStats = Object.entries(counts.K).filter(([n])=>n!=='0').map(([n,c])=>`<span class="pill">[${romanMap[Number(n)]}]: ${c}</span>`);
  
  return { 
      rowMeta, counts, details, 
      yRptHTML: yStats.join(' '), kRptHTML: kStats.join(' '),
      yStats: sideStatsSummary(counts.Y), kStats: sideStatsSummary(counts.K) 
  };
}

function renderGranth(){
  const host=q('granthList'); if(!host) return; host.innerHTML='';
  const sel=q('deleteKumbhSelect');
  if(sel){ sel.innerHTML='<option value=>Select Raid</option>'; if(Array.isArray(state.granth)) state.granth.forEach(k=>{ const op=document.createElement('option'); op.value=String(k.id); op.textContent=`#${String(k.id).padStart(2,'0')} Raid Log`; sel.appendChild(op); }); }
  if(!Array.isArray(state.granth) || !state.granth.length){ host.innerHTML='<div class="kumbh">No Raid history yet.</div>'; return; }
  const items=[...state.granth].reverse();
  items.forEach(k=>{
    const wrap=document.createElement('div'); wrap.className='card'; const insight=kumbhInsights(k.rows||[]);
    const rows=[...(k.rows||[])].reverse().map(r=>{
      const meta=insight.rowMeta.get(Number(r.chakra)) || { ySelCode:'-', yHitCode:'-', kSelCode:'-', kHitCode:'-', capped:[], returned:[] };
      return `<tr><td>${r.chakra}</td><td style="font-weight:900; color:var(--gold);">${r.y}</td><td style="font-weight:900; color:var(--gold);">${r.k}</td><td>${meta.ySelCode}</td><td>${meta.yHitCode}</td><td>${meta.kSelCode}</td><td>${meta.kHitCode}</td><td>${formatRoundInfoEntries(meta.capped)}</td><td>${formatRoundInfoEntries(meta.returned)}</td><td>${formatRoundInfoEntries(Array.isArray(r.np)?r.np:(r.np?[r.np]:[]))}</td><td>${r.axyapatra ?? '-'}</td></tr>`;
    }).join('');
    const travelRows = [...insight.details.Y, ...insight.details.K].sort((a,b)=>a.hitRound-b.hitRound).map(d=>`<tr><td>${d.side}</td><td><span style="font-size:16px; color:var(--gold); font-weight:bold;">${d.number}</span></td><td>${d.selectedRound}</td><td>${d.hitRound}</td><td>${d.travelSteps}</td></tr>`).join('') || '<tr><td colspan="5">No completed travel yet.</td></tr>';
    wrap.innerHTML=`<div class="label">#${String(k.id).padStart(2,'0')} Raid Log</div><div class="table-wrap"><table><thead><tr><th>Wave</th><th>Y</th><th>K</th><th>YSel</th><th>YHit</th><th>KSel</th><th>KHit</th><th>Stun</th><th>Revive</th><th>Net XP</th><th>Stash</th></tr></thead><tbody>${rows}</tbody></table></div><div class="granth-summary"><div class="summary-row"><span class="summary-label">Y Freq:</span>${insight.yRptHTML}</div><div class="summary-row"><span class="summary-label">K Freq:</span>${insight.kRptHTML}</div></div><div class="table-wrap"><table><thead><tr><th>Faction</th><th>Summon</th><th>ActiveWave</th><th>LootWave</th><th>Tiers</th></tr></thead><tbody>${travelRows}</tbody></table></div>`;
    host.appendChild(wrap);
  });
}

function renderDrishti(){ if(q('sumChakras')) q('sumChakras').textContent=Math.max(0,state.currentChakra); if(q('sumAhuti')) q('sumAhuti').textContent=state.summary.totalAhuti; if(q('sumProfit')) q('sumProfit').textContent=state.liveBankroll-state.settings.bankroll; if(q('sumExposure')) q('sumExposure').textContent=state.summary.maxExposure; const dt=q('drishtiTable'); if(!dt) return; const tbody=dt.querySelector('tbody'); if(!tbody) return; tbody.innerHTML=''; if(Array.isArray(state.drishti)) [...state.drishti].reverse().forEach(r=>{ const tr=document.createElement('tr'); tr.innerHTML=`<td>${r.side}</td><td><span style="font-size:16px; color:var(--gold); font-weight:bold;">${r.number}</span></td><td>${r.activationChakra}</td><td>${r.winChakra}</td><td>${r.steps}</td><td>${r.prevLoss}</td><td>${r.winBet}</td><td>${r.net}</td><td>${r.status}</td>`; tbody.appendChild(tr); }); }
function renderSopana(){ const lt=q('ladderTable'); if(!lt) return; const tbody=lt.querySelector('tbody'); if(!tbody) return; tbody.innerHTML=''; state.ladder.forEach((row,idx)=>{ const tr=document.createElement('tr'); tr.innerHTML=`<td>${row.step}</td><td><input type="number" data-ladder-index="${idx}" inputmode="numeric" enterkeyhint="next" value="${row.bet}"></td><td>${row.winReturn}</td><td>${row.netProfit}</td><td>${row.ifLoseTotal}</td>`; tbody.appendChild(tr); }); const secondTable=q('secondLadderTable'); if(secondTable){ const tbody2=secondTable.querySelector('tbody'); if(tbody2) { tbody2.innerHTML=''; let prevLoss=0; for(let i=1;i<=Math.min(state.settings.maxSteps,15);i++){ const bet=secondLadderBet(i); const winReturn=bet*9; prevLoss += bet; const tr=document.createElement('tr'); tr.innerHTML=`<td>T${i}</td><td><input type="number" data-second-ladder-index="${i-1}" inputmode="numeric" enterkeyhint="next" value="${bet}"></td><td>${winReturn}</td><td>${winReturn - prevLoss}</td><td>${-prevLoss}</td>`; tbody2.appendChild(tr); } } } }
function renderYantra(){ const s=state.settings; if(q('setBankroll')) q('setBankroll').value=s.bankroll; if(q('setTargetDollar')) q('setTargetDollar').value=s.targetDollar; if(q('setTargetPercent')) q('setTargetPercent').value=s.targetPercent; if(q('setStopLoss')) q('setStopLoss').value=s.stopLoss; if(q('setMin')) q('setMin').value=s.min; if(q('setMax')) q('setMax').value=s.max; if(q('setCoin')) q('setCoin').value=s.coin; if(q('setTargetNum')) q('setTargetNum').value=s.targetNum; if(q('setDoubleLadder')) q('setDoubleLadder').value=s.doubleLadder||'on'; if(q('setKeypadMode')) q('setKeypadMode').value=s.keypadMode; if(q('setMaxSteps')) q('setMaxSteps').value=s.maxSteps; if(q('setReserve')) q('setReserve').value=s.reserve; if(q('setCapRule')) q('setCapRule').value=s.capRule; if(q('setCapReturn')) q('setCapReturn').value=s.capReturn || 'on'; if(q('setAttackMode')) q('setAttackMode').value=s.attackMode || 'classic'; if(q('setTheme')) q('setTheme').value=s.theme || 'warhunt'; if(q('setVaultBg')) q('setVaultBg').value=s.vaultBg || 'bg-molten'; if(q('setStopLossPerNumber')) q('setStopLossPerNumber').value=s.stopLossPerNumber ?? -100; }
function renderMedha(){ const active=[]; const cap=[]; ['Y','K'].forEach(side=>{ for(let n=1;n<=9;n++){ const info=state.numbers[side][n]; if(info.status==='A'||info.status==='B') active.push(`${side} ${n} T${info.step}`); if(info.status==='C') cap.push(`${side} ${n}`);} }); if(q('medhaPanel')) q('medhaPanel').innerHTML=`<div class="medha-item"><div class="label">Active Summons</div><div style="font-size:16px">${active.join(' | ') || 'None'}</div></div><div class="medha-item"><div class="label">Stunned Summons</div><div style="font-size:16px">${cap.join(' | ') || 'None'}</div></div>`; }
function renderActiveTab(){ document.querySelectorAll('.screen').forEach(s=>s.classList.toggle('active',s.id===`screen-${state.activeTab}`)); document.querySelectorAll('.nav').forEach(b=>b.classList.toggle('active',b.dataset.target===state.activeTab)); if(q('screenTitle')) q('screenTitle').textContent=titles[state.activeTab]||titles.sangram; }
function renderAll(){ applyTheme(state.settings.theme || 'warhunt'); applyBackground(state.settings.vaultBg || 'bg-molten'); renderActiveTab(); renderBoards(); renderVyuha(); renderSangram(); renderGranth(); renderDrishti(); renderSopana(); renderYantra(); renderMedha(); saveState(); }

function startPrayoga(){ if(state.currentChakra===0 && !(currentKumbh()?.rows?.length)){ state.liveBankroll = state.settings.bankroll; } else if(state.currentChakra!==0 || currentKumbh()?.rows?.length){ state.currentKumbhId=null; state.liveBankroll = state.settings.bankroll; state.currentChakra=0; state.numbers={Y:createSide(),K:createSide()}; state.drishti=[]; state.summary={totalAhuti:0,maxExposure:0}; pending={Y:null,K:null}; } const kumbh=ensureKumbh(); state.activeTab='sangram'; renderAll(); showToast('RAID STARTED', `Entering Zone #${String(kumbh.id).padStart(2,'0')}`); }
async function clearCurrentSession(){ if(!(await askClearKumbh())) return; state.liveBankroll=state.settings.bankroll; state.currentChakra=0; state.numbers={Y:createSide(),K:createSide()}; state.drishti=[]; state.summary={totalAhuti:0,maxExposure:0}; pending={Y:null,K:null}; state.currentKumbhId=null; const kumbh=ensureKumbh(); state.activeTab='sangram'; renderAll(); showToast('RAID ABANDONED',`Reset to Zone #${String(kumbh.id).padStart(2,'0')}`); }
function recordSnapshot(){ historyStack.push(historySnapshot()); if(historyStack.length>20) historyStack.shift(); redoStack = []; }
function undoLast(){ const prev=historyStack.pop(); if(!prev) return; redoStack.push(historySnapshot()); restoreSnapshot(prev); renderAll(); showToast('TIME REVERSED','Wave reverted'); }
function redoLast(){ const next=redoStack.pop(); if(!next) return; historyStack.push(historySnapshot()); restoreSnapshot(next); renderAll(); showToast('TIMELINE RESTORED','Wave restored'); }
function pushDrishti(rec){ if(!Array.isArray(state.drishti)) state.drishti = []; state.drishti.push(rec); }

// 🔥 SILENT CALCULATORS - RESPECTS CAP RETURN SETTING 🔥
function resolveNumberSilent(side,num,rowEvents,shouldReturnFromCap=false){
  const info=state.numbers[side][num];
  if(!info || info.status==='L') return;
  if(info.status==='C'){ 
      if(state.settings.capReturn === 'off' || !shouldReturnFromCap) return; 
      info.status='B'; info.ladder=2; info.step=1; info.pendingSecond=false; 
      if(rowEvents) rowEvents.ret.push(`${side}${num}`); 
      return; 
  }
  const mode = getAttackMode(); const threshold = attackThresholdForMode(mode);
  if(info.status==='I'){ if(threshold===1){ activateTrackedNumber(info); } else { info.status='W'; info.watchCount = 1; info.activeAt = null; info.prevLoss = 0; info.step = 0; info.ladder = 1; } return; }
  if(info.status==='W'){ info.watchCount = Number(info.watchCount||0) + 1; if(info.watchCount >= threshold){ activateTrackedNumber(info); } return; }
  const bet=currentBetFor(info); const totalReturn=bet*9; const net=(bet*8)-info.prevLoss;
  state.liveBankroll += totalReturn; info.winningBet=bet; info.lastNet=net; pushDrishti({ side, number:num, activationChakra:info.activeAt ?? state.currentChakra, winChakra:state.currentChakra, steps:info.step, prevLoss:info.prevLoss, winBet:bet, net, status:'LOOTED' });
  if(rowEvents) rowEvents.np.push(`${side}${num} ${net >= 0 ? '+' : ''}${net}`); info.status='L';
}

function advanceAfterLossSilent(side,rowEvents,winningNum=null){
  for(let n=1;n<=9;n++){
    if(winningNum!==null && Number(winningNum)===n) continue;
    const info=state.numbers[side][n]; if(info.status!=='A' && info.status!=='B') continue;
    const bet=currentBetFor(info); info.prevLoss += bet; info.step += 1;
    if(info.ladder===1){
      if(shouldCapNowSilent(side,n,info)){
        const cappedAt = info.step>state.settings.maxSteps ? state.settings.maxSteps : info.step;
        info.status='C'; pushDrishti({ side, number:n, activationChakra:info.activeAt ?? '-', winChakra:'-', steps:cappedAt, prevLoss:info.prevLoss, winBet:'-', net:soldierStepNetProfit(info), status:'STUNNED' }); if(rowEvents){ rowEvents.cap.push(`${side}${n}`); rowEvents.np.push(`${side}${n} ${soldierStepNetProfit(info) >= 0 ? '+' : ''}${soldierStepNetProfit(info)}`); }
      } else { info.status='A'; }
    } else { if(info.step>15) info.step=15; info.status='B'; }
  }
}

async function resolveNumber(side,num,notes,rowEvents){ 
  const info=state.numbers[side][num]; 
  if(info.status==='L'){ return; }
  if(info.status==='C'){ 
      if(state.settings.capReturn === 'off') {
          notes.push({title:'REVIVE DISABLED',text:`${num} cannot return from stun`,kind:'warn'});
          return;
      }
      const shouldReturn = await askCapReturnDecision(side,num); 
      if(!shouldReturn) return; 
      info.status='B'; info.ladder=2; info.step=1; info.pendingSecond=false; 
      if(rowEvents) rowEvents.ret.push(`${side}${num}`); 
      notes.push({title:'SUMMON REVIVED',text:`${num} back in battle`,kind:'warn'}); 
      return; 
  }
  const mode = getAttackMode(); const threshold = attackThresholdForMode(mode);
  if(info.status==='I'){ if(threshold===1){ activateTrackedNumber(info); } else { info.status='W'; info.watchCount = 1; info.activeAt = null; info.prevLoss = 0; info.step = 0; info.ladder = 1; } return; }
  if(info.status==='W'){ info.watchCount = Number(info.watchCount||0) + 1; if(info.watchCount >= threshold){ activateTrackedNumber(info); } return; }
  const bet=currentBetFor(info); const totalReturn=bet*9; const net=(bet*8)-info.prevLoss;
  state.liveBankroll += totalReturn; info.winningBet=bet; info.lastNet=net; 
  pushDrishti({ side, number:num, activationChakra:info.activeAt ?? state.currentChakra, winChakra:state.currentChakra, steps:info.step, prevLoss:info.prevLoss, winBet:bet, net, status:'LOOTED' });
  if(rowEvents) rowEvents.np.push(`${side}${num} ${net >= 0 ? '+' : ''}${net}`);
  
  const vd=vijayDarshanaDisplay(info);
  info.status='L'; 
  
  playSound('win'); triggerStagePopup(vd.displayNet); 
  notes.push({title:'LOOT SECURED', text:`${num} T${vd.displayStep} Magic : +${vd.displayNet} XP`}); 
}

async function advanceAfterLoss(side,notes,rowEvents,winningNum=null){ 
  for(let n=1;n<=9;n++){ 
    if(winningNum!==null && Number(winningNum)===n) continue; 
    const info=state.numbers[side][n]; if(info.status!=='A' && info.status!=='B') continue; 
    const bet=currentBetFor(info); info.prevLoss += bet; info.step += 1; 
    if(info.ladder===1){ 
      if(await askCapDecision(side,n,info)){ 
        playSound('stun'); info.status='C'; pushDrishti({ side, number:n, activationChakra:info.activeAt ?? '-', winChakra:'-', steps:info.step, prevLoss:info.prevLoss, winBet:'-', net:soldierStepNetProfit(info), status:'STUNNED' }); 
        if(rowEvents){ rowEvents.cap.push(`${side}${n}`); rowEvents.np.push(`${side}${n} ${soldierStepNetProfit(info) >= 0 ? '+' : ''}${soldierStepNetProfit(info)}`); } 
        notes.push({title:'STUNNED', text:`${n} is stunned`, kind:'warn'}); 
      } else if(info.step>state.settings.maxSteps){ 
        playSound('stun'); info.status='C'; pushDrishti({ side, number:n, activationChakra:info.activeAt ?? '-', winChakra:'-', steps:state.settings.maxSteps, prevLoss:info.prevLoss, winBet:'-', net:soldierStepNetProfit(info), status:'STUNNED' }); 
        if(rowEvents){ rowEvents.cap.push(`${side}${n}`); rowEvents.np.push(`${side}${n} ${soldierStepNetProfit(info) >= 0 ? '+' : ''}${soldierStepNetProfit(info)}`); } 
        notes.push({title:'STUNNED', text:`${n} is stunned`, kind:'warn'}); 
      } else { info.status='A'; }
    } else { if(info.step>15) info.step=15; info.status='B'; }
  } 
}

async function processCombined(){ if(pending.Y===null || pending.K===null) return; recordSnapshot(); state.currentChakra += 1; ensureKumbh(); const y=pending.Y, k=pending.K; pending={Y:null,K:null}; let exposure=nextExposureTotal(); state.liveBankroll -= exposure; state.summary.totalAhuti += exposure; state.summary.maxExposure = Math.max(state.summary.maxExposure, exposure); const notes=[]; const rowEvents={cap:[],ret:[],np:[]}; if(y===0) await advanceAfterLoss('Y',notes,rowEvents); else { await advanceAfterLoss('Y',[],rowEvents,y); await resolveNumber('Y',y,notes,rowEvents); } if(k===0) await advanceAfterLoss('K',notes,rowEvents); else { await advanceAfterLoss('K',[],rowEvents,k); await resolveNumber('K',k,notes,rowEvents); }
  currentKumbh()?.rows.push({ chakra:state.currentChakra, y, k, cap:rowEvents.cap, ret:rowEvents.ret, np:rowEvents.np, ahuti:exposure, axyapatra:state.liveBankroll });
  if(state.liveBankroll <= state.settings.bankroll - state.settings.stopLoss) notes.push({title:'STASH WARNING',text:'Diamond Stash approaching critical',kind:'warn'});
  if(state.liveBankroll < state.settings.reserve) notes.push({title:'STASH WARNING',text:'Diamond Stash below safe level',kind:'warn'});
  renderAll(); notes.forEach(n=>showToast(n.title,n.text,n.kind||'')); }
async function processIndividual(side,num){ recordSnapshot(); state.currentChakra += 1; ensureKumbh(); let exposure=0; for(let n=1;n<=9;n++){ const info=state.numbers[side][n]; if(info.status==='A'||info.status==='B') exposure += currentBetFor(info); }
  state.liveBankroll -= exposure; state.summary.totalAhuti += exposure; state.summary.maxExposure = Math.max(state.summary.maxExposure, exposure); const notes=[]; const rowEvents={cap:[],ret:[],np:[]}; if(num===0) await advanceAfterLoss(side,notes,rowEvents); else { await advanceAfterLoss(side,[],rowEvents,num); await resolveNumber(side,num,notes,rowEvents); }
  currentKumbh()?.rows.push({ chakra:state.currentChakra, y: side==='Y'?num:'-', k: side==='K'?num:'-', cap:rowEvents.cap, ret:rowEvents.ret, np:rowEvents.np, ahuti:exposure, axyapatra:state.liveBankroll });
  renderAll(); notes.forEach(n=>showToast(n.title,n.text,n.kind||'')); }

async function handleTap(side,num,el){
  initAudio(); 
  if(keypadBusy) return;

  if (num === 'D1' || num === 'D2') { 
      glowKey(el);
      return; 
  }
  
  const isLockedTap = num!==0 && state?.numbers?.[side]?.[num]?.status==='L';
  keypadBusy = true;
  try{
    glowKey(el);
    if(document.activeElement instanceof HTMLElement && document.activeElement !== el) document.activeElement.blur();
    if(state.settings.keypadMode==='combined'){
      pending[side]=num; renderSangram(); if(pending.Y!==null && pending.K!==null) await processCombined();
    } else { await processIndividual(side,num); renderSangram(); }
  } catch(err){ console.error('Keypad entry failed', err); showToast('ENTRY WARNING', (err && err.message) ? err.message : 'Entry kept unchanged', 'warn');
  } finally { keypadBusy = false; }
}

function switchTab(target){ if(!target) return; state.activeTab=target; renderActiveTab(); saveState(); }
function setupTabs(){ document.querySelectorAll('.nav').forEach(btn=>{ btn.onclick = (e)=>{ e.preventDefault(); switchTab(btn.dataset.target); }; }); }
function setupBoards(){
  ['boardY','boardK'].forEach(id=>{
    const host=q(id); if(!host) return;
    host.onclick = e=>{
      const btn=e.target.closest('button.tile'); if(!(btn instanceof HTMLButtonElement) || !host.contains(btn)) return;
      const side=btn.dataset.side; const rawNum = btn.dataset.num;
      if (rawNum === 'D1' || rawNum === 'D2') { handleTap(side, rawNum, btn); return; }
      const num=Number(rawNum);
      if((side!=='Y' && side!=='K') || !Number.isFinite(num)) return;
      handleTap(side,num,btn);
    };
  });
}

function recalcTargetLink(source){ const bankroll=Number(q('setBankroll').value)||defaultSettings.bankroll; if(source==='dollar') if(q('setTargetPercent')) q('setTargetPercent').value=((Number(q('setTargetDollar').value||0)/bankroll)*100).toFixed(2); if(source==='percent') if(q('setTargetDollar')) q('setTargetDollar').value=Math.round((bankroll*Number(q('setTargetPercent').value||0))/100); }
function normalizeLadderBet(value){ return Math.max(state.settings.coin, Number(value)||0); }
function syncFirstLadderFromInputs(){
  let cumulative=0;
  document.querySelectorAll('[data-ladder-index]').forEach(inp=>{
    const i=Number(inp.dataset.ladderIndex); const bet=normalizeLadderBet(inp.value); cumulative += bet;
    state.ladder[i]={ step:`T${i+1}`, bet, winReturn: bet*9, netProfit:(bet*9)-cumulative, ifLoseTotal:-cumulative };
  });
}
function refreshFirstLadderPreview(){
  let cumulative=0;
  document.querySelectorAll('[data-ladder-index]').forEach(inp=>{
    const bet=normalizeLadderBet(inp.value); cumulative += bet; const row=inp.closest('tr'); if(!row) return;
    const cells=row.querySelectorAll('td');
    if(cells[2]) cells[2].textContent=String(bet*9); if(cells[3]) cells[3].textContent=String((bet*9)-cumulative); if(cells[4]) cells[4].textContent=String(-cumulative);
  });
}

function replayKumbhRowsWithCurrentSettings(kumbh){
  state.liveBankroll = state.settings.bankroll; state.currentChakra = 0; state.numbers = { Y: createSide(), K: createSide() }; state.drishti = []; state.summary = { totalAhuti: 0, maxExposure: 0 };
  const rows = [...(kumbh?.rows || [])].sort((a,b)=>Number(a.chakra)-Number(b.chakra));
  
  for(const row of rows){
    const validY = (row.y !== '-' && row.y !== '' && row.y != null && !isNaN(Number(row.y)));
    const validK = (row.k !== '-' && row.k !== '' && row.k != null && !isNaN(Number(row.k)));
    const yVal = validY ? Number(row.y) : null;
    const kVal = validK ? Number(row.k) : null;

    state.currentChakra += 1;
    let exposure = 0;

    if(state.settings.keypadMode === 'combined' || validY) {
        for(let n=1;n<=9;n++){ const info = state.numbers.Y[n]; if(info.status==='A'||info.status==='B') exposure += currentBetFor(info); }
    }
    if(state.settings.keypadMode === 'combined' || validK) {
        for(let n=1;n<=9;n++){ const info = state.numbers.K[n]; if(info.status==='A'||info.status==='B') exposure += currentBetFor(info); }
    }

    state.liveBankroll -= exposure;
    state.summary.totalAhuti += exposure;
    state.summary.maxExposure = Math.max(state.summary.maxExposure, exposure);

    const rowEvents = {cap:[], ret:[], np:[]};
    const priorRet = Array.isArray(row.ret) ? row.ret.slice() : (row.ret ? [row.ret] : []);

    if(state.settings.keypadMode === 'combined' || validY) {
        if(yVal === 0) advanceAfterLossSilent('Y', rowEvents);
        else if(yVal !== null) { advanceAfterLossSilent('Y', rowEvents, yVal); resolveNumberSilent('Y', yVal, rowEvents, priorRet.includes(`Y${yVal}`)); }
    }

    if(state.settings.keypadMode === 'combined' || validK) {
        if(kVal === 0) advanceAfterLossSilent('K', rowEvents);
        else if(kVal !== null) { advanceAfterLossSilent('K', rowEvents, kVal); resolveNumberSilent('K', kVal, rowEvents, priorRet.includes(`K${kVal}`)); }
    }

    row.chakra = state.currentChakra; row.cap = rowEvents.cap; row.ret = rowEvents.ret; row.np = rowEvents.np; row.ahuti = exposure; row.axyapatra = state.liveBankroll;
  }
}

function replayAllKumbhsWithCurrentSettings(){
  if (!Array.isArray(state.granth)) state.granth = [];
  const preserved = { granth: clone(state.granth), currentKumbhId: state.currentKumbhId, activeTab: state.activeTab }; let activeSnapshot = null;
  for(const kumbh of preserved.granth){ 
      replayKumbhRowsWithCurrentSettings(kumbh); 
      if(kumbh.id === preserved.currentKumbhId){ activeSnapshot = { liveBankroll: state.liveBankroll, currentChakra: state.currentChakra, numbers: clone(state.numbers), drishti: clone(state.drishti), summary: clone(state.summary) }; } 
  }
  state.granth = preserved.granth; state.activeTab = preserved.activeTab; state.currentKumbhId = preserved.currentKumbhId;
  if(activeSnapshot){ state.liveBankroll = activeSnapshot.liveBankroll; state.currentChakra = activeSnapshot.currentChakra; state.numbers = activeSnapshot.numbers || { Y: createSide(), K: createSide() }; state.drishti = activeSnapshot.drishti || []; state.summary = activeSnapshot.summary || { totalAhuti: 0, maxExposure: 0 }; } 
  else { state.liveBankroll = state.settings.bankroll; state.currentChakra = 0; state.numbers = { Y: createSide(), K: createSide() }; state.drishti = []; state.summary = { totalAhuti: 0, maxExposure: 0 }; }
}

function refreshLinkedLadderCalculations(){ syncFirstLadderFromInputs(); refreshFirstLadderPreview(); if (!Array.isArray(state.granth)) state.granth = []; const hasRecordedRows = state.granth.some(k => Array.isArray(k.rows) && k.rows.length); if(hasRecordedRows) replayAllKumbhsWithCurrentSettings(); renderVyuha(); renderSangram(); renderGranth(); renderDrishti(); renderMedha(); saveState(); }

function shouldCapNowSilent(side,num,info){
  const stopLossPerNumber = Number(state.settings.stopLossPerNumber);
  if(state.settings.capRule==='on' && info.ladder===1 && Number.isFinite(stopLossPerNumber)){ if(soldierStepNetProfit(info) <= stopLossPerNumber) return true; }
  return info.ladder===1 && info.step>state.settings.maxSteps;
}

function escapeCsvValue(val) {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) return '"' + str.replace(/"/g, '""') + '"';
    return str;
}
function xmlEscape(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
function sheetNameSafe(name, fallback) {
    if (!name) return fallback;
    return String(name).replace(/[\\/?*[\]]/g, '').substring(0, 31) || fallback;
}
function xlsxCellRef(cIdx, rIdx) {
    let colStr = ''; let c = cIdx;
    while (c >= 0) { colStr = String.fromCharCode(65 + (c % 26)) + colStr; c = Math.floor(c / 26) - 1; }
    return `${colStr}${rIdx + 1}`;
}
function ladderCsvContent() {
    let csv = 'Ladder,Step,Bet\n';
    state.ladder.forEach((r, i) => { csv += `L1,${r.step},${r.bet}\n`; });
    for (let i = 1; i <= Math.min(state.settings.maxSteps, 15); i++) { csv += `L2,T${i},${secondLadderBet(i)}\n`; }
    return csv;
}

function parseCsvToGrid(text) {
    let p = '', row = [''], ret = [row], i = 0, r = 0, s = !0, l;
    for (let c of text) {
        l = c;
        if ('"' === l) {
            if (s && l === p) row[i] += l;
            s = !s;
        } else if (',' === l && s) l = row[++i] = '';
        else if ('\n' === l && s) {
            if ('\r' === p) row[i] = row[i].slice(0, -1);
            row = ret[++r] = [l = '']; i = 0;
        } else row[i] += l;
        p = l;
    }
    return ret.filter(r => r.length > 1 || r[0] !== '');
}

function safeBind(id, fn, event = 'click') {
    try {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener(event, async function(e) {
                try { await fn(e); } 
                catch (err) { console.error(`Error executing action on ${id}:`, err); showToast('ERROR', 'Action failed', 'warn'); }
            });
        }
    } catch (err) { console.error(`Failed to attach event to ${id}:`, err); }
}

function readYantraSettings(){
  const current = clone(state.settings); const bankrollRaw = Number(q('setBankroll')?.value); current.bankroll = Number.isFinite(bankrollRaw) && bankrollRaw >= 0 ? bankrollRaw : defaultSettings.bankroll;
  current.targetDollar = Number(q('setTargetDollar')?.value)||500; current.targetPercent = Number(q('setTargetPercent')?.value)||1.67; current.stopLoss = Number(q('setStopLoss')?.value)||30000; current.min = Number(q('setMin')?.value)||200; current.max = Number(q('setMax')?.value)||3000; current.coin = Number(q('setCoin')?.value)||100; current.targetNum = Number(q('setTargetNum')?.value)||1000; current.doubleLadder = q('setDoubleLadder')?.value || 'on'; current.keypadMode = q('setKeypadMode')?.value || 'combined'; current.maxSteps = Number(q('setMaxSteps')?.value)||30; current.reserve = Number(q('setReserve')?.value)||20000; current.capRule = q('setCapRule')?.value || 'on'; current.capReturn = q('setCapReturn')?.value || 'on';
  if(q('setAttackMode')) current.attackMode = q('setAttackMode').value || 'classic'; current.theme = q('setTheme')?.value || 'warhunt'; current.vaultBg = q('setVaultBg')?.value || 'bg-molten'; const stopLossPerNumberValue = Number(q('setStopLossPerNumber')?.value); current.stopLossPerNumber = Number.isFinite(stopLossPerNumberValue) ? stopLossPerNumberValue : -100; return current;
}

async function applyYantraSettings() { 
    if (!(await askApplyYantra())) return; 
    try {
        state.settings = readYantraSettings(); 
        applyTheme(state.settings.theme || 'warhunt'); 
        applyBackground(state.settings.vaultBg || 'bg-molten'); 
        state.ladder = buildLadder(state.settings); 
        
        if (!Array.isArray(state.granth)) state.granth = [];
        if (!Array.isArray(state.drishti)) state.drishti = [];

        const hasRecordedRows = state.granth.some(k => Array.isArray(k.rows) && k.rows.length); 
        
        if (hasRecordedRows) { replayAllKumbhsWithCurrentSettings(); } 
        else { state.liveBankroll = state.settings.bankroll; } 
        renderAll(); 
        showToast('YANTRA APPLIED', 'Settings updated'); 
    } catch (error) {
        console.error('Yantra settings error:', error);
        showToast('ERROR', error.message || 'Could not apply settings', 'warn');
    }
}

function exportPayload(){ 
    return { app:'Kubera_V5Pro Final locked', version:'Kubera_V5Pro Final locked', exportedAt:new Date().toISOString(), state, pending, historyStack, redoStack }; 
}

function granthCsvContent(){
  const header='KumbhId,Chakra,Y,YSel,YHit,K,KSel,KHit,Cap,Ret,NP,Ah,Ax,Side,Number,SelectedRound,HitRound,TravelSteps,SelectCode,HitCode\n'; const rows=[];
  if (!Array.isArray(state.granth)) state.granth = [];
  state.granth.forEach(k=>{
    const insight=kumbhInsights(k.rows||[]); const detailMap=new Map();
    [...insight.details.Y, ...insight.details.K].forEach(d=>{ const key=`${d.side}-${d.hitRound}`; if(!detailMap.has(key)) detailMap.set(key, []); detailMap.get(key).push(d); });
    (k.rows||[]).forEach(r=>{
      const chakra=Number(r.chakra)||0; const meta=insight.rowMeta.get(chakra) || { ySelCode:'-', yHitCode:'-', kSelCode:'-', kHitCode:'-', capped:[], returned:[] }; const details=[...(detailMap.get(`Y-${chakra}`)||[]), ...(detailMap.get(`K-${chakra}`)||[])];
      if(details.length){ details.forEach(d=>rows.push([k.id,r.chakra,r.y ?? '-',meta.ySelCode,meta.yHitCode,r.k ?? '-',meta.kSelCode,meta.kHitCode,formatRoundInfoEntries(meta.capped),formatRoundInfoEntries(meta.returned),formatRoundInfoEntries(Array.isArray(r.np)?r.np:(r.np?[r.np]:[])),r.ahuti ?? 0,r.axyapatra ?? 0,d.side,d.number,d.selectedRound,d.hitRound,d.travelSteps,d.selectCode,d.hitCode].map(escapeCsvValue).join(','))); } 
      else { rows.push([k.id,r.chakra,r.y ?? '-',meta.ySelCode,meta.yHitCode,r.k ?? '-',meta.kSelCode,meta.kHitCode,formatRoundInfoEntries(meta.capped),formatRoundInfoEntries(meta.returned),formatRoundInfoEntries(Array.isArray(r.np)?r.np:(r.np?[r.np]:[])),r.ahuti ?? 0,r.axyapatra ?? 0,'','','','','',''].map(escapeCsvValue).join(',')); }
    });
  }); return header + rows.join('\n');
}

function granthWorkbookSheets(){
  if (!Array.isArray(state.granth)) state.granth = [];
  return state.granth.map(k=>{
    const insight=kumbhInsights(k.rows||[]); const rows=[]; rows.push([`Kumbh #${String(k.id).padStart(2,'0')}`]); rows.push(['R','Y','K','YSel','YHit','KSel','KHit','Cap','Ret','NP','Ax']);
    (k.rows||[]).forEach(r=>{
      const meta=insight.rowMeta.get(Number(r.chakra)||0) || { ySelCode:'-', yHitCode:'-', kSelCode:'-', kHitCode:'-', capped:[], returned:[] };
      rows.push([Number(r.chakra)||0, r.y ?? '-', r.k ?? '-', meta.ySelCode, meta.yHitCode, meta.kSelCode, meta.kHitCode, formatRoundInfoEntries(meta.capped), formatRoundInfoEntries(meta.returned), formatRoundInfoEntries(Array.isArray(r.np)?r.np:(r.np?[r.np]:[])), Number(r.axyapatra)||0]);
    });
    rows.push([]); rows.push(['Travel Details']); rows.push(['Side','Number','SelectedRound','HitRound','TravelSteps']);
    const details=[...insight.details.Y, ...insight.details.K].sort((a,b)=>a.hitRound-b.hitRound);
    if(details.length) details.forEach(d=>rows.push([d.side,d.number,d.selectedRound,d.hitRound,d.travelSteps])); else rows.push(['No completed travel yet']);
    
    rows.push([]); 
    const yHot = insight?.yStats?.hot?.join(' | ') || '-';
    const yCool = insight?.yStats?.cool?.join(' | ') || '-';
    const kHot = insight?.kStats?.hot?.join(' | ') || '-';
    const kCool = insight?.kStats?.cool?.join(' | ') || '-';
    
    rows.push(['Y Hot', yHot]); 
    rows.push(['Y Cool', yCool]); 
    rows.push(['Y Rpt', Object.entries(insight.counts.Y).filter(([n])=>n!=='0').map(([n,c])=>`${n}:${c}`).join(' | ') || '-']); 
    rows.push(['K Hot', kHot]); 
    rows.push(['K Cool', kCool]); 
    rows.push(['K Rpt', Object.entries(insight.counts.K).filter(([n])=>n!=='0').map(([n,c])=>`${n}:${c}`).join(' | ') || '-']);
    
    return { name:`Kumbh_${String(k.id).padStart(2,'0')}`, rows };
  });
}

function buildSheetXml(rows){
  const sheetRows=rows.map((row,rIdx)=>{
    const cells=row.map((value,cIdx)=>{
      if(value===null || value===undefined || value==='') return '';
      const ref=xlsxCellRef(cIdx,rIdx);
      if(typeof value==='number' && Number.isFinite(value)) return `<c r="${ref}"><v>${value}</v></c>`;
      return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(String(value))}</t></is></c>`;
    }).join('');
    return `<row r="${rIdx+1}">${cells}</row>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`;
}

function buildXlsxWorkbook(kumbhs){
  const enc=new TextEncoder(); const files=[]; const add=(name,content)=>files.push({name,data:enc.encode(content)});
  const rawRows = parseCsvToGrid(granthCsvContent());
  const sheetEntries = (kumbhs||[]).length ? [...kumbhs, {name:'SystemData', rows: rawRows}] : [{name:'SystemData', rows:[['No data']]}];
  const wbSheets=sheetEntries.map((s,i)=>`<sheet name="${xmlEscape(sheetNameSafe(s.name,`Sheet${i+1}`))}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('');
  const wbRels=sheetEntries.map((s,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('');
  const contentOverrides=sheetEntries.map((s,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('');
  add('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>${contentOverrides}</Types>`);
  add('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`);
  const now=new Date().toISOString();
  add('docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:creator>Kubera Warhunt</dc:creator><cp:lastModifiedBy>Kubera Warhunt</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`);
  add('docProps/app.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Kubera Warhunt</Application></Properties>`);
  add('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${wbSheets}</sheets></workbook>`);
  add('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${wbRels}<Relationship Id="rId${sheetEntries.length+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  add('xl/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs></styleSheet>`);
  sheetEntries.forEach((sheet,idx)=>add(`xl/worksheets/sheet${idx+1}.xml`, buildSheetXml(sheet.rows)));
  const crcTable=new Uint32Array(256); for(let i=0;i<256;i++){ let c=i; for(let k=0;k<8;k++) c=(c&1)?(0xEDB88320^(c>>>1)):(c>>>1); crcTable[i]=c>>>0; }
  const crc32=(data)=>{ let c=0xFFFFFFFF; for(let i=0;i<data.length;i++) c=crcTable[(c^data[i])&0xFF]^(c>>>8); return (c^0xFFFFFFFF)>>>0; };
  const parts=[]; const central=[]; let offset=0; const pushU16=(arr,n)=>arr.push(n&255,(n>>>8)&255); const pushU32=(arr,n)=>arr.push(n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255);
  files.forEach(file=>{
    const nameBytes=enc.encode(file.name); const crc=crc32(file.data); const local=[];
    pushU32(local,0x04034b50); pushU16(local,20); pushU16(local,0); pushU16(local,0); pushU16(local,0); pushU16(local,0); pushU32(local,crc); pushU32(local,file.data.length); pushU32(local,file.data.length); pushU16(local,nameBytes.length); pushU16(local,0);
    parts.push(Uint8Array.from(local), nameBytes, file.data);
    const cent=[]; pushU32(cent,0x02014b50); pushU16(cent,20); pushU16(cent,20); pushU16(cent,0); pushU16(cent,0); pushU16(cent,0); pushU16(cent,0); pushU32(cent,crc); pushU32(cent,file.data.length); pushU32(cent,file.data.length); pushU16(cent,nameBytes.length); pushU16(cent,0); pushU16(cent,0); pushU16(cent,0); pushU16(cent,0); pushU32(cent,0); pushU32(cent,offset);
    central.push(Uint8Array.from(cent), nameBytes); offset += local.length + nameBytes.length + file.data.length;
  });
  const centralSize=central.reduce((n,a)=>n+a.length,0); const end=[]; pushU32(end,0x06054b50); pushU16(end,0); pushU16(end,0); pushU16(end,files.length); pushU16(end,files.length); pushU32(end,centralSize); pushU32(end,offset); pushU16(end,0);
  return new Blob([...parts,...central,Uint8Array.from(end)], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}

async function saveWithPickerOrDownload(fileName, content, mimeType, fileDesc, ext) {
    const blob = (content instanceof Blob) ? content : new Blob([content], { type: mimeType });
    try {
        if (window.showSaveFilePicker) {
            const handle = await window.showSaveFilePicker({ suggestedName: fileName, types: [{ description: fileDesc, accept: { [mimeType]: [ext] } }] });
            const writable = await handle.createWritable(); await writable.write(blob); await writable.close(); return true; 
        }
    } catch (err) { if (err.name === 'AbortError') return null; console.warn('Path picker blocked, using direct download.', err); }
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.style.display = 'none'; a.href = url; a.download = fileName;
    document.body.appendChild(a); a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 500); return true; 
}

async function doExportData(format) {
    try {
        let content, type, ext, desc;
        if(format === 'csv') { content = granthCsvContent(); type = 'text/csv'; ext = '.csv'; desc = 'CSV Files'; } 
        else if(format === 'xlsx') { content = buildXlsxWorkbook(granthWorkbookSheets()); type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'; ext = '.xlsx'; desc = 'Excel Files'; } 
        else { content = JSON.stringify(exportPayload(), null, 2); type = 'application/json'; ext = '.json'; desc = 'JSON Files'; }
        showToast('EXPORTING...', 'Preparing file...');
        const success = await saveWithPickerOrDownload(`Kubera_V5Pro_Final_locked${ext}`, content, type, desc, ext);
        if (success) showToast('EXPORT SUCCESS', `${format.toUpperCase()} saved`);
    } catch(err) {
        console.error("Export error:", err);
        showToast('EXPORT FAILED', err.message || 'Could not export file', 'warn');
    }
}

async function readUploadedFile(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.xlsx')) {
    if (typeof XLSX === 'undefined') {
      try {
        await new Promise((res, rej) => {
          const s = document.createElement('script');
          s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
          s.onload = res; s.onerror = () => rej(new Error("No internet for Excel."));
          document.head.appendChild(s);
        });
      } catch(e) { throw new Error("XLSX_NETWORK_ERROR"); }
    }
    const data = new Uint8Array(await file.arrayBuffer());
    const workbook = XLSX.read(data, {type: 'array'});
    if (workbook.Sheets['SystemData']) return XLSX.utils.sheet_to_csv(workbook.Sheets['SystemData']);
    return XLSX.utils.sheet_to_csv(workbook.Sheets[workbook.SheetNames[0]]);
  }
  return await file.text();
}

function processDataImport(text) {
    const trimmed = String(text || '').trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
            const parsed=JSON.parse(trimmed);
            if(parsed && parsed.state){ restoreSnapshot(parsed); }
            else if(parsed && parsed.granth){ state = reviveState({ ...freshState(), granth: parsed.granth, currentKumbhId: parsed.granth.at(-1)?.id||null, settings: parsed.settings || state.settings }); pending={Y:null,K:null}; historyStack=[]; redoStack=[]; replayAllKumbhsWithCurrentSettings(); }
            else { state = reviveState(parsed); pending={Y:null,K:null}; historyStack=[]; redoStack=[]; }
            renderAll(); showToast('GRANTH LOADED','JSON imported successfully');
        } catch(e) { console.error(e); showToast('IMPORT FAILED', 'Invalid JSON structure', 'warn'); }
    } else {
        try {
            const grid = parseCsvToGrid(trimmed);
            let startIndex = 0;
            if(grid.length > 0 && grid[0].length > 0 && (String(grid[0][0]).toLowerCase().includes('kumbhid') || String(grid[0][1]).toLowerCase().includes('chakra'))) {
                startIndex = 1; 
            }
            
            const grouped = new Map();
            for (let i = startIndex; i < grid.length; i++) {
                const cols = grid[i].map(s => String(s).trim().replace(/^"|"$/g, ''));
                if (cols.length < 3) continue;
                
                const rawKumbh = String(cols[0]||'').replace(/[^\d]/g, '');
                const rawChakra = String(cols[1]||'').replace(/[^\d]/g, '');
                const kumbhId = Number(rawKumbh);
                const chakra = Number(rawChakra);
                
                if (!kumbhId || !chakra) continue;
                
                if (!grouped.has(kumbhId)) grouped.set(kumbhId, { id: kumbhId, rows: [] });
                const target = grouped.get(kumbhId);
                
                const yRaw = cols[2] ? String(cols[2]).replace(/[^\d]/g, '') : '';
                const kRaw = cols[5] ? String(cols[5]).replace(/[^\d]/g, '') : '';
                
                if(!target.rows.some(r => Number(r.chakra) === chakra)) {
                    const parseArr = val => val && val !== '-' ? String(val).split(',').map(s=>s.trim()).filter(Boolean) : [];
                    target.rows.push({
                        chakra,
                        y: yRaw ? Number(yRaw) : '-',
                        k: kRaw ? Number(kRaw) : '-',
                        cap: parseArr(cols[8]),
                        ret: parseArr(cols[9]),
                        np: parseArr(cols[10]),
                        ahuti: parseInt(String(cols[11]||'').replace(/[^\d-]/g, '')) || 0,
                        axyapatra: parseInt(String(cols[12]||'').replace(/[^\d-]/g, '')) || 0
                    });
                }
            }
            
            if (grouped.size === 0) throw new Error("No data found");
            state.granth = [...grouped.values()].sort((a,b) => a.id - b.id); 
            state.currentKumbhId = state.granth.at(-1)?.id || null; 
            pending = {Y: null, K: null}; historyStack = []; redoStack = []; 
            replayAllKumbhsWithCurrentSettings();
            renderAll(); 
            showToast('GRANTH LOADED', 'Spreadsheet imported successfully');
        } catch(e) { 
            console.error('Import parse error:', e); 
            showToast('IMPORT FAILED', 'Could not read CSV/XLSX data', 'warn'); 
        }
    }
}

async function exportDrishtiCsv() {
    if (!Array.isArray(state.drishti) || state.drishti.length === 0) {
        showToast('EMPTY', 'No data to export', 'warn'); return;
    }
    let csv = 'Side,Number,ActivationWave,WinWave,Steps,PrevLoss,WinBet,Net,Status\n';
    state.drishti.forEach(r => {
        csv += `${r.side},${r.number},${r.activationChakra},${r.winChakra},${r.steps},${r.prevLoss},${r.winBet},${r.net},${r.status}\n`;
    });
    const success = await saveWithPickerOrDownload('Drishti_Log.csv', csv, 'text/csv', 'CSV Files', '.csv');
    if (success) showToast('EXPORT SUCCESS', 'Drishti CSV saved');
}

function exportDrishtiPdf() {
    if (!Array.isArray(state.drishti) || state.drishti.length === 0) {
        showToast('EMPTY', 'No data to export', 'warn'); return;
    }
    let rows = '';
    [...state.drishti].reverse().forEach(r => {
        rows += `<tr><td>${r.side}</td><td>${r.number}</td><td>${r.activationChakra}</td><td>${r.winChakra}</td><td>${r.steps}</td><td>${r.prevLoss}</td><td>${r.winBet}</td><td>${r.net}</td><td>${r.status}</td></tr>`;
    });
    const printWindow = window.open('', '_blank');
    if(!printWindow) { showToast('ERROR', 'Allow popups to print PDF', 'warn'); return; }
    printWindow.document.write(`
        <html>
        <head><title>Drishti Log Export</title>
        <style>
            body { font-family: sans-serif; padding: 20px; color: #000; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 14px; }
            th, td { border: 1px solid #aaa; padding: 8px; text-align: center; }
            th { background-color: #eee; }
            h2 { color: #333; }
        </style>
        </head>
        <body>
            <h2>Kubera Omega - Drishti Log</h2>
            <table>
                <thead><tr><th>Side</th><th>Summon</th><th>Act. Wave</th><th>Win Wave</th><th>Tiers</th><th>Prev Loss</th><th>Win Bet</th><th>Net Profit</th><th>Status</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>
            <script>window.onload = () => { window.print(); window.close(); }</script>
        </body>
        </html>
    `);
    printWindow.document.close();
}

function setupControls() {
  safeBind('prayogaBtn', startPrayoga);
  safeBind('kumbhaBtn', clearCurrentSession);
  safeBind('undoBtn', undoLast);
  safeBind('redoBtn', redoLast);
  
  safeBind('setTargetDollar', ()=>recalcTargetLink('dollar'), 'input');
  safeBind('setTargetPercent', ()=>recalcTargetLink('percent'), 'input');
  safeBind('setBankroll', ()=>recalcTargetLink('dollar'), 'input');
  safeBind('applyYantraBtn', applyYantraSettings);
  
  safeBind('saveLadderBtn', () => { 
      document.querySelectorAll('[data-ladder-index]').forEach(inp => { inp.value = normalizeLadderBet(inp.value); }); 
      syncFirstLadderFromInputs(); 
      if (!Array.isArray(state.granth)) state.granth = [];
      const hasRecordedRows = state.granth.some(k => Array.isArray(k.rows) && k.rows.length); 
      if (hasRecordedRows) replayAllKumbhsWithCurrentSettings(); 
      renderAll(); showToast('SOPANA SAVED', 'Editable ladder updated'); 
  });
  
  safeBind('exportLadderBtn', async () => {
      syncFirstLadderFromInputs(); const content = ladderCsvContent(); 
      const success = await saveWithPickerOrDownload('sopana-ladder.csv', content, 'text/csv', 'CSV Files', '.csv');
      if (success) showToast('SOPANA EXPORTED','Ladder CSV saved'); 
  });
  
  safeBind('loadLadderBtn', () => q('loadLadderFile').click());
  
  safeBind('loadLadderFile', async (e) => {
      const file = e.target.files[0]; if(!file) return;
      try {
          const text = await readUploadedFile(file);
          const lines = text.trim().split(/\r?\n/).slice(1).filter(Boolean); 
          let cumulative1=0, cumulative2=0; 
          lines.forEach(line => { 
              const [ladder,stepLabel,betRaw] = line.split(','); 
              const idx = Math.max(0, Number(String(stepLabel).replace(/\D/g,''))-1); 
              const bet = Number(betRaw)||0; 
              if (String(ladder).trim().toUpperCase()==='L2') { cumulative2 += bet; } 
              else { cumulative1 += bet; state.ladder[idx] = { step:`T${idx+1}`, bet, winReturn:bet*9, netProfit:(bet*9)-cumulative1, ifLoseTotal:-cumulative1 }; } 
          }); 
          if (!Array.isArray(state.granth)) state.granth = [];
          if(state.granth.some(k => Array.isArray(k.rows) && k.rows.length)) replayAllKumbhsWithCurrentSettings(); 
          renderAll(); showToast('SOPANA LOADED','Ladder loaded'); 
      } finally { e.target.value = ''; }
  }, 'change');

  safeBind('resetLadderBtn', () => { 
      state.ladder = buildLadder(state.settings); 
      if (!Array.isArray(state.granth)) state.granth = [];
      if (state.granth.some(k => Array.isArray(k.rows) && k.rows.length)) replayAllKumbhsWithCurrentSettings(); 
      renderAll(); showToast('SOPANA RESET', 'Default ladder restored'); 
  });
  
  document.addEventListener('input', e => { const el = e.target; if(el instanceof HTMLInputElement && el.matches('[data-ladder-index]')) refreshLinkedLadderCalculations(); });
  document.addEventListener('keydown', e => { 
      const el = e.target; 
      if(el instanceof HTMLInputElement && el.matches('[data-ladder-index]') && e.key === 'Enter') { 
          e.preventDefault(); const current = Number(el.dataset.ladderIndex); const next = document.querySelector(`[data-ladder-index="${current+1}"]`); 
          if(next){ next.focus(); next.select(); } else { el.blur(); } 
      } 
  });
  document.addEventListener('focusin', e => { const el = e.target; if(el instanceof HTMLInputElement && el.matches('[data-ladder-index]')) setTimeout(() => el.select(), 0); });
  
  safeBind('exportCsvBtn', () => { if (typeof exportDrishtiCsv === 'function') exportDrishtiCsv(); else showToast('INFO', 'Drishti CSV export not available', 'warn'); });
  safeBind('exportPdfBtn', () => { if (typeof exportDrishtiPdf === 'function') exportDrishtiPdf(); else showToast('INFO', 'PDF export not available', 'warn'); });
  
  safeBind('loadCsvBtn', () => q('loadCsvFile').click()); 
  
  safeBind('loadCsvFile', async (e) => {
      const file = e.target.files[0]; if(!file) return; 
      try {
          const text = await readUploadedFile(file);
          state.drishti = text.trim().split(/\r?\n/).slice(1).filter(Boolean).map(line => { 
              const [side,number,activationChakra,winChakra,steps,prevLoss,winBet,net,status] = line.split(','); 
              return {side,number,activationChakra,winChakra,steps,prevLoss,winBet,net,status}; 
          }); 
          renderAll(); showToast('DRISHTI LOADED','File imported'); 
      } finally { e.target.value = ''; }
  }, 'change');
  
  safeBind('exportGranthBtn', () => { const fmt = q('granthExportFormat')?.value || 'json'; doExportData(fmt); });
  safeBind('importGranthBtn', () => q('importGranthFile').click());
  
  safeBind('importGranthFile', async (e) => {
      const file = e.target.files[0]; if(!file) return; 
      try { 
          const text = await readUploadedFile(file); processDataImport(text); 
      } catch(err) { 
          console.error(err); 
          if (err.message === "XLSX_NETWORK_ERROR") showToast('IMPORT FAILED', 'Internet required for Excel imports', 'warn');
          else showToast('IMPORT FAILED', 'Could not read file', 'warn'); 
      } finally { e.target.value = ''; }
  }, 'change');

  safeBind('deleteGranthBtn', async () => {
    const sel = q('deleteKumbhSelect'); const id = Number(sel?.value || 0);
    if (!Array.isArray(state.granth)) state.granth = [];
    if (id) {
      const ok = await askModal({ title: `DELETE RAID #${String(id).padStart(2, '0')}`, text: 'Remove this specific raid log?', okLabel: 'Delete', cancelLabel: 'Cancel', okClass: 'warn' });
      if (!ok) return;
      state.granth = state.granth.filter(k => k.id !== id).map((k, idx) => ({ ...k, id: idx + 1 }));
      state.currentKumbhId = state.granth.at(-1)?.id || null;
      renderAll(); showToast('LOG DELETED', 'Selected Raid Log removed'); return;
    } 
    const ok = await askModal({ title: 'PURGE ALL HISTORY', text: 'This will permanently erase the entire Granth.', okLabel: 'Purge All', cancelLabel: 'Cancel', okClass: 'warn' });
    if (!ok) return;
    state.granth = []; state.currentKumbhId = null;
    renderAll(); showToast('GRANTH PURGED', 'All Raid history removed');
  });
  
  safeBind('historyUndoBtn', () => { if(typeof undoLast === 'function') undoLast(); });
}

function setupInstall(){
    window.addEventListener('beforeinstallprompt', e => {
        e.preventDefault();
        deferredPrompt = e;
        const btn = q('installBtn');
        if(btn) {
            btn.style.background = '#40b46b'; 
            btn.style.color = '#fff';
            btn.textContent = 'READY TO INSTALL';
        }
    });
    
    safeBind('installBtn', async () => {
        if(!deferredPrompt) {
            showToast('INSTALL UNAVAILABLE', 'Use your browser menu: Share -> Add to Home Screen', 'warn');
            return;
        }
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if(outcome === 'accepted') {
            deferredPrompt = null;
            const btn = q('installBtn');
            if(btn) btn.classList.add('hidden');
        }
    });
}

function initApp() {
    try { setupTabs(); } catch(e) { console.error('setupTabs failed:', e); }
    try { setupBoards(); } catch(e) { console.error('setupBoards failed:', e); }
    try { setupControls(); } catch(e) { console.error('setupControls failed:', e); }
    try { setupInstall(); } catch(e) { console.error('setupInstall failed:', e); }
    try { renderAll(); } catch(e) { console.error('renderAll failed:', e); }
}

if('serviceWorker' in navigator){ window.addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js').catch(()=>{})); }
if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', initApp); } else { initApp(); }
