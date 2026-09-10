function localStorageBytes() {
  let total = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    const v = localStorage.getItem(k);
    total += (k.length + v.length) * 2;
  }
  return total;
}

export async function getStorageEstimate() {
  const lsBytes = localStorageBytes();
  const lsMB = (lsBytes / 1048576).toFixed(1);
  const lsQuota = 5 * 1048576;
  const lsPercent = ((lsBytes / lsQuota) * 100).toFixed(1);
  const lsWarning = lsPercent > 80;

  if (!navigator.storage || !navigator.storage.estimate) {
    return { usage: lsBytes, quota: lsQuota, usageMB: lsMB, quotaMB: '5.0', percent: lsPercent, lsOnly: true, lsWarning };
  }
  try {
    const est = await navigator.storage.estimate();
    const usage = typeof est.usage === 'number' && est.usage >= 0 ? est.usage : 0;
    const quota = typeof est.quota === 'number' && est.quota > 0 ? est.quota : 1;
    return {
      usage,
      quota,
      usageMB: (usage / 1048576).toFixed(1),
      quotaMB: (quota / 1048576).toFixed(1),
      percent: ((usage / quota) * 100).toFixed(1),
      lsUsageMB: lsMB,
      lsPercent,
      lsWarning,
    };
  } catch {
    return { usage: lsBytes, quota: lsQuota, usageMB: lsMB, quotaMB: '5.0', percent: lsPercent, lsOnly: true, lsWarning };
  }
}
