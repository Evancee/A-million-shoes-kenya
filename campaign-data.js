// Default campaign content and shared data helpers for the public page and admin dashboard.
window.campaignDefaults = {
  target: 1000000,
  pairsSecured: 0,
  pairsDistributed: 0,
  schoolsReached: 0,
  childrenReached: 0,
  impact: [
    { statistic: 'schoolsReached', label: 'Schools reached', icon: '⌂' },
    { statistic: 'childrenReached', label: 'Children reached', icon: '♡' },
    { statistic: 'pairsDistributed', label: 'Shoes distributed', icon: '↗' }
  ],
  contributors: [],
  schools: []
};

window.campaignStorageKey = 'amillionShoesCampaignData';
window.campaignStorageVersionKey = 'amillionShoesCampaignDataVersion';
window.campaignDataVersion = '3';

window.prepareCampaignStorage = () => {
  try {
    const storedVersion = localStorage.getItem(window.campaignStorageVersionKey);
    if (storedVersion === null || storedVersion === '1') {
      // The unversioned/version 1 storage held the original illustrative dataset.
      localStorage.removeItem(window.campaignStorageKey);
    } else if (storedVersion === '2') {
      const previousData = localStorage.getItem(window.campaignStorageKey);
      const previousVersion = storedVersion;
      let migratedData = previousData;

      if (previousData !== null) {
        let parsed;
        try {
          parsed = JSON.parse(previousData);
        } catch (error) {
          return { ok: false, error: 'Saved version 2 campaign data is malformed and could not be migrated.' };
        }
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          return { ok: false, error: 'Saved version 2 campaign data is malformed and could not be migrated.' };
        }
        for (const collection of ['contributors', 'schools']) {
          if (parsed[collection] === undefined) continue;
          if (!Array.isArray(parsed[collection]) || parsed[collection].some((record) => !record || typeof record !== 'object' || Array.isArray(record))) {
            return { ok: false, error: `Saved version 2 ${collection} data is malformed and could not be migrated.` };
          }
          parsed[collection].forEach((record) => { record.verificationStatus = 'pending'; });
        }

        const normalized = window.normalizeCampaignData(parsed);
        if (normalized.error) return { ok: false, error: normalized.error };
        migratedData = JSON.stringify(normalized.data);
      }

      try {
        if (migratedData !== previousData) {
          localStorage.setItem(window.campaignStorageKey, migratedData);
          if (localStorage.getItem(window.campaignStorageKey) !== migratedData) throw new Error('Campaign records could not be confirmed.');
        }
        localStorage.setItem(window.campaignStorageVersionKey, window.campaignDataVersion);
        if (localStorage.getItem(window.campaignStorageVersionKey) !== window.campaignDataVersion) throw new Error('Campaign storage version could not be confirmed.');
      } catch (error) {
        try {
          if (previousData === null) localStorage.removeItem(window.campaignStorageKey);
          else localStorage.setItem(window.campaignStorageKey, previousData);
          localStorage.setItem(window.campaignStorageVersionKey, previousVersion);
          if (localStorage.getItem(window.campaignStorageKey) !== previousData || localStorage.getItem(window.campaignStorageVersionKey) !== previousVersion) {
            throw new Error('Previous campaign data could not be confirmed.');
          }
        } catch (rollbackError) {
          return { ok: false, error: 'Migration failed and the previous campaign data could not be confirmed. Reload and inspect the saved data before continuing.' };
        }
        return { ok: false, error: error.message || 'Campaign data could not be migrated.' };
      }
      return { ok: true, migrated: true };
    } else if (storedVersion !== window.campaignDataVersion) {
      return { ok: false, error: 'This browser has campaign data from an unsupported newer version.' };
    }
    localStorage.setItem(window.campaignStorageVersionKey, window.campaignDataVersion);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: 'The browser could not prepare local campaign storage.' };
  }
};

window.cloneCampaignData = (data) => JSON.parse(JSON.stringify(data));

