const fs = require("fs");
const path = require("path");
const scriptPath = path.join("..", "..", "make-data.js");
const makeDataRun = require(scriptPath);

const makeDir = (pth) => {
    return (fn) => {
        if (fn) {
            return path.join(pth, fn);
        } else {
            return pth;
        }
    };
}
const workingDir = makeDir(path.join(".", "test", "build"));
const filesDir = makeDir(path.join("..", "test-files"));
const currDir = makeDir(".");

beforeEach(() => {
    process.chdir(workingDir());
});

afterEach(() => {
    jest.clearAllMocks();
    process.chdir(path.join("..", ".."));
    for (fn of fs.readdirSync(workingDir())) {
        fs.unlinkSync(workingDir(fn));
    }
});

/*
 Tests
*/


test('Throws error for missing data file', () => {
    expect(() => {
        makeDataRun(true)
    }).toThrow('No data file');
});

test('Throws error for bad config', () => {
    fs.copyFileSync(filesDir("data-malta.csv"), currDir("data-malta.csv"));
    expect(() => {
        makeDataRun(true)
    }).toThrow('set from values in make-data-config.json does not exist');
});


test('Issues warnings for invalid courts and creates a court map template', () => {
    fs.copyFileSync(filesDir("data-malta.csv"), currDir("data-malta.csv"));
    fs.copyFileSync(filesDir("make-data-config-MALTA.json"), currDir("make-data-config.json"));
    
    const consoleSpy = jest.spyOn(console, 'log');
    
    makeDataRun(true);

    expect(consoleSpy).toHaveBeenCalledWith('ADDING TO CODE MAP: [Qorti Civili (Sezzjoni tal-Familja)::mt]');
    expect(consoleSpy).toHaveBeenCalledWith('WARNING: Invalid entry at Qorti Civili (Sezzjoni tal-Familja)::mt');
    expect(consoleSpy).toHaveBeenCalledTimes(105);
});


test('Issues a warning for an unrecognized jurisdiction and creates court-jurisdiction map template', () => {
    fs.copyFileSync(filesDir("data-malta.csv"), currDir("data-malta.csv"));
    fs.copyFileSync(filesDir("make-data-config-MALTA.json"), currDir("make-data-config.json"));
    fs.copyFileSync(filesDir("court-code-map-MALTA.json"), currDir("court-code-map.json"));
    
    const consoleSpy = jest.spyOn(console, 'log');

    makeDataRun(true);

    expect(consoleSpy).toHaveBeenCalledWith('ADDING TO CODE MAP: [qc::Gozo]');
    expect(consoleSpy).toHaveBeenCalledTimes(1);
});

test('Processes without error and creates import-me.json file', () => {
    fs.copyFileSync(filesDir("data-malta.csv"), currDir("data-malta.csv"));
    fs.copyFileSync(filesDir("make-data-config-MALTA.json"), currDir("make-data-config.json"));
    fs.copyFileSync(filesDir("court-code-map-MALTA.json"), currDir("court-code-map.json"));
    fs.copyFileSync(filesDir("court-jurisdiction-code-map-MALTA.json"), currDir("court-jurisdiction-code-map.json"));
    
    var txt = fs.readFileSync();
    
    const consoleSpy = jest.spyOn(console, 'log');

    makeDataRun(true);

    expect(consoleSpy).toHaveBeenCalledTimes(0);
    
});

