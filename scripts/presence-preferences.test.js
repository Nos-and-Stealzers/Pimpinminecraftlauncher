const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizePresence, validatePresencePatch } = require('../src/main/presence-preferences');
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
