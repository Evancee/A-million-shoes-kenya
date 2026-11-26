const client = window.supabaseClient;
let activeUser = null;
let activeCampaignId = null;
let records = { campaigns: [], contributors: [], contributions: [], shoe_procurements: [], schools: [], distributions: [] };
let editing = null;
let saving = false;
const formatNumber = (value) => new Intl.NumberFormat('en-KE').format(Number(value) || 0);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const setAuthMessage = (message, error = false) => {
  const node = document.querySelector('#auth-message');
  node.textContent = message;
  node.classList.toggle('is-error', error);
};
const setDashboardMessage = (message, error = false) => {
  const node = document.querySelector('#dashboard-message');
  node.textContent = message;
  node.classList.toggle('is-error', error);
};
const setDistributionMessage = (message, error = false) => {
  const node = document.querySelector('#distribution-action-message');
  node.textContent = message;
  node.classList.toggle('is-error', error);
};
function showGate(message = 'Sign in with your administrator account.', error = false) {
  document.querySelector('#admin-dashboard').hidden = true;
  document.querySelector('#auth-gate').hidden = false;
  document.querySelector('#login-form').hidden = false;
  setAuthMessage(message, error);
}
function showDashboard() {
  document.querySelector('#auth-gate').hidden = true;
  document.querySelector('#admin-dashboard').hidden = false;
}
async function authorizeSession(session) {
  if (!session?.user) {
    activeUser = null;
    showGate('Sign in with your administrator account.');
    return false;
  }
  const { data, error } = await client.rpc('is_admin');
  if (error) {
    await client.auth.signOut();
    activeUser = null;
    showGate(`Administrator authorization failed: ${error.message}`, true);
    return false;
  }
  if (data !== true) {
    await client.auth.signOut();
    activeUser = null;
    showGate('This account is authenticated but is not authorized as an administrator.', true);
    return false;
  }
  activeUser = session.user;
  showDashboard();
  await loadDashboardData();
  return true;
}

const loginForm = document.querySelector('#login-form');
loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (saving) return;
  saving = true;
  const submit = document.querySelector('#login-submit');
  submit.disabled = true;
  setAuthMessage('Signing in...');
  const { error } = await client.auth.signInWithPassword({ email: loginForm.elements.email.value.trim(), password: loginForm.elements.password.value });
  saving = false;
  submit.disabled = false;
  if (error) {
    setAuthMessage(error.message.includes('Invalid login credentials') ? 'Email or password is incorrect.' : `Sign in failed: ${error.message}`, true);
    return;
  }
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  if (sessionError || !sessionData.session) {
    showGate('Your session could not be established. Please sign in again.', true);
    return;
  }
  await authorizeSession(sessionData.session);
});

document.querySelector('#logout-button').addEventListener('click', async () => {
  const { error } = await client.auth.signOut();
  if (error) setDashboardMessage(`Could not end the session: ${error.message}`, true);
  else showGate('You have been signed out.');
});

async function loadDashboardData(successMessage = 'Campaign statistics are calculated from the database.') {
  document.querySelector('#data-status').textContent = 'LOADING';
  setDashboardMessage('Loading campaign records...');
  try {
    const [statsResponse, ...responses] = await Promise.all([
      client.from('campaign_statistics').select('*'),
      ...Object.keys(records).map((table) => client.from(table).select('*'))
    ]);
    if (statsResponse.error) throw new Error(`Could not load campaign statistics: ${statsResponse.error.message}`);
    const statsRows = statsResponse.data || [];
    const stats = statsRows.find((row) => /a million shoes kenya/i.test(row.campaign_name || '')) || statsRows[0];
    activeCampaignId = stats?.campaign_id || null;
    if (!activeCampaignId) throw new Error('The A Million Shoes Kenya campaign row was not found in campaign_statistics.');
    document.querySelector('#stat-target').textContent = formatNumber(1000000);
    const secured = Number(stats.secured_shoes ?? stats.pairs_secured ?? stats.total_pairs_secured);
    const distributed = Number(stats.distributed_shoes ?? stats.pairs_distributed ?? stats.total_pairs_distributed);
    const reachedSchools = Number(stats.schools_reached);
    const reachedChildren = Number(stats.children_reached);
    if (![secured, distributed, reachedSchools, reachedChildren].every(Number.isFinite)) {
      throw new Error('campaign_statistics is missing one or more calculated totals.');
    }
    document.querySelector('#stat-secured').textContent = formatNumber(secured);
    document.querySelector('#stat-distributed').textContent = formatNumber(distributed);
    document.querySelector('#stat-schools').textContent = formatNumber(reachedSchools);
    document.querySelector('#stat-children').textContent = formatNumber(reachedChildren);
    const progress = Number(stats.progress_percentage);
    document.querySelector('#stat-progress').textContent = Number.isFinite(progress) ? `${progress}%` : '-';
    Object.keys(records).forEach((table, index) => {
      if (responses[index].error) throw new Error(`Could not load ${table}: ${responses[index].error.message}`);
      const rows = responses[index].data || [];
      records[table] = ['campaigns', 'distributions'].includes(table)
        ? rows
        : rows.filter((row) => !row.campaign_id || row.campaign_id === activeCampaignId);
    });
    renderAll();
    document.querySelector('#data-status').textContent = 'LIVE DATA';
    setDashboardMessage(successMessage);
  } catch (error) {
    document.querySelector('#data-status').textContent = 'DATA ERROR';
    setDashboardMessage(error.message, true);
    console.error(error);
  }
}

