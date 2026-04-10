/* js/app.js — Studio Portal v6 */

const PROJECT_COLORS = [
  '#6c5ce7','#0d9660','#1d4ed8','#be185d','#0e7490',
  '#a35c07','#c0392b','#7c3aed','#0891b2','#b45309'
];

let currentUser = null;
let currentProfile = null;
let allClients = [];
let allProjects = [];
let allInvoices = [];
let allBookings = [];
let currentProjectId = null;
let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth();
let lineItemCount = 0;

/* ══════════════════════════════════════════
   INIT
══════════════════════════════════════════ */
(async function init() {
  initTheme();
  updateThemeIcon();
  initModals();
  const { data: { session } } = await db.auth.getSession();
  if (!session) { window.location.href = 'index.html'; return; }
  currentUser = session.user;
  await loadProfile();
  await Promise.all([loadClients(), loadProjects(), loadInvoices()]);
  await loadTimeData();
  renderDashboard();
  populateSelects();
  populateTimeProjectSelects();
  document.getElementById('portal-url').value = 'https://sendzest.github.io/Studio-portal/portal.html';
  db.auth.onAuthStateChange((event, session) => { if (!session) window.location.href = 'index.html'; });
})();

/* ══════════════════════════════════════════
   HELPERS
══════════════════════════════════════════ */
function escapeHtml(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function formatCurrency(n,cur='GBP'){return new Intl.NumberFormat('en-GB',{style:'currency',currency:cur}).format(n||0);}
function formatDate(d){if(!d)return'—';return new Date(d).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});}
function formatDateShort(d){if(!d)return'—';return new Date(d).toLocaleDateString('en-GB',{day:'numeric',month:'short'});}
function formatDateTime(d){if(!d)return'—';return new Date(d).toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});}
function timeAgo(d){const diff=Date.now()-new Date(d);const m=Math.floor(diff/60000);if(m<1)return'just now';if(m<60)return m+'m ago';const h=Math.floor(m/60);if(h<24)return h+'h ago';const days=Math.floor(h/24);if(days<7)return days+'d ago';return formatDateShort(d);}
function initials(n){if(!n)return'?';return n.split(' ').map(x=>x[0]).join('').toUpperCase().slice(0,2);}
function isOverdue(d){if(!d)return false;return new Date(d)<new Date();}
function avatarColor(s){const cols=[{bg:'#ede9ff',color:'#7c6af0'},{bg:'#e3f9f0',color:'#22a06b'},{bg:'#dbeafe',color:'#2563eb'},{bg:'#fce7f3',color:'#db2777'},{bg:'#cffafe',color:'#0891b2'},{bg:'#fef3c7',color:'#b45309'}];let h=0;for(let c of(s||''))h=c.charCodeAt(0)+((h<<5)-h);return cols[Math.abs(h)%cols.length];}
function statusBadge(s){const m={paid:'b-complete',complete:'b-complete',signed:'b-signed',sent:'b-booked',booked:'b-booked',in_progress:'b-in-progress',pending:'b-pending',overdue:'b-overdue',draft:'b-draft',enquiry:'b-draft',delivered:'b-pending',cancelled:'b-draft',confirmed:'b-booked'};const l={paid:'Paid',complete:'Complete',signed:'Signed',sent:'Sent',booked:'Booked',in_progress:'In Progress',pending:'Pending',overdue:'Overdue',draft:'Draft',enquiry:'Enquiry',delivered:'Delivered',cancelled:'Cancelled',confirmed:'Confirmed'};return`<span class="badge ${m[s]||'b-draft'}">${l[s]||s}</span>`;}
function renderTimeline(status){const stages=[{key:'enquiry',label:'Enquiry'},{key:'booked',label:'Booked'},{key:'in_progress',label:'In Progress'},{key:'delivered',label:'Delivered'},{key:'complete',label:'Complete'}];const cur=stages.findIndex(s=>s.key===status);return`<div class="status-timeline">${stages.map((s,i)=>`<div class="tl-step ${i<cur?'done':i===cur?'current':''}">${i<stages.length-1?'':''}<div class="tl-dot">${i<cur?'✓':i===cur?'→':''}</div><div class="tl-label">${s.label}</div></div>`).join('')}</div>`;}
function formatBytes(b){if(!b)return'—';if(b<1024)return b+' B';if(b<1048576)return(b/1024).toFixed(1)+' KB';return(b/1048576).toFixed(1)+' MB';}
function fileIcon(m){if(!m)return'📄';if(m.startsWith('image/'))return'🖼️';if(m==='application/pdf')return'📋';if(m.includes('spreadsheet')||m.includes('excel'))return'📊';if(m.includes('word')||m.includes('document'))return'📝';if(m.includes('zip')||m.includes('archive'))return'🗜';return'📄';}
function updateThemeIcon(){const t=localStorage.getItem('theme')||'light';document.querySelectorAll('.theme-toggle').forEach(b=>b.textContent=t==='dark'?'☀️':'🌙');}

/* ══════════════════════════════════════════
   THEME
══════════════════════════════════════════ */
function initTheme(){const s=localStorage.getItem('theme')||'light';document.documentElement.setAttribute('data-theme',s);}
function toggleTheme(){const c=document.documentElement.getAttribute('data-theme');const n=c==='dark'?'light':'dark';document.documentElement.setAttribute('data-theme',n);localStorage.setItem('theme',n);updateThemeIcon();}

/* ══════════════════════════════════════════
   MODALS
══════════════════════════════════════════ */
function initModals(){document.querySelectorAll('.modal-overlay').forEach(o=>o.addEventListener('click',e=>{if(e.target===o)o.classList.remove('open');}));}
function openModal(id){const el=document.getElementById('modal-'+id);if(el)el.classList.add('open');if(id==='new-invoice'){populateInvoiceNumber();if(!document.getElementById('line-items-body').children.length)addLineItem();}}
function closeModal(id){const el=document.getElementById('modal-'+id);if(el)el.classList.remove('open');}
function showToast(msg,type=''){const t=document.getElementById('toast');if(!t)return;t.textContent=msg;t.className='toast show'+(type?' '+type:'');clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove('show'),3000);}

/* ══════════════════════════════════════════
   NAVIGATION
══════════════════════════════════════════ */
function showPage(id,btn){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  const page=document.getElementById('page-'+id);
  if(page)page.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  if(btn)btn.classList.add('active');
  window.scrollTo(0,0);
  if(id==='time')renderTimePage();
  if(id==='scheduling')renderCalendar();
  if(id==='files')loadFiles();
  if(id==='notes')loadNotes();
  if(id==='notifications')loadNotificationSettings();
  if(id==='settings')populateSettings();
  if(id==='clients')renderClients();
  if(id==='invoices')renderInvoicesPage();
  if(id==='contracts')loadContracts();
  if(id==='projects'){renderProjectList();}
}

async function signOut(){await db.auth.signOut();window.location.href='index.html';}

function openClientPortal(clientEmail){
  const url='portal.html'+(clientEmail?'?client='+encodeURIComponent(clientEmail):'');
  window.open(url,'_blank');
}

/* ══════════════════════════════════════════
   DATA
══════════════════════════════════════════ */
async function loadProfile(){const{data}=await db.from('profiles').select('*').eq('id',currentUser.id).single();currentProfile=data||{};const name=currentProfile.full_name||currentProfile.business_name||currentUser.email.split('@')[0];document.getElementById('user-name').textContent=name;const av=document.getElementById('user-avatar');av.textContent=initials(name);const col=avatarColor(name);av.style.background=col.bg;av.style.color=col.color;}
async function loadClients(){const{data}=await db.from('clients').select('*').eq('owner_id',currentUser.id).order('first_name');allClients=data||[];}
async function loadProjects(){const{data}=await db.from('projects').select('*, clients(first_name, last_name, email)').eq('owner_id',currentUser.id).order('created_at',{ascending:false});allProjects=data||[];}
async function loadInvoices(){const{data}=await db.from('invoices').select('*, clients(first_name, last_name), projects(name)').eq('owner_id',currentUser.id).order('created_at',{ascending:false});allInvoices=data||[];updateInvoiceBadge();}
function updateInvoiceBadge(){const n=allInvoices.filter(i=>i.status==='sent'&&i.due_date&&isOverdue(i.due_date)).length;const el=document.getElementById('nav-invoices');if(!el)return;el.querySelector('.nav-badge')?.remove();if(n>0)el.insertAdjacentHTML('beforeend',`<span class="nav-badge">${n}</span>`);}

/* ══════════════════════════════════════════
   DASHBOARD — project list + time widget
══════════════════════════════════════════ */
async function renderDashboard(){
  const revenue=allInvoices.filter(i=>i.status==='paid').reduce((s,i)=>s+(i.total||0),0);
  const active=allProjects.filter(p=>!['complete','cancelled'].includes(p.status));
  const unpaidTotal=allInvoices.filter(i=>['sent','overdue'].includes(i.status)).reduce((s,i)=>s+((i.total||0)-(i.amount_paid||0)),0);
  const overdue=allInvoices.filter(i=>i.status==='sent'&&i.due_date&&isOverdue(i.due_date));
  const todayH=typeof getTodayH==='function'?getTodayH():0;
  const todayE=typeof getTodayE==='function'?getTodayE():0;
  const weekH=typeof getWeekH==='function'?getWeekH():0;

  // Row 1: Stats
  document.getElementById('stats-row').innerHTML=`
    <div class="stat-card neon">
      <div class="stat-label">Today</div>
      <div class="stat-value">${typeof fmtDurShort==='function'?fmtDurShort(todayH+(runningEntry?timerSeconds:0)):'0:00'}</div>
      <div class="stat-sub">${formatCurrency(todayE)} earned</div>
      <span class="stat-chip nk">▲ On track</span>
    </div>
    <div class="stat-card glass">
      <div class="stat-label">This week</div>
      <div class="stat-value">${typeof fmtDurShort==='function'?fmtDurShort(weekH):'0:00'}</div>
      <div class="stat-sub">${formatCurrency(typeof getWeekE==='function'?getWeekE():0)} earned</div>
      <span class="stat-chip g">▲ This week</span>
    </div>
    <div class="stat-card glass">
      <div class="stat-label">Unpaid</div>
      <div class="stat-value" style="${overdue.length>0?'color:var(--amber)':''}">${formatCurrency(unpaidTotal)}</div>
      <div class="stat-sub">${overdue.length>0?overdue.length+' overdue':allInvoices.filter(i=>i.status==='sent').length+' outstanding'}</div>
      <span class="stat-chip ${overdue.length>0?'a':'g'}">${overdue.length>0?'⚠ Overdue':'✓ On time'}</span>
    </div>
    <div class="stat-card dark">
      <div class="stat-label">Revenue YTD</div>
      <div class="stat-value">${formatCurrency(revenue)}</div>
      <div class="stat-sub">${allInvoices.filter(i=>i.status==='paid').length} paid invoices</div>
      <span class="stat-chip dk">▲ YTD</span>
    </div>`;

  // Row 2: Calendar + upcoming bookings
  await renderDashboardCalendar();

  // Row 3: Projects + week chart
  renderDashboardClockWidget();
  renderWeekChart();

  const projContainer=document.getElementById('dashboard-projects');
  if(!projContainer)return;
  const shown=allProjects.filter(p=>p.status!=='complete'&&p.status!=='cancelled').slice(0,6);
  if(!shown.length){projContainer.innerHTML=`<div class="empty-state"><div class="empty-icon">📁</div><div class="empty-title">No active projects</div><button class="btn btn-accent" onclick="openModal('new-project')">+ New Project</button></div>`;return;}
  projContainer.innerHTML=shown.map(p=>renderProjectListItem(p)).join('');

  // Row 4: Quick note + Notion — wait for DOM
  setTimeout(()=>{
    renderDashboardNote();
    renderDashboardNotion();
  },0);
}

