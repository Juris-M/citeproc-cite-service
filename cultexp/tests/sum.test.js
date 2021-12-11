const makeData = require('../make-data.js');

test('Throws error for missing config', () => {
    expect(makeData.run()).toThrow("Ouch!");
});