function statusLabel(row) {
  const status = row.verification_status || row.status || '-';
  const klass = status === 'verified' ? 'status-verified' : status === 'rejected' ? 'status-rejected' : 'status-pending';
  return `<span class="record-status ${klass}">${escapeHtml(status)}</span>`;
}
function actions(row, table, canEdit = false) {
  const id = escapeHtml(row.id);
  const mayEdit = canEdit && (table !== 'distributions' || row.verification_status === 'pending');
  const edit = mayEdit ? `<button type="button" data-edit="${table}" data-id="${id}">Edit</button>` : '';
  const statusReview = ['contributors', 'schools'].includes(table)
    ? `<button type="button" data-status-review="verified" data-table="${table}" data-id="${id}">Verify</button><button type="button" data-status-review="rejected" data-table="${table}" data-id="${id}">Reject</button>` : '';
  const review = ['contributions', 'shoe_procurements', 'distributions'].includes(table) && row.verification_status === 'pending'
    ? `<button type="button" data-review="verified" data-table="${table}" data-id="${id}">Verify</button><button type="button" data-review="rejected" data-table="${table}" data-id="${id}">Reject</button>` : '';
  return `<div class="table-actions">${edit}${statusReview}${review}</div>`;
}
function renderTable(elementId, table, columns, canEdit = false) {
  const rows = records[table];
  const container = document.querySelector(`#${elementId}`);
  if (!rows.length) { container.innerHTML = '<p class="empty-state">No records found.</p>'; return; }
  if (!columns.length) columns = Object.keys(rows[0]).map((field) => [field, field.replaceAll('_', ' ')]);
  container.innerHTML = `<table class="admin-data-table"><thead><tr>${columns.map(([, label]) => `<th>${escapeHtml(label)}</th>`).join('')}<th>Status</th><th>Actions</th></tr></thead><tbody>${rows.map((row) => `<tr>${columns.map(([field]) => {
    const value = table === 'distributions' && field === 'distributed_at' ? formatDistributionDate(row[field]) : row[field] ?? '-';
    return `<td>${escapeHtml(value)}</td>`;
  }).join('')}<td>${statusLabel(row)}</td><td>${actions(row, table, canEdit)}</td></tr>`).join('')}</tbody></table>`;
}
function renderAll() {
  renderTable('contributors-editor', 'contributors', [['name', 'Name'], ['phone', 'Phone'], ['email', 'Email'], ['public_consent', 'Public consent']], true);
  renderTable('contributions-editor', 'contributions', [['amount', 'Amount'], ['payment_reference', 'Payment reference'], ['contributor_id', 'Contributor ID']]);
  renderTable('procurements-editor', 'shoe_procurements', [['pairs_secured', 'Pairs secured'], ['purchase_date', 'Purchase date'], ['supplier', 'Supplier'], ['evidence_reference', 'Evidence'], ['notes', 'Notes']]);
  renderTable('schools-editor', 'schools', [['school_name', 'School'], ['district', 'District'], ['contact_person', 'Contact person'], ['contact_phone', 'Contact phone'], ['public_consent', 'Public consent'], ['consent_given_at', 'Consent recorded at']], true);
  renderTable('distributions-editor', 'distributions', [['campaign_id', 'Campaign'], ['school_id', 'School'], ['pairs_delivered', 'Pairs delivered'], ['children_reached', 'Children reached'], ['distributed_at', 'Distributed at'], ['notes', 'Notes']], true);
  document.querySelectorAll('#distributions-editor tbody tr').forEach((tr, index) => {
    const row = records.distributions[index];
    tr.cells[0].textContent = campaignName(row.campaign_id);
    tr.cells[1].textContent = schoolName(row.school_id);
  });
}