async function renderDashboardCalendar(){
  const container=document.getElementById('dashboard-calendar');
  if(!container)return;

  // Load bookings if not already loaded
  if(!allBookings.length){
    const{data}=await db.from('bookings').select('*, clients(first_name,last_name)').eq('owner_id',currentUser.id).order('start_at');
    allBookings=data||[];
  }

  const today=new Date();
  const days=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  // Get Mon of this week
  const mon=new Date(today);
  mon.setDate(today.getDate()-((today.getDay()+6)%7));

  const weekDays=days.map((name,i)=>{
    const d=new Date(mon);d.setDate(mon.getDate()+i);
    const ds=d.toISOString().slice(0,10);
    const isToday=ds===today.toISOString().slice(0,10);
    const hasBook=allBookings.some(b=>b.start_at.startsWith(ds));
    return{name,date:d.getDate(),ds,isToday,hasBook};
  });

  // Upcoming bookings (next 3)
  const upcoming=allBookings
    .filter(b=>new Date(b.start_at)>=new Date())
    .slice(0,3);

  container.innerHTML=`
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
      <div class="section-title">This week</div>
      <span style="font-size:12px;color:var(--text-mid);font-weight:600;">${today.toLocaleDateString('en-GB',{month:'long',year:'numeric'})}</span>
    </div>
    <div class="cal-strip-row">
      ${weekDays.map(d=>`
        <div class="cal-strip-day${d.isToday?' today':''}">
          <div class="cal-strip-dow">${d.name}</div>
          <div class="cal-strip-num">${d.date}</div>
          <div class="cal-strip-pip${d.hasBook?' on':''}"></div>
        </div>`).join('')}
    </div>
    ${upcoming.length?`
      <div style="border-top:1px solid var(--border);padding-top:12px;display:flex;flex-direction:column;gap:7px;">
        ${upcoming.map(b=>{
          const diff=new Date(b.start_at)-new Date();
          const hrs=Math.floor(diff/3600000);
          const mins=Math.floor((diff%3600000)/60000);
          const when=diff<0?'Now':hrs<1?`in ${mins}m`:hrs<24?`in ${hrs}h`:`${formatDateShort(b.start_at)}`;
          const isToday=b.start_at.startsWith(today.toISOString().slice(0,10));
          const client=b.clients?`${b.clients.first_name} ${b.clients.last_name}`:'';
          return`<div class="bk-row ${isToday?'dark':'soft'}">
            <div class="bk-ico">📅</div>
            <div style="flex:1;min-width:0;">
              <div class="bk-name">${escapeHtml(b.title)}</div>
              <div class="bk-time">${isToday?new Date(b.start_at).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}):formatDateShort(b.start_at)}${client?' · '+escapeHtml(client):''}</div>
            </div>
            <span class="bk-when">${when}</span>
          </div>`;
        }).join('')}
      </div>`:'<div style="font-size:12px;color:var(--text-mid);text-align:center;padding:8px 0;">No upcoming bookings</div>'}
  `;
}

function renderWeekChart(){
  const container=document.getElementById('dashboard-week-chart');
  if(!container)return;

  const today=new Date();
  const mon=new Date(today);mon.setDate(today.getDate()-((today.getDay()+6)%7));
  const days=['M','Tu','W','Th','F','Sa','Su'];
  const vals=days.map((_,i)=>{
    const d=new Date(mon);d.setDate(mon.getDate()+i);
    const ds=d.toISOString().slice(0,10);
    const secs=timeEntries.filter(e=>e.date===ds&&e.duration&&!e.running).reduce((s,e)=>s+(e.duration||0),0);
    return{label:days[i],ds,secs,isToday:ds===today.toISOString().slice(0,10),isFuture:d>today};
  });

  const max=Math.max(...vals.map(v=>v.secs),1);
  const weekH=typeof getWeekH==='function'?getWeekH():0;
  const weekE=typeof getWeekE==='function'?getWeekE():0;

  container.innerHTML=`
    <div class="section-title" style="margin-bottom:12px;">Hours this week</div>
    <div class="week-bars">
      ${vals.map(v=>{
        const pct=v.secs/max*100;
        const cls=v.isToday?'week-bar today-bar':v.secs>0?'week-bar filled':'week-bar';
        return`<div class="${cls}" style="height:${Math.max(pct,4)}%;"></div>`;
      }).join('')}
    </div>
    <div class="week-bar-days">
      ${vals.map((v,i)=>`<div class="week-bar-day${v.isToday?' today':''}">${v.label}</div>`).join('')}
    </div>
    <div class="week-total-row">
      <div>
        <div class="week-total-val">${typeof fmtDurShort==='function'?fmtDurShort(weekH):'0:00'}</div>
        <div class="week-total-lbl">${formatCurrency(weekE)} earned</div>
      </div>
      <span class="stat-chip g">▲ This week</span>
    </div>
  `;
}

let noteTimer=null;
function renderDashboardNote(){
  const container=document.getElementById('dashboard-note');
  if(!container)return;
  const saved=currentProfile?.dashboard_note||'';
  container.innerHTML=`
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
      <div style="font-size:13px;font-weight:500;color:var(--text);">Quick note</div>
      <span style="font-size:11px;color:var(--text-mid);" id="note-save-status">Saves automatically</span>
    </div>
    <textarea id="dashboard-note-area" rows="6" placeholder="Jot something down — it saves as you type…"
      style="width:100%;resize:none;border:1.5px solid var(--border);border-radius:var(--r);padding:10px 12px;font-family:inherit;font-size:13px;color:var(--text);background:var(--surface2);outline:none;line-height:1.6;transition:border-color .18s;"
      onfocus="this.style.borderColor='var(--accent)';this.style.background='var(--surface)'"
      onblur="this.style.borderColor='var(--border)';this.style.background='var(--surface2)'"
    >${escapeHtml(saved)}</textarea>
  `;
  document.getElementById('dashboard-note-area').addEventListener('input',function(){
    clearTimeout(noteTimer);
    document.getElementById('note-save-status').textContent='Saving…';
    noteTimer=setTimeout(async()=>{
      const val=this.value;
      await db.from('profiles').update({dashboard_note:val}).eq('id',currentUser.id);
      if(currentProfile)currentProfile.dashboard_note=val;
      document.getElementById('note-save-status').textContent='Saved';
      setTimeout(()=>{const el=document.getElementById('note-save-status');if(el)el.textContent='Saves automatically';},2000);
    },800);
  });
}

async function renderDashboardNotion(){
  const container=document.getElementById('dashboard-notion');
  if(!container)return;

  const notionToken=currentProfile?.notion_token;

  const header=`
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
      <div style="display:flex;align-items:center;gap:7px;">
        <div style="width:16px;height:16px;background:var(--text);border-radius:3px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <span style="font-size:10px;font-weight:700;color:var(--surface);font-family:serif;line-height:1;">N</span>
        </div>
        <div style="font-size:13px;font-weight:500;color:var(--text);">Notion</div>
      </div>
    </div>`;

  if(!notionToken){
    container.innerHTML=header+`
      <div id="notion-pages-list" style="display:flex;flex-direction:column;gap:6px;">
        <div style="font-size:12px;color:var(--text-mid);background:var(--surface2);border-radius:var(--r);padding:12px;line-height:1.6;text-align:center;">
          Connect Notion in Settings to see your recent pages here.
        </div>
        <a href="app.html#settings" style="display:block;text-align:center;font-size:12px;color:var(--accent);margin-top:6px;cursor:pointer;" onclick="showPage('settings',document.getElementById('nav-settings'))">Set up Notion →</a>
      </div>`;
    return;
  }

  container.innerHTML=header+`
    <div id="notion-pages-list" style="display:flex;flex-direction:column;gap:6px;">
      <div style="font-size:12px;color:var(--text-mid);text-align:center;padding:12px 0;">Loading recent pages…</div>
    </div>`;

  loadNotionPages(notionToken);
}



function renderProjectListItem(p){
  const clientName=p.clients?`${p.clients.first_name} ${p.clients.last_name}`:'No client';
  const projInvoices=allInvoices.filter(i=>i.project_id===p.id);
  const outstanding=projInvoices.filter(i=>['sent','overdue'].includes(i.status)).reduce((s,i)=>s+((i.total||0)-(i.amount_paid||0)),0);
  const lastEntry=timeEntries.filter(e=>e.project_id===p.id&&e.duration).sort((a,b)=>b.date.localeCompare(a.date))[0];
  const isRunning=runningEntry&&runningEntry.project_id===p.id;
  const color=p.color||PROJECT_COLORS[0];
  const col=avatarColor(clientName);
  const stages=p.stages||[];
  const doneStages=stages.filter(s=>s.done).length;
  const totalStages=stages.length;
  return`<div class="proj-list-item" onclick="openProject('${p.id}')">
    <div class="proj-color-bar" style="background:${color}"></div>
    <div class="proj-avatar" style="background:${col.bg};color:${col.color};width:38px;height:38px;font-size:12px;font-weight:700;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${initials(clientName)}</div>
    <div style="flex:1;min-width:0">
      <div style="font-weight:600;font-size:14px;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(p.name)}</div>
      <div style="font-size:12px;color:var(--text-mid)">${escapeHtml(clientName)} · ${p.service_type||'Project'}</div>
      ${totalStages>0?`<div style="margin-top:5px;display:flex;align-items:center;gap:6px"><div style="flex:1;height:4px;background:var(--border);border-radius:2px;overflow:hidden"><div style="height:100%;background:${color};border-radius:2px;width:${Math.round(doneStages/totalStages*100)}%"></div></div><div style="font-size:11px;color:var(--text-mid)">${doneStages}/${totalStages}</div></div>`:''}
    </div>
    <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0">
      ${statusBadge(p.status)}
      ${outstanding>0?`<div style="font-size:11.5px;color:var(--amber);font-weight:500">${formatCurrency(outstanding)} due</div>`:''}
      ${lastEntry?`<div style="font-size:11px;color:var(--text-mid)">⏱ ${timeAgo(lastEntry.date+' '+lastEntry.start_time)}</div>`:''}
    </div>
    <div onclick="event.stopPropagation()" style="display:flex;gap:6px;flex-shrink:0">
      ${isRunning
        ?`<button class="btn btn-red btn-sm" onclick="clockOut()">⏹ Stop</button>`
        :`<button class="btn btn-green btn-sm" onclick="clockInOnProject(event,'${p.id}')">▶ Clock In</button>`}
      <button class="btn btn-ghost btn-sm" style="color:var(--text-mid);font-size:11px;" onclick="event.stopPropagation();deleteProject('${p.id}','${escapeHtml(p.name)}')">✕</button>
    </div>
  </div>`;
}

