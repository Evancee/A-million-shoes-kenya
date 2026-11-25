const storageKey = window.campaignStorageKey;
const storagePreparation = window.prepareCampaignStorage();
const cloneData = window.cloneCampaignData;
const formatNumber = (value) => new Intl.NumberFormat('en-KE').format(Number(value) || 0);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]));

let lastSavedValue = null;
let dataLoadError = storagePreparation.ok ? '' : storagePreparation.error;
let migrationWarning = '';

function loadData() {
  try {
    lastSavedValue = localStorage.getItem(storageKey);
    const parsed = lastSavedValue === null ? null : JSON.parse(lastSavedValue);
    const result = window.normalizeCampaignData(parsed);
    if (result.error) throw new Error(result.error);
    if (result.migrated && lastSavedValue !== null && storagePreparation.ok) {
      try {
        lastSavedValue = window.writeCampaignData(result.data, lastSavedValue);
      } catch (error) {
        migrationWarning = `Records were loaded, but their IDs could not be saved yet: ${error.message}`;
      }
    }
    return result.data;
  } catch (error) {
    dataLoadError = `Saved campaign data could not be read safely: ${error.message} Reset campaign data to continue.`;
    return cloneData(window.campaignDefaults);
  }
}

let campaignData = loadData();
let statsDraft = null;
const saveMessage = document.querySelector('#save-message');
const statsForm = document.querySelector('#stats-form');
const contributorDialog = document.querySelector('#contributor-dialog');
const contributorForm = document.querySelector('#contributor-form');
const schoolDialog = document.querySelector('#school-dialog');
const schoolForm = document.querySelector('#school-form');
let editingContributorId = null;
let editingSchoolId = null;
let openRecordMenuButton = null;
let dialogReturnFocus = null;

function showMessage(message, isError = false) {
  saveMessage.textContent = message;
  saveMessage.classList.toggle('is-error', isError);
}

function updateOverview(data = campaignData) {
  const percentage = data.target > 0 ? data.pairsSecured / data.target * 100 : 0;
  const progressValue = Math.min(100, Math.max(0, percentage));
  document.querySelector('#overview-target').textContent = formatNumber(data.target);
  document.querySelector('#overview-secured').textContent = formatNumber(data.pairsSecured);
  document.querySelector('#overview-distributed').textContent = formatNumber(data.pairsDistributed);
  document.querySelector('#overview-remaining').textContent = formatNumber(Math.max(0, data.target - data.pairsSecured));
  document.querySelector('#overview-progress').textContent = `${Number(percentage.toFixed(1))}%`;
  document.querySelector('#overview-progress-inline').textContent = `${Number(percentage.toFixed(1))}%`;
  const progressFill = document.querySelector('#admin-progress-fill');
  const progressTrack = progressFill.closest('[role="progressbar"]');
  progressFill.style.width = `${progressValue}%`;
  progressTrack.setAttribute('aria-valuenow', String(Number(progressValue.toFixed(1))));
  progressTrack.setAttribute('aria-valuetext', `${Number(percentage.toFixed(1))}% progress; ${formatNumber(data.pairsSecured)} of ${formatNumber(data.target)} pairs secured`);
  document.querySelector('#overview-contributors').textContent = formatNumber(data.contributors.length);
  document.querySelector('#overview-schools').textContent = formatNumber(data.schoolsReached);
  const hasEnteredData = data.target !== window.campaignDefaults.target ||
    [data.pairsSecured, data.pairsDistributed, data.schoolsReached, data.childrenReached].some((value) => value > 0) ||
    data.contributors.length > 0 || data.schools.length > 0;
  document.querySelector('#campaign-data-status').textContent = hasEnteredData ? 'DATA ENTERED' : 'DATA PENDING';
}

function fillStatsForm(source = campaignData) {
  statsDraft = {
    target: String(source.target),
    pairsSecured: String(source.pairsSecured),
    pairsDistributed: String(source.pairsDistributed),
    schoolsReached: String(source.schoolsReached),
    childrenReached: String(source.childrenReached)
  };
  for (const [field, value] of Object.entries(statsDraft)) statsForm.elements[field].value = value;
}

