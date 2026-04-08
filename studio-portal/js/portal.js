/* js/portal.js — Client portal logic */

let portalUser = null;
let portalClient = null;
let portalProjects = [];
let currentPortalProject = null;
let sigPad = null;
let currentSignContractId = null;

(async function init() {
  initTheme();
  updateThemeIcon();
  initModals();

  const { data: { session } } = await db.auth.getSession();

  if (!session) {
    showLoginScreen();
    return;
  }

  portalUser = session.user;
  await loadPortalClient();
})();

function updateThemeIcon() {
  const theme = localStorage.getItem('theme') || 'light';
  const btn = document.getElementById('portal-theme-btn');
  if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
}

function showLoginScreen() {
  document.getElementById('portal-login-screen').style.display = 'flex';
  document.getElementById('portal-app').style.display = 'none';
}

function showPortalApp() {
  document.getElementById('portal-login-screen').style.display = 'none';
  document.getElementById('portal-app').style.display = 'flex';
}

async function sendPortalMagicLink() {
  const email = document.getElementById('portal-email').value.trim();
  if (!email) { showPortalError('Please enter your email address.'); return; }

  const { error } = await db.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: 'https://sendzest.github.io/Studio-portal/portal.html' }
  });

  if (error) { showPortalError(error.message); return; }

  document.getElementById('portal-magic-email').textContent = email;
  document.getElementById('portal-login-form').style.display = 'none';
  document.getElementById('portal-magic-sent').style.display = 'block';
}

async function portalSignIn() {
  const email = document.getElementById('portal-email').value.trim();
  const password = document.getElementById('portal-password').value;
  if (!email || !password) { showPortalError('Please enter your email and password.'); return; }

  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) { showPortalError(error.message); return; }

  portalUser = (await db.auth.getUser()).data.user;
  await loadPortalClient();
}

async function portalSignOut() {
  await db.auth.signOut();
  showLoginScreen();
}

function showPortalError(msg) {
  const el = document.getElementById('portal-auth-error');
  el.textContent = msg;
  el.classList.add('show');
}

async function loadPortalClient() {
  // Find client record linked to this user
  const { data: client } = await db.from('clients')
    .select('*')
    .eq('portal_user_id', portalUser.id)
    .single();

  if (!client) {
    // If no client record, check if this is the owner trying to preview
    const { data: profile } = await db.from('profiles').select('*').eq('id', portalUser.id).single();
    if (profile) {
      // Owner previewing — load first client for demo
      showToast('Previewing portal as studio owner');
      const { data: firstClient } = await db.from('clients').select('*').eq('owner_id', portalUser.id).limit(1).single();
      if (firstClient) {
        portalClient = firstClient;
      } else {
        showPortalError('No clients found. Add a client first.');
        showLoginScreen();
        return;
      }
    } else {
      showPortalError('No portal access found for this email. Please contact your studio.');
      showLoginScreen();
      return;
    }
  } else {
    portalClient = client;
  }

  const name = `${portalClient.first_name} ${portalClient.last_name}`;
  document.getElementById('portal-client-name').textContent = name;
  const av = document.getElementById('portal-client-avatar');
  av.textContent = initials(name);
  const col = avatarColor(name);
  av.style.background = col.bg;
  av.style.color = col.color;

  // Load owner profile for welcome message
  const { data: profile } = await db.from('profiles')
    .select('portal_welcome_message, portal_name')
    .eq('id', portalClient.owner_id)
    .single();

  if (profile?.portal_welcome_message) {
    document.getElementById('portal-welcome-text').textContent = profile.portal_welcome_message;
  }

  showPortalApp();
  await loadPortalProjects();
}

async function loadPortalProjects() {
  const { data: projects } = await db.from('projects')
    .select('*')
    .eq('client_id', portalClient.id)
    .order('created_at', { ascending: false });

  portalProjects = projects || [];

  if (portalProjects.length === 0) {
    document.getElementById('portal-project-name').textContent = 'No projects yet';
    document.getElementById('portal-timeline').innerHTML = '<div style="color:var(--text-mid);font-size:13px;">No projects found.</div>';
    return;
  }

  // Project selector if multiple
  if (portalProjects.length > 1) {
    const selector = document.getElementById('portal-project-selector');
    const select = document.getElementById('portal-project-select');
    selector.style.display = 'block';
    select.innerHTML = portalProjects.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
  }

  currentPortalProject = portalProjects[0];
  await renderPortalProject();
}