async function deleteProject(projectId, name){
  if(!window.confirm(`Delete "${name}"? This will also delete all invoices, contracts, files and messages for this project. This cannot be undone.`))return;
  // Delete storage files first
  const{data:projectFiles}=await db.from('files').select('storage_path').eq('project_id',projectId);
  if(projectFiles?.length){
    await Promise.all(projectFiles.map(f=>db.storage.from('project-files').remove([f.storage_path])));
  }
  await Promise.all([
    db.from('invoices').delete().eq('project_id',projectId),
    db.from('contracts').delete().eq('project_id',projectId),
    db.from('files').delete().eq('project_id',projectId),
    db.from('messages').delete().eq('project_id',projectId),
    db.from('notes').delete().eq('project_id',projectId),
    db.from('bookings').delete().eq('project_id',projectId),
    db.from('time_entries').update({project_id:null}).eq('project_id',projectId),
    db.from('time_projects').update({project_id:null}).eq('project_id',projectId),
  ]);
  await db.from('projects').delete().eq('id',projectId);
  await loadProjects();
  await loadInvoices();
  renderProjectList();
  renderDashboard();
  showToast(`"${name}" deleted`,'success');
}

async function clockInOnProject(event,projectId){
  event.stopPropagation();
  const p=allProjects.find(x=>x.id===projectId);
  if(!p)return;
  const descInput=document.getElementById('proj-clock-desc');
  const desc=descInput?.value.trim()||'';
  await clockIn(null,desc,projectId);
}

/* ══════════════════════════════════════════
   PROJECTS PAGE
══════════════════════════════════════════ */
function renderProjectList(){
  const container=document.getElementById('proj-list-content');
  if(!container)return;
  if(!allProjects.length){container.innerHTML=`<div class="empty-state"><div class="empty-icon">📁</div><div class="empty-title">No projects yet</div><button class="btn btn-accent" onclick="openModal('new-project')">+ New Project</button></div>`;return;}
  const active=allProjects.filter(p=>!['complete','cancelled'].includes(p.status));
  const done=allProjects.filter(p=>['complete','cancelled'].includes(p.status));
  let html='';
  if(active.length){html+=`<div style="margin-bottom:24px"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.09em;color:var(--text-mid);margin-bottom:12px">Active (${active.length})</div>${active.map(renderProjectListItem).join('')}</div>`;}
  if(done.length){html+=`<div><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.09em;color:var(--text-mid);margin-bottom:12px">Completed (${done.length})</div>${done.map(renderProjectListItem).join('')}</div>`;}
  container.innerHTML=html;
}

