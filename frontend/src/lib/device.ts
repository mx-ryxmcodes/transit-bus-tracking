/** Stable per-browser ID used for driver device approval (must be >= 16 chars). */
export function getDeviceFingerprint(): string {
  const KEY = 'transit_device_id';
  let id = localStorage.getItem(KEY);
  if (!id) { id = crypto.randomUUID(); localStorage.setItem(KEY, id); }
  return id;
}
