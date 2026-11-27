const formatNumber = (value) => new Intl.NumberFormat('en-KE').format(value);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]));

const campaignData = { target: 1000000, pairsSecured: null, pairsDistributed: null, schoolsReached: null, childrenReached: null, contributors: [], schools: [] };
const impactItems = [
  { statistic: 'schoolsReached', label: 'Schools reached', icon: '⌂' },
  { statistic: 'childrenReached', label: 'Children reached', icon: '♡' },
  { statistic: 'pairsDistributed', label: 'Shoes distributed', icon: '↗' }
];
const pick = (row, ...keys) => {
  for (const key of keys) if (row[key] !== undefined && row[key] !== null) return row[key];
  return null;
};
const numeric = (row, ...keys) => {
  const value = pick(row, ...keys);
  return value === null || value === '' ? null : Number(value);
};

function renderCampaignData() {
  const hasStatistics = [campaignData.pairsSecured, campaignData.pairsDistributed, campaignData.schoolsReached, campaignData.childrenReached].every(Number.isFinite);
  const progressPercentage = hasStatistics ? campaignData.pairsSecured / campaignData.target * 100 : 0;
  const displayedPercentage = Number(progressPercentage.toFixed(1));
  const progressFill = document.querySelector('#campaign-progress-fill');
  const progressTrack = progressFill.closest('[role="progressbar"]');
  document.querySelector('#campaign-target').textContent = formatNumber(campaignData.target);
  document.querySelector('#campaign-secured').textContent = hasStatistics ? formatNumber(campaignData.pairsSecured) : '—';
  document.querySelector('#campaign-distributed').textContent = hasStatistics ? formatNumber(campaignData.pairsDistributed) : '—';
  document.querySelector('#campaign-percentage').textContent = hasStatistics ? `${displayedPercentage}%` : '—';
  document.querySelector('#campaign-remaining').textContent = hasStatistics ? `${formatNumber(Math.max(0, campaignData.target - campaignData.pairsSecured))} pairs remaining` : 'Campaign statistics are loading.';
  progressFill.style.width = `${Math.min(100, Math.max(0, progressPercentage))}%`;
  progressTrack.setAttribute('aria-valuenow', String(Math.min(100, Math.max(0, displayedPercentage))));
  progressTrack.setAttribute('aria-valuetext', hasStatistics ? `${displayedPercentage}% progress; ${formatNumber(campaignData.pairsSecured)} of ${formatNumber(campaignData.target)} pairs secured` : 'Campaign statistics are unavailable');
  progressTrack.setAttribute('aria-label', `Campaign progress towards the ${formatNumber(campaignData.target)} pair target`);

  const targetPhrase = 'one million';
  document.querySelector('#campaign-target-headline').textContent = 'One Million shoes.';
  document.querySelector('#campaign-target-slogan').textContent = 'One Million smiles.';
  document.querySelector('#campaign-target-intro').textContent = `${targetPhrase} pairs`;
  document.querySelector('#campaign-target-mission').textContent = `${targetPhrase} pairs`;
  const description = document.querySelector('meta[name="description"]');
  description.content = 'A Million Shoes Kenya is a social impact initiative working to provide one million pairs of shoes to children across Kenya.';
  document.querySelector('#campaign-data-status').textContent = hasStatistics ? 'LIVE DATA' : 'LOADING DATA';
  document.querySelector('.demo-explainer').textContent = hasStatistics ? 'Statistics reflect calculations from verified campaign records.' : 'Campaign statistics are loading from the database.';
  document.querySelector('#impact-data-note').textContent = hasStatistics ? 'Campaign figures reflect calculations from verified database records.' : 'Campaign statistics are loading from the campaign database.';
  document.querySelector('#impact-grid').innerHTML = impactItems.map((item) => `<article class="impact-item reveal"><span class="impact-number">${Number.isFinite(campaignData[item.statistic]) ? formatNumber(campaignData[item.statistic]) : '—'}</span><span class="impact-label">${escapeHtml(item.label)}</span><span class="impact-icon" aria-hidden="true">${escapeHtml(item.icon)}</span></article>`).join('');

  const contributors = campaignData.contributors;
  document.querySelector('#contributor-data-note').textContent = contributors.length ? 'Public contributor information is shown with consent.' : 'No public contributor information is currently available.';
  document.querySelector('#contributor-grid').innerHTML = contributors.length ? contributors.map((person) => {
    const optionalDetails = [
      person.contributionAmount != null ? `Contribution amount: ${formatNumber(person.contributionAmount)}` : '',
      person.pairsContributed != null ? `Pairs contributed: ${formatNumber(person.pairsContributed)}` : ''
    ].filter(Boolean).map((detail) => `<p>${escapeHtml(detail)}</p>`).join('');
    return `<article class="person-card reveal"><div class="avatar ${escapeHtml(person.color || 'avatar-grey')}" aria-hidden="true">${escapeHtml(person.initials)}</div><div class="person-info"><h3>${escapeHtml(person.name)}</h3><p>${escapeHtml(person.role)}</p>${optionalDetails}</div><span class="person-tag">${escapeHtml(person.type)}</span></article>`;
  }).join('') : '<p class="public-empty-state">No public contributor information is currently available.</p>';

  const schools = campaignData.schools;
  document.querySelector('#school-data-note').textContent = schools.length ? 'Public school and delivery information is shown with consent.' : 'No public school information is currently available.';
  document.querySelector('#school-list').innerHTML = schools.length ? schools.map((school) => `<article class="school-row reveal"><div class="school-pin" aria-hidden="true">⌂</div><div class="school-name"><h3>${escapeHtml(school.name)}</h3><p>${escapeHtml(school.district)}</p></div><div class="school-metric"><strong>${formatNumber(school.pairsDelivered)}</strong><span>Pairs delivered</span></div><div class="school-metric"><strong>${formatNumber(school.childrenReached)}</strong><span>Children reached</span></div><span class="row-arrow" aria-hidden="true">↗</span></article>`).join('') : '<p class="public-empty-state">No public school information is currently available.</p>';
}