/* ══════════════════════════════════════════
   PROJECT DETAIL
══════════════════════════════════════════ */
async function openProject(projectId){
  currentProjectId=projectId;
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById('page-project-detail').classList.add('active');
  document.getElementById('pd-content').innerHTML=`<div class="loading"><div class="spinner"></div> Loading project…</div>`;
  window.scrollTo(0,0);

  const[{data:project},{data:invoices},{data:contracts},{data:files},{data:messages},{data:notes}]=await Promise.all([
    db.from('projects').select('*, clients(*)').eq('id',projectId).single(),
    db.from('invoices').select('*').eq('project_id',projectId).order('created_at',{ascending:false}),
    db.from('contracts').select('*').eq('project_id',projectId).order('created_at',{ascending:false}),
    db.from('files').select('*').eq('project_id',projectId).order('created_at',{ascending:false}),
    db.from('messages').select('*').eq('project_id',projectId).order('created_at'),
    db.from('notes').select('*').eq('project_id',projectId).order('created_at',{ascending:false}),
  ]);

  if(!project){showToast('Project not found','error');return;}
  const client=project.clients;
  const clientName=client?`${client.first_name} ${client.last_name}`:'No client';
  const paidAmt=(invoices||[]).filter(i=>i.status==='paid').reduce((s,i)=>s+(i.total||0),0);
  const totalDue=(invoices||[]).reduce((s,i)=>s+(i.total||0),0);
  const paidPct=totalDue>0?Math.round((paidAmt/totalDue)*100):0;
  const color=project.color||PROJECT_COLORS[0];
  const stages=project.stages||[];

  document.getElementById('pd-title').textContent=project.name;

  document.getElementById('pd-content').innerHTML=`
    <div class="pd-hero">
      <div class="pd-hero-content">
        <div>
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
            <div style="width:14px;height:14px;border-radius:50%;background:${color};flex-shrink:0"></div>
            <div class="pd-name">${escapeHtml(project.name)}</div>
          </div>
          <div class="pd-type">${escapeHtml(project.service_type||'Project')}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:rgba(240,238,255,.4);margin-bottom:3px">Total Value</div>
          <div style="font-family:'DM Serif Display',serif;font-size:28px;color:var(--accent)">${formatCurrency(project.value)}</div>
        </div>
      </div>
    </div>

    <div class="card card-pad" style="margin-bottom:18px">
      <div style="font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text-mid);margin-bottom:12px">Status</div>
      ${renderTimeline(project.status)}
      <div style="margin-top:14px;display:flex;gap:6px;flex-wrap:wrap">
        ${['enquiry','booked','in_progress','delivered','complete'].map(s=>`<button class="btn btn-sm ${project.status===s?'btn-accent':'btn-outline'}" onclick="updateProjectStatus('${project.id}','${s}',this)">${s.replace('_',' ').replace(/\b\w/g,c=>c.toUpperCase())}</button>`).join('')}
      </div>
    </div>

    <div style="display:grid;grid-template-columns:260px 1fr 260px;gap:18px">

      <div style="display:flex;flex-direction:column;gap:14px">
        <div class="info-card">
          <div class="info-card-title">Contact</div>
          ${client?`<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
            <div class="avatar av-lg" style="background:${avatarColor(clientName).bg};color:${avatarColor(clientName).color};border-radius:12px">${initials(clientName)}</div>
            <div><div style="font-weight:600;font-size:14px;color:var(--text)">${escapeHtml(clientName)}</div><div style="font-size:12px;color:var(--text-mid)">${escapeHtml(client.company||'')}</div></div>
          </div>
          <div style="display:flex;flex-direction:column;gap:6px">
            ${client.phone?`<div style="display:flex;align-items:center;gap:8px;font-size:13px"><span style="color:var(--text-mid);width:18px">📞</span><a href="tel:${client.phone}">${escapeHtml(client.phone)}</a></div>`:''}
            <div style="display:flex;align-items:center;gap:8px;font-size:13px"><span style="color:var(--text-mid);width:18px">✉️</span><a href="mailto:${client.email}">${escapeHtml(client.email)}</a></div>
          </div>`:`<div style="color:var(--text-mid);font-size:13px">No client assigned</div>`}
        </div>
        <div class="info-card">
          <div class="info-card-title">Quick Actions</div>
          <div style="display:flex;flex-direction:column;gap:6px">
            <button class="btn btn-outline btn-full btn-sm" onclick="openModal('new-invoice')">+ Invoice</button>
            <button class="btn btn-outline btn-full btn-sm" onclick="openModal('new-contract')">📝 Contract</button>
            <button class="btn btn-outline btn-full btn-sm" onclick="triggerProjectUpload('${project.id}')">📎 Upload File</button>
            <button class="btn btn-outline btn-full btn-sm" onclick="openShareInvoiceModal()">🔗 Share Invoice</button>
            <button class="btn btn-ghost btn-full btn-sm" onclick="openClientPortal('${client?.email||''}')">↗ Client Portal</button>
          </div>
        </div>
        <div id="project-clock-in-widget"></div>
      </div>

      <div>
        <div class="card card-pad" style="margin-bottom:16px">
          <div style="display:flex;gap:28px;margin-bottom:10px;align-items:flex-start">
            <div><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--text-mid);margin-bottom:3px">Total Due</div><div style="font-family:'DM Serif Display',serif;font-size:24px;color:var(--text)">${formatCurrency(totalDue-paidAmt)}</div></div>
            <div><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--text-mid);margin-bottom:3px">Received</div><div style="font-family:'DM Serif Display',serif;font-size:24px;color:var(--green)">${formatCurrency(paidAmt)}</div></div>
            <div style="margin-left:auto;display:flex;align-items:center">
              <div style="width:52px;height:52px;border-radius:50%;background:conic-gradient(var(--green) 0% ${paidPct}%,var(--border) ${paidPct}% 100%);display:flex;align-items:center;justify-content:center">
                <div style="width:38px;height:38px;background:var(--surface);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10.5px;font-weight:700">${paidPct}%</div>
              </div>
            </div>
          </div>
          <div class="progress-bar"><div class="progress-fill" style="width:${paidPct}%"></div></div>
        </div>

        <div class="card" style="margin-bottom:16px;overflow:hidden">
          <div style="padding:14px 16px 0;border-bottom:1px solid var(--border)">
            <div class="portal-tabs" style="margin-bottom:0;border-bottom:none">
              <button class="portal-tab active" onclick="switchPortalTab(this,'pd-tab-invoices')">Invoices (${(invoices||[]).length})</button>
              <button class="portal-tab" onclick="switchPortalTab(this,'pd-tab-contracts')">Contracts (${(contracts||[]).length})</button>
              <button class="portal-tab" onclick="switchPortalTab(this,'pd-tab-files')">Files (${(files||[]).length})</button>
            </div>
          </div>
          <div id="pd-tab-invoices" class="portal-tab-content active" style="padding:14px 16px">
            ${(invoices||[]).map(inv=>{const od=inv.status==='sent'&&inv.due_date&&isOverdue(inv.due_date);return`<div class="inv-item" onclick="openInvoicePreview('${inv.id}')"><span class="inv-icon">🧾</span><div class="inv-info"><div class="inv-num">#${escapeHtml(inv.invoice_number)}</div><div class="inv-meta" style="color:${od?'var(--red)':''};">${inv.due_date?(od?'Overdue · ':'')+formatDate(inv.due_date):'No due date'}</div></div><div class="inv-amt">${formatCurrency(inv.total)}</div>${statusBadge(od?'overdue':inv.status)}</div>`;}).join('')}
            ${!(invoices||[]).length?'<div style="color:var(--text-mid);font-size:13px;text-align:center;padding:14px">No invoices yet</div>':''}
            <button class="btn btn-outline btn-full btn-sm" style="margin-top:8px" onclick="openModal('new-invoice')">+ Add invoice</button>
          </div>
          <div id="pd-tab-contracts" class="portal-tab-content" style="padding:14px 16px;display:none">
            ${(contracts||[]).map(c=>`<div class="inv-item"><span class="inv-icon">📄</span><div class="inv-info"><div class="inv-num">${escapeHtml(c.title)}</div><div class="inv-meta">${formatDate(c.created_at)}</div></div>${statusBadge(c.status)}</div>`).join('')}
            ${!(contracts||[]).length?'<div style="color:var(--text-mid);font-size:13px;text-align:center;padding:14px">No contracts yet</div>':''}
            <button class="btn btn-outline btn-full btn-sm" style="margin-top:8px" onclick="openModal('new-contract')">+ Send contract</button>
          </div>
          <div id="pd-tab-files" class="portal-tab-content" style="padding:14px 16px;display:none">
            <div class="files-grid" style="grid-template-columns:repeat(3,1fr)">
              ${(files||[]).map(f=>`<div class="file-card" onclick="downloadFile('${f.storage_path}','${f.name}')"><div class="file-icon">${fileIcon(f.mime_type)}</div><div class="file-name">${escapeHtml(f.name)}</div><div class="file-meta">${formatBytes(f.size_bytes)}</div></div>`).join('')}
              <div class="file-card" style="border-style:dashed;background:var(--surface2);display:flex;flex-direction:column;align-items:center;justify-content:center" onclick="triggerProjectUpload('${project.id}')"><div style="font-size:20px;color:var(--text-mid)">+</div><div style="font-size:11px;color:var(--text-mid);margin-top:3px">Upload</div></div>
            </div>
          </div>
        </div>

        <div class="card" style="overflow:hidden">
          <div style="padding:14px 16px;border-bottom:1px solid var(--border);font-weight:600;font-size:13.5px">Messages</div>
          <div class="msg-thread" id="msg-thread">
            ${(messages||[]).length?messages.map(m=>`<div class="msg-bubble ${m.sender_role==='owner'?'mine':'theirs'}"><div class="msg-text">${escapeHtml(m.content)}</div><div class="msg-time">${timeAgo(m.created_at)}</div></div>`).join('')
            :'<div style="color:var(--text-mid);font-size:13px;text-align:center;padding:20px">No messages yet</div>'}
          </div>
          <div class="msg-input-row">
            <input class="msg-input" id="msg-input" placeholder="Send a message…" onkeydown="if(event.key==='Enter')sendMessage('${project.id}')">
            <button class="msg-send" onclick="sendMessage('${project.id}')">Send</button>
          </div>
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:14px">
        <div class="info-card">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
            <div class="info-card-title" style="margin:0">Deliverables</div>
            <button class="btn btn-ghost btn-sm" style="padding:2px 6px;font-size:11px" onclick="openAddStageRow('${project.id}')">+ Add</button>
          </div>
          <div id="stages-list-${project.id}">
            ${stages.length?renderStagesHtml(stages,project.id):'<div style="color:var(--text-mid);font-size:13px;text-align:center;padding:12px 0">No deliverables yet</div>'}
          </div>
          <div id="add-stage-row-${project.id}" style="display:none;margin-top:8px">
            <div style="display:flex;gap:6px">
              <input type="text" id="new-stage-input-${project.id}" placeholder="Add deliverable…" style="flex:1;padding:8px 11px;border:1.5px solid var(--border);border-radius:var(--r);font-family:inherit;font-size:13px;color:var(--text);background:var(--surface2);outline:none" onkeydown="if(event.key==='Enter')addStage('${project.id}')">
              <button class="btn btn-accent btn-sm" onclick="addStage('${project.id}')">Add</button>
            </div>
          </div>
        </div>

        <div class="info-card">
          <div class="info-card-title">Activity</div>
          ${generateActivity(invoices,contracts,messages,project)}
        </div>

        <div class="info-card">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
            <div class="info-card-title" style="margin:0">Notes & Links</div>
            <button class="btn btn-ghost btn-sm" style="padding:2px 6px;font-size:11px" onclick="openModal('add-note')">+ Add</button>
          </div>
          ${(notes||[]).slice(0,3).map(n=>`<div class="note-item" style="margin-bottom:6px"><div class="note-title">${n.type==='link'?'🔗 ':''}${escapeHtml(n.title)}</div><div class="note-preview">${escapeHtml(n.url||n.content||'')}</div></div>`).join('')}
          ${!(notes||[]).length?`<div style="color:var(--text-mid);font-size:13px">No notes yet</div>`:''}
        </div>
      </div>
    </div>
  `;

  // Render time clock-in widget after DOM is set
  if(typeof renderProjectClockIn==='function') renderProjectClockIn(projectId);
}

function switchPortalTab(btn,targetId){
  btn.closest('.portal-tabs').querySelectorAll('.portal-tab').forEach(t=>t.classList.remove('active'));
  btn.classList.add('active');
  const parent=btn.closest('.card');
  parent.querySelectorAll('.portal-tab-content').forEach(t=>{t.classList.remove('active');t.style.display='none';});
  const el=document.getElementById(targetId);
  if(el){el.classList.add('active');el.style.display='block';}
}

function generateActivity(invoices,contracts,messages,project){
  const events=[];
  (invoices||[]).forEach(i=>{if(i.paid_at)events.push({date:i.paid_at,text:`Invoice paid · ${formatCurrency(i.total)}`,color:'var(--green)'});if(i.sent_at)events.push({date:i.sent_at,text:`Invoice sent · ${formatCurrency(i.total)}`,color:'var(--blue)'});});
  (contracts||[]).forEach(c=>{if(c.signed_at)events.push({date:c.signed_at,text:`Contract signed · ${escapeHtml(c.title)}`,color:'var(--accent)'});if(c.sent_at)events.push({date:c.sent_at,text:`Contract sent · ${escapeHtml(c.title)}`,color:'var(--blue)'});});
  events.push({date:project.created_at,text:'Project created',color:'var(--text-mid)'});
  events.sort((a,b)=>new Date(b.date)-new Date(a.date));
  if(!events.length)return'<div style="color:var(--text-mid);font-size:13px">No activity yet</div>';
  return events.slice(0,6).map(e=>`<div class="act-item"><div class="act-dot" style="background:${e.color}"></div><div class="act-text">${e.text}</div><div class="act-time">${timeAgo(e.date)}</div></div>`).join('');
}

async function updateProjectStatus(projectId,status,btn){
  const{error}=await db.from('projects').update({status}).eq('id',projectId);
  if(error){showToast('Failed to update','error');return;}
  const p=allProjects.find(x=>x.id===projectId);if(p)p.status=status;
  btn.closest('div').querySelectorAll('.btn').forEach(b=>{const s=b.textContent.trim().toLowerCase().replace(/\s+/g,'_');b.className=`btn btn-sm ${s===status?'btn-accent':'btn-outline'}`;});
  const tlEl=document.querySelector('#pd-content .status-timeline');
  if(tlEl)tlEl.outerHTML=renderTimeline(status);
  showToast('Status updated','success');
}

/* ══════════════════════════════════════════
   CUSTOM STAGES
══════════════════════════════════════════ */
function renderStagesHtml(stages, projectId) {
  return stages.map((s, i) => {
    const checked = s.done ? 'checked' : '';
    const done = s.done ? 'done' : '';
    const checkMark = s.done ? '✓' : '';
    return '<div class="stage-item">' +
      '<div class="stage-checkbox ' + checked + '" onclick="toggleStage(\'' + projectId + '\',' + i + ')">' + checkMark + '</div>' +
      '<div class="stage-label ' + done + '">' + escapeHtml(s.name) + '</div>' +
      '<button class="btn btn-ghost btn-sm" style="padding:2px 4px;font-size:11px;color:var(--red)" onclick="deleteStage(\'' + projectId + '\',' + i + ')">✕</button>' +
      '</div>';
  }).join('');
}
function openAddStageRow(projectId){const row=document.getElementById('add-stage-row-'+projectId);if(row){row.style.display='block';document.getElementById('new-stage-input-'+projectId)?.focus();}}

async function addStage(projectId){
  const input=document.getElementById('new-stage-input-'+projectId);
  const name=input?.value.trim();if(!name)return;
  const p=allProjects.find(x=>x.id===projectId);if(!p)return;
  const stages=[...(p.stages||[]),{name,done:false,created_at:new Date().toISOString()}];
  const{error}=await db.from('projects').update({stages}).eq('id',projectId);
  if(error){showToast('Failed to add stage','error');return;}
  p.stages=stages;if(input)input.value='';
  // Re-render stages list
  const container=document.getElementById('stages-list-'+projectId);
  if(container)container.innerHTML=renderStagesHtml(stages,projectId);
  showToast('Deliverable added!','success');
}

async function toggleStage(projectId,index){
  const p=allProjects.find(x=>x.id===projectId);if(!p)return;
  const stages=[...(p.stages||[])];
  stages[index]={...stages[index],done:!stages[index].done};
  await db.from('projects').update({stages}).eq('id',projectId);
  p.stages=stages;
  const checkbox=document.querySelectorAll(`#stages-list-${projectId} .stage-checkbox`)[index];
  const label=document.querySelectorAll(`#stages-list-${projectId} .stage-label`)[index];
  if(checkbox){checkbox.classList.toggle('checked');checkbox.textContent=stages[index].done?'✓':'';}
  if(label)label.className=`stage-label ${stages[index].done?'done':''}`;
  renderDashboard();
}

async function deleteStage(projectId,index){
  const p=allProjects.find(x=>x.id===projectId);if(!p)return;
  const stages=(p.stages||[]).filter((_,i)=>i!==index);
  await db.from('projects').update({stages}).eq('id',projectId);
  p.stages=stages;
  const container=document.getElementById('stages-list-'+projectId);
  if(container)container.innerHTML=renderStagesHtml(stages,projectId);
}

/* ══════════════════════════════════════════
   COLOUR PICKERS
══════════════════════════════════════════ */
function renderColorSwatches(containerId,selected){
  const c=document.getElementById(containerId);if(!c)return;
  c.innerHTML=PROJECT_COLORS.map(col=>`<div class="color-swatch ${col===selected?'selected':''}" style="background:${col}" data-color="${col}" onclick="selectColor('${containerId}',this)"></div>`).join('');
}
function selectColor(containerId,el){document.querySelectorAll(`#${containerId} .color-swatch`).forEach(s=>s.classList.remove('selected'));el.classList.add('selected');}
function getSelectedColor(containerId){const s=document.querySelector(`#${containerId} .color-swatch.selected`);return s?s.dataset.color:PROJECT_COLORS[0];}

/* ══════════════════════════════════════════
   CLIENTS
══════════════════════════════════════════ */
function renderClients(filter=''){
  const container=document.getElementById('clients-list');
  const filtered=allClients.filter(c=>`${c.first_name} ${c.last_name} ${c.email} ${c.company||''}`.toLowerCase().includes(filter.toLowerCase()));
  if(!filtered.length){container.innerHTML=`<div class="empty-state"><div class="empty-icon">👥</div><div class="empty-title">No clients yet</div><button class="btn btn-accent" onclick="openModal('new-client')">+ Add Client</button></div>`;return;}
  container.innerHTML=filtered.map(c=>{const name=`${c.first_name} ${c.last_name}`;const col=avatarColor(name);const pc=allProjects.filter(p=>p.client_id===c.id).length;return`<div class="card" style="padding:14px 18px;display:flex;align-items:center;gap:13px;margin-bottom:9px;">
    <div class="avatar av-md" style="background:${col.bg};color:${col.color};border-radius:10px;cursor:pointer" onclick="filterByClient('${c.id}')">${initials(name)}</div>
    <div style="flex:1;min-width:0;cursor:pointer" onclick="filterByClient('${c.id}')"><div style="font-weight:600;font-size:14px">${escapeHtml(name)}</div><div style="font-size:12px;color:var(--text-mid)">${escapeHtml(c.email)}${c.phone?' · '+escapeHtml(c.phone):''}</div></div>
    <div style="font-size:12px;color:var(--text-mid);white-space:nowrap">${pc} project${pc!==1?'s':''}</div>
    ${(c.tags||[]).map(t=>`<span class="tag">${escapeHtml(t)}</span>`).join('')}
    <button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="deleteClient('${c.id}','${escapeHtml(name)}')">Delete</button>
  </div>`;}).join('');}