function campaignName(id) {
  const campaign = records.campaigns.find((item) => String(item.id) === String(id));
  return campaign?.campaign_name || campaign?.name || campaign?.title || id || '-';
}
function schoolName(id) {
  const school = records.schools.find((item) => String(item.id) === String(id));
  return school?.school_name || id || '-';
}
function dateTimeLocalValue(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
function consentPayload(publicConsent, existingTimestamp = null) {
  if (!publicConsent) return { public_consent: false, consent_given_at: null };
  const existingDate = existingTimestamp ? new Date(existingTimestamp) : null;
  const timestamp = existingDate && !Number.isNaN(existingDate.getTime())
    ? existingTimestamp
    : new Date().toISOString();
  return { public_consent: true, consent_given_at: timestamp };
}
function formatDistributionDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

const fields = {
  contributors: [
    ['name', 'Name', 'text', true], ['phone', 'Phone', 'tel', false], ['email', 'Email', 'email', false], ['public_consent', 'Public listing consent', 'checkbox', false]
  ],
  contributions: [
    ['contributor_id', 'Contributor', 'select', true], ['amount', 'Amount', 'number', true], ['payment_reference', 'Payment reference', 'text', false]
  ],
  shoe_procurements: [
    ['pairs_secured', 'Pairs secured', 'number', true], ['purchase_date', 'Purchase date', 'date', true], ['supplier', 'Supplier', 'text', false], ['evidence_reference', 'Evidence reference', 'text', false], ['notes', 'Notes', 'textarea', false]
  ],
  schools: [
    ['school_name', 'School name', 'text', true], ['district', 'District', 'text', false],
    ['contact_person', 'Contact person', 'text', false], ['contact_phone', 'Contact phone', 'tel', false],
    ['public_consent', 'Public listing consent', 'checkbox', false]
  ],
  distributions: [
    ['campaign_id', 'Campaign', 'campaign-select', true], ['school_id', 'School', 'school-select', true],
    ['pairs_delivered', 'Pairs delivered', 'number', true], ['children_reached', 'Children reached', 'number', false],
    ['distributed_at', 'Distribution date and time', 'datetime-local', false], ['notes', 'Notes', 'textarea', false]
  ]
};
function openEditor(table, row = null) {
  if (table === 'distributions' && (!records.campaigns.length || !records.schools.length)) {
    const missing = [!records.campaigns.length && 'campaign', !records.schools.length && 'school'].filter(Boolean);
    setDistributionMessage(`Cannot open the form: add or load at least one ${missing.join(' and ')} first.`, true);
    return;
  }
  editing = { table, row, isNew: !row };
  document.querySelector('#dialog-title').textContent = `${row ? 'Edit' : 'Add'} ${table.replaceAll('_', ' ').replace(/s$/, '')}`;
  const html = fields[table].map(([key, label, type, required]) => {
    const value = key === 'distributed_at' ? dateTimeLocalValue(row?.[key]) : row?.[key] ?? '';
    if (type === 'select' || type === 'campaign-select' || type === 'school-select') {
      const source = type === 'campaign-select' ? records.campaigns : type === 'school-select' ? records.schools : records.contributors;
      const options = source.map((item) => {
        const optionLabel = type === 'campaign-select' ? (item.campaign_name || item.name || item.title || item.id) : type === 'school-select' ? item.school_name : item.name;
        return `<option value="${escapeHtml(item.id)}" ${String(value) === String(item.id) ? 'selected' : ''}>${escapeHtml(optionLabel)}</option>`;
      }).join('');
      const placeholder = value ? '' : '<option value="" selected disabled>Select a record</option>';
      return `<div class="field full"><label>${escapeHtml(label)}</label><select name="${key}" ${required ? 'required' : ''}>${placeholder}${options}</select></div>`;
    }
    if (type === 'checkbox') return `<label class="field consent-field"><input name="${key}" type="checkbox" ${value ? 'checked' : ''}> ${escapeHtml(label)}</label>`;
    if (type === 'textarea') return `<div class="field full"><label>${escapeHtml(label)}</label><textarea name="${key}">${escapeHtml(value)}</textarea></div>`;
    const min = '0';
    const step = ['pairs_delivered', 'children_reached'].includes(key) ? '1' : 'any';
    return `<div class="field${type === 'textarea' ? ' full' : ''}"><label>${escapeHtml(label)}</label><input name="${key}" type="${type}" value="${escapeHtml(value)}" ${required ? 'required' : ''} ${type === 'number' ? `min="${min}" step="${step}"` : ''}></div>`;
  }).join('');
  document.querySelector('#dialog-fields').innerHTML = html;
  document.querySelector('#dialog-message').textContent = '';
  document.querySelector('#record-dialog').showModal();
  if (table === 'distributions') setDistributionMessage('Distribution form opened.');
}

function payloadFor(table, form) {
  const value = (key) => form.elements[key]?.value.trim() || null;
  if (table === 'schools') {
    const publicConsent = form.elements.public_consent.checked;
    const previouslyConsentedAt = editing.row?.public_consent === true ? editing.row.consent_given_at : null;
    return {
      school_name: value('school_name'), district: value('district'), contact_person: value('contact_person'),
      contact_phone: value('contact_phone'), ...consentPayload(publicConsent, previouslyConsentedAt)
    };
  }
  if (table === 'distributions') {
    if (!records.campaigns.some((campaign) => campaign.id === value('campaign_id'))) throw new Error('Select a valid campaign.');
    if (!records.schools.some((school) => school.id === value('school_id'))) throw new Error('Select a valid school.');
    const distributedAt = value('distributed_at');
    return {
      campaign_id: value('campaign_id'), school_id: value('school_id'), pairs_delivered: Number(value('pairs_delivered')),
      children_reached: Number(value('children_reached') || 0), ...(distributedAt ? { distributed_at: new Date(distributedAt).toISOString() } : {}),
      notes: value('notes'), ...(editing.isNew ? { verification_status: 'pending' } : {})
    };
  }
  if (table === 'contributors') {
    const publicConsent = form.elements.public_consent.checked;
    const previouslyConsentedAt = editing.row?.public_consent === true ? editing.row.consent_given_at : null;
    return {
      name: value('name'), phone: value('phone'), email: value('email'),
      ...consentPayload(publicConsent, previouslyConsentedAt)
    };
  }
  if (table === 'contributions') return { contributor_id: value('contributor_id'), campaign_id: activeCampaignId, amount: Number(value('amount')), payment_reference: value('payment_reference'), verification_status: 'pending' };
  if (table === 'shoe_procurements') return { campaign_id: activeCampaignId, pairs_secured: Number(value('pairs_secured')), purchase_date: value('purchase_date'), supplier: value('supplier'), evidence_reference: value('evidence_reference'), notes: value('notes'), verification_status: 'pending' };
  return {};
}

document.querySelector('#record-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (saving || !editing) return;
  saving = true;
  const submit = document.querySelector('#dialog-submit');
  submit.disabled = true;
  const { table, row, isNew } = editing;
  let payload;
  try {
    payload = payloadFor(table, event.currentTarget);
  } catch (error) {
    saving = false;
    submit.disabled = false;
    document.querySelector('#dialog-message').textContent = error.message;
    return;
  }
  let result;
  try {
    const query = !isNew ? client.from(table).update(payload).eq('id', row.id) : client.from(table).insert(payload);
    result = await query;
  } catch (error) {
    result = { error };
  }
  saving = false;
  submit.disabled = false;
  if (result.error) { document.querySelector('#dialog-message').textContent = result.error.message; return; }
  document.querySelector('#record-dialog').close();
  setDashboardMessage('Record saved.');
  await loadDashboardData();
});

