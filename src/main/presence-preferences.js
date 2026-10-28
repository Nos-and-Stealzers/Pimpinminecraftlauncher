// Plain JSON preferences; never accept a Discord token or client secret.
const DEFAULTS = Object.freeze({ discordRich: true, discordAppId: null, discordShowInstance: true, discordShowVersion: true, discordShowElapsed: true });
function normalizePresence(source = {}) {
  const result = { ...DEFAULTS };
  for (const key of ['discordRich', 'discordShowInstance', 'discordShowVersion', 'discordShowElapsed']) {
    if (typeof source?.[key] === 'boolean') result[key] = source[key];
  }
  const id = typeof source?.discordAppId === 'string' ? source.discordAppId.trim() : '';
  if (/^[0-9]{17,20}$/.test(id)) result.discordAppId = id;
  return result;
}
function validatePresencePatch(patch) {
  if (!Object.hasOwn(patch || {}, 'discordAppId')) return;
  const id = patch.discordAppId;
  if (id !== null && id !== '' && (typeof id !== 'string' || !/^[0-9]{17,20}$/.test(id.trim()))) {
    throw new Error('Discord application ID must contain 17 to 20 digits. Paste the application ID, not a token or secret.');
  }
}
module.exports = { DEFAULTS, normalizePresence, validatePresencePatch };