async function deleteClient(clientId, name){
  if(!window.confirm(`Delete ${name}? This cannot be undone. Their projects will remain but will be unlinked.`))return;
  await db.from('clients').delete().eq('id',clientId);
  await loadClients();
  renderClients();
  populateSelects();
  showToast('Client deleted','success');
}
function filterClients(val){renderClients(val);}
function filterByClient(clientId){
  showPage('projects',document.getElementById('nav-projects'));
  // Filter project list to just this client
  const container=document.getElementById('proj-list-content');
  if(!container)return;
  const client=allClients.find(c=>c.id===clientId);
  const clientName=client?client.first_name+' '+client.last_name:'Client';
  const filtered=allProjects.filter(p=>p.client_id===clientId);
  if(!filtered.length){
    container.innerHTML=`<div class="empty-state"><div class="empty-icon">📁</div><div class="empty-title">No projects for ${escapeHtml(clientName)}</div><button class="btn btn-accent" onclick="openModal('new-project')">+ New Project</button></div>`;
    return;
  }
  container.innerHTML=`<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
    <div style="font-size:13px;color:var(--text-mid)">Showing projects for <strong>${escapeHtml(clientName)}</strong></div>
    <button class="btn btn-ghost btn-sm" onclick="renderProjectList()">Show all →</button>
  </div>`+filtered.map(renderProjectListItem).join('');
}

/* ══════════════════════════════════════════
   INVOICES
══════════════════════════════════════════ */
function renderInvoicesPage(){
  const outstanding=allInvoices.filter(i=>['sent'].includes(i.status));
  const paid30=allInvoices.filter(i=>i.status==='paid'&&i.paid_at&&(Date.now()-new Date(i.paid_at))<30*86400000);
  const overdue=allInvoices.filter(i=>i.status==='sent'&&i.due_date&&isOverdue(i.due_date));
  document.getElementById('invoice-stats').innerHTML=`
    <div class="stat-card"><div class="stat-label">Outstanding</div><div class="stat-value">${formatCurrency(outstanding.reduce((s,i)=>s+((i.total||0)-(i.amount_paid||0)),0))}</div><div class="stat-sub">${outstanding.length} invoices</div></div>
    <div class="stat-card"><div class="stat-label">Paid (30 days)</div><div class="stat-value">${formatCurrency(paid30.reduce((s,i)=>s+(i.total||0),0))}</div><div class="stat-sub">${paid30.length} invoices</div></div>
    <div class="stat-card"><div class="stat-label">Overdue</div><div class="stat-value" style="color:${overdue.length?'var(--red)':'var(--text)'}">${formatCurrency(overdue.reduce((s,i)=>s+((i.total||0)-(i.amount_paid||0)),0))}</div><div class="stat-sub ${overdue.length?'stat-down':''}">${overdue.length} invoices</div></div>`;
  const tbody=document.getElementById('invoices-tbody');
  if(!allInvoices.length){tbody.innerHTML=`<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">🧾</div><div class="empty-title">No invoices yet</div><button class="btn btn-accent" onclick="openModal('new-invoice')">+ New Invoice</button></div></td></tr>`;return;}
  tbody.innerHTML=allInvoices.map(inv=>{
    const clientName=inv.clients?`${inv.clients.first_name} ${inv.clients.last_name}`:'—';
    const od=inv.status==='sent'&&inv.due_date&&isOverdue(inv.due_date);
    return`<tr style="cursor:pointer" onclick="openInvoicePreview('${inv.id}')">
      <td style="font-weight:500">#${escapeHtml(inv.invoice_number)}</td>
      <td>${escapeHtml(clientName)}</td>
      <td style="color:var(--text-mid)">${escapeHtml(inv.projects?.name||'—')}</td>
      <td style="font-weight:600">${formatCurrency(inv.total)}</td>
      <td style="color:${od?'var(--red)':'var(--text-mid)'}">${inv.due_date?formatDate(inv.due_date):'—'}</td>
      <td>${statusBadge(od?'overdue':inv.status)}</td>
      <td onclick="event.stopPropagation()"><button class="btn btn-ghost btn-sm" onclick="openShareInvoiceModal('${inv.id}')">🔗</button></td>
    </tr>`;
  }).join('');}

/* ══════════════════════════════════════════
   CONTRACTS
══════════════════════════════════════════ */
async function loadContracts(){
  const{data}=await db.from('contracts').select('*, clients(first_name,last_name), projects(name)').eq('owner_id',currentUser.id).order('created_at',{ascending:false});
  const c=document.getElementById('contracts-list');
  if(!data||!data.length){c.innerHTML=`<div class="empty-state"><div class="empty-icon">📝</div><div class="empty-title">No contracts yet</div><button class="btn btn-accent" onclick="openModal('new-contract')">+ New Contract</button></div>`;return;}
  c.innerHTML=data.map(contract=>{const cn=contract.clients?`${contract.clients.first_name} ${contract.clients.last_name}`:'—';
    return`<div class="card" style="padding:15px 18px;display:flex;align-items:center;gap:13px;margin-bottom:9px"><span style="font-size:22px">📄</span><div style="flex:1;min-width:0"><div style="font-weight:500;font-size:14px">${escapeHtml(contract.title)}</div><div style="font-size:12px;color:var(--text-mid)">${escapeHtml(cn)} · ${formatDate(contract.created_at)}</div></div>${statusBadge(contract.status)}</div>`;
  }).join('');}

/* ══════════════════════════════════════════
   FILES
══════════════════════════════════════════ */
async function loadFiles(){
  const pf=document.getElementById('files-project-filter');
  if(pf&&pf.options.length===1)allProjects.forEach(p=>{const o=document.createElement('option');o.value=p.id;o.textContent=p.name;pf.appendChild(o);});
  const filter=pf?.value||'';
  let q=db.from('files').select('*, projects(name)').eq('owner_id',currentUser.id);
  if(filter)q=q.eq('project_id',filter);
  const{data:files}=await q.order('created_at',{ascending:false});
  const c=document.getElementById('files-grid-container');
  if(!files||!files.length){c.innerHTML=`<div class="empty-state"><div class="empty-icon">🗂</div><div class="empty-title">No files yet</div></div>`;return;}
  c.innerHTML=`<div class="files-grid">${files.map(f=>`<div class="file-card" onclick="downloadFile('${f.storage_path}','${escapeHtml(f.name)}')"><div class="file-icon">${fileIcon(f.mime_type)}</div><div class="file-name" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</div><div class="file-meta">${formatBytes(f.size_bytes)} · ${formatDateShort(f.created_at)}</div></div>`).join('')}</div>`;
  // Init upload zone after content renders
  setTimeout(()=>initUploadZone('upload-zone',fs=>uploadFiles(fs,null)),50);
}

function triggerFileUpload(projectId){
  const input=document.createElement('input');
  input.type='file';input.multiple=true;
  input.onchange=()=>uploadFiles([...input.files],projectId||null);
  input.click();
}

async function uploadFiles(files,projectId){
  for(const file of files){
    if(file.size>52428800){showToast(file.name+' is too large (max 50MB)','error');continue;}
    const path=`${currentUser.id}/${projectId||'general'}/${Date.now()}-${file.name}`;
    const{error}=await db.storage.from('project-files').upload(path,file);
    if(error){showToast('Failed to upload '+file.name,'error');continue;}
    await db.from('files').insert({owner_id:currentUser.id,project_id:projectId||null,name:file.name,storage_path:path,mime_type:file.type,size_bytes:file.size});
    showToast(file.name+' uploaded!','success');
  }
  loadFiles();
}

async function triggerProjectUpload(projectId){const i=document.createElement('input');i.type='file';i.multiple=true;i.onchange=()=>uploadFiles([...i.files],projectId);i.click();}
async function downloadFile(path,name){const{data}=await db.storage.from('project-files').createSignedUrl(path,3600);if(data?.signedUrl){const a=document.createElement('a');a.href=data.signedUrl;a.download=name;a.click();}}
function initUploadZone(id,cb){
  const z=document.getElementById(id);if(!z)return;
  // Remove old listeners by cloning
  const fresh=z.cloneNode(true);z.parentNode.replaceChild(fresh,z);
  fresh.addEventListener('dragover',e=>{e.preventDefault();fresh.classList.add('drag-over');});
  fresh.addEventListener('dragleave',()=>fresh.classList.remove('drag-over'));
  fresh.addEventListener('drop',e=>{e.preventDefault();fresh.classList.remove('drag-over');cb([...e.dataTransfer.files]);});
  fresh.addEventListener('click',()=>{const i=document.createElement('input');i.type='file';i.multiple=true;i.accept='*/*';i.onchange=()=>cb([...i.files]);i.click();});
}

/* ══════════════════════════════════════════
   NOTES
══════════════════════════════════════════ */
async function loadNotes(){
  const{data}=await db.from('notes').select('*, projects(name)').eq('owner_id',currentUser.id).order('created_at',{ascending:false});
  const c=document.getElementById('notes-grid');
  if(!data||!data.length){c.innerHTML=`<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">📌</div><div class="empty-title">No notes yet</div><button class="btn btn-accent" onclick="openModal('add-note')">+ New Note</button></div>`;return;}
  c.innerHTML=data.map(n=>`<div class="note-item card" style="padding:15px 17px"><div class="note-title">${n.type==='link'?'🔗 ':''}${escapeHtml(n.title)}</div><div class="note-preview">${escapeHtml(n.url||n.content||'')}</div><div style="display:flex;align-items:center;justify-content:space-between;margin-top:6px"><div class="note-date">${n.projects?.name||'General'} · ${formatDateShort(n.created_at)}</div>${n.visible_to_client?'<span class="tag" style="font-size:10px">Client visible</span>':''}</div></div>`).join('');}

function toggleNoteType(){const t=document.getElementById('note-type').value;document.getElementById('note-content-group').style.display=t==='note'?'block':'none';document.getElementById('note-url-group').style.display=t==='link'?'block':'none';}

/* ══════════════════════════════════════════
   SCHEDULING
══════════════════════════════════════════ */
async function renderCalendar(){
  const{data:bookings}=await db.from('bookings').select('*, clients(first_name,last_name)').eq('owner_id',currentUser.id).order('start_at');
  allBookings=bookings||[];drawCalendar();renderUpcomingBookings();}

