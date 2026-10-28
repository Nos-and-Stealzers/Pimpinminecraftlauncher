const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizePresence, validatePresencePatch, effectiveAppId, builtInAppId } = require('../src/main/presence-preferences');
const { createPresence } = require('../src/main/presence');
test('presence preferences accept only typed booleans and a public numeric application ID', () => {
  assert.deepEqual(normalizePresence({ discordAppId: ' 123456789012345678 ', discordRich: false, discordShowInstance: false, discordShowVersion: false, discordShowElapsed: false }), { discordAppId: '123456789012345678', discordRich: false, discordShowInstance: false, discordShowVersion: false, discordShowElapsed: false });
  for (const id of [123456789012345678, 'token.secret', '123', {}, [], '9'.repeat(21)]) {
    assert.equal(normalizePresence({ discordAppId: id }).discordAppId, null);
    assert.throws(() => validatePresencePatch({ discordAppId: id }), /application ID/);
  }
  assert.equal(normalizePresence({ discordRich: 'false' }).discordRich, true);
  for (const id of ['', null, '123456789012345678']) assert.doesNotThrow(() => validatePresencePatch({ discordAppId: id }));
  assert.doesNotThrow(() => validatePresencePatch({}));
});
test('a user ID overrides the built-in ID; invalid user IDs fall back to the built-in one', () => {
  const builtIn = builtInAppId();
  assert.equal(effectiveAppId({ discordAppId: '123456789012345678' }), '123456789012345678');
  assert.equal(effectiveAppId({ discordAppId: 'token.secret' }), builtIn);
  assert.equal(effectiveAppId({}), builtIn);
});
test('presence connects automatically with the built-in ID and no user setup', async () => {
  let loginId = null, activity = null;
  const client = { on() {}, login: async ({ clientId }) => { loginId = clientId; }, setActivity: async (a) => { activity = a; }, clearActivity: async () => {}, destroy: async () => {} };
  const p = createPresence({ getSettings: () => ({}), createClient: () => client, effectiveAppId: () => '999999999999999999' });
  await p.setGames([{ name: 'Survival', mcVersion: '1.21.4', loader: 'fabric', started: 1000 }]);
  assert.equal(loginId, '999999999999999999');
  assert.equal(activity.details, 'Playing Survival');
  assert.equal(p.getStatus().state, 'connected');
  await p.quit();
});
