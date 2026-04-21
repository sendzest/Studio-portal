/* js/time.js — Time tracking (Trak integration) */

let timeProjects = [];
let timeEntries = [];
let runningEntry = null;
let timerInterval = null;
let timerSeconds = 0;
let currentTimeProjectId = null;
let timeDetailMonth = 'all';

const TIME_COLORS = ['#C8A96E','#D85A30','#3D7A52','#2A5C8A','#B8720A','#6B4FA0','#B83232','#4A8A6A','#5A5A8A','#8A4A5A'];

function th(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function fmtDur(s){s=Math.max(0,Math.floor(s||0));return `${Math.floor(s/3600)}:${String(Math.floor((s%3600)/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;}
function fmtDurShort(s){s=Math.max(0,Math.floor(s||0));return `${Math.floor(s/3600)}:${String(Math.floor((s%3600)/60)).padStart(2,'0')}`;}
function getTP(id){if(!id)return null;return timeProjects.find(p=>String(p.id)===String(id))||null;}

// Get rate and name for a time entry — checks time_project_id first, then project_id
function getEntryRate(entry){
  if(entry.hourly_rate)return entry.hourly_rate;
  if(entry.time_project_id){
    const tp=getTP(entry.time_project_id);
    if(tp&&tp.rate)return tp.rate;
  }
  if(entry.project_id){
    const sp=allProjects.find(p=>String(p.id)===String(entry.project_id));
    if(sp&&sp.hourly_rate)return sp.hourly_rate;
  }
  return 0;
}
function getEntryProjectName(entry){
  if(entry.time_project_id){
    const tp=getTP(entry.time_project_id);
    if(tp)return tp.name;
  }
  if(entry.project_id){
    const sp=allProjects.find(p=>String(p.id)===String(entry.project_id));
    if(sp)return sp.name;
  }
  return '—';
}

function getEntryProjectColor(entry){
  if(entry.time_project_id){
    const tp=getTP(entry.time_project_id);
    if(tp)return tp.color||'var(--accent)';
  }
  if(entry.project_id){
    const sp=allProjects.find(p=>String(p.id)===String(entry.project_id));
    if(sp)return sp.color||'var(--accent)';
  }
  return 'var(--mid)';
}

// Get the linked project ID for an entry (either time or studio)
function getEntryLinkedId(entry){
  return entry.time_project_id||entry.project_id||null;
}
function todayStr(){return new Date().toISOString().slice(0,10);}
function weekStartStr(){const d=new Date();d.setDate(d.getDate()-((d.getDay()+6)%7));return d.toISOString().slice(0,10);}
function monthStartStr(){const d=new Date();d.setDate(1);return d.toISOString().slice(0,10);}

function formatDateLbl(d){
  if(!d)return '';
  const today=todayStr();
  const yd=new Date();yd.setDate(yd.getDate()-1);
  const yds=yd.toISOString().slice(0,10);
  if(d===today)return'Today';
  if(d===yds)return'Yesterday';
  return new Date(d+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short'});
}
function fmtMonth(ym){if(!ym)return'';const[y,m]=ym.split('-');return new Date(parseInt(y),parseInt(m)-1,1).toLocaleDateString('en-GB',{month:'short',year:'numeric'});}

function getTodayH(){return timeEntries.filter(e=>e.date===todayStr()&&e.duration&&!e.running).reduce((s,e)=>s+(e.duration||0),0);}
function getTodayE(){return timeEntries.filter(e=>e.date===todayStr()&&e.duration&&!e.running).reduce((s,e)=>s+((e.duration||0)/3600)*getEntryRate(e),0);}
function getWeekH(){const ws=weekStartStr();return timeEntries.filter(e=>e.date>=ws&&e.duration&&!e.running).reduce((s,e)=>s+(e.duration||0),0);}
function getWeekE(){const ws=weekStartStr();return timeEntries.filter(e=>e.date>=ws&&e.duration&&!e.running).reduce((s,e)=>s+((e.duration||0)/3600)*getEntryRate(e),0);}
function getMonthH(){const ms=monthStartStr();return timeEntries.filter(e=>e.date>=ms&&e.duration&&!e.running).reduce((s,e)=>s+(e.duration||0),0);}
function getMonthE(){const ms=monthStartStr();return timeEntries.filter(e=>e.date>=ms&&e.duration&&!e.running).reduce((s,e)=>s+((e.duration||0)/3600)*getEntryRate(e),0);}

async function loadTimeData(){
  if(!currentUser)return;
  const[{data:tp,error:e1},{data:te,error:e2}]=await Promise.all([
    db.from('time_projects').select('*').eq('owner_id',currentUser.id).order('created_at'),
    db.from('time_entries').select('*').eq('owner_id',currentUser.id).order('date',{ascending:false}).order('start_time',{ascending:false})
  ]);
  if(e1)console.error('time_projects:',e1.message);
  if(e2)console.error('time_entries:',e2.message);
  timeProjects=tp||[];
  timeEntries=te||[];
  runningEntry=timeEntries.find(e=>e.running)||null;
  if(runningEntry){timerSeconds=Math.floor((Date.now()-new Date(runningEntry.started_at))/1000);startTimerTick();}
  updateTimerSidebarWidget();
}

async function clockIn(tpId,desc='',studioProjectId=null){
  // tpId can be null if clocking in directly on a studio project
  if(!tpId&&!studioProjectId){showToast('Select a project first','error');return;}
  if(runningEntry)await clockOut();
  const now=new Date();
  const{data,error}=await db.from('time_entries').insert({
    owner_id:currentUser.id,
    time_project_id:tpId||null,
    project_id:studioProjectId||null,
    description:desc||null,
    date:now.toISOString().slice(0,10),start_time:now.toTimeString().slice(0,5),
    running:true,started_at:now.toISOString()
  }).select().single();
  if(error){showToast('Failed to start timer','error');return;}
  runningEntry=data;timeEntries.unshift(data);timerSeconds=0;
  startTimerTick();updateTimerSidebarWidget();updateDashboardClockWidget();refreshTimeUI();
  if(typeof renderDashboard==='function')renderDashboard();
  showToast('Timer started!','success');
}

async function clockOut(){
  if(!runningEntry)return;
  clearInterval(timerInterval);timerInterval=null;
  const now=new Date();
  const duration=Math.floor((now-new Date(runningEntry.started_at))/1000);
  if(duration<10){
    await db.from('time_entries').delete().eq('id',runningEntry.id);
    timeEntries=timeEntries.filter(e=>e.id!==runningEntry.id);
  }else{
    const{error}=await db.from('time_entries').update({end_time:now.toTimeString().slice(0,5),duration,running:false,started_at:null}).eq('id',runningEntry.id);
    if(error){showToast('Failed to stop timer','error');return;}
    const idx=timeEntries.findIndex(e=>e.id===runningEntry.id);
    if(idx!==-1)timeEntries[idx]={...timeEntries[idx],end_time:now.toTimeString().slice(0,5),duration,running:false};
    showToast('Stopped · '+fmtDurShort(duration),'success');
  }
  runningEntry=null;timerSeconds=0;
  updateTimerSidebarWidget();updateDashboardClockWidget();refreshTimeUI();
  const w=document.getElementById('project-clock-in-widget');
  if(w&&typeof currentProjectId!=='undefined'&&currentProjectId)renderProjectClockIn(currentProjectId);
  // Refresh dashboard project list
  if(typeof renderDashboard==='function')renderDashboard();
}

function startTimerTick(){
  clearInterval(timerInterval);
  timerInterval=setInterval(()=>{
    timerSeconds++;
    document.querySelectorAll('.live-timer-display').forEach(el=>el.textContent=fmtDur(timerSeconds));
  },1000);
}

function refreshTimeUI(){
  if(document.getElementById('page-time')?.classList.contains('active'))renderTimePage();
  if(document.getElementById('page-time-project-detail')?.classList.contains('active')&&currentTimeProjectId)renderTimeProjectDetail(currentTimeProjectId);
}

function updateTimerSidebarWidget(){
  const w=document.getElementById('sidebar-timer-widget');
  if(!w)return;
  w.innerHTML='';
  const navTime=document.getElementById('nav-time');

  if(runningEntry){
    const tp=getTP(runningEntry.time_project_id);
    const pName=tp?.name||(typeof allProjects!=='undefined'?allProjects.find(p=>p.id===runningEntry.project_id)?.name:'')||'Timer running';
    const outer=document.createElement('div');
    outer.style.cssText='padding:8px 12px';
    const inner=document.createElement('div');
    inner.style.cssText='background:var(--sidebar-active-bg);border-radius:8px;padding:10px 12px;cursor:pointer;border:1px solid var(--sidebar-border)';
    inner.onclick=function(){if(navTime)showPage('time',navTime);};
    const dot=document.createElement('div');
    dot.style.cssText='width:7px;height:7px;border-radius:50%;background:var(--green);animation:timerPulse 1.2s ease-in-out infinite;flex-shrink:0';
    const runLabel=document.createElement('div');
    runLabel.style.cssText='font-size:10px;font-weight:600;color:var(--sidebar-text-muted);text-transform:uppercase;letter-spacing:.07em';
    runLabel.textContent='Running';
    const dotRow=document.createElement('div');
    dotRow.style.cssText='display:flex;align-items:center;gap:7px;margin-bottom:5px';
    dotRow.appendChild(dot);dotRow.appendChild(runLabel);
    const timer=document.createElement('div');
    timer.className='live-timer-display';
    timer.style.cssText='font-family:DM Serif Display,serif;font-size:20px;color:var(--accent)';
    timer.textContent=fmtDur(timerSeconds);
    const name=document.createElement('div');
    name.style.cssText='font-size:11px;color:var(--sidebar-text);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
    name.textContent=pName;
    const stopBtn=document.createElement('button');
    stopBtn.style.cssText='margin-top:8px;width:100%;padding:5px;background:var(--red-light);border:1px solid rgba(192,57,43,.2);border-radius:6px;color:var(--red);font-size:12px;font-weight:500;cursor:pointer';
    stopBtn.textContent='⏹ Stop';
    stopBtn.onclick=function(e){e.stopPropagation();clockOut();};
    inner.appendChild(dotRow);inner.appendChild(timer);inner.appendChild(name);inner.appendChild(stopBtn);
    outer.appendChild(inner);w.appendChild(outer);
  }else{
    const div=document.createElement('div');
    div.style.cssText='padding:8px 12px 4px;cursor:pointer';
    div.onclick=function(){if(navTime)showPage('time',navTime);};
    const h=getTodayH();const e=getTodayE();
    const lbl=document.createElement('div');
    lbl.style.cssText='font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--sidebar-text-muted);margin-bottom:3px';
    lbl.textContent='Today';
    const val=document.createElement('div');
    val.style.cssText='font-family:DM Serif Display,serif;font-size:18px;color:var(--sidebar-text)';
    val.textContent=h?fmtDurShort(h):'0:00';
    div.appendChild(lbl);div.appendChild(val);
    if(e>0){const earn=document.createElement('div');earn.style.cssText='font-size:11px;color:var(--sidebar-text-muted)';earn.textContent=formatCurrency(e);div.appendChild(earn);}
    w.appendChild(div);
  }
}

function renderDashboardClockWidget(){
  const c=document.getElementById('dashboard-clock-widget');if(!c)return;
  const active=timeProjects.filter(p=>!p.archived);
  let timerArea='';
  if(runningEntry){
    const tp=getTP(runningEntry.time_project_id);
    timerArea=`<div class="timer-card">
      <div class="timer-running-row"><div class="timer-pulse"></div><span class="timer-running-lbl">Running</span></div>
      <div class="timer-display live-timer-display">${fmtDur(timerSeconds)}</div>
      <div class="timer-proj-name">${th(tp?.name||'Timer running')} · ${th(runningEntry.description||'—')}</div>
      <button class="timer-btn stop" onclick="clockOut()">⏹ Stop timer</button>
    </div>`;
  }else if(!active.length){
    timerArea=`<div style="text-align:center;padding:16px;color:var(--text-mid);font-size:13px">No time projects yet. <span onclick="showPage('time',document.getElementById('nav-time'));openTimeProjectModal()" style="color:var(--accent);cursor:pointer">Create one →</span></div>`;
  }else{
    timerArea=`<div class="timer-card">
      <div class="timer-display" style="color:rgba(255,255,255,.3);margin-bottom:14px;">0:00:00</div>
      <select id="dashboard-timer-select" style="width:100%;padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.08);color:#fff;font-family:inherit;font-size:13px;outline:none;margin-bottom:8px;">
        <option value="">Select project…</option>${active.map(p=>`<option value="${p.id}">${th(p.name)}${p.client?' · '+th(p.client):''}</option>`).join('')}
      </select>
      <input type="text" id="dashboard-timer-desc" placeholder="What are you working on?" style="width:100%;padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,.15);background:rgba(255,255,255,.08);color:#fff;font-family:inherit;font-size:13px;outline:none;margin-bottom:0;" onkeydown="if(event.key==='Enter')startDashboardTimer()" />
      <button class="timer-btn start" onclick="startDashboardTimer()">▶ Clock In</button>
    </div>`;
  }
  const recent=timeEntries.filter(e=>!e.running&&e.duration).slice(0,4);
  const recentHtml=recent.length?`<div style="margin-top:14px;border-top:1px solid var(--border);padding-top:12px">
    <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:var(--text-mid);margin-bottom:8px">Recent</div>
    ${recent.map(e=>{const earn=((e.duration||0)/3600)*getEntryRate(e);
      return`<div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--border)">
        <div style="width:7px;height:7px;border-radius:50%;background:${getEntryProjectColor(e)};flex-shrink:0"></div>
        <div style="flex:1;font-size:13px;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${th(getEntryProjectName(e))}</div>
        <div style="font-size:12px;color:var(--text-mid);white-space:nowrap">${fmtDurShort(e.duration)}</div>
        ${earn>0?`<div style="font-size:12px;color:var(--text-mid);white-space:nowrap">${formatCurrency(earn)}</div>`:''}
      </div>`;}).join('')}
  </div>`:'';
  c.innerHTML=`<div class="card" style="padding:20px;margin-bottom:20px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
      <div class="section-title">Time Tracker</div>
      <button class="btn btn-ghost btn-sm" onclick="showPage('time',document.getElementById('nav-time'))" style="font-size:12px">View all →</button>
    </div>
    <div id="dashboard-timer-area">${timerArea}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:16px">
      <div style="background:var(--surface2);border-radius:var(--r);padding:14px">
        <div style="font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:var(--text-mid);margin-bottom:5px">Today</div>
        <div style="font-family:'DM Serif Display',serif;font-size:22px;color:var(--text)">${fmtDurShort(getTodayH())}</div>
        <div style="font-size:12px;color:var(--text-mid);margin-top:2px">${formatCurrency(getTodayE())}</div>
      </div>
      <div style="background:var(--surface2);border-radius:var(--r);padding:14px">
        <div style="font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:var(--text-mid);margin-bottom:5px">This Week</div>
        <div style="font-family:'DM Serif Display',serif;font-size:22px;color:var(--text)">${fmtDurShort(getWeekH())}</div>
        <div style="font-size:12px;color:var(--text-mid);margin-top:2px">${formatCurrency(getWeekE())}</div>
      </div>
    </div>${recentHtml}
  </div>`;
}

function updateDashboardClockWidget(){renderDashboardClockWidget();}

async function startDashboardTimer(){
  const sel=document.getElementById('dashboard-timer-select');
  const desc=document.getElementById('dashboard-timer-desc')?.value.trim()||'';
  if(!sel?.value){showToast('Select a project first','error');return;}
  await clockIn(sel.value,desc);
}

function renderTimePage(){
  const c=document.getElementById('time-page-content');if(!c)return;
  const active=timeProjects.filter(p=>!p.archived);
  let timerBar='';
  if(runningEntry){
    const tp=getTP(runningEntry.time_project_id);
    timerBar=`<div style="background:var(--green-light);border:1px solid rgba(61,122,82,.25);border-radius:var(--rl);padding:16px 20px;display:flex;align-items:center;gap:16px;flex-wrap:wrap">
      <div style="width:12px;height:12px;border-radius:50%;background:${tp?.color||'var(--green)'};animation:timerPulse 1.2s ease-in-out infinite;flex-shrink:0"></div>
      <div style="flex:1;min-width:120px"><div style="font-weight:600;font-size:14px;color:var(--text)">${th(tp?.name||'Timer')}</div>
      <div style="font-size:12px;color:var(--text-mid)">${th(runningEntry.description||'No description')}</div></div>
      <div class="live-timer-display" style="font-family:'DM Serif Display',serif;font-size:30px;color:var(--green);min-width:110px;text-align:right">${fmtDur(timerSeconds)}</div>
      <button class="btn btn-red" onclick="clockOut()">⏹ Stop</button></div>`;
  }else{
    timerBar=`<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--rl);padding:14px 18px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <div style="font-family:'DM Serif Display',serif;font-size:26px;color:var(--text-mid);min-width:100px">0:00:00</div>
      <select id="time-project-select" style="flex:1;min-width:140px;padding:9px 12px;border:1.5px solid var(--border);border-radius:var(--r);font-family:inherit;font-size:13.5px;color:var(--text);background:var(--surface2);outline:none">
        <option value="">Select project…</option>${active.map(p=>`<option value="${p.id}">${th(p.name)}${p.client?' · '+th(p.client):''}</option>`).join('')}
      </select>
      <input type="text" id="time-desc-input" placeholder="What are you working on?" style="flex:2;min-width:140px;padding:9px 12px;border:1.5px solid var(--border);border-radius:var(--r);font-family:inherit;font-size:13.5px;color:var(--text);background:var(--surface2);outline:none" onkeydown="if(event.key==='Enter')startMainTimer()">
      <button class="btn btn-green" onclick="startMainTimer()">▶ Start</button></div>`;
  }
  const completed=timeEntries.filter(e=>!e.running&&e.duration);
  const groups={};completed.forEach(e=>{const d=e.date||'Unknown';if(!groups[d])groups[d]=[];groups[d].push(e);});
  const entriesHtml=completed.length?Object.entries(groups).map(([date,ents])=>{
    const tot=ents.reduce((s,e)=>s+(e.duration||0),0);
    const earn=ents.reduce((s,e)=>s+((e.duration||0)/3600)*getEntryRate(e),0);
    return`<div style="margin-bottom:20px">
      <div style="display:flex;justify-content:space-between;padding:0 0 8px;border-bottom:1px solid var(--border);margin-bottom:4px">
        <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:var(--text-mid)">${formatDateLbl(date)}</div>
        <div style="font-size:12px;color:var(--text-mid)">${fmtDurShort(tot)} · ${formatCurrency(earn)}</div>
      </div>
      ${ents.map(e=>{const projName=getEntryProjectName(e);const projColor=getEntryProjectColor(e);const er=((e.duration||0)/3600)*getEntryRate(e);const tpId=e.time_project_id;const spId=e.project_id;
        return`<div style="display:flex;align-items:center;gap:10px;padding:8px;border-radius:8px" onmouseover="this.querySelector('.tea').style.opacity='1'" onmouseout="this.querySelector('.tea').style.opacity='0'">
          <div style="width:8px;height:8px;border-radius:50%;background:${projColor};flex-shrink:0"></div>
          <div style="font-size:13px;font-weight:500;color:var(--accent);min-width:110px;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" onclick="${tpId?`openTimeProjectDetail('${tpId}')`:spId?`showPage('projects',document.getElementById('nav-projects'))`:''}">${th(projName)}</div>
          <div style="font-size:12px;color:var(--text-mid);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${th(e.description||'')}</div>
          <div style="font-size:11px;color:var(--text-mid);white-space:nowrap">${e.start_time||''} – ${e.end_time||''}</div>
          <div style="font-size:13px;font-weight:500;min-width:44px;text-align:right;color:var(--text)">${fmtDurShort(e.duration)}</div>
          ${er>0?`<div style="font-size:12px;color:var(--text-mid);min-width:54px;text-align:right">${formatCurrency(er)}</div>`:'<div style="min-width:54px"></div>'}
          <div class="tea" style="display:flex;gap:4px;opacity:0;transition:opacity .15s">
            <button class="btn btn-ghost btn-sm" style="padding:4px 7px" onclick="editTimeEntry('${e.id}')">✎</button>
            <button class="btn btn-ghost btn-sm" style="padding:4px 7px;color:var(--red)" onclick="deleteTimeEntry('${e.id}')">✕</button>
          </div>
        </div>`;}).join('')}
    </div>`;
  }).join(''):`<div class="empty-state"><div class="empty-icon">⏱</div><div class="empty-title">No entries yet</div><div class="empty-text">Start the timer or add an entry manually.</div></div>`;

  const projSidebar=active.length?active.map(p=>{
    const pe=timeEntries.filter(e=>String(e.time_project_id)===String(p.id)&&e.duration);
    const tot=pe.reduce((s,e)=>s+(e.duration||0),0);
    const earn=pe.reduce((s,e)=>s+((e.duration||0)/3600)*(p.rate||0),0);
    const uninv=pe.filter(e=>!e.invoiced).length;
    const isRun=runningEntry&&String(runningEntry.time_project_id)===String(p.id);
    return`<div style="background:var(--surface);border:1px solid ${isRun?'var(--green)':'var(--border)'};border-radius:var(--r);padding:14px;margin-bottom:10px;cursor:pointer;transition:border-color .15s" onmouseover="this.style.borderColor='${isRun?'var(--green)':'var(--accent)'}'" onmouseout="this.style.borderColor='${isRun?'var(--green)':'var(--border)'}'" onclick="openTimeProjectDetail('${p.id}')">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <div style="width:10px;height:10px;border-radius:50%;background:${p.color};flex-shrink:0${isRun?';animation:timerPulse 1.2s ease-in-out infinite':''}"></div>
        <div style="font-weight:500;font-size:13.5px;color:var(--text);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${th(p.name)}</div>
        <button class="btn btn-sm" style="padding:4px 8px;font-size:11px;background:${isRun?'var(--red)':'var(--green)'};color:white;border:none" onclick="event.stopPropagation();${isRun?'clockOut()':`quickClockIn('${p.id}','${th(p.name)}')`}">${isRun?'⏹':'▶'}</button>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-mid)">
        <span>${fmtDurShort(tot)}</span><span>${formatCurrency(earn)}</span>
        ${uninv>0?`<span style="color:var(--amber)">${uninv} uninvoiced</span>`:''}
      </div>
      ${p.rate?`<div style="font-size:11px;color:var(--text-mid);margin-top:4px">£${p.rate}/hr${p.client?' · '+th(p.client):''}</div>`:''}
    </div>`;
  }).join(''):`<div style="text-align:center;padding:24px 16px;color:var(--text-mid);font-size:13px;background:var(--surface);border:1px solid var(--border);border-radius:var(--rl)">No time projects yet.<br><button class="btn btn-dark btn-sm" style="margin-top:10px" onclick="openTimeProjectModal()">+ Create one</button></div>`;

  c.innerHTML=`
    <div class="stats-row" style="grid-template-columns:repeat(3,1fr)">
      <div class="stat-card"><div class="stat-icon">⏱</div><div class="stat-label">Today</div><div class="stat-value">${fmtDurShort(getTodayH()+(runningEntry?timerSeconds:0))}</div><div class="stat-sub">${formatCurrency(getTodayE())}</div></div>
      <div class="stat-card"><div class="stat-icon">📅</div><div class="stat-label">This Week</div><div class="stat-value">${fmtDurShort(getWeekH())}</div><div class="stat-sub">${formatCurrency(getWeekE())}</div></div>
      <div class="stat-card"><div class="stat-icon">📆</div><div class="stat-label">This Month</div><div class="stat-value">${fmtDurShort(getMonthH())}</div><div class="stat-sub">${formatCurrency(getMonthE())}</div></div>
    </div>
    <div style="margin-bottom:20px">${timerBar}</div>
    <div style="display:grid;grid-template-columns:1fr 300px;gap:20px">
      <div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
          <div class="section-title">Time Entries</div>
          <button class="btn btn-outline btn-sm" onclick="openManualTimeEntry()">+ Add manually</button>
        </div>
        ${entriesHtml}
      </div>
      <div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
          <div class="section-title">Projects</div>
          <button class="btn btn-dark btn-sm" onclick="openTimeProjectModal()">+ New</button>
        </div>
        ${projSidebar}
      </div>
    </div>`;
}

async function startMainTimer(){
  const sel=document.getElementById('time-project-select');
  const desc=document.getElementById('time-desc-input')?.value.trim()||'';
  if(!sel?.value){showToast('Select a project first','error');return;}
  await clockIn(sel.value,desc);
}

function openTimeProjectDetail(tpId){
  if(!tpId)return;
  currentTimeProjectId=String(tpId);
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById('page-time-project-detail').classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  document.getElementById('nav-time')?.classList.add('active');
  const tp=getTP(tpId);
  if(tp)document.getElementById('time-pd-title').textContent=tp.name;
  renderTimeProjectDetail(String(tpId));
  window.scrollTo(0,0);
}

function renderTimeProjectDetail(tpId){
  const c=document.getElementById('time-project-detail-content');if(!c)return;
  const tp=getTP(tpId);
  if(!tp){c.innerHTML=`<div class="empty-state"><div class="empty-title">Project not found</div></div>`;return;}
  const pe=timeEntries.filter(e=>String(e.time_project_id)===String(tpId)&&e.duration&&!e.running);
  const ws=weekStartStr();const ms=monthStartStr();
  const wSec=pe.filter(e=>e.date>=ws).reduce((s,e)=>s+(e.duration||0),0);
  const mSec=pe.filter(e=>e.date>=ms).reduce((s,e)=>s+(e.duration||0),0);
  const aSec=pe.reduce((s,e)=>s+(e.duration||0),0);
  const r=tp.rate||tp.hourly_rate||0;
  const uninv=pe.filter(e=>!e.invoiced);
  const uninvSec=uninv.reduce((s,e)=>s+(e.duration||0),0);
  const isRun=runningEntry&&String(runningEntry.time_project_id)===String(tpId);

  let budget='';
  if(tp.budget_type&&tp.budget_type!=='none'&&tp.budget>0){
    const used=tp.budget_type==='hours'?aSec/3600:aSec/3600*r;
    const pct=Math.min(100,(used/tp.budget)*100);
    const bc=pct>90?'var(--red)':pct>70?'var(--amber)':'var(--green)';
    const lbl=tp.budget_type==='hours'?`${used.toFixed(1)} / ${tp.budget}h`:`${formatCurrency(used)} / ${formatCurrency(tp.budget)}`;
    budget=`<div class="card card-pad" style="margin-bottom:16px"><div style="display:flex;justify-content:space-between;margin-bottom:6px"><div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:var(--text-mid)">Budget</div><div style="font-size:12px;color:var(--text-mid)">${lbl} used</div></div><div class="progress-bar"><div class="progress-fill" style="width:${pct.toFixed(1)}%;background:${bc}"></div></div></div>`;
  }

  let uninvBanner='';
  if(uninv.length>0&&r>0){
    uninvBanner=`<div style="background:var(--amber-light);border:1px solid rgba(184,114,10,.2);border-radius:var(--r);padding:14px 16px;display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:10px">
      <div><div style="font-size:13px;font-weight:500;color:var(--amber)">${uninv.length} uninvoiced ${uninv.length===1?'entry':'entries'} — ${formatCurrency(uninvSec/3600*r)} ready</div>
      <div style="font-size:12px;color:var(--amber);opacity:.8;margin-top:2px">${fmtDurShort(uninvSec)} across ${uninv.length} session${uninv.length!==1?'s':''}</div></div>
      <button class="btn btn-gold btn-sm" onclick="openTimeInvoiceModal('${tpId}')">Invoice now</button>
    </div>`;
  }

  const months=[...new Set(pe.map(e=>e.date?.slice(0,7)).filter(Boolean))].sort((a,b)=>b.localeCompare(a));
  const filtered=timeDetailMonth==='all'?pe:pe.filter(e=>e.date?.slice(0,7)===timeDetailMonth);

  c.innerHTML=`
    <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:12px">
      <div style="display:flex;align-items:center;gap:12px">
        <div style="width:16px;height:16px;border-radius:50%;background:${tp.color};flex-shrink:0${isRun?';animation:timerPulse 1.2s ease-in-out infinite':''}"></div>
        <div>
          <div style="font-family:'DM Serif Display',serif;font-size:22px;color:var(--text)">${th(tp.name)}</div>
          <div style="font-size:13px;color:var(--text-mid)">${tp.client?th(tp.client):'No client'}${r?' · £'+r+'/hr':''}</div>
        </div>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        ${isRun?`<div class="live-timer-display" style="font-family:'DM Serif Display',serif;font-size:22px;color:var(--green)">${fmtDur(timerSeconds)}</div>
          <button class="btn btn-red btn-sm" onclick="clockOut()">⏹ Stop</button>`
          :`<button class="btn btn-outline btn-sm" onclick="openTimeProjectModal('${tpId}')">Edit</button>
           <button class="btn btn-green btn-sm" onclick="quickClockIn('${tpId}','${th(tp.name)}')">▶ Clock In</button>`}
      </div>
    </div>
    ${uninvBanner}${budget}
    <div class="stats-row" style="grid-template-columns:repeat(3,1fr);margin-bottom:16px">
      <div class="stat-card"><div class="stat-label">This Week</div><div class="stat-value">${fmtDurShort(wSec)}</div><div class="stat-sub">${formatCurrency(wSec/3600*r)}</div></div>
      <div class="stat-card"><div class="stat-label">This Month</div><div class="stat-value">${fmtDurShort(mSec)}</div><div class="stat-sub">${formatCurrency(mSec/3600*r)}</div></div>
      <div class="stat-card"><div class="stat-label">All Time</div><div class="stat-value">${fmtDurShort(aSec)}</div><div class="stat-sub">${formatCurrency(aSec/3600*r)} · ${pe.length} entries</div></div>
    </div>
    ${tp.notes?`<div class="card card-pad" style="margin-bottom:16px"><div class="info-card-title">Notes</div><div style="font-size:13.5px;color:var(--text-mid);line-height:1.65;white-space:pre-wrap">${th(tp.notes)}</div></div>`:''}
    <div class="card" style="padding:18px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
        <div class="section-title">Entry Log</div>
        <button class="btn btn-outline btn-sm" onclick="openManualTimeEntry('${tpId}')">+ Add manually</button>
      </div>
      <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:14px">
        <button style="padding:4px 12px;border-radius:20px;font-size:12px;border:1px solid ${timeDetailMonth==='all'?'var(--accent)':'var(--border)'};background:${timeDetailMonth==='all'?'var(--amber-light)':'transparent'};color:${timeDetailMonth==='all'?'var(--amber)':'var(--text-mid)'};cursor:pointer;font-family:inherit" onclick="setTimeDetailMonth('all','${tpId}')">All time</button>
        ${months.map(m=>`<button style="padding:4px 12px;border-radius:20px;font-size:12px;border:1px solid ${timeDetailMonth===m?'var(--accent)':'var(--border)'};background:${timeDetailMonth===m?'var(--amber-light)':'transparent'};color:${timeDetailMonth===m?'var(--amber)':'var(--text-mid)'};cursor:pointer;font-family:inherit" onclick="setTimeDetailMonth('${m}','${tpId}')">${fmtMonth(m)}</button>`).join('')}
      </div>
      <div style="font-size:12px;color:var(--text-mid);margin-bottom:10px">${filtered.length} entries · ${fmtDurShort(filtered.reduce((s,e)=>s+(e.duration||0),0))}</div>
      ${filtered.length===0?'<div style="text-align:center;padding:20px;color:var(--text-mid);font-size:13px">No entries for this period</div>':
        filtered.map(e=>{const er=((e.duration||0)/3600)*(e.hourly_rate||r);
          return`<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--border)" onmouseover="this.querySelector('.da').style.opacity='1'" onmouseout="this.querySelector('.da').style.opacity='0'">
            <div style="font-size:12px;color:var(--text-mid);min-width:65px">${formatDateLbl(e.date)}</div>
            <div style="flex:1;font-size:13px;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${th(e.description||'—')}</div>
            <div style="font-size:11px;color:var(--text-mid);white-space:nowrap">${e.start_time||''} – ${e.end_time||''}</div>
            <div style="font-weight:500;min-width:44px;text-align:right;color:var(--text)">${fmtDurShort(e.duration)}</div>
            ${er>0?`<div style="font-size:12px;color:var(--text-mid);min-width:54px;text-align:right">${formatCurrency(er)}</div>`:'<div style="min-width:54px"></div>'}
            ${e.invoiced?`<span class="badge b-complete" style="font-size:10px;padding:2px 6px">Invoiced</span>`:'<div style="min-width:58px"></div>'}
            <div class="da" style="display:flex;gap:4px;opacity:0;transition:opacity .15s">
              <button class="btn btn-ghost btn-sm" style="padding:3px 6px" onclick="editTimeEntry('${e.id}')">✎</button>
              <button class="btn btn-ghost btn-sm" style="padding:3px 6px;color:var(--red)" onclick="deleteTimeEntry('${e.id}')">✕</button>
            </div>
          </div>`;}).join('')}
    </div>`;
}