function drawCalendar(){
  const months=['January','February','March','April','May','June','July','August','September','October','November','December'];
  document.getElementById('cal-month-label').textContent=`${months[calMonth]} ${calYear}`;
  const grid=document.getElementById('cal-grid');grid.innerHTML='';
  const first=new Date(calYear,calMonth,1);const last=new Date(calYear,calMonth+1,0);const today=new Date();
  let offset=first.getDay()-1;if(offset<0)offset=6;
  const prevLast=new Date(calYear,calMonth,0).getDate();
  for(let i=offset-1;i>=0;i--){const d=document.createElement('button');d.className='cal-day other-month';d.textContent=prevLast-i;grid.appendChild(d);}
  for(let day=1;day<=last.getDate();day++){
    const ds=`${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const isToday=day===today.getDate()&&calMonth===today.getMonth()&&calYear===today.getFullYear();
    const hasBook=allBookings.some(b=>b.start_at.startsWith(ds));
    const d=document.createElement('button');d.className=`cal-day${isToday?' today':''}${hasBook?' has-booking':''}`;d.textContent=day;d.onclick=()=>showDayBookings(ds);grid.appendChild(d);
  }
  const rem=(offset+last.getDate())%7===0?0:7-((offset+last.getDate())%7);
  for(let i=1;i<=rem;i++){const d=document.createElement('button');d.className='cal-day other-month';d.textContent=i;grid.appendChild(d);}
}

function calNav(dir){calMonth+=dir;if(calMonth>11){calMonth=0;calYear++;}if(calMonth<0){calMonth=11;calYear--;}drawCalendar();}

function renderUpcomingBookings(){
  const c=document.getElementById('upcoming-bookings');
  const up=allBookings.filter(b=>new Date(b.start_at)>=new Date()).slice(0,5);
  if(!up.length){c.innerHTML='<div style="color:var(--text-mid);font-size:13px;text-align:center;padding:12px 0">No upcoming bookings</div>';return;}
  const colors=['var(--accent)','var(--blue)','var(--green)','var(--pink)','var(--teal)'];
  c.innerHTML=up.map((b,i)=>`<div style="padding:10px 12px;border-left:3px solid ${colors[i%colors.length]};background:var(--surface2);border-radius:0 var(--r) var(--r) 0;margin-bottom:8px"><div style="font-weight:500;font-size:13px">${escapeHtml(b.title)}</div><div style="font-size:11.5px;color:var(--text-mid)">${b.clients?b.clients.first_name+' '+b.clients.last_name+' · ':''} ${formatDateTime(b.start_at)}</div></div>`).join('');}

function showDayBookings(ds){const bs=allBookings.filter(b=>b.start_at.startsWith(ds));if(!bs.length){const nb=document.getElementById('nb-date');if(nb)nb.value=ds;openModal('new-booking');}else showToast(`${bs.length} booking${bs.length>1?'s':''} on ${formatDate(ds)}`);}
function copyBookingLink(){navigator.clipboard.writeText('https://sendzest.github.io/Studio-portal/book.html');showToast('Booking link copied!','success');}

/* ══════════════════════════════════════════
   NOTIFICATIONS
══════════════════════════════════════════ */
async function loadNotificationSettings(){
  const{data}=await db.from('notification_settings').select('*').eq('owner_id',currentUser.id).single();
  if(!data)return;
  ['invoice_sent','invoice_overdue_reminder','contract_sent','project_status_update','message_to_client','invoice_paid','contract_signed','message_from_client','new_booking'].forEach(f=>{const el=document.getElementById('notif-'+f);if(el){el.className='toggle'+(data[f]?' on':'');}});
}
async function saveNotificationSettings(){
  const fields=['invoice_sent','invoice_overdue_reminder','contract_sent','project_status_update','message_to_client','invoice_paid','contract_signed','message_from_client','new_booking'];
  const update={};fields.forEach(f=>{const el=document.getElementById('notif-'+f);if(el)update[f]=el.classList.contains('on');});
  const{error}=await db.from('notification_settings').upsert({owner_id:currentUser.id,...update});
  if(error){showToast('Failed to save','error');return;}
  showToast('Saved!','success');}

/* ══════════════════════════════════════════
   SETTINGS
══════════════════════════════════════════ */
function populateSettings(){
  const p=currentProfile||{};
  document.getElementById('s-business-name').value=p.business_name||'';
  document.getElementById('s-full-name').value=p.full_name||'';
  document.getElementById('s-email').value=p.email||currentUser?.email||'';
  document.getElementById('s-currency').value=p.currency||'GBP';
  document.getElementById('s-country').value=p.country||'GB';
  document.getElementById('s-portal-name').value=p.portal_name||'';
  document.getElementById('s-portal-welcome').value=p.portal_welcome_message||'';
}
async function saveProfile(){
  if(!currentUser){showToast('Not logged in','error');return;}
  const u={business_name:document.getElementById('s-business-name').value,full_name:document.getElementById('s-full-name').value,email:document.getElementById('s-email').value,currency:document.getElementById('s-currency').value,country:document.getElementById('s-country').value};
  const{error}=await db.from('profiles').upsert({id:currentUser.id,...u});
  if(error){showToast('Failed: '+error.message,'error');return;}
  currentProfile={...(currentProfile||{}),...u};document.getElementById('user-name').textContent=u.full_name||u.business_name||'Studio';showToast('Saved!','success');}
async function savePortalSettings(){
  if(!currentUser)return;
  const u={portal_name:document.getElementById('s-portal-name').value,portal_welcome_message:document.getElementById('s-portal-welcome').value};
  const{error}=await db.from('profiles').upsert({id:currentUser.id,...u});
  if(error){showToast('Failed','error');return;}showToast('Portal settings saved!','success');}
async function changePassword(){
  const np=document.getElementById('s-new-password').value;const cp=document.getElementById('s-confirm-password').value;
  if(!np||np.length<8){showToast('Min 8 characters','error');return;}if(np!==cp){showToast('Passwords do not match','error');return;}
  const{error}=await db.auth.updateUser({password:np});
  if(error){showToast('Failed','error');return;}
  document.getElementById('s-new-password').value='';document.getElementById('s-confirm-password').value='';showToast('Password updated!','success');}
function copyPortalUrl(){navigator.clipboard.writeText(document.getElementById('portal-url').value);showToast('Copied!','success');}

/* ══════════════════════════════════════════
   CREATE ACTIONS
══════════════════════════════════════════ */
async function createProject(){
  const name=document.getElementById('np-name').value.trim();
  if(!name){showToast('Name required','error');return;}
  const color=getSelectedColor('np-color-swatches');
  const{data,error}=await db.from('projects').insert({owner_id:currentUser.id,client_id:document.getElementById('np-client').value||null,name,service_type:document.getElementById('np-service').value,value:parseFloat(document.getElementById('np-value').value)||0,hourly_rate:parseFloat(document.getElementById('np-hourly-rate').value)||0,start_date:document.getElementById('np-date').value||null,notes:document.getElementById('np-notes').value,status:'booked',color,stages:[]}).select().single();
  if(error){showToast('Failed: '+error.message,'error');return;}
  closeModal('new-project');['np-name','np-value','np-notes'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  await loadProjects();populateSelects();populateTimeProjectSelects();renderDashboard();showToast('Project created!','success');openProject(data.id);}

async function createClient(){
  const first=document.getElementById('nc-first').value.trim();const email=document.getElementById('nc-email').value.trim();
  if(!first||!email){showToast('Name and email required','error');return;}
  const{error}=await db.from('clients').insert({owner_id:currentUser.id,first_name:first,last_name:document.getElementById('nc-last').value.trim(),email,phone:document.getElementById('nc-phone').value.trim()||null,company:document.getElementById('nc-company').value.trim()||null,tags:document.getElementById('nc-tags').value.split(',').map(t=>t.trim()).filter(Boolean)});
  if(error){showToast(error.message,'error');return;}
  closeModal('new-client');['nc-first','nc-last','nc-email','nc-phone','nc-company','nc-tags'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  await loadClients();renderClients();populateSelects();showToast('Client added!','success');}

async function createInvoice(status='draft'){
  const number=document.getElementById('ni-number').value.trim();
  if(!number){showToast('Invoice number required','error');return;}
  const items=getLineItems();const subtotal=items.reduce((s,i)=>s+i.total,0);
  const paymentLink=document.getElementById('ni-payment-link')?.value.trim()||null;
  const dbStatus=status==='download'?'draft':status;
  const{data:savedInv,error}=await db.from('invoices').insert({
    owner_id:currentUser.id,
    client_id:document.getElementById('ni-client').value||null,
    project_id:document.getElementById('ni-project').value||null,
    invoice_number:number,line_items:items,subtotal,total:subtotal,
    due_date:document.getElementById('ni-due').value||null,
    notes:document.getElementById('ni-notes').value,
    payment_link:paymentLink,
    share_token:crypto.randomUUID(),
    status:dbStatus,
    sent_at:null
  }).select().single();
  if(error){showToast('Failed','error');return;}
  closeModal('new-invoice');
  await loadInvoices();
  if(status==='download'){
    // Open invoice preview modal for download + mark-as-sent
    openInvoicePreview(savedInv.id);
    showToast('Invoice saved — download below','success');
  } else {
    renderInvoicesPage();
    showToast('Draft saved!','success');
  }
}

function addLineItem(){
  const tbody=document.getElementById('line-items-body');const id=lineItemCount++;
  const row=document.createElement('tr');row.id=`li-row-${id}`;
  row.innerHTML=`<td style="padding:8px 0"><input type="text" class="inline-edit li-desc" placeholder="Description" style="border:none;background:none;font-family:inherit;font-size:13.5px;width:100%;outline:none;color:var(--text)"></td>
    <td style="padding:8px 6px"><input type="number" class="inline-edit li-rate" placeholder="0.00" step="0.01" style="border:none;background:none;font-family:inherit;font-size:13.5px;width:80px;outline:none;color:var(--text)" oninput="calcLineTotal(${id})"></td>
    <td style="padding:8px 6px"><input type="number" class="inline-edit li-qty" value="1" style="border:none;background:none;font-family:inherit;font-size:13.5px;width:50px;outline:none;color:var(--text)" oninput="calcLineTotal(${id})"></td>
    <td style="padding:8px 0;text-align:right;font-weight:500;color:var(--text)" id="li-total-${id}">£0.00</td>
    <td style="padding:8px 0"><button class="btn btn-ghost btn-sm" onclick="document.getElementById('li-row-${id}').remove();calcTotal()">✕</button></td>`;
  tbody.appendChild(row);}

function calcLineTotal(id){const row=document.getElementById(`li-row-${id}`);if(!row)return;const r=parseFloat(row.querySelector('.li-rate').value)||0;const q=parseFloat(row.querySelector('.li-qty').value)||0;document.getElementById(`li-total-${id}`).textContent=formatCurrency(r*q);calcTotal();}
function calcTotal(){let t=0;document.querySelectorAll('#line-items-body tr').forEach(row=>{const r=parseFloat(row.querySelector('.li-rate')?.value)||0;const q=parseFloat(row.querySelector('.li-qty')?.value)||0;t+=r*q;});document.getElementById('invoice-total').textContent=formatCurrency(t);}
function getLineItems(){return[...document.querySelectorAll('#line-items-body tr')].map(row=>({description:row.querySelector('.li-desc')?.value||'',rate:parseFloat(row.querySelector('.li-rate')?.value)||0,qty:parseFloat(row.querySelector('.li-qty')?.value)||1,total:(parseFloat(row.querySelector('.li-rate')?.value)||0)*(parseFloat(row.querySelector('.li-qty')?.value)||1)})).filter(i=>i.description||i.rate);}
function populateInvoiceNumber(){const el=document.getElementById('ni-number');if(!el)return;const n=new Date();const prefix=`INV-${n.getFullYear()}${String(n.getMonth()+1).padStart(2,'0')}${String(n.getDate()).padStart(2,'0')}`;const existingNums=allInvoices.map(i=>{const m=i.invoice_number?.match(/-(\d+)$/);return m?parseInt(m[1],10):0;});const next=Math.max(0,...existingNums)+1;el.value=`${prefix}-${String(next).padStart(3,'0')}`;}

async function createContract(){
  const title=document.getElementById('nc2-title').value.trim();const content=document.getElementById('nc2-content').value.trim();
  if(!title||!content){showToast('Title and content required','error');return;}
  const{error}=await db.from('contracts').insert({owner_id:currentUser.id,client_id:document.getElementById('nc2-client').value||null,project_id:document.getElementById('nc2-project').value||null,title,content,status:'sent',sent_at:new Date().toISOString()});
  if(error){showToast('Failed','error');return;}
  closeModal('new-contract');loadContracts();showToast('Contract sent!','success');}

async function createNote(){
  const title=document.getElementById('note-title').value.trim();if(!title){showToast('Title required','error');return;}
  const type=document.getElementById('note-type').value;
  const{error}=await db.from('notes').insert({owner_id:currentUser.id,project_id:document.getElementById('note-project').value||null,title,content:type==='note'?document.getElementById('note-content').value:null,url:type==='link'?document.getElementById('note-url').value:null,type,visible_to_client:document.getElementById('note-visible').value==='true'});
  if(error){showToast('Failed','error');return;}closeModal('add-note');loadNotes();showToast('Note saved!','success');}

async function createBooking(){
  const title=document.getElementById('nb-title').value.trim();const date=document.getElementById('nb-date').value;const start=document.getElementById('nb-start').value;const end=document.getElementById('nb-end').value;
  if(!title||!date||!start||!end){showToast('Title, date, start and end time required','error');return;}
  const{error}=await db.from('bookings').insert({owner_id:currentUser.id,client_id:document.getElementById('nb-client').value||null,project_id:document.getElementById('nb-project').value||null,title,start_at:`${date}T${start}:00`,end_at:`${date}T${document.getElementById('nb-end').value}:00`,location:document.getElementById('nb-location').value||null,notes:document.getElementById('nb-notes').value||null});
  if(error){showToast('Failed','error');return;}closeModal('new-booking');renderCalendar();showToast('Booking created!','success');}

function loadContractTemplate(){
  const templates={photography:`This Photography Services Agreement is between [Business Name] and [Client Name].\n\n1. SERVICES\nThe photographer will provide photography services as agreed.\n\n2. DELIVERABLES\nFinal edited images delivered within 30 days of the shoot.\n\n3. PAYMENT\nA non-refundable deposit of 25% secures the booking. Balance due on delivery.\n\n4. COPYRIGHT\nThe photographer retains copyright. Client receives a licence for personal use.\n\n5. CANCELLATION\nCancellation with less than 7 days notice forfeits the deposit.`,freelancer:`This Services Agreement is between [Business Name] and [Client Name].\n\n1. SCOPE OF WORK\nServices as outlined in the project brief.\n\n2. PAYMENT\nDue within 14 days of invoice. Late payments incur 2% monthly interest.\n\n3. REVISIONS\nUp to 2 rounds of revisions included.\n\n4. IP\nAll work product transfers to client upon full payment.`,branding:`This Branding & Design Agreement is between [Business Name] and [Client Name].\n\n1. PROJECT SCOPE\nBrand identity design including logo, colour palette, and typography.\n\n2. REVISIONS\nTwo rounds included. Further revisions quoted separately.\n\n3. FILE DELIVERY\nFinal files provided upon receipt of full payment.\n\n4. USAGE RIGHTS\nClient receives full ownership upon payment.`};
  const t=templates[document.getElementById('nc2-template').value];if(t)document.getElementById('nc2-content').value=t;}

/* ══════════════════════════════════════════
   INVOICE PREVIEW / EDIT / DELETE
══════════════════════════════════════════ */

function openInvoicePreview(invoiceId){
  const inv=allInvoices.find(i=>String(i.id)===String(invoiceId));
  if(!inv){showToast('Invoice not found','error');return;}
  const client=allClients.find(c=>c.id===inv.client_id);
  const project=allProjects.find(p=>p.id===inv.project_id);
  const clientName=client?`${client.first_name} ${client.last_name}`:'—';
  const items=inv.line_items||[];
  const overdueFlag=inv.status==='sent'&&inv.due_date&&isOverdue(inv.due_date);
  const displayStatus=overdueFlag?'overdue':inv.status;

  const modal=document.getElementById('modal-invoice-preview');
  if(!modal)return;

  document.getElementById('inv-preview-body').innerHTML=`
    <div style="background:var(--ink);padding:24px 28px;margin:-20px -24px 24px;display:flex;justify-content:space-between;align-items:flex-start;">
      <div>
        <div style="font-family:'DM Serif Display',serif;font-size:20px;color:#f0eeff;">${escapeHtml(currentProfile?.business_name||'Studio')}</div>
        <div style="font-size:12px;color:rgba(240,238,255,.5);margin-top:3px;">${escapeHtml(currentProfile?.email||'')}</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:11px;color:rgba(240,238,255,.4);text-transform:uppercase;letter-spacing:.07em;margin-bottom:4px;">Invoice</div>
        <div style="font-family:'DM Serif Display',serif;font-size:20px;color:var(--accent);">#${escapeHtml(inv.invoice_number)}</div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px;">
      <div>
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--text-mid);margin-bottom:6px;">Billed To</div>
        <div style="font-weight:500;font-size:14px;color:var(--text);">${escapeHtml(clientName)}</div>
        ${client?`<div style="font-size:13px;color:var(--text-mid);">${escapeHtml(client.email)}</div>`:''}
      </div>
      <div style="text-align:right;">
        <div style="margin-bottom:8px;">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--text-mid);margin-bottom:3px;">Issue Date</div>
          <div style="font-size:13px;color:var(--text);">${formatDate(inv.created_at)}</div>
        </div>
        <div>
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--text-mid);margin-bottom:3px;">Due Date</div>
          <div style="font-size:13px;color:${overdueFlag?'var(--red)':'var(--text)'};">${inv.due_date?formatDate(inv.due_date):'No due date'}</div>
        </div>
      </div>
    </div>

    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
      <thead><tr style="border-bottom:1.5px solid var(--border);">
        <th style="text-align:left;padding:0 0 10px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-mid);width:50%">Description</th>
        <th style="text-align:left;padding:0 8px 10px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-mid)">Rate</th>
        <th style="text-align:left;padding:0 8px 10px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-mid)">Qty</th>
        <th style="text-align:right;padding:0 0 10px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-mid)">Total</th>
      </tr></thead>
      <tbody>
        ${items.map(item=>`<tr style="border-bottom:1px solid var(--border);">
          <td style="padding:10px 0;font-size:13.5px;color:var(--text);">${escapeHtml(item.description||'')}</td>
          <td style="padding:10px 8px;font-size:13.5px;color:var(--text);">${formatCurrency(item.rate)}</td>
          <td style="padding:10px 8px;font-size:13.5px;color:var(--text);">${item.qty}</td>
          <td style="padding:10px 0;text-align:right;font-weight:500;color:var(--text);">${formatCurrency(item.total)}</td>
        </tr>`).join('')}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="3" style="text-align:right;padding-top:14px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-mid);">Total</td>
          <td style="text-align:right;padding-top:14px;font-family:'DM Serif Display',serif;font-size:22px;color:var(--text);">${formatCurrency(inv.total)}</td>
        </tr>
      </tfoot>
    </table>

    ${inv.notes?`<div style="padding:14px;background:var(--surface2);border-radius:var(--r);font-size:13px;color:var(--text-mid);line-height:1.6;margin-bottom:16px;">${escapeHtml(inv.notes)}</div>`:''}
    ${inv.payment_link?`<div style="font-size:12px;color:var(--text-mid);">Payment link: <a href="${escapeHtml(inv.payment_link)}" target="_blank" style="color:var(--accent);">${escapeHtml(inv.payment_link)}</a></div>`:''}

    <div style="margin-top:20px;display:flex;align-items:center;justify-content:space-between;">
      <div>${statusBadge(displayStatus)}</div>
      <div style="font-size:12px;color:var(--text-mid);">Created ${formatDate(inv.created_at)}</div>
    </div>
  `;

  // Set footer buttons based on status
  document.getElementById('inv-preview-mark-sent').style.display=inv.status==='draft'?'block':'none';
  document.getElementById('inv-preview-mark-paid').style.display=inv.status==='sent'?'block':'none';
  document.getElementById('inv-preview-inv-id').value=invoiceId;

  openModal('invoice-preview');
}

async function invoicePreviewMarkSent(){
  const id=document.getElementById('inv-preview-inv-id').value;
  await db.from('invoices').update({status:'sent',sent_at:new Date().toISOString()}).eq('id',id);
  await loadInvoices();
  const inv=allInvoices.find(i=>String(i.id)===String(id));
  if(inv){
    document.getElementById('inv-preview-mark-sent').style.display='none';
    document.getElementById('inv-preview-mark-paid').style.display='block';
  }
  renderInvoicesPage();
  if(currentProjectId)openProject(currentProjectId);
  showToast('Invoice marked as sent','success');
}

async function invoicePreviewMarkPaid(){
  const id=document.getElementById('inv-preview-inv-id').value;
  await db.from('invoices').update({status:'paid',paid_at:new Date().toISOString()}).eq('id',id);
  await loadInvoices();
  document.getElementById('inv-preview-mark-paid').style.display='none';
  renderInvoicesPage();
  if(currentProjectId)openProject(currentProjectId);
  showToast('Invoice marked as paid!','success');
}

async function deleteInvoiceFromPreview(){
  const id=document.getElementById('inv-preview-inv-id')?.value;
  if(!id){showToast('No invoice selected','error');return;}
  const inv=allInvoices.find(i=>String(i.id)===String(id));
  if(!window.confirm('Delete invoice'+(inv?` #${inv.invoice_number}`:'')+`? This cannot be undone.`))return;
  const{error}=await db.from('invoices').delete().eq('id',id);
  if(error){showToast('Failed to delete: '+error.message,'error');return;}
  await loadInvoices();
  closeModal('invoice-preview');
  try{renderInvoicesPage();}catch(e){console.warn('renderInvoicesPage:',e);}
  updateInvoiceBadge();
  if(currentProjectId){try{openProject(currentProjectId);}catch(e){console.warn('openProject:',e);}}
  showToast('Invoice deleted','success');
}

