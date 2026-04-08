/* js/client.js — Supabase client + shared auth utilities */

const SUPABASE_URL = 'https://irsnlxbkzqeqstovtwlu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlyc25seGJrenFlcXN0b3Z0d2x1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxMzE3NzcsImV4cCI6MjA5MDcwNzc3N30.TW3AicYTNoTS4jOIDDBWRYrqAF2jAwWRgSOetA2oXgU';

const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ── THEME ── */
function initTheme() {
  const saved = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
  return saved;
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  document.querySelectorAll('.theme-toggle').forEach(btn => {
    btn.textContent = next === 'dark' ? '☀️' : '🌙';
  });
}

/* ── TOAST ── */
function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = type === 'success' ? '✓ ' + msg : type === 'error' ? '✕ ' + msg : msg;
  t.className = 'toast show' + (type ? ' ' + type : '');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 3000);
}

/* ── MODAL ── */
function openModal(id) {
  const el = document.getElementById('modal-' + id);
  if (el) el.classList.add('open');
}

function closeModal(id) {
  const el = document.getElementById('modal-' + id);
  if (el) el.classList.remove('open');
}

function initModals() {
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) overlay.classList.remove('open');
    });
  });
}

/* ── TABS ── */
function initTabs() {
  document.querySelectorAll('.tabs').forEach(group => {
    group.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        group.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const target = tab.dataset.target;
        if (target) {
          document.querySelectorAll(`[data-tab-group="${group.dataset.group}"]`).forEach(p => p.classList.remove('active'));
          const targetEl = document.getElementById(target);
          if (targetEl) targetEl.classList.add('active');
        }
      });
    });
  });
}

/* ── PORTAL TABS ── */
function switchPortalTab(btn, targetId) {
  btn.closest('.portal-tabs').querySelectorAll('.portal-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.portal-tab-content').forEach(t => t.classList.remove('active'));
  const el = document.getElementById(targetId);
  if (el) el.classList.add('active');
}

/* ── HELPERS ── */
function formatCurrency(amount, currency = 'GBP') {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amount || 0);
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateShort(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return formatDateShort(dateStr);
}

function initials(name) {
  if (!name) return '?';
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

function isOverdue(dueDateStr) {
  if (!dueDateStr) return false;
  return new Date(dueDateStr) < new Date() && new Date(dueDateStr).toDateString() !== new Date().toDateString();
}

function statusBadge(status) {
  const map = {
    paid: 'b-complete', complete: 'b-complete', signed: 'b-signed',
    sent: 'b-booked', booked: 'b-booked', in_progress: 'b-booked',
    pending: 'b-pending', overdue: 'b-overdue', draft: 'b-draft',
    enquiry: 'b-draft', delivered: 'b-pending', cancelled: 'b-draft',
    awaiting: 'b-pending', confirmed: 'b-booked'
  };
  const labels = {
    paid: 'Paid', complete: 'Complete', signed: 'Signed',
    sent: 'Sent', booked: 'Booked', in_progress: 'In Progress',
    pending: 'Pending', overdue: 'Overdue', draft: 'Draft',
    enquiry: 'Enquiry', delivered: 'Delivered', cancelled: 'Cancelled',
    awaiting: 'Awaiting Signature', confirmed: 'Confirmed'
  };
  const cls = map[status] || 'b-draft';
  const label = labels[status] || status;
  return `<span class="badge ${cls}">${label}</span>`;
}

function getProjectStages(status) {
  const stages = ['enquiry', 'booked', 'in_progress', 'delivered', 'complete'];
  const labels = { enquiry: 'Enquiry', booked: 'Contract Signed', in_progress: 'In Progress', delivered: 'Delivered', complete: 'Complete' };
  const current = stages.indexOf(status);
  return stages.map((s, i) => ({
    key: s,
    label: labels[s],
    done: i < current,
    current: i === current
  }));
}

function renderTimeline(status) {
  const stages = getProjectStages(status);
  return `<div class="status-timeline">
    ${stages.map((s, i) => `
      <div class="tl-step ${s.done ? 'done' : s.current ? 'current' : ''}">
        <div class="tl-dot">${s.done ? '✓' : s.current ? '→' : ''}</div>
        <div class="tl-label">${s.label}</div>
      </div>
      ${i < stages.length - 1 ? '' : ''}
    `).join('')}
  </div>`;
}

/* ── SIGNATURE PAD ── */
function initSignaturePad(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;

  const ctx = canvas.getContext('2d');
  let drawing = false;
  let hasDrawn = false;

  // Set actual pixel size
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * window.devicePixelRatio;
  canvas.height = rect.height * window.devicePixelRatio;
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--ink').trim() || '#1a1814';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  function getPos(e) {
    const r = canvas.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    return { x: src.clientX - r.left, y: src.clientY - r.top };
  }

  function start(e) {
    e.preventDefault();
    drawing = true;
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function move(e) {
    e.preventDefault();
    if (!drawing) return;
    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    hasDrawn = true;
  }

  function end(e) { e.preventDefault(); drawing = false; }

  canvas.addEventListener('mousedown', start);
  canvas.addEventListener('mousemove', move);
  canvas.addEventListener('mouseup', end);
  canvas.addEventListener('mouseleave', end);
  canvas.addEventListener('touchstart', start, { passive: false });
  canvas.addEventListener('touchmove', move, { passive: false });
  canvas.addEventListener('touchend', end, { passive: false });

  return {
    clear() {
      ctx.clearRect(0, 0, canvas.width / window.devicePixelRatio, canvas.height / window.devicePixelRatio);
      hasDrawn = false;
    },
    isEmpty() { return !hasDrawn; },
    toDataURL() { return canvas.toDataURL('image/png'); }
  };
}

/* ── DRAG & DROP UPLOAD ── */
function initUploadZone(zoneId, onFiles) {
  const zone = document.getElementById(zoneId);
  if (!zone) return;

  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    onFiles([...e.dataTransfer.files]);
  });

  zone.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '*/*';
    input.onchange = () => onFiles([...input.files]);
    input.click();
  });
}

/* ── FILE SIZE ── */
function formatBytes(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function fileIcon(mimeType) {
  if (!mimeType) return '📄';
  if (mimeType.startsWith('image/')) return '🖼️';
  if (mimeType === 'application/pdf') return '📋';
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return '📊';
  if (mimeType.includes('word') || mimeType.includes('document')) return '📝';
  if (mimeType.includes('zip') || mimeType.includes('archive')) return '🗜';
  if (mimeType.startsWith('video/')) return '🎥';
  return '📄';
}

/* ── AVATAR COLOR ── */
function avatarColor(str) {
  const colors = [
    { bg: '#e8e2d5', color: '#6b5c40' },
    { bg: '#e6f0f8', color: '#2a5c8a' },
    { bg: '#eaf3ee', color: '#3d7a52' },
    { bg: '#fef4e3', color: '#b8720a' },
    { bg: '#f0ebf8', color: '#6b4fa0' },
    { bg: '#fdecea', color: '#b83232' },
  ];
  let hash = 0;
  for (let c of (str || '')) hash = c.charCodeAt(0) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

/* ── CONFIRM ── */
function confirm(msg) {
  return window.confirm(msg);
}