function showPublicError() {
  document.querySelector('#campaign-data-status').textContent = 'DATA UNAVAILABLE';
  document.querySelector('.demo-explainer').textContent = 'Campaign information is temporarily unavailable. Please try again later.';
  document.querySelector('#impact-data-note').textContent = 'Campaign information is temporarily unavailable. Please try again later.';
  document.querySelector('#contributor-data-note').textContent = 'Public contributor information is temporarily unavailable.';
  document.querySelector('#school-data-note').textContent = 'Public school information is temporarily unavailable.';
  document.querySelector('#contributor-grid').innerHTML = '<p class="public-empty-state">Public contributor information is temporarily unavailable.</p>';
  document.querySelector('#school-list').innerHTML = '<p class="public-empty-state">Public school information is temporarily unavailable.</p>';
}

async function loadPublicCampaignData() {
  try {
    const client = window.supabaseClient;
    const [statsResult, contributorsResult, schoolsResult] = await Promise.all([
      client.from('public_campaign_statistics').select('*').limit(1).single(),
      client.from('public_contributors').select('*'),
      client.from('public_schools').select('school_id,school_name,district,pairs_delivered,children_reached')
    ]);
    const error = statsResult.error || contributorsResult.error || schoolsResult.error;
    if (error) throw error;
    const stats = statsResult.data;
    campaignData.pairsSecured = numeric(stats, 'secured_shoes', 'pairs_secured', 'total_pairs_secured', 'shoes_secured');
    campaignData.pairsDistributed = numeric(stats, 'distributed_shoes', 'pairs_distributed', 'total_pairs_distributed', 'shoes_distributed');
    campaignData.schoolsReached = numeric(stats, 'schools_reached', 'total_schools_reached');
    campaignData.childrenReached = numeric(stats, 'children_reached', 'total_children_reached');
    if (![campaignData.pairsSecured, campaignData.pairsDistributed, campaignData.schoolsReached, campaignData.childrenReached].every(Number.isFinite)) {
      throw new Error('public_campaign_statistics is missing an expected total column.');
    }
    campaignData.contributors = contributorsResult.data.map((row) => ({
      name: pick(row, 'display_name', 'name') || '', initials: pick(row, 'initials') || '',
      role: pick(row, 'role', 'description') || '', type: pick(row, 'contributor_type', 'type') || '',
      color: pick(row, 'color', 'avatar_color') || 'avatar-grey',
      contributionAmount: numeric(row, 'contribution_amount', 'amount'), pairsContributed: numeric(row, 'pairs_contributed', 'pairs')
    }));
    campaignData.schools = schoolsResult.data.map((row) => ({
      id: row.school_id,
      name: row.school_name || '',
      district: row.district || '',
      pairsDelivered: numeric(row, 'pairs_delivered') ?? 0,
      childrenReached: numeric(row, 'children_reached') ?? 0
    }));
    renderCampaignData();
    observeRevealItems();
  } catch (error) {
    console.error('Could not load public campaign data from Supabase.', error);
    showPublicError();
  }
}

document.querySelector('#campaign-data-status').textContent = 'LOADING DATA';
document.querySelector('.demo-explainer').textContent = 'Campaign statistics are loading from the campaign database.';
document.querySelector('#impact-data-note').textContent = 'Campaign statistics are loading from the campaign database.';
document.querySelector('#contributor-data-note').textContent = 'Public contributor information is loading.';
document.querySelector('#school-data-note').textContent = 'Public school information is loading.';
document.querySelector('#contributor-grid').innerHTML = '<p class="public-empty-state">Loading public contributors…</p>';
document.querySelector('#school-list').innerHTML = '<p class="public-empty-state">Loading public schools…</p>';
loadPublicCampaignData();
const sayHelloLink = document.querySelector('#say-hello-link');
const isMobileDevice = navigator.userAgentData?.mobile || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
if (isMobileDevice) {
  sayHelloLink.href = sayHelloLink.dataset.mobileHref;
  sayHelloLink.removeAttribute('target');
  sayHelloLink.removeAttribute('rel');
}
const menuButton = document.querySelector('.menu-toggle');
const navLinks = document.querySelector('.nav-links');

menuButton.addEventListener('click', () => {
  const isOpen = menuButton.getAttribute('aria-expanded') === 'true';
  menuButton.setAttribute('aria-expanded', String(!isOpen));
  menuButton.setAttribute('aria-label', isOpen ? 'Open navigation menu' : 'Close navigation menu');
  navLinks.classList.toggle('is-open', !isOpen);
});

navLinks.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', () => {
    menuButton.setAttribute('aria-expanded', 'false');
    menuButton.setAttribute('aria-label', 'Open navigation menu');
    navLinks.classList.remove('is-open');
  });
});

let revealObserver = null;
if ('IntersectionObserver' in window) {
  revealObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
}

function observeRevealItems() {
  const revealItems = document.querySelectorAll('.reveal');
  if (revealObserver) revealItems.forEach((item) => revealObserver.observe(item));
  else revealItems.forEach((item) => item.classList.add('is-visible'));
}

observeRevealItems();