window.createCampaignRecordId = () => {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
  return `record_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
};

window.normalizeCampaignData = (savedData) => {
  if (savedData === null || savedData === undefined) {
    return { data: window.cloneCampaignData(window.campaignDefaults), migrated: false };
  }
  if (typeof savedData !== 'object' || Array.isArray(savedData)) {
    return { error: 'Saved campaign data must be an object.' };
  }

  const data = {
    ...window.cloneCampaignData(window.campaignDefaults),
    ...savedData,
    impact: window.cloneCampaignData(window.campaignDefaults.impact),
    contributors: Array.isArray(savedData.contributors) ? savedData.contributors.map((record) => ({ ...record })) :
      (savedData.contributors === undefined ? [] : savedData.contributors),
    schools: Array.isArray(savedData.schools) ? savedData.schools.map((record) => ({ ...record })) :
      (savedData.schools === undefined ? [] : savedData.schools)
  };
  let migrated = false;

  for (const collection of ['contributors', 'schools']) {
    if (!Array.isArray(data[collection])) return { error: `${collection} must be a list.` };
    for (const record of data[collection]) {
      if (!record || typeof record !== 'object' || Array.isArray(record)) {
        return { error: `Every ${collection === 'schools' ? 'school' : 'contributor'} must be a valid record.` };
      }
      if (!record.id) {
        record.id = window.createCampaignRecordId();
        migrated = true;
      }
      if (record.verificationStatus === undefined) {
        record.verificationStatus = 'pending';
        migrated = true;
      }
    }
  }

  const validationError = window.validateCampaignData(data);
  return validationError ? { error: validationError } : { data, migrated };
};

window.validateCampaignData = (data) => {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return 'Campaign data must be an object.';
  const totals = ['target', 'pairsSecured', 'pairsDistributed', 'schoolsReached', 'childrenReached'];
  for (const field of totals) {
    if (typeof data[field] !== 'number' || !Number.isSafeInteger(data[field]) || data[field] < 0) {
      return `${field} must be a whole number of zero or greater.`;
    }
  }
  if (data.target <= 0) return 'Campaign target must be greater than zero.';
  if (!Array.isArray(data.contributors) || !Array.isArray(data.schools)) {
    return 'Contributors and schools must both be lists.';
  }

  const validateText = (record, field, label, required = false, maxLength = 500) => {
    if (record[field] === undefined || record[field] === null) return required ? `${label} is required.` : '';
    if (typeof record[field] !== 'string' || record[field].length > maxLength || (required && !record[field].trim())) {
      return `${label} must be ${required ? 'non-empty text' : `text of ${maxLength} characters or fewer`}.`;
    }
    return '';
  };
  const validateCount = (value, label, optional = false) => {
    if (optional && (value === undefined || value === null || value === '')) return '';
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? '' : `${label} must be a whole number of zero or greater.`;
  };
  const validateAmount = (value) => value === undefined || value === null || value === '' ||
    (typeof value === 'number' && Number.isFinite(value) && value >= 0) ? '' : 'Contribution amount must be a valid number of zero or greater.';

  for (const [index, person] of data.contributors.entries()) {
    if (!person || typeof person !== 'object' || Array.isArray(person)) return `Contributor ${index + 1} is not a valid record.`;
    if (typeof person.id !== 'string' || !/^[A-Za-z0-9_-]{8,100}$/.test(person.id)) return `Contributor ${index + 1} needs a valid ID.`;
    const nameError = validateText(person, 'name', 'Contributor name', true, 200);
    if (nameError) return nameError;
    for (const field of ['initials', 'role', 'type', 'description']) {
      const maxLength = field === 'initials' ? 3 : field === 'description' ? 2000 : 200;
      const error = validateText(person, field, `Contributor ${field}`, false, maxLength);
      if (error) return error;
    }
    if (person.color !== undefined && !['avatar-red', 'avatar-green', 'avatar-grey'].includes(person.color)) return 'Choose a valid contributor avatar colour.';
    if (!['pending', 'verified'].includes(person.verificationStatus)) return `Contributor ${person.name} needs a valid verification status.`;
    const amountError = validateAmount(person.contributionAmount);
    if (amountError) return amountError;
    const pairsError = validateCount(person.pairsContributed, 'Pairs contributed', true);
    if (pairsError) return pairsError;
  }

  for (const [index, school] of data.schools.entries()) {
    if (!school || typeof school !== 'object' || Array.isArray(school)) return `School ${index + 1} is not a valid record.`;
    if (typeof school.id !== 'string' || !/^[A-Za-z0-9_-]{8,100}$/.test(school.id)) return `School ${index + 1} needs a valid ID.`;
    const nameError = validateText(school, 'name', 'School name', true, 200);
    if (nameError) return nameError;
    const locationError = validateText(school, 'county', 'School location', false, 200);
    if (locationError) return locationError;
    if (!['pending', 'verified'].includes(school.verificationStatus)) return `School ${school.name} needs a valid verification status.`;
    const pairsError = validateCount(school.pairsDelivered, 'Pairs delivered');
    if (pairsError) return pairsError;
    const childrenError = validateCount(school.childrenReached, 'Children reached');
    if (childrenError) return childrenError;
  }

  for (const collection of ['contributors', 'schools']) {
    const ids = data[collection].map((record) => record.id);
    if (new Set(ids).size !== ids.length) return `${collection} contains duplicate record IDs.`;
  }
  return '';
};

window.writeCampaignData = (data, expectedStoredValue) => {
  const validationError = window.validateCampaignData(data);
  if (validationError) throw new Error(validationError);
  const serialized = JSON.stringify(data);
  const currentValue = localStorage.getItem(window.campaignStorageKey);
  if (currentValue !== expectedStoredValue) throw new Error('Campaign data changed in another tab. Reload this dashboard before saving.');

  try {
    localStorage.setItem(window.campaignStorageKey, serialized);
    if (localStorage.getItem(window.campaignStorageKey) !== serialized) throw new Error('The browser did not confirm the saved campaign data.');
  } catch (error) {
    try {
      if (expectedStoredValue === null) localStorage.removeItem(window.campaignStorageKey);
      else localStorage.setItem(window.campaignStorageKey, expectedStoredValue);
      if (localStorage.getItem(window.campaignStorageKey) !== expectedStoredValue) throw new Error('Previous data could not be restored.');
    } catch (rollbackError) {
      throw new Error('Save failed, and the browser could not confirm restoration of the previous data. Reload and inspect saved data before continuing.');
    }
    throw new Error(error.message || 'The browser could not save campaign data.');
  }
  return serialized;
};

window.clearCampaignData = (expectedStoredValue) => {
  const currentValue = localStorage.getItem(window.campaignStorageKey);
  if (currentValue !== expectedStoredValue) throw new Error('Campaign data changed in another tab. Reload this dashboard before resetting.');
  const previousVersion = localStorage.getItem(window.campaignStorageVersionKey);
  try {
    localStorage.removeItem(window.campaignStorageKey);
    localStorage.setItem(window.campaignStorageVersionKey, window.campaignDataVersion);
    if (localStorage.getItem(window.campaignStorageKey) !== null || localStorage.getItem(window.campaignStorageVersionKey) !== window.campaignDataVersion) {
      throw new Error('The browser did not confirm the reset.');
    }
  } catch (error) {
    try {
      if (expectedStoredValue !== null) localStorage.setItem(window.campaignStorageKey, expectedStoredValue);
      if (previousVersion === null) localStorage.removeItem(window.campaignStorageVersionKey);
      else localStorage.setItem(window.campaignStorageVersionKey, previousVersion);
      if (localStorage.getItem(window.campaignStorageKey) !== expectedStoredValue) throw new Error('Previous data could not be restored.');
      if (localStorage.getItem(window.campaignStorageVersionKey) !== previousVersion) throw new Error('Previous storage version could not be restored.');
    } catch (rollbackError) {
      throw new Error('Reset failed, and the browser could not confirm restoration of the previous data. Reload and inspect saved data before continuing.');
    }
    throw new Error(error.message || 'The browser could not reset campaign data.');
  }
};