function statusMarkup(record) {
  const verified = record.verificationStatus === 'verified';
  return `<span class="record-status ${verified ? 'status-verified' : 'status-pending'}" aria-label="${verified ? 'Verified' : 'Pending verification'}">${verified ? 'Verified' : 'Pending'}</span>`;
}

function renderContributors() {
  const editor = document.querySelector('#contributors-editor');
  if (!campaignData.contributors.length) {
    editor.innerHTML = '<p class="empty-state">No contributor records yet. Campaign information is awaiting initial entry and verification. Add a contributor when verified details are available.</p>';
    return;
  }
  editor.innerHTML = campaignData.contributors.map((person, index) => {
    const recordId = escapeHtml(person.id);
    const name = escapeHtml(person.name);
    const actionLabel = person.verificationStatus === 'verified' ? 'Mark as pending' : 'Mark as verified';
    return `
      <div class="contributor-row">
        <span class="contributor-row-name">${name}</span>
        ${statusMarkup(person)}
        <div class="contributor-menu-wrap">
          <button class="contributor-menu-toggle" type="button" data-record-menu="contributors-${index}" data-collection="contributors" data-record-id="${recordId}" aria-label="More actions for ${name}" aria-expanded="false" aria-controls="contributor-menu-${index}"><span aria-hidden="true">⋮</span></button>
          <div class="contributor-dropdown" id="contributor-menu-${index}" hidden>
            <button type="button" data-record-action="edit" data-collection="contributors" data-record-id="${recordId}">Edit contributor</button>
            <button type="button" data-record-action="verification" data-collection="contributors" data-record-id="${recordId}">${actionLabel}</button>
            <button type="button" data-record-action="delete" data-collection="contributors" data-record-id="${recordId}">Delete contributor</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function renderSchools() {
  const editor = document.querySelector('#schools-editor');
  if (!campaignData.schools.length) {
    editor.innerHTML = '<p class="empty-state">No school records yet. Campaign information is awaiting initial entry and verification. Add a school when verified details are available.</p>';
    return;
  }
  editor.innerHTML = campaignData.schools.map((school, index) => {
    const recordId = escapeHtml(school.id);
    const name = escapeHtml(school.name);
    const actionLabel = school.verificationStatus === 'verified' ? 'Mark as pending' : 'Mark as verified';
    return `
      <div class="contributor-row school-row">
        <span class="contributor-row-name">${name}</span>
        ${statusMarkup(school)}
        <div class="contributor-menu-wrap">
          <button class="contributor-menu-toggle" type="button" data-record-menu="schools-${index}" data-collection="schools" data-record-id="${recordId}" aria-label="More actions for ${name}" aria-expanded="false" aria-controls="school-menu-${index}"><span aria-hidden="true">⋮</span></button>
          <div class="contributor-dropdown" id="school-menu-${index}" hidden>
            <button type="button" data-record-action="edit" data-collection="schools" data-record-id="${recordId}">Edit school</button>
            <button type="button" data-record-action="verification" data-collection="schools" data-record-id="${recordId}">${actionLabel}</button>
            <button type="button" data-record-action="delete" data-collection="schools" data-record-id="${recordId}">Delete school</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function renderDashboard() {
  updateOverview();
  fillStatsForm();
  renderContributors();
  renderSchools();
}

function saveCandidate(candidate) {
  if (dataLoadError) {
    showMessage(dataLoadError, true);
    return false;
  }
  const validationError = window.validateCampaignData(candidate);
  if (validationError) {
    showMessage(validationError, true);
    return false;
  }
  try {
    lastSavedValue = window.writeCampaignData(candidate, lastSavedValue);
    campaignData = candidate;
    migrationWarning = '';
    showMessage('Changes confirmed and saved in this browser.');
    return true;
  } catch (error) {
    showMessage(`Save failed. Your saved campaign data was kept. ${error.message}`, true);
    return false;
  }
}

statsForm.addEventListener('input', () => {
  statsDraft = {
    target: statsForm.elements.target.value,
    pairsSecured: statsForm.elements.pairsSecured.value,
    pairsDistributed: statsForm.elements.pairsDistributed.value,
    schoolsReached: statsForm.elements.schoolsReached.value,
    childrenReached: statsForm.elements.childrenReached.value
  };
  showMessage('Unsaved statistics. Select Save campaign statistics to commit these values.');
});

statsForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!statsForm.reportValidity()) return;
  const candidate = cloneData(campaignData);
  candidate.target = Number(statsDraft.target);
  candidate.pairsSecured = Number(statsDraft.pairsSecured);
  candidate.pairsDistributed = Number(statsDraft.pairsDistributed);
  candidate.schoolsReached = Number(statsDraft.schoolsReached);
  candidate.childrenReached = Number(statsDraft.childrenReached);
  if (saveCandidate(candidate)) updateOverview();
});