function printInvoicePreview(){
  const id=document.getElementById('inv-preview-inv-id').value;
  const inv=allInvoices.find(i=>String(i.id)===String(id));
  const client=allClients.find(c=>c.id===inv?.client_id);
  const clientName=client?`${client.first_name} ${client.last_name}`:'';
  const items=inv?.line_items||[];

  const win=window.open('','_blank');
  win.document.write(`<!DOCTYPE html><html><head><title>Invoice #${escapeHtml(inv?.invoice_number||'')}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box;}
    body{font-family:-apple-system,'DM Sans',sans-serif;color:#16132a;padding:40px;font-size:14px;line-height:1.6;}
    .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px;padding-bottom:20px;border-bottom:2px solid #16132a;}
    .biz-name{font-size:22px;font-weight:600;letter-spacing:-.3px;}
    .inv-num{font-size:20px;font-weight:600;color:#6c5ce7;text-align:right;}
    .inv-label{font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:#888;margin-bottom:4px;text-align:right;}
    .meta{display:flex;justify-content:space-between;margin-bottom:28px;}
    .meta-block{}
    .meta-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#888;margin-bottom:5px;}
    .meta-val{font-size:14px;color:#16132a;}
    table{width:100%;border-collapse:collapse;margin-bottom:20px;}
    th{text-align:left;padding:8px 0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#888;border-bottom:1.5px solid #dde3f2;}
    td{padding:10px 0;border-bottom:1px solid #eef1f8;font-size:14px;}
    th:last-child,td:last-child{text-align:right;}
    .total-row td{border-top:2px solid #16132a;border-bottom:none;padding-top:14px;font-weight:600;font-size:18px;}
    .notes{background:#f0f2f9;padding:14px;border-radius:8px;font-size:13px;color:#5a6280;margin-bottom:16px;}
    .footer{text-align:center;margin-top:32px;padding-top:16px;border-top:1px solid #dde3f2;font-size:12px;color:#888;}
    ${inv?.payment_link?`.pay-link{display:inline-block;margin:16px 0;padding:12px 24px;background:#6c5ce7;color:white;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;}`:''}
  </style></head><body>
  <div class="header">
    <div>
      <div class="biz-name">${escapeHtml(currentProfile?.business_name||'Studio')}</div>
      <div style="font-size:13px;color:#888;margin-top:4px;">${escapeHtml(currentProfile?.email||'')}</div>
    </div>
    <div>
      <div class="inv-label">Invoice</div>
      <div class="inv-num">#${escapeHtml(inv?.invoice_number||'')}</div>
    </div>
  </div>
  <div class="meta">
    <div class="meta-block">
      <div class="meta-label">Billed To</div>
      <div class="meta-val" style="font-weight:500">${escapeHtml(clientName)}</div>
      ${client?`<div class="meta-val" style="color:#888">${escapeHtml(client.email)}</div>`:''}
    </div>
    <div class="meta-block" style="text-align:right">
      <div class="meta-label">Issue Date</div>
      <div class="meta-val">${formatDate(inv?.created_at)}</div>
      ${inv?.due_date?`<div class="meta-label" style="margin-top:10px">Due Date</div><div class="meta-val">${formatDate(inv.due_date)}</div>`:''}
    </div>
  </div>
  <table>
    <thead><tr><th style="width:50%">Description</th><th>Rate</th><th>Qty</th><th>Total</th></tr></thead>
    <tbody>${items.map(item=>`<tr>
      <td>${escapeHtml(item.description||'')}</td>
      <td>${formatCurrency(item.rate)}</td>
      <td>${item.qty}</td>
      <td>${formatCurrency(item.total)}</td>
    </tr>`).join('')}</tbody>
    <tfoot><tr class="total-row"><td colspan="3" style="text-align:right">Total</td><td>${formatCurrency(inv?.total)}</td></tr></tfoot>
  </table>
  ${inv?.notes?`<div class="notes">${escapeHtml(inv.notes)}</div>`:''}
  ${inv?.payment_link?`<a href="${escapeHtml(inv.payment_link)}" class="pay-link">Pay Now</a>`:''}
  <div class="footer">Thank you for your business</div>
  </body></html>`);
  win.document.close();
  setTimeout(()=>win.print(),600);
}

/* ══════════════════════════════════════════
   SHARE INVOICE
══════════════════════════════════════════ */
async function openShareInvoiceModal(preselectedId=null){
  const sel=document.getElementById('share-invoice-select');
  sel.innerHTML='<option value="">Choose invoice…</option>'+allInvoices.map(i=>`<option value="${i.id}" data-token="${i.share_token}">#${escapeHtml(i.invoice_number)} · ${formatCurrency(i.total)}</option>`).join('');
  if(preselectedId){sel.value=preselectedId;updateShareLink();}
  openModal('share-invoice');}
function updateShareLink(){const opt=document.getElementById('share-invoice-select').selectedOptions[0];const token=opt?.dataset?.token;document.getElementById('share-link-input').value=token?`https://sendzest.github.io/Studio-portal/invoice.html?token=${token}`:'';}
function copyShareLink(){const v=document.getElementById('share-link-input').value;if(!v){showToast('Select an invoice first','error');return;}navigator.clipboard.writeText(v);showToast('Link copied!','success');}
function copyAndCloseShareModal(){
  copyShareLink();
  closeModal('share-invoice');
}
// Keep old name as alias in case any HTML still references it
function emailShareLink(){copyAndCloseShareModal();}

/* ══════════════════════════════════════════
   MESSAGES
══════════════════════════════════════════ */
async function sendMessage(projectId){
  const input=document.getElementById('msg-input');const content=input.value.trim();if(!content)return;input.value='';
  const{error}=await db.from('messages').insert({project_id:projectId,sender_id:currentUser.id,sender_role:'owner',content});
  if(error){showToast('Failed','error');return;}
  const thread=document.getElementById('msg-thread');
  thread.innerHTML+=`<div class="msg-bubble mine"><div class="msg-text">${escapeHtml(content)}</div><div class="msg-time">just now</div></div>`;
  thread.scrollTop=thread.scrollHeight;}

/* ══════════════════════════════════════════
   POPULATES
══════════════════════════════════════════ */
function populateSelects(){
  ['np-client','ni-client','nc2-client','nb-client'].forEach(id=>{
    const el=document.getElementById(id);if(!el)return;
    const cur=el.value;while(el.options.length>1)el.remove(1);
    allClients.forEach(c=>{const o=document.createElement('option');o.value=c.id;o.textContent=`${c.first_name} ${c.last_name}`;el.appendChild(o);});
    if(cur)el.value=cur;
  });
  // For invoice client — add onchange to filter projects
  const niClient=document.getElementById('ni-client');
  if(niClient&&!niClient.dataset.bound){
    niClient.dataset.bound='1';
    niClient.addEventListener('change',()=>filterInvoiceProjects(niClient.value));
  }
  ['nc2-project','nb-project','note-project','files-project-filter'].forEach(id=>{
    const el=document.getElementById(id);if(!el)return;
    while(el.options.length>1)el.remove(1);
    allProjects.forEach(p=>{const o=document.createElement('option');o.value=p.id;o.textContent=p.name;el.appendChild(o);});
  });
  // ni-project starts empty — filtered by client selection
  const niProj=document.getElementById('ni-project');
  if(niProj){niProj.innerHTML='<option value="">Select client first…</option>';}
  renderColorSwatches('np-color-swatches',PROJECT_COLORS[allProjects.length%PROJECT_COLORS.length]);
}

function filterInvoiceProjects(clientId){
  const sel=document.getElementById('ni-project');if(!sel)return;
  sel.innerHTML='<option value="">Select project…</option>';
  const filtered=clientId?allProjects.filter(p=>p.client_id===clientId):allProjects;
  filtered.forEach(p=>{const o=document.createElement('option');o.value=p.id;o.textContent=p.name;sel.appendChild(o);});
  if(!clientId)sel.innerHTML='<option value="">Select client first…</option>';
}

function populateTimeProjectSelects(){
  const ss=document.getElementById('tp-studio-project-select');
  if(ss){ss.innerHTML='<option value="">No linked studio project</option>'+allProjects.map(p=>`<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');}
}

/* ══════════════════════════════════════════
   HELPERS for tab switch
══════════════════════════════════════════ */
function switchTab(btn,group,targetId){
  const container=btn.parentElement;
  container.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));btn.classList.add('active');
  const target=document.getElementById(targetId);
  if(target){document.querySelectorAll('.tab-content').forEach(t=>{if(t.id===targetId)t.classList.add('active');else if(t.closest('#page-projects'))t.classList.remove('active');});}
}

/* ══════════════════════════════════════════
   NOTION INTEGRATION
══════════════════════════════════════════ */

async function saveNotionToken() {
  const token = document.getElementById('s-notion-token')?.value.trim();
  if (!token) { showToast('Enter a token first', 'error'); return; }
  const { error } = await db.from('profiles').update({ notion_token: token }).eq('id', currentUser.id);
  if (error) { showToast('Failed to save', 'error'); return; }
  if (currentProfile) currentProfile.notion_token = token;
  showToast('Notion token saved!', 'success');
  renderDashboardNotion();
}

async function testNotionConnection() {
  const token = document.getElementById('s-notion-token')?.value.trim() || currentProfile?.notion_token;
  if (!token) { showToast('Enter a token first', 'error'); return; }
  showToast('Testing connection…');
  // Test by searching for pages
  try {
    const res = await fetch('https://api.notion.com/v1/search', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ page_size: 1 })
    });
    if (res.ok) {
      showToast('Notion connected!', 'success');
      loadNotionPages(token);
    } else {
      showToast('Connection failed — check your token', 'error');
    }
  } catch (e) {
    showToast('Connection failed', 'error');
  }
}

async function loadNotionPages(token) {
  if (!token) return;
  const list = document.getElementById('notion-pages-list');
  if (!list) return;

  try {
    const res = await fetch('https://api.notion.com/v1/search', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sort: { direction: 'descending', timestamp: 'last_edited_time' },
        page_size: 4
      })
    });

    if (!res.ok) {
      list.innerHTML = `<div style="font-size:12px;color:var(--text-mid);text-align:center;padding:8px">Could not load pages — check your token in Settings</div>`;
      return;
    }

    const data = await res.json();
    const pages = data.results || [];

    if (!pages.length) {
      list.innerHTML = `<div style="font-size:12px;color:var(--text-mid);text-align:center;padding:8px">No pages found — make sure your integration has access to pages</div>`;
      return;
    }

    list.innerHTML = pages.map(p => {
      const title = p.properties?.title?.title?.[0]?.plain_text ||
                    p.properties?.Name?.title?.[0]?.plain_text ||
                    'Untitled';
      const edited = timeAgo(p.last_edited_time);
      const url = p.url;
      const icon = p.icon?.emoji || '📄';
      return `<div style="padding:9px 10px;background:var(--surface2);border-radius:var(--r);cursor:pointer;transition:background .14s;"
        onmouseover="this.style.background='var(--accent-soft)'"
        onmouseout="this.style.background='var(--surface2)'"
        onclick="window.open('${url}','_blank')">
        <div style="display:flex;align-items:center;gap:7px;">
          <span style="font-size:14px;">${icon}</span>
          <div style="min-width:0;flex:1;">
            <div style="font-size:13px;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(title)}</div>
            <div style="font-size:11px;color:var(--text-mid);">Edited ${edited}</div>
          </div>
        </div>
      </div>`;
    }).join('');

  } catch (e) {
    if (list) list.innerHTML = `<div style="font-size:12px;color:var(--text-mid);text-align:center;padding:8px">Failed to load Notion pages</div>`;
  }
}