async function reviewRecord(table, id, status) {
  const { error } = await client.from(table).update({ verification_status: status, reviewed_by: activeUser.id, reviewed_at: new Date().toISOString() }).eq('id', id);
  if (error) { setDashboardMessage(`Review update failed: ${error.message}`, true); return; }
  setDashboardMessage(`Record ${status}.`);
  await loadDashboardData();
}
async function updateContributorOrSchoolStatus(table, id, status) {
  if (!['contributors', 'schools'].includes(table) || !['verified', 'rejected'].includes(status)) return;
  const row = records[table].find((record) => String(record.id) === String(id));
  if (!row) {
    setDashboardMessage('This record is no longer available. Reload the dashboard and try again.', true);
    return;
  }
  const label = table === 'contributors' ? 'contributor' : 'school';
  if (!window.confirm(`Set ${label} "${row.name || row.school_name}" status to ${status}?`)) return;
  const consent = consentPayload(row.public_consent === true, row.public_consent === true ? row.consent_given_at : null);
  const { error } = await client.from(table).update({ status, ...consent }).eq('id', id);
  if (error) {
    setDashboardMessage(`Could not update ${label} status: ${error.message}`, true);
    return;
  }
  await loadDashboardData(`${label[0].toUpperCase()}${label.slice(1)} status updated to ${status}.`);
}
document.addEventListener('click', (event) => {
  const statusReview = event.target.closest('[data-status-review]');
  if (statusReview) {
    statusReview.disabled = true;
    updateContributorOrSchoolStatus(statusReview.dataset.table, statusReview.dataset.id, statusReview.dataset.statusReview)
      .finally(() => { statusReview.disabled = false; });
    return;
  }
  const review = event.target.closest('[data-review]');
  if (review) {
    review.disabled = true;
    reviewRecord(review.dataset.table, review.dataset.id, review.dataset.review).finally(() => { review.disabled = false; });
    return;
  }
  const edit = event.target.closest('[data-edit]');
  if (edit) openEditor(edit.dataset.edit, records[edit.dataset.edit].find((row) => String(row.id) === edit.dataset.id));
});
for (const [button, table] of [['add-contributor', 'contributors'], ['add-contribution', 'contributions'], ['add-procurement', 'shoe_procurements'], ['add-school', 'schools']]) {
  document.querySelector(`#${button}`).addEventListener('click', () => openEditor(table));
}
document.querySelector('#add-distribution').addEventListener('click', () => {
  setDistributionMessage('Checking available campaigns and schools...');
  try {
    openEditor('distributions');
  } catch (error) {
    console.error('Could not open the distribution form.', error);
    setDistributionMessage(`Could not open the distribution form: ${error.message}`, true);
  }
});
document.querySelector('#dialog-close').addEventListener('click', () => document.querySelector('#record-dialog').close());
document.querySelector('#dialog-cancel').addEventListener('click', () => document.querySelector('#record-dialog').close());

