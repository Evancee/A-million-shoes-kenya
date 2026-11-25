const campaignStorageKey = window.campaignStorageKey;
const storagePreparation = window.prepareCampaignStorage();
const readCampaignData = () => {
  try {
    const savedData = localStorage.getItem(campaignStorageKey);
    const result = window.normalizeCampaignData(savedData ? JSON.parse(savedData) : null);
    if (result.error) throw new Error(result.error);
    return result.data;
  } catch (error) {
    console.warn('Could not read saved campaign data; using defaults.', error);
    return window.cloneCampaignData(window.campaignDefaults);
  }
};
let campaignData = readCampaignData();

const formatNumber = (value) => new Intl.NumberFormat('en-KE').format(value);
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]));

const renderCampaignData = () => {
  const progressPercentage = campaignData.target > 0 ? (campaignData.pairsSecured / campaignData.target) * 100 : 0;
  const displayedPercentage = Number(progressPercentage.toFixed(1));
  const remainingPairs = Math.max(0, campaignData.target - campaignData.pairsSecured);
  const progressFill = document.querySelector('#campaign-progress-fill');
  const progressTrack = progressFill.closest('[role="progressbar"]');

  document.querySelector('#campaign-target').textContent = formatNumber(campaignData.target);
  document.querySelector('#campaign-secured').textContent = formatNumber(campaignData.pairsSecured);
  document.querySelector('#campaign-distributed').textContent = formatNumber(campaignData.pairsDistributed);
  document.querySelector('#campaign-percentage').textContent = `${displayedPercentage}%`;
  document.querySelector('#campaign-remaining').textContent = `${formatNumber(remainingPairs)} pairs remaining`;
  progressFill.style.width = `${Math.min(100, Math.max(0, progressPercentage))}%`;
  progressTrack.setAttribute('aria-valuenow', String(Math.min(100, Math.max(0, displayedPercentage))));
  progressTrack.setAttribute('aria-valuetext', `${displayedPercentage}% progress; ${formatNumber(campaignData.pairsSecured)} of ${formatNumber(campaignData.target)} pairs secured`);
  progressTrack.setAttribute('aria-label', `Campaign progress: ${formatNumber(campaignData.pairsSecured)} of ${formatNumber(campaignData.target)} pairs secured`);

  const targetPhrase = campaignData.target === 1000000 ? 'one million' : formatNumber(campaignData.target);
  const targetPhraseTitle = campaignData.target === 1000000 ? 'One Million' : formatNumber(campaignData.target);
  const targetUnit = campaignData.target === 1 ? 'pair' : 'pairs';
  const shoeUnit = campaignData.target === 1 ? 'shoe' : 'shoes';
  const smileUnit = campaignData.target === 1 ? 'smile' : 'smiles';
  document.querySelector('#campaign-target-headline').textContent = `${targetPhraseTitle} ${shoeUnit}.`;
  document.querySelector('#campaign-target-slogan').textContent = `${targetPhraseTitle} ${smileUnit}.`;
  document.querySelector('#campaign-target-intro').textContent = `${targetPhrase} ${targetUnit}`;
  document.querySelector('#campaign-target-mission').textContent = `${targetPhrase} ${targetUnit}`;
  document.title = `A Million Shoes Kenya — ${targetPhraseTitle} ${shoeUnit}. ${targetPhraseTitle} ${smileUnit}.`;
  const description = document.querySelector('meta[name="description"]');
  description.content = `A Million Shoes Kenya is a social impact initiative working to provide ${formatNumber(campaignData.target)} ${targetUnit} of shoes to children across Kenya.`;
  const hasCampaignFigures = [campaignData.pairsSecured, campaignData.pairsDistributed, campaignData.schoolsReached, campaignData.childrenReached].some((value) => value > 0);
  document.querySelector('#impact-data-note').textContent = hasCampaignFigures
    ? 'Campaign figures shown here reflect information entered in the local dashboard.'
    : 'Campaign information is awaiting initial data entry and verification.';
  const hasEnteredData = campaignData.target !== window.campaignDefaults.target || hasCampaignFigures || campaignData.contributors.length > 0 || campaignData.schools.length > 0;
  document.querySelector('#campaign-data-status').textContent = hasEnteredData ? 'DATA ENTERED' : 'DATA PENDING';

  document.querySelector('#impact-grid').innerHTML = campaignData.impact.map((item) => `
    <article class="impact-item reveal"><span class="impact-number">${formatNumber(campaignData[item.statistic])}</span><span class="impact-label">${escapeHtml(item.label)}</span><span class="impact-icon" aria-hidden="true">${escapeHtml(item.icon)}</span></article>
  `).join('');

  const publicContributors = campaignData.contributors.filter((person) => person.verificationStatus === 'verified');
  document.querySelector('#contributor-data-note').textContent = publicContributors.length
    ? 'Verified contributor records are displayed below. Pending records remain unpublished.'
    : campaignData.contributors.length ? 'Contributor records are awaiting verification.' : 'Contributor information is awaiting initial entry and verification.';
  document.querySelector('#contributor-grid').innerHTML = publicContributors.length ? publicContributors.map((person) => {
    const optionalDetails = [
      person.contributionAmount !== '' && person.contributionAmount != null ? `Contribution amount: ${formatNumber(person.contributionAmount)}` : '',
      person.pairsContributed !== '' && person.pairsContributed != null ? `Pairs contributed: ${formatNumber(person.pairsContributed)}` : '',
      person.description || ''
    ].filter(Boolean).map((detail) => `<p>${escapeHtml(detail)}</p>`).join('');
    return `<article class="person-card reveal"><div class="avatar ${escapeHtml(person.color || 'avatar-grey')}" aria-hidden="true">${escapeHtml(person.initials)}</div><div class="person-info"><h3>${escapeHtml(person.name)}</h3><p>${escapeHtml(person.role)}</p>${optionalDetails}</div><span class="person-tag">${escapeHtml(person.type)}</span></article>`;
  }).join('') : `<p class="public-empty-state">${campaignData.contributors.length ? 'Contributor records are awaiting verification.' : 'Contributor information is awaiting initial entry and verification.'}</p>`;

  const publicSchools = campaignData.schools.filter((school) => school.verificationStatus === 'verified');
  document.querySelector('#school-data-note').textContent = publicSchools.length
    ? 'Verified school and delivery records are displayed below. Pending records remain unpublished.'
    : campaignData.schools.length ? 'School records are awaiting verification.' : 'School and delivery information is awaiting initial entry and verification.';
  document.querySelector('#school-list').innerHTML = publicSchools.length ? publicSchools.map((school) => `
    <article class="school-row reveal"><div class="school-pin" aria-hidden="true">⌂</div><div class="school-name"><h3>${escapeHtml(school.name)}</h3><p>${escapeHtml(school.county || '')}</p></div><div class="school-metric"><strong>${formatNumber(school.pairsDelivered)}</strong><span>Pairs delivered</span></div><div class="school-metric"><strong>${formatNumber(school.childrenReached)}</strong><span>Children reached</span></div><span class="row-arrow" aria-hidden="true">↗</span></article>
  `).join('') : `<p class="public-empty-state">${campaignData.schools.length ? 'School records are awaiting verification.' : 'School and delivery information is awaiting initial entry and verification.'}</p>`;
};

renderCampaignData();
if (storagePreparation && !storagePreparation.ok) console.warn(storagePreparation.error);
window.addEventListener('storage', (event) => {
  if (event.key !== campaignStorageKey) return;
  campaignData = readCampaignData();
  renderCampaignData();
  observeRevealItems();
});

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
