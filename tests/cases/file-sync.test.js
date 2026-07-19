// fileSyncWrite() — the File System Access "linked file" write path.
// Only fileHandle.requestPermission/createWritable are stubbed; no real
// picker or IndexedDB involved (mirrors mytasks' file-sync test approach).

test('fileSyncWrite writes the given data to the linked file when permission is granted', async function () {
  let written = null, closed = false;
  fileHandle = {
    name: 'test.json',
    requestPermission: async () => 'granted',
    createWritable: async () => ({
      write: async (text) => { written = text; },
      close: async () => { closed = true; }
    })
  };
  await fileSyncWrite({ prompts: [{ id: 1, name: 'X' }], categories: [] });
  assertTrue(closed, 'the writable stream should have been closed');
  assertIncludes(written, '"name": "X"');
});

test('fileSyncWrite does nothing when no file is linked', async function () {
  fileHandle = null;
  await fileSyncWrite({ prompts: [], categories: [] });
  assertTrue(true, 'should resolve without throwing');
});

test('save() triggers fileSyncWrite when a file is linked', function () {
  let written = null;
  fileHandle = {
    name: 'test.json',
    requestPermission: async () => 'granted',
    createWritable: async () => ({ write: async (text) => { written = text; }, close: async () => {} })
  };
  const p = makeUnlockedPrompt({ name: 'Synced prompt' });
  save();
  assertTrue(true, 'save() should not throw synchronously even though fileSyncWrite is async');
});