async function loadPortalProject() {
  const id = document.getElementById('portal-project-select').value;
  currentPortalProject = portalProjects.find(p => p.id === id);
  await renderPortalProject();
}

async function renderPortalProject() {
  if (!currentPortalProject) return;

  document.getElementById('portal-project-name').textContent = currentPortalProject.name;
  document.getElementById('portal-project-meta').textContent =
    `${currentPortalProject.service_type || 'Project'} · Started ${formatDate(currentPortalProject.start_date || currentPortalProject.created_at)}`;

  document.getElementById('portal-timeline').innerHTML = renderTimeline(currentPortalProject.status);

  await Promise.all([
    renderPortalInvoices(),
    renderPortalContracts(),
    renderPortalFiles(),
    renderPortalMessages(),
    renderPortalNotes(),
    renderPortalOverview(),
  ]);
}

async function renderPortalOverview() {
  const { data: invoices } = await db.from('invoices').select('*').eq('client_id', portalClient.id);
  const { data: contracts } = await db.from('contracts').select('*').eq('client_id', portalClient.id);

  const totalDue = (invoices || []).reduce((s, i) => s + (i.total || 0), 0);
  const paid = (invoices || []).filter(i => i.status === 'paid').reduce((s, i) => s + (i.total || 0), 0);
  const balance = totalDue - paid;
  const pct = totalDue > 0 ? Math.round((paid / totalDue) * 100) : 0;

  document.getElementById('portal-balance').textContent = formatCurrency(balance);
  document.getElementById('portal-balance-sub').textContent = `${formatCurrency(paid)} paid of ${formatCurrency(totalDue)} total`;
  document.getElementById('portal-balance-bar').style.width = pct + '%';

  // Next steps
  const steps = [];
  const overdue = (invoices || []).filter(i => i.status === 'sent' && i.due_date && isOverdue(i.due_date));
  const unsigned = (contracts || []).filter(c => c.status === 'sent');
  const pending = (invoices || []).filter(i => i.status === 'sent' && !(i.due_date && isOverdue(i.due_date)));

  if (overdue.length > 0) steps.push(`<div style="display:flex;align-items:center;gap:8px;font-size:13px;margin-bottom:6px;"><span>⚠️</span> ${overdue.length} overdue invoice${overdue.length > 1 ? 's' : ''}</div>`);
  if (unsigned.length > 0) steps.push(`<div style="display:flex;align-items:center;gap:8px;font-size:13px;margin-bottom:6px;"><span>✍️</span> ${unsigned.length} contract${unsigned.length > 1 ? 's' : ''} awaiting signature</div>`);
  if (pending.length > 0) steps.push(`<div style="display:flex;align-items:center;gap:8px;font-size:13px;margin-bottom:6px;color:var(--text-mid);"><span>🕐</span> ${pending.length} outstanding invoice${pending.length > 1 ? 's' : ''}</div>`);
  if (steps.length === 0) steps.push(`<div style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--green);"><span>✓</span> You're all up to date!</div>`);

  document.getElementById('portal-next-steps').innerHTML = steps.join('');

  // All projects table
  document.getElementById('portal-projects-table').innerHTML = `
    <table style="width:100%;border-collapse:collapse;">
      <thead><tr style="border-bottom:1px solid var(--border);">
        <th style="text-align:left;padding:8px 10px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:var(--text-mid);">Project</th>
        <th style="text-align:left;padding:8px 10px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:var(--text-mid);">Type</th>
        <th style="text-align:left;padding:8px 10px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:var(--text-mid);">Status</th>
      </tr></thead>
      <tbody>
        ${portalProjects.map(p => `
          <tr style="border-bottom:1px solid var(--border);cursor:pointer;" onclick="selectProject('${p.id}')">
            <td style="padding:11px 10px;font-weight:500;color:var(--text);">${p.name}</td>
            <td style="padding:11px 10px;color:var(--text-mid);">${p.service_type || '—'}</td>
            <td style="padding:11px 10px;">${statusBadge(p.status)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function selectProject(id) {
  const select = document.getElementById('portal-project-select');
  if (select) select.value = id;
  currentPortalProject = portalProjects.find(p => p.id === id);
  renderPortalProject();
  switchPortalTab(document.querySelector('.portal-tab'), 'ptab-overview');
}

async function renderPortalInvoices() {
  const { data: invoices } = await db.from('invoices')
    .select('*')
    .eq('client_id', portalClient.id)
    .order('created_at', { ascending: false });

  const container = document.getElementById('portal-invoices-list');
  if (!invoices || invoices.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">🧾</div><div class="empty-title">No invoices yet</div></div>`;
    return;
  }

  container.innerHTML = invoices.map(inv => {
    const overdueFlag = inv.status === 'sent' && inv.due_date && isOverdue(inv.due_date);
    const displayStatus = overdueFlag ? 'overdue' : inv.status;
    const canPay = ['sent', 'overdue'].includes(displayStatus);
    return `<div class="card" style="padding:15px 18px;display:flex;align-items:center;gap:13px;margin-bottom:10px;">
      <span style="font-size:20px;">🧾</span>
      <div style="flex:1;min-width:0;">
        <div style="font-weight:500;font-size:14px;color:var(--text);">Invoice #${inv.invoice_number}</div>
        <div style="font-size:12px;color:${overdueFlag ? 'var(--red)' : 'var(--text-mid)'};">
          ${inv.due_date ? (overdueFlag ? '⚠️ Overdue · ' : 'Due ') + formatDate(inv.due_date) : 'No due date'}
        </div>
      </div>
      <div style="font-weight:600;font-size:14px;color:var(--text);">${formatCurrency(inv.total)}</div>
      ${statusBadge(displayStatus)}
      ${canPay ? `<button class="btn ${overdueFlag ? 'btn-red' : 'btn-gold'} btn-sm" onclick="showPaymentInfo('${inv.id}')">Pay Now</button>` : ''}
      <button class="btn btn-ghost btn-sm" onclick="downloadPortalInvoice('${inv.id}')">PDF</button>
    </div>`;
  }).join('');
}

async function renderPortalContracts() {
  const { data: contracts } = await db.from('contracts')
    .select('*')
    .eq('client_id', portalClient.id)
    .order('created_at', { ascending: false });

  const container = document.getElementById('portal-contracts-list');
  if (!contracts || contracts.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">📝</div><div class="empty-title">No contracts yet</div></div>`;
    return;
  }

  container.innerHTML = contracts.map(c => `
    <div class="card" style="padding:18px;margin-bottom:12px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
        <div>
          <div style="font-weight:500;font-size:14px;color:var(--text);">${c.title}</div>
          <div style="font-size:12px;color:var(--text-mid);">Sent ${formatDate(c.sent_at || c.created_at)}${c.signed_at ? ' · Signed ' + formatDate(c.signed_at) : ''}</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          ${statusBadge(c.signed_at ? 'signed' : c.status)}
          ${!c.signed_at && c.status === 'sent' ? `<button class="btn btn-green btn-sm" onclick="openSignModal('${c.id}','${escapeAttr(c.title)}','${escapeAttr(c.content)}')">Sign Contract</button>` : ''}
        </div>
      </div>
      <div style="background:var(--surface2);border-radius:var(--r);padding:13px;font-size:13px;color:var(--text-mid);line-height:1.7;max-height:120px;overflow:hidden;position:relative;">
        ${escapeHtml(c.content).substring(0, 400)}${c.content.length > 400 ? '…' : ''}
        <div style="position:absolute;bottom:0;left:0;right:0;height:40px;background:linear-gradient(transparent,var(--surface2));"></div>
      </div>
    </div>
  `).join('');
}

async function renderPortalFiles() {
  const { data: files } = await db.from('files')
    .select('*')
    .eq('client_id', portalClient.id)
    .eq('visible_to_client', true)
    .order('created_at', { ascending: false });

  const container = document.getElementById('portal-files-list');

  initUploadZone('portal-upload-zone', uploadPortalFiles);

  if (!files || files.length === 0) {
    container.innerHTML = `<div style="color:var(--text-mid);font-size:13px;text-align:center;padding:20px 0;">No files shared yet</div>`;
    return;
  }

  container.innerHTML = `<div class="files-grid" style="margin-top:4px;">${files.map(f => `
    <div class="file-card" onclick="downloadPortalFile('${f.storage_path}','${f.name}')">
      <div class="file-icon">${fileIcon(f.mime_type)}</div>
      <div class="file-name" title="${f.name}">${f.name}</div>
      <div class="file-meta">${formatBytes(f.size_bytes)} · ${formatDateShort(f.created_at)}</div>
    </div>
  `).join('')}</div>`;
}

async function uploadPortalFiles(files) {
  for (const file of files) {
    if (file.size > 50 * 1024 * 1024) { showToast(`${file.name} too large (max 50MB)`, 'error'); continue; }
    const path = `client-uploads/${portalClient.owner_id}/${portalClient.id}/${Date.now()}-${file.name}`;
    const { error: upErr } = await db.storage.from('project-files').upload(path, file);
    if (upErr) { showToast(`Failed to upload ${file.name}`, 'error'); continue; }
    await db.from('files').insert({
      owner_id: portalClient.owner_id,
      client_id: portalClient.id,
      project_id: currentPortalProject?.id || null,
      name: file.name,
      storage_path: path,
      mime_type: file.type,
      size_bytes: file.size,
      uploaded_by: 'client',
      visible_to_client: true,
    });
    showToast(`${file.name} uploaded!`, 'success');
  }
  renderPortalFiles();
}

async function downloadPortalFile(storagePath, name) {
  const { data } = await db.storage.from('project-files').createSignedUrl(storagePath, 3600);
  if (data?.signedUrl) {
    const a = document.createElement('a');
    a.href = data.signedUrl;
    a.download = name;
    a.click();
  }
}

async function renderPortalMessages() {
  if (!currentPortalProject) return;

  const { data: messages } = await db.from('messages')
    .select('*')
    .eq('project_id', currentPortalProject.id)
    .order('created_at');

  const thread = document.getElementById('portal-msg-thread');

  if (!messages || messages.length === 0) {
    thread.innerHTML = '<div style="color:var(--text-mid);font-size:13px;text-align:center;padding:20px;">No messages yet. Start a conversation with your studio.</div>';
    return;
  }

  // Mark messages as read
  const unread = messages.filter(m => m.sender_role === 'owner' && !m.read_at);
  if (unread.length > 0) {
    await db.from('messages').update({ read_at: new Date().toISOString() })
      .in('id', unread.map(m => m.id));
  }

  thread.innerHTML = messages.map(m => {
    const mine = m.sender_role === 'client';
    return `<div class="msg-bubble ${mine ? 'mine' : 'theirs'}">
      <div class="msg-text">${escapeHtml(m.content)}</div>
      <div class="msg-time">${mine ? 'You' : 'Studio'} · ${timeAgo(m.created_at)}</div>
    </div>`;
  }).join('');

  thread.scrollTop = thread.scrollHeight;

  // Badge
  const badge = document.getElementById('portal-msg-badge');
  if (badge) {
    if (unread.length > 0) {
      badge.textContent = unread.length;
      badge.style.display = 'inline';
    } else {
      badge.style.display = 'none';
    }
  }
}

async function sendPortalMessage() {
  if (!currentPortalProject) { showToast('No project selected', 'error'); return; }
  const input = document.getElementById('portal-msg-input');
  const content = input.value.trim();
  if (!content) return;

  input.value = '';

  const { error } = await db.from('messages').insert({
    project_id: currentPortalProject.id,
    sender_id: portalUser.id,
    sender_role: 'client',
    content,
  });

  if (error) { showToast('Failed to send message', 'error'); return; }

  const thread = document.getElementById('portal-msg-thread');
  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble mine';
  bubble.innerHTML = `<div class="msg-text">${escapeHtml(content)}</div><div class="msg-time">You · just now</div>`;
  thread.appendChild(bubble);
  thread.scrollTop = thread.scrollHeight;
}

async function sendFromModal() {
  const content = document.getElementById('portal-modal-msg').value.trim();
  if (!content) return;
  document.getElementById('portal-msg-input').value = content;
  document.getElementById('portal-modal-msg').value = '';
  closeModal('portal-message');
  switchPortalTab(document.querySelectorAll('.portal-tab')[4], 'ptab-messages');
  await sendPortalMessage();
}

async function renderPortalNotes() {
  if (!currentPortalProject) return;

  const { data: notes } = await db.from('notes')
    .select('*')
    .eq('project_id', currentPortalProject.id)
    .eq('visible_to_client', true)
    .order('created_at', { ascending: false });

  const container = document.getElementById('portal-notes-list');

  const clientNotes = await db.from('notes')
    .select('*')
    .eq('project_id', currentPortalProject.id)
    .eq('owner_id', portalClient.owner_id);

  // Show studio-shared notes + any client-added notes
  const allNotes = notes || [];
  if (allNotes.length === 0) {
    container.innerHTML = '<div style="color:var(--text-mid);font-size:13px;margin-bottom:12px;">No notes shared yet.</div>';
    return;
  }

  container.innerHTML = allNotes.map(n => `
    <div class="note-item" style="margin-bottom:8px;">
      <div class="note-title">${n.type === 'link' ? '🔗 ' : ''}${n.title}</div>
      <div class="note-preview">${n.type === 'link' ? `<a href="${escapeHtml(n.url)}" target="_blank" style="color:var(--blue);">${n.url}</a>` : escapeHtml(n.content || '')}</div>
      <div class="note-date">${formatDateShort(n.created_at)}</div>
    </div>
  `).join('');
}

function togglePortalNoteType() {
  const type = document.getElementById('pnote-type').value;
  document.getElementById('pnote-content-group').style.display = type === 'note' ? 'block' : 'none';
  document.getElementById('pnote-url-group').style.display = type === 'link' ? 'block' : 'none';
}

async function addPortalNote() {
  if (!currentPortalProject) { showToast('No project selected', 'error'); return; }
  const type = document.getElementById('pnote-type').value;
  const title = document.getElementById('pnote-title').value.trim();
  const content = document.getElementById('pnote-content').value.trim();
  const url = document.getElementById('pnote-url').value.trim();

  if (!title) { showToast('Title is required', 'error'); return; }

  const { error } = await db.from('notes').insert({
    owner_id: portalClient.owner_id,
    project_id: currentPortalProject.id,
    title, type,
    content: type === 'note' ? content : null,
    url: type === 'link' ? url : null,
    visible_to_client: true,
  });

  if (error) { showToast('Failed to save note', 'error'); return; }
  document.getElementById('pnote-title').value = '';
  document.getElementById('pnote-content').value = '';
  document.getElementById('pnote-url').value = '';
  renderPortalNotes();
  showToast('Note added!', 'success');
}

/* ── SIGNATURE ── */
function openSignModal(contractId, title, content) {
  currentSignContractId = contractId;
  document.getElementById('sign-modal-title').textContent = `Sign: ${title}`;
  document.getElementById('sign-modal-preview').innerHTML = escapeHtml(content).substring(0, 600) + (content.length > 600 ? '…' : '');
  openModal('portal-sign');
  setTimeout(() => {
    sigPad = initSignaturePad('sig-canvas');
  }, 100);
}

async function submitSignature() {
  if (!sigPad || sigPad.isEmpty()) {
    showToast('Please draw your signature first', 'error');
    return;
  }

  const signatureData = sigPad.toDataURL();

  const { error } = await db.from('contracts').update({
    status: 'signed',
    signature_data: signatureData,
    signed_at: new Date().toISOString(),
    signed_ip: 'client',
  }).eq('id', currentSignContractId);

  if (error) { showToast('Failed to submit signature', 'error'); return; }

  closeModal('portal-sign');
  renderPortalContracts();
  showToast('Contract signed successfully!', 'success');
}

/* ── PAYMENT ── */
function showPaymentInfo(invoiceId) {
  showToast('Bank transfer details will appear here. Stripe integration coming soon.');
}

function downloadPortalInvoice(invoiceId) {
  showToast('PDF download coming soon');
}

/* ── HELPERS ── */
function escapeHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function escapeAttr(str) {
  return String(str || '').replace(/'/g, '\\\'').replace(/\n/g, ' ').substring(0, 200);
}
