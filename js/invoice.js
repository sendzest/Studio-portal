/* js/invoice.js — Public invoice share page */

(async function init() {
  initTheme();
  updateThemeIcon();

  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');

  if (!token) {
    showError('No invoice token provided.');
    return;
  }

  // Fetch invoice by share token
  const { data: invoice, error } = await db
    .from('invoices')
    .select('*, clients(first_name, last_name, email), profiles(business_name, email)')
    .eq('share_token', token)
    .single();

  if (error || !invoice) {
    showError('This invoice link is invalid or has expired.');
    return;
  }

  // Check expiry
  if (invoice.share_expires_at && new Date(invoice.share_expires_at) < new Date()) {
    showError('This invoice link has expired. Please contact your studio for a new link.');
    return;
  }

  renderInvoice(invoice);
})();

function updateThemeIcon() {
  const theme = localStorage.getItem('theme') || 'light';
  document.querySelectorAll('.theme-toggle').forEach(btn => {
    btn.textContent = theme === 'dark' ? '☀️' : '🌙';
  });
}

function showError(msg) {
  document.getElementById('invoice-loading').style.display = 'none';
  document.getElementById('invoice-error').style.display = 'flex';
  document.getElementById('invoice-error-msg').textContent = msg;
}

function renderInvoice(invoice) {
  document.getElementById('invoice-loading').style.display = 'none';
  document.getElementById('invoice-page').style.display = 'block';

  // Business info
  const profile = invoice.profiles;
  document.getElementById('inv-business-name').textContent = profile?.business_name || 'Studio.';
  document.getElementById('inv-business-email').textContent = profile?.email || '';
  document.title = `Invoice #${invoice.invoice_number}`;

  // Invoice meta
  document.getElementById('inv-number').textContent = `#${invoice.invoice_number}`;

  // Client
  const client = invoice.clients;
  document.getElementById('inv-client-name').textContent = client
    ? `${client.first_name} ${client.last_name}` : '—';
  document.getElementById('inv-client-email').textContent = client?.email || '';

  // Dates
  document.getElementById('inv-created').textContent = formatDate(invoice.created_at);

  const dueEl = document.getElementById('inv-due');
  if (invoice.due_date) {
    const overdue = isOverdue(invoice.due_date) && invoice.status !== 'paid';
    dueEl.textContent = formatDate(invoice.due_date) + (overdue ? ' — Overdue' : '');
    dueEl.style.color = overdue ? 'var(--red)' : 'var(--text)';
  } else {
    dueEl.textContent = 'No due date';
  }

  // Status banner
  const banner = document.getElementById('inv-status-banner');
  if (invoice.status === 'paid') {
    banner.innerHTML = `<div style="background:var(--green-light);border:1px solid rgba(61,122,82,0.2);border-radius:var(--r);padding:12px 16px;font-size:13px;font-weight:600;color:var(--green);">✓ This invoice has been paid</div>`;
  } else if (invoice.due_date && isOverdue(invoice.due_date)) {
    banner.innerHTML = `<div style="background:var(--red-light);border:1px solid rgba(184,50,50,0.2);border-radius:var(--r);padding:12px 16px;font-size:13px;font-weight:600;color:var(--red);">⚠️ This invoice is overdue</div>`;
  }

  // Line items
  const tbody = document.getElementById('inv-line-items');
  const items = invoice.line_items || [];
  if (items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="padding:14px 0;color:var(--text-mid);font-size:13px;">No line items</td></tr>`;
  } else {
    tbody.innerHTML = items.map(item => `
      <tr>
        <td style="padding:11px 0;">${escapeHtml(item.description || '')}</td>
        <td style="padding:11px 0;">${formatCurrency(item.rate)}</td>
        <td style="padding:11px 0;">${item.qty}</td>
        <td style="padding:11px 0;text-align:right;font-weight:500;">${formatCurrency(item.total)}</td>
      </tr>
    `).join('');
  }

  document.getElementById('inv-subtotal').textContent = formatCurrency(invoice.subtotal || invoice.total);
  document.getElementById('inv-total').textContent = formatCurrency(invoice.total);

  // Notes
  if (invoice.notes) {
    document.getElementById('inv-notes-section').style.display = 'block';
    document.getElementById('inv-notes').textContent = invoice.notes;
  }

  // Actions
  const actions = document.getElementById('inv-actions');
  if (invoice.status === 'paid') {
    document.getElementById('inv-paid-section').style.display = 'block';
    if (invoice.paid_at) {
      document.getElementById('inv-paid-date').textContent = `Paid on ${formatDate(invoice.paid_at)}`;
    }
    actions.innerHTML = `<button class="btn btn-outline btn-full no-print" onclick="window.print()">🖨 Print / Save as PDF</button>`;
  } else {
    const payLink = invoice.payment_link;
    actions.innerHTML = `
      ${payLink ? `<a href="${escapeHtml(payLink)}" target="_blank" class="btn btn-gold btn-full btn-lg" style="text-decoration:none;justify-content:center;">Pay ${formatCurrency(invoice.total)}</a>` : ''}
      <button class="btn btn-outline btn-full no-print" onclick="window.print()">🖨 Print / Save as PDF</button>
    `;
  }
}

function showPaymentOptions() {
  // Payment modal — Stripe can be wired here later
  const existing = document.getElementById('payment-modal');
  if (existing) { existing.style.display = 'flex'; return; }

  const modal = document.createElement('div');
  modal.id = 'payment-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:200;backdrop-filter:blur(2px);padding:16px;';
  modal.innerHTML = `
    <div style="background:var(--surface);border-radius:var(--rl);width:440px;max-width:100%;box-shadow:var(--shadow-lg);border:1px solid var(--border);animation:slideUp .28s cubic-bezier(.16,1,.3,1);">
      <div style="padding:22px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;">
        <div style="font-family:'DM Serif Display',serif;font-size:20px;color:var(--text);">Pay Invoice</div>
        <button onclick="document.getElementById('payment-modal').style.display='none'" style="background:none;border:none;font-size:20px;color:var(--text-mid);cursor:pointer;">×</button>
      </div>
      <div style="padding:24px;">
        <div style="text-align:center;margin-bottom:24px;">
          <div style="font-family:'DM Serif Display',serif;font-size:32px;color:var(--text);" id="pay-amount">${document.getElementById('inv-total').textContent}</div>
          <div style="font-size:13px;color:var(--text-mid);margin-top:4px;">Invoice ${document.getElementById('inv-number').textContent}</div>
        </div>
        <div style="background:var(--surface2);border:1px solid var(--border);border-radius:var(--r);padding:16px;margin-bottom:16px;">
          <div style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:var(--text-mid);margin-bottom:10px;">Bank Transfer</div>
          <div style="font-size:13.5px;color:var(--text);line-height:1.8;">
            Please use your invoice number as the payment reference and transfer to your studio's bank account.<br>
            Contact your studio for bank details.
          </div>
        </div>
        <div style="background:var(--blue-light);border-radius:var(--r);padding:13px;font-size:13px;color:var(--blue);line-height:1.6;">
          💳 Online card payment via Stripe coming soon. Your studio will be in touch with payment options.
        </div>
      </div>
    </div>
  `;
  modal.addEventListener('click', e => { if (e.target === modal) modal.style.display = 'none'; });
  document.body.appendChild(modal);
}

function escapeHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