function getRecord(collection, recordId) {
  if (!['contributors', 'schools'].includes(collection)) return null;
  return campaignData[collection].find((record) => record.id === recordId) || null;
}

function findRecordMenuButton(collection, recordId) {
  return [...document.querySelectorAll('[data-record-menu]')]
    .find((button) => button.dataset.collection === collection && button.dataset.recordId === recordId) || null;
}

function closeRecordMenu(restoreFocus = false) {
  if (!openRecordMenuButton) return;
  const button = openRecordMenuButton;
  const dropdown = document.getElementById(button.getAttribute('aria-controls'));
  button.setAttribute('aria-expanded', 'false');
  if (dropdown) dropdown.hidden = true;
  openRecordMenuButton = null;
  if (restoreFocus && button.isConnected) button.focus();
}

function openContributorEditor(recordId = null, returnFocus = null) {
  editingContributorId = recordId;
  dialogReturnFocus = returnFocus;
  const contributor = recordId === null ? {
    id: window.createCampaignRecordId(), name: '', initials: '', role: '', type: '', color: 'avatar-grey',
    contributionAmount: '', pairsContributed: '', description: '', verificationStatus: 'pending'
  } : getRecord('contributors', recordId);
  if (!contributor) return;
  contributorForm.dataset.recordId = contributor.id;
  contributorForm.elements.name.value = contributor.name || '';
  contributorForm.elements.initials.value = contributor.initials || '';
  contributorForm.elements.role.value = contributor.role || '';
  contributorForm.elements.type.value = contributor.type || '';
  contributorForm.elements.color.value = contributor.color || 'avatar-grey';
  contributorForm.elements.contributionAmount.value = contributor.contributionAmount ?? '';
  contributorForm.elements.pairsContributed.value = contributor.pairsContributed ?? '';
  contributorForm.elements.description.value = contributor.description || '';
  contributorForm.elements.verificationStatus.value = contributor.verificationStatus;
  document.querySelector('#contributor-form-message').textContent = '';
  document.querySelector('#contributor-dialog-title').textContent = recordId === null ? 'Add contributor' : 'Edit contributor';
  contributorDialog.showModal();
  contributorForm.elements.name.focus();
}

function openSchoolEditor(recordId = null, returnFocus = null) {
  editingSchoolId = recordId;
  dialogReturnFocus = returnFocus;
  const school = recordId === null
    ? { id: window.createCampaignRecordId(), name: '', county: '', childrenReached: 0, pairsDelivered: 0, verificationStatus: 'pending' }
    : getRecord('schools', recordId);
  if (!school) return;
  schoolForm.dataset.recordId = school.id;
  schoolForm.elements.name.value = school.name || '';
  schoolForm.elements.county.value = school.county || '';
  schoolForm.elements.childrenReached.value = school.childrenReached ?? 0;
  schoolForm.elements.pairsDelivered.value = school.pairsDelivered ?? 0;
  schoolForm.elements.verificationStatus.value = school.verificationStatus;
  document.querySelector('#school-form-message').textContent = '';
  document.querySelector('#school-dialog-title').textContent = recordId === null ? 'Add school' : 'Edit school';
  schoolDialog.showModal();
  schoolForm.elements.name.focus();
}