function setTimeDetailMonth(m,tpId){timeDetailMonth=m;renderTimeProjectDetail(tpId);}

function renderProjectClockIn(studioProjectId){
  const c=document.getElementById('project-clock-in-widget');
  if(!c)return;
  const project=(typeof allProjects!=='undefined'?allProjects:[]).find(p=>p.id===studioProjectId);
  const isRunHere=runningEntry&&String(runningEntry.project_id)===String(studioProjectId);
  const projEntries=timeEntries.filter(e=>String(e.project_id)===String(studioProjectId)&&e.duration&&!e.running);
  const totSec=projEntries.reduce((s,e)=>s+(e.duration||0),0);
  const rate=project?parseFloat(project.hourly_rate)||parseFloat(project.rate)||0:0;
  const totEarn=(totSec/3600)*rate;
  const todayStr=new Date().toISOString().slice(0,10);
  const todaySec=projEntries.filter(e=>e.date===todayStr).reduce((s,e)=>s+(e.duration||0),0);

  const div=document.createElement('div');
  div.className='info-card';

  let html='<div class="info-card-title">Time</div>';

  if(isRunHere){
    html+='<div style="background:var(--green-light);border:1px solid rgba(13,150,96,.2);border-radius:var(--r);padding:12px;margin-bottom:12px;display:flex;align-items:center;gap:10px">'
      +'<div style="width:8px;height:8px;border-radius:50%;background:var(--green);animation:timerPulse 1.2s ease-in-out infinite;flex-shrink:0"></div>'
      +'<div style="flex:1"><div style="font-size:13px;font-weight:500;color:var(--green)">Timer running</div>'
      +'<div class="live-timer-display" style="font-size:20px;font-weight:600;color:var(--green)">'+fmtDur(timerSeconds)+'</div></div>'
      +'<button class="btn btn-red btn-sm" id="pct-stop">Stop</button>'
      +'</div>';
  }else{
    html+='<div style="display:flex;flex-direction:column;gap:7px;margin-bottom:12px">'
      +'<input type="text" id="proj-clock-desc" placeholder="What are you working on?" style="padding:8px 12px;border:1.5px solid var(--border);border-radius:var(--r);font-family:inherit;font-size:13px;color:var(--text);background:var(--surface2);outline:none">'
      +'<button class="btn btn-green btn-full btn-sm" id="pct-start">Clock In</button>'
      +'</div>';
  }

  const uninvEntries=projEntries.filter(e=>!e.invoiced);
  const uninvSec=uninvEntries.reduce((s,e)=>s+(e.duration||0),0);
  const uninvEarn=rate>0?(uninvSec/3600)*rate:0;

  html+='<div style="border-top:1px solid var(--border);padding-top:10px;display:flex;flex-direction:column;gap:5px">'
    +'<div style="display:flex;justify-content:space-between;font-size:13px"><span style="color:var(--text-mid)">Today</span>'
    +'<span style="font-weight:500;color:var(--text)">'+fmtDurShort(todaySec+(isRunHere?timerSeconds:0))+'</span></div>'
    +'<div style="display:flex;justify-content:space-between;font-size:13px"><span style="color:var(--text-mid)">Total logged</span>'
    +'<span style="font-weight:500;color:var(--text)">'+fmtDurShort(totSec)+'</span></div>'
    +(rate>0?'<div style="display:flex;justify-content:space-between;font-size:13px"><span style="color:var(--text-mid)">Total earned</span>'
      +'<span style="font-weight:500;color:var(--text)">'+formatCurrency(totEarn)+'</span></div>':'')
    +(uninvEntries.length>0?'<div style="background:var(--amber-light);border-radius:12px;padding:10px 12px;margin-top:6px;">'
      +'<div style="font-size:11.5px;font-weight:700;color:var(--amber);margin-bottom:6px;">'
      +uninvEntries.length+' uninvoiced entr'+(uninvEntries.length===1?'y':'ies')+(rate>0?' · '+formatCurrency(uninvEarn):'')
      +'</div>'
      +'<button class="btn btn-full btn-sm" id="pct-invoice" style="background:var(--amber);color:#fff;border:none;font-size:12px;">Invoice uninvoiced time</button>'
      +'</div>':'')
    +'<button class="btn btn-ghost btn-full btn-sm" id="pct-view" style="margin-top:4px;font-size:11px;">View all time</button>'
    +'</div>';

  div.innerHTML=html;
  c.innerHTML='';
  c.appendChild(div);

  // Attach handlers (no inline JS = no quoting issues)
  const startBtn=c.querySelector('#pct-start');
  if(startBtn)startBtn.onclick=function(){
    const desc=document.getElementById('proj-clock-desc')?.value.trim()||'';
    clockIn(null,desc,studioProjectId);
  };
  const stopBtn=c.querySelector('#pct-stop');
  if(stopBtn)stopBtn.onclick=clockOut;
  const viewBtn=c.querySelector('#pct-view');
  if(viewBtn)viewBtn.onclick=function(){showPage('time',document.getElementById('nav-time'));};
  const invBtn=c.querySelector('#pct-invoice');
  if(invBtn)invBtn.onclick=function(){openTimeInvoiceModal(null,studioProjectId);};
}