const adminMenuToggle = document.querySelector('#admin-menu-toggle');
const adminSidebarNav = document.querySelector('#admin-sidebar-nav');
function setAdminNavigationOpen(isOpen) {
  adminMenuToggle.setAttribute('aria-expanded', String(isOpen));
  adminMenuToggle.setAttribute('aria-label', isOpen ? 'Close dashboard navigation' : 'Open dashboard navigation');
  adminSidebarNav.classList.toggle('is-open', isOpen);
}
adminMenuToggle.addEventListener('click', () => {
  setAdminNavigationOpen(adminMenuToggle.getAttribute('aria-expanded') !== 'true');
});
adminSidebarNav.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', () => setAdminNavigationOpen(false));
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && adminMenuToggle.getAttribute('aria-expanded') === 'true') {
    setAdminNavigationOpen(false);
    adminMenuToggle.focus();
  }
});

(async function initializeAuth() {
  document.querySelector('#login-form').hidden = true;
  setAuthMessage('Checking administrator session...');
  try {
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    if (!data.session) { showGate('Sign in with your administrator account.'); return; }
    await authorizeSession(data.session);
  } catch (error) {
    showGate(`Could not check your session: ${error.message}`, true);
  }
  client.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT' || !session) {
      activeUser = null;
      showGate('Your session ended or expired. Please sign in again.');
    }
  });
})();