function handleRecordMenuClick(event) {
  const toggle = event.target.closest('[data-record-menu]');
  if (toggle) {
    if (openRecordMenuButton === toggle) {
      closeRecordMenu();
      return;
    }
    closeRecordMenu();
    openRecordMenuButton = toggle;
    const dropdown = document.getElementById(toggle.getAttribute('aria-controls'));
    if (dropdown) dropdown.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    dropdown?.querySelector('button')?.focus();
    return;
  }

  const action = event.target.closest('[data-record-action]');
  if (!action) return;
  const collection = action.dataset.collection;
  const recordId = action.dataset.recordId;
  const menuButton = openRecordMenuButton;
  closeRecordMenu();
  const record = getRecord(collection, recordId);
  if (!record) {
    showMessage('This record is no longer available. Reload the dashboard and try again.', true);
    return;
  }

  if (action.dataset.recordAction === 'edit') {
    if (collection === 'contributors') openContributorEditor(recordId, menuButton);
    else openSchoolEditor(recordId, menuButton);
    return;
  }

  const candidate = cloneData(campaignData);
  const candidateRecord = candidate[collection].find((item) => item.id === recordId);
  if (action.dataset.recordAction === 'verification') {
    candidateRecord.verificationStatus = candidateRecord.verificationStatus === 'verified' ? 'pending' : 'verified';
    if (saveCandidate(candidate)) {
      if (collection === 'contributors') renderContributors();
      else renderSchools();
      findRecordMenuButton(collection, recordId)?.focus();
    } else if (menuButton?.isConnected) menuButton.focus();
    return;
  }

  if (action.dataset.recordAction !== 'delete') return;
  if (!window.confirm(`Delete ${record.name}? This cannot be undone.`)) {
    if (menuButton?.isConnected) menuButton.focus();
    return;
  }
  candidate[collection] = candidate[collection].filter((item) => item.id !== recordId);
  if (!saveCandidate(candidate)) {
    if (menuButton?.isConnected) menuButton.focus();
    return;
  }
  if (collection === 'schools') renderSchools();
  else renderContributors();
  updateOverview();
  const remainingButton = [...document.querySelectorAll('[data-record-menu]')]
    .find((button) => button.dataset.collection === collection) ||
    document.querySelector(collection === 'schools' ? '#add-school' : '#add-contributor');
  remainingButton?.focus();
}

document.querySelector('#contributors-editor').addEventListener('click', handleRecordMenuClick);
document.querySelector('#schools-editor').addEventListener('click', handleRecordMenuClick);

document.addEventListener('click', (event) => {
  if (openRecordMenuButton && !event.target.closest('.contributor-menu-wrap')) closeRecordMenu();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && openRecordMenuButton) {
    event.preventDefault();
    closeRecordMenu(true);
  }
});

function restoreDialogFocus() {
  if (dialogReturnFocus?.isConnected) dialogReturnFocus.focus();
  dialogReturnFocus = null;
}

contributorDialog.addEventListener('close', restoreDialogFocus);
schoolDialog.addEventListener('close', restoreDialogFocus);

document.querySelector('#cancel-contributor-edit').addEventListener('click', () => contributorDialog.close());
document.querySelector('#close-contributor-dialog').addEventListener('click', () => contributorDialog.close());
document.querySelector('#cancel-school-edit').addEventListener('click', () => schoolDialog.close());
document.querySelector('#close-school-dialog').addEventListener('click', () => schoolDialog.close());

contributorForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const message = document.querySelector('#contributor-form-message');
  if (!contributorForm.reportValidity()) return;
  const id = editingContributorId === null ? contributorForm.dataset.recordId : editingContributorId;
  const previous = editingContributorId === null ? {} : getRecord('contributors', id);
  const contributor = {
    ...previous,
    id,
    name: contributorForm.elements.name.value.trim(),
    initials: contributorForm.elements.initials.value.trim(),
    role: contributorForm.elements.role.value.trim(),
    type: contributorForm.elements.type.value.trim(),
    color: contributorForm.elements.color.value,
    verificationStatus: contributorForm.elements.verificationStatus.value
  };
  for (const field of ['contributionAmount', 'pairsContributed']) {
    const value = contributorForm.elements[field].value;
    if (value === '') delete contributor[field];
    else contributor[field] = Number(value);
  }
  const description = contributorForm.elements.description.value.trim();
  if (description) contributor.description = description;
  else delete contributor.description;

  const candidate = cloneData(campaignData);
  const savedId = id;
  if (editingContributorId === null) candidate.contributors.push(contributor);
  else candidate.contributors = candidate.contributors.map((item) => item.id === id ? contributor : item);
  if (!saveCandidate(candidate)) {
    message.textContent = document.querySelector('#save-message').textContent;
    return;
  }
  renderContributors();
  updateOverview();
  dialogReturnFocus = findRecordMenuButton('contributors', savedId) || document.querySelector('#add-contributor');
  editingContributorId = null;
  contributorDialog.close();
});

schoolForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const message = document.querySelector('#school-form-message');
  if (!schoolForm.reportValidity()) return;
  const id = editingSchoolId === null ? schoolForm.dataset.recordId : editingSchoolId;
  const previous = editingSchoolId === null ? {} : getRecord('schools', id);
  const school = {
    ...previous,
    id,
    name: schoolForm.elements.name.value.trim(),
    county: schoolForm.elements.county.value.trim(),
    childrenReached: Number(schoolForm.elements.childrenReached.value),
    pairsDelivered: Number(schoolForm.elements.pairsDelivered.value),
    verificationStatus: schoolForm.elements.verificationStatus.value
  };
  const candidate = cloneData(campaignData);
  const savedId = id;
  if (editingSchoolId === null) candidate.schools.push(school);
  else candidate.schools = candidate.schools.map((item) => item.id === id ? school : item);
  if (!saveCandidate(candidate)) {
    message.textContent = document.querySelector('#save-message').textContent;
    return;
  }
  renderSchools();
  updateOverview();
  dialogReturnFocus = findRecordMenuButton('schools', savedId) || document.querySelector('#add-school');
  editingSchoolId = null;
  schoolDialog.close();
});

document.querySelector('#add-contributor').addEventListener('click', () => {
  openContributorEditor(null, document.querySelector('#add-contributor'));
});

document.querySelector('#add-school').addEventListener('click', () => {
  openSchoolEditor(null, document.querySelector('#add-school'));
});

document.querySelector('#reset-data').addEventListener('click', () => {
  if (!window.confirm('Reset all campaign information to the clean initial state? This clears saved statistics, contributors, and schools from this browser.')) return;
  try {
    window.clearCampaignData(lastSavedValue);
    lastSavedValue = null;
    dataLoadError = '';
    migrationWarning = '';
    campaignData = cloneData(window.campaignDefaults);
    renderDashboard();
    showMessage('Campaign data reset. Statistics are zero and contributor and school records are empty.');
  } catch (error) {
    showMessage(`Reset failed. Your saved campaign data was kept. ${error.message}`, true);
  }
});

document.addEventListener('storage', (event) => {
  if (event.key === storageKey && event.newValue !== lastSavedValue) {
    showMessage('Campaign data changed in another tab. Reload this dashboard before making changes.', true);
  }
});

renderDashboard();
if (dataLoadError) showMessage(dataLoadError, true);
else if (migrationWarning) showMessage(migrationWarning, true);

const sidebarLinks = [...document.querySelectorAll('.sidebar-link')];
const sidebarSections = sidebarLinks
  .map((link) => document.querySelector(link.getAttribute('href')))
  .filter(Boolean);

function setActiveSidebarLink(sectionId) {
  sidebarLinks.forEach((link) => {
    const isActive = link.hash === `#${sectionId}`;
    link.classList.toggle('is-active', isActive);
    if (isActive) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
}

sidebarLinks.forEach((link) => link.addEventListener('click', () => setActiveSidebarLink(link.hash.slice(1))));

if ('IntersectionObserver' in window) {
  const sectionObserver = new IntersectionObserver((entries) => {
    const visibleSections = entries.filter((entry) => entry.isIntersecting);
    if (!visibleSections.length) return;
    visibleSections.sort((a, b) => b.intersectionRatio - a.intersectionRatio);
    setActiveSidebarLink(visibleSections[0].target.id);
  }, { rootMargin: '-15% 0px -65% 0px', threshold: [0, 0.15, 0.4] });
  sidebarSections.forEach((section) => sectionObserver.observe(section));
}

if (dataLoadError) console.warn(dataLoadError);
else if (migrationWarning) console.warn(migrationWarning);