function openTimeProjectModal(tpId=null,linkedProjId=null){
  document.getElementById('tp-edit-id').value=tpId||'';
  document.getElementById('tp-linked-project').value=linkedProjId||'';
  ['tp-name','tp-client','tp-rate','tp-notes','tp-budget'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('tp-budget-type').value='none';
  document.getElementById('tp-budget-group').style.display='none';
  const ss=document.getElementById('tp-studio-project-select');
  if(ss){ss.innerHTML='<option value="">No linked studio project</option>'+(allProjects||[]).map(p=>`<option value="${p.id}">${th(p.name)}</option>`).join('');}
  let selColor=TIME_COLORS[timeProjects.length%TIME_COLORS.length];
  if(tpId){
    const tp=getTP(tpId);
    if(tp){
      document.getElementById('tp-name').value=tp.name||'';
      document.getElementById('tp-client').value=tp.client||'';
      document.getElementById('tp-rate').value=tp.rate||'';
      document.getElementById('tp-notes').value=tp.notes||'';
      document.getElementById('tp-budget-type').value=tp.budget_type||'none';
      document.getElementById('tp-budget').value=tp.budget||'';
      if(tp.budget_type&&tp.budget_type!=='none')document.getElementById('tp-budget-group').style.display='block';
      if(tp.project_id){document.getElementById('tp-linked-project').value=tp.project_id;if(ss)ss.value=tp.project_id;}
      selColor=tp.color||selColor;
    }
  }
  if(linkedProjId&&ss)ss.value=linkedProjId;
  renderTimeColorSwatches(selColor);
  openModal('time-project-modal');
}

function renderTimeColorSwatches(sel){
  const c=document.getElementById('tp-color-swatches');if(!c)return;
  c.innerHTML=TIME_COLORS.map(col=>`<div onclick="selectTimeColor(this)" data-color="${col}"
    style="width:26px;height:26px;border-radius:50%;background:${col};cursor:pointer;border:2.5px solid ${col===sel?'var(--ink)':'transparent'};transition:transform .1s,border-color .1s;flex-shrink:0"
    onmouseover="this.style.transform='scale(1.15)'" onmouseout="this.style.transform='scale(1)'"></div>`).join('');
}
function selectTimeColor(el){document.querySelectorAll('#tp-color-swatches div').forEach(s=>s.style.borderColor='transparent');el.style.borderColor='var(--ink)';}
function getSelectedTimeColor(){for(const s of document.querySelectorAll('#tp-color-swatches div')){if(s.style.borderColor&&s.style.borderColor!=='transparent'&&s.style.borderColor!=='')return s.dataset.color;}return TIME_COLORS[0];}
function toggleTimeBudgetInput(){document.getElementById('tp-budget-group').style.display=document.getElementById('tp-budget-type').value==='none'?'none':'block';}

async function saveTimeProject(){
  const name=document.getElementById('tp-name').value.trim();
  if(!name){showToast('Project name is required','error');return;}
  const tpId=document.getElementById('tp-edit-id').value;
  const ss=document.getElementById('tp-studio-project-select');
  const linkedProjId=ss?.value||document.getElementById('tp-linked-project').value||null;
  const data={owner_id:currentUser.id,name,
    client:document.getElementById('tp-client').value.trim()||null,
    rate:parseFloat(document.getElementById('tp-rate').value)||0,
    notes:document.getElementById('tp-notes').value.trim()||null,
    budget_type:document.getElementById('tp-budget-type').value||'none',
    budget:parseFloat(document.getElementById('tp-budget').value)||0,
    project_id:linkedProjId||null,color:getSelectedTimeColor(),archived:false};
  let error;
  if(tpId)({error}=await db.from('time_projects').update(data).eq('id',tpId));
  else({error}=await db.from('time_projects').insert(data));
  if(error){showToast('Failed to save: '+error.message,'error');return;}
  await loadTimeData();
  closeModal('time-project-modal');
  showToast(tpId?'Project updated!':'Project created!','success');
  updateTimerSidebarWidget();refreshTimeUI();updateDashboardClockWidget();
}

function openManualTimeEntry(presetId=null){
  document.getElementById('te-edit-id').value='';
  document.getElementById('te-date').value=todayStr();
  document.getElementById('te-start').value='';
  document.getElementById('te-end').value='';
  document.getElementById('te-desc').value='';
  const rateEl=document.getElementById('te-hourly-rate');
  if(rateEl)rateEl.value='';
  const sel=document.getElementById('te-project');
  if(sel){
    const options=['<option value="">No project</option>'];
    if(typeof allProjects!=='undefined'&&allProjects.length){
      options.push('<optgroup label="Projects">');
      allProjects.forEach(p=>options.push(`<option value="sp:${p.id}">${th(p.name)}${p.hourly_rate?' (£'+p.hourly_rate+'/hr)':''}</option>`));
      options.push('</optgroup>');
    }
    if(timeProjects.filter(p=>!p.archived).length){
      options.push('<optgroup label="Time Projects">');
      timeProjects.filter(p=>!p.archived).forEach(p=>options.push(`<option value="tp:${p.id}">${th(p.name)}${p.rate?' (£'+p.rate+'/hr)':''}</option>`));
      options.push('</optgroup>');
    }
    sel.innerHTML=options.join('');
    if(presetId)sel.value=`sp:${presetId}`;
  }
  openModal('time-entry-modal');
}

async function editTimeEntry(entryId){
  const e=timeEntries.find(x=>String(x.id)===String(entryId));if(!e)return;
  const sel=document.getElementById('te-project');
  if(sel){
    // Populate with studio projects (primary) + any time projects
    const options=['<option value="">No project</option>'];
    // Studio projects
    if(typeof allProjects!=='undefined'&&allProjects.length){
      options.push('<optgroup label="Projects">');
      allProjects.forEach(p=>options.push(`<option value="sp:${p.id}">${th(p.name)}${p.hourly_rate?' (£'+p.hourly_rate+'/hr)':''}</option>`));
      options.push('</optgroup>');
    }
    // Time-only projects
    if(timeProjects.filter(p=>!p.archived).length){
      options.push('<optgroup label="Time Projects">');
      timeProjects.filter(p=>!p.archived).forEach(p=>options.push(`<option value="tp:${p.id}">${th(p.name)}${p.rate?' (£'+p.rate+'/hr)':''}</option>`));
      options.push('</optgroup>');
    }
    sel.innerHTML=options.join('');
    // Set current value
    if(e.project_id)sel.value=`sp:${e.project_id}`;
    else if(e.time_project_id)sel.value=`tp:${e.time_project_id}`;
  }
  document.getElementById('te-edit-id').value=e.id;
  document.getElementById('te-desc').value=e.description||'';
  document.getElementById('te-date').value=e.date||'';
  document.getElementById('te-start').value=e.start_time||'';
  document.getElementById('te-end').value=e.end_time||'';
  // Hourly rate override
  const rateEl=document.getElementById('te-hourly-rate');
  if(rateEl)rateEl.value=e.hourly_rate||getEntryRate(e)||'';
  openModal('time-entry-modal');
}

async function saveTimeEntry(){
  const rawProj=document.getElementById('te-project').value;
  const desc=document.getElementById('te-desc').value.trim();
  const date=document.getElementById('te-date').value;
  const start=document.getElementById('te-start').value;
  const end=document.getElementById('te-end').value;
  const editId=document.getElementById('te-edit-id').value;
  const hourlyRate=parseFloat(document.getElementById('te-hourly-rate')?.value)||null;
  if(!date||!start||!end){showToast('Date, start and end time are required','error');return;}
  const startParts=start.split(':').map(Number);
  const endParts=end.split(':').map(Number);
  const sh=startParts[0],sm=startParts[1];
  const eh=endParts[0],em=endParts[1];
  const durMins=(eh*60+em)-(sh*60+sm);
  if(durMins<=0){showToast('End time must be after start time','error');return;}
  // Parse sp:/tp: prefix
  let studioProjectId=null,timeProjectId=null;
  if(rawProj.startsWith('sp:'))studioProjectId=rawProj.slice(3);
  else if(rawProj.startsWith('tp:'))timeProjectId=rawProj.slice(3);
  const updateRow={
    time_project_id:timeProjectId||null,
    project_id:studioProjectId||null,
    description:desc||null,
    date,start_time:start,end_time:end,
    duration:durMins*60,
    hourly_rate:hourlyRate||null,
    running:false
  };
  let error;
  if(editId){
    ({error}=await db.from('time_entries').update(updateRow).eq('id',editId));
  }else{
    ({error}=await db.from('time_entries').insert({...updateRow,owner_id:currentUser.id,invoiced:false}));
  }
  if(error){showToast('Error: '+error.message,'error');console.error('saveTimeEntry error:',error);return;}
  await loadTimeData();closeModal('time-entry-modal');
  showToast(editId?'Entry updated!':'Entry added!','success');
  refreshTimeUI();updateDashboardClockWidget();
}

async function deleteTimeEntry(entryId){
  if(!window.confirm('Delete this time entry?'))return;
  await db.from('time_entries').delete().eq('id',entryId);
  timeEntries=timeEntries.filter(e=>String(e.id)!==String(entryId));
  showToast('Entry deleted');refreshTimeUI();updateDashboardClockWidget();
  if(typeof renderDashboard==='function')renderDashboard();
}

async function quickClockIn(tpId,name){
  if(runningEntry){const tp=getTP(runningEntry.time_project_id);if(!window.confirm(`Stop "${tp?.name||'current timer'}" and start "${name}"?`))return;}
  await clockIn(tpId,'');
}

function openTimeInvoiceModal(tpId,studioProjectId=null){
  // Supports both time projects (tpId) and studio projects (studioProjectId)
  let name,rate,uninv,linkedProjectId;

  if(tpId){
    const tp=getTP(tpId);if(!tp)return;
    name=tp.name;rate=tp.rate||0;linkedProjectId=tp.project_id||null;
    uninv=timeEntries.filter(e=>String(e.time_project_id)===String(tpId)&&!e.invoiced&&e.duration);
  } else if(studioProjectId){
    const sp=(typeof allProjects!=='undefined'?allProjects:[]).find(p=>String(p.id)===String(studioProjectId));
    if(!sp)return;
    name=sp.name;rate=parseFloat(sp.hourly_rate)||0;linkedProjectId=studioProjectId;
    uninv=timeEntries.filter(e=>String(e.project_id)===String(studioProjectId)&&!e.invoiced&&e.duration);
  } else return;

  if(!uninv.length){showToast('No uninvoiced entries for this project','error');return;}
  const totSec=uninv.reduce((s,e)=>s+(e.duration||0),0);
  const sub=(totSec/3600)*rate;
  document.getElementById('ti-project-name').textContent=name;
  document.getElementById('ti-entries-count').textContent=`${uninv.length} ${uninv.length===1?'entry':'entries'} · ${fmtDurShort(totSec)}`;
  document.getElementById('ti-subtotal').textContent=formatCurrency(sub);
  document.getElementById('ti-total').textContent=formatCurrency(sub*1.2);
  document.getElementById('ti-tp-id').value=tpId||('sp:'+studioProjectId);
  document.getElementById('ti-inv-number').value=`TIME-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`;
  document.getElementById('ti-due-date').value=todayStr();
  document.getElementById('ti-tax').value='20';
  document.getElementById('ti-notes').value='';
  openModal('time-invoice-modal');
}

async function createTimeInvoice(){
  const rawId=document.getElementById('ti-tp-id').value;
  const isStudioProj=rawId.startsWith('sp:');
  const tax=parseFloat(document.getElementById('ti-tax').value)||0;

  let name,rate,uninv,linkedProjectId;

  if(isStudioProj){
    const spId=rawId.slice(3);
    const sp=(typeof allProjects!=='undefined'?allProjects:[]).find(p=>String(p.id)===String(spId));
    if(!sp){showToast('Project not found','error');return;}
    name=sp.name;rate=parseFloat(sp.hourly_rate)||0;linkedProjectId=spId;
    uninv=timeEntries.filter(e=>String(e.project_id)===String(spId)&&!e.invoiced&&e.duration);
  } else {
    const tp=getTP(rawId);if(!tp){showToast('Time project not found','error');return;}
    name=tp.name;rate=tp.rate||0;linkedProjectId=tp.project_id||null;
    uninv=timeEntries.filter(e=>String(e.time_project_id)===String(rawId)&&!e.invoiced&&e.duration);
  }

  if(!uninv.length){showToast('No uninvoiced entries','error');return;}
  const totSec=uninv.reduce((s,e)=>s+(e.duration||0),0);
  const sub=(totSec/3600)*rate;
  const taxAmt=sub*(tax/100);
  const share_token=crypto.randomUUID();

  const lineItems=uninv.map(e=>{
    const hrs=((e.duration||0)/3600);
    const entryRate=e.hourly_rate||rate;
    return{
      description:(e.description||'Time')+' — '+new Date(e.date+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}),
      rate:entryRate,
      qty:Math.round(hrs*100)/100,
      total:hrs*entryRate
    };
  });

  const{error}=await db.from('invoices').insert({
    owner_id:currentUser.id,
    project_id:linkedProjectId||null,
    invoice_number:document.getElementById('ti-inv-number').value.trim(),
    line_items:lineItems,
    subtotal:sub,total:sub+taxAmt,
    due_date:document.getElementById('ti-due-date').value||null,
    notes:document.getElementById('ti-notes').value||null,
    share_token,
    status:'draft',
    sent_at:null
  });
  if(error){showToast('Failed to create invoice: '+error.message,'error');return;}
  await db.from('time_entries').update({invoiced:true}).in('id',uninv.map(e=>e.id));
  await loadTimeData();
  if(typeof loadInvoices==='function')await loadInvoices();
  closeModal('time-invoice-modal');
  showToast('Invoice created from '+uninv.length+' time entries!','success');
  refreshTimeUI();
}

async function clockInDirectly(studioProjectId){
  const desc=document.getElementById('proj-clock-desc')?.value.trim()||'';
  await clockIn(null,desc,studioProjectId);
}
