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
const fileSetup = () => {
    fs.mkdirSync(path.join(".", "files"));
}
const workingDir = makeDir(path.join(".", "test", "build"));
const workingFilesDir = makeDir(workingDir("files"));
const filesDir = makeDir(path.join("..", "test-files"));
const currDir = makeDir(".");



beforeEach(() => {
    process.chdir(workingDir());
});

afterEach(() => {
    jest.clearAllMocks();
    process.chdir(path.join("..", ".."));
    if (fs.existsSync(workingFilesDir())) {
        for (fn of fs.readdirSync(workingFilesDir())) {
            fs.unlinkSync(workingFilesDir(fn));
        }
        fs.rmdirSync(workingFilesDir());
    }
    for (fn of fs.readdirSync(workingDir())) {
        try {
            fs.unlinkSync(workingDir(fn));
        } catch(e) {
            console.log(fn + " " + workingDir(fn));
            throw e;
            process.exit();
        }
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

test('Throws error for multiple data files', () => {
    fs.copyFileSync(filesDir("data-malta.csv"), currDir("data-one.csv"));
    fs.copyFileSync(filesDir("data-malta.csv"), currDir("data-two.csv"));
    
    expect(() => {
        makeDataRun(true)
    }).toThrow('Multiple data files');
});

test('Throws error for bad config', () => {
    fs.copyFileSync(filesDir("data-malta.csv"), currDir("data-malta.csv"));

    expect(() => {
        makeDataRun(true)
    }).toThrow('set from values in make-data-config.json does not exist');
});


test('Throws error for missing ./files subdirectory', () => {
    fs.copyFileSync(filesDir("data-malta-date-formats.csv"), currDir("data-malta.csv"));
    fs.copyFileSync(filesDir("make-data-config-MALTA.json"), currDir("make-data-config.json"));
    fs.copyFileSync(filesDir("court-code-map-MALTA.json"), currDir("court-code-map.json"));
    fs.copyFileSync(filesDir("court-jurisdiction-code-map-MALTA.json"), currDir("court-jurisdiction-code-map.json"));
    expect(() => {
        makeDataRun(true)
    }).toThrow('subdirectory ./files does not exist');
});


test('Issues warnings for invalid courts and creates a court map template', () => {
    fileSetup();
    fs.copyFileSync(filesDir("data-malta.csv"), currDir("data-malta.csv"));
    fs.copyFileSync(filesDir("make-data-config-MALTA.json"), currDir("make-data-config.json"));
    var expectedJson = fs.readFileSync(filesDir("court-code-map-RAW.json"));
    var expectedObj = JSON.parse(expectedJson);
    const consoleSpy = jest.spyOn(console, 'log');
    makeDataRun(true);
    var resultJson = fs.readFileSync(currDir("court-code-map.json"));
    var resultObj = JSON.parse(resultJson);

    expect(consoleSpy).toHaveBeenCalledWith('ADDING TO CODE MAP: [Qorti Civili (Sezzjoni tal-Familja)::mt]');
    expect(consoleSpy).toHaveBeenCalledWith('WARNING: Invalid entry at Qorti Civili (Sezzjoni tal-Familja)::mt');
    expect(consoleSpy).toHaveBeenCalledTimes(105);
    expect(resultObj).toEqual(expectedObj);
});


test('Issues a warning for an unrecognized jurisdiction and creates court-jurisdiction map template', () => {
    fileSetup();
    fs.copyFileSync(filesDir("data-malta.csv"), currDir("data-malta.csv"));
    fs.copyFileSync(filesDir("make-data-config-MALTA.json"), currDir("make-data-config.json"));
    fs.copyFileSync(filesDir("court-code-map-MALTA.json"), currDir("court-code-map.json"));
    var expectedJson = fs.readFileSync(filesDir("court-jurisdiction-code-map-RAW.json"));
    var expectedObj = JSON.parse(expectedJson);
    const consoleSpy = jest.spyOn(console, 'log');
    makeDataRun(true);
    var resultJson = fs.readFileSync(currDir("court-jurisdiction-code-map.json"));
    var resultObj = JSON.parse(resultJson);

    expect(consoleSpy).toHaveBeenCalledWith('ADDING TO CODE MAP: [qc::Gozo]');
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    expect(resultObj).toEqual(expectedObj);
});

test('Processes without error and creates import-me.json file', () => {
    fileSetup();
    fs.copyFileSync(filesDir("data-malta.csv"), currDir("data-malta.csv"));
    fs.copyFileSync(filesDir("make-data-config-MALTA.json"), currDir("make-data-config.json"));
    fs.copyFileSync(filesDir("court-code-map-MALTA.json"), currDir("court-code-map.json"));
    fs.copyFileSync(filesDir("court-jurisdiction-code-map-MALTA.json"), currDir("court-jurisdiction-code-map.json"));
    var expectedJson = fs.readFileSync(filesDir("import-me.json"));
    var expectedObj = JSON.parse(expectedJson);
    const consoleSpy = jest.spyOn(console, 'log');
    makeDataRun(true);
    var resultJson = fs.readFileSync(currDir("import-me.json"));
    var resultObj = JSON.parse(resultJson);

    expect(consoleSpy).toHaveBeenCalledTimes(0);
    expect(resultObj).toEqual(expectedObj);
});


test('Processes dates correctly', () => {
    fileSetup();
    fs.copyFileSync(filesDir("data-malta-date-formats.csv"), currDir("data-malta.csv"));
    fs.copyFileSync(filesDir("make-data-config-MALTA.json"), currDir("make-data-config.json"));
    fs.copyFileSync(filesDir("court-code-map-MALTA.json"), currDir("court-code-map.json"));
    fs.copyFileSync(filesDir("court-jurisdiction-code-map-MALTA.json"), currDir("court-jurisdiction-code-map.json"));
    makeDataRun(true);
    var resultJson = fs.readFileSync(currDir("import-me.json"));
    var resultObj = JSON.parse(resultJson);
    expect(resultObj[0].issued).toEqual({"date-parts": [["2019"]]});
    expect(resultObj[1].issued).toEqual({"date-parts": [["2019", "2", "11"]]});
    expect(resultObj[2].issued).toEqual({"date-parts": [["2019", "2", "11"]]});
});

test('Issues a warning on an ambiguous date', () => {
    fileSetup();
    fs.copyFileSync(filesDir("data-malta-ambiguous-date.csv"), currDir("data-malta.csv"));
    fs.copyFileSync(filesDir("make-data-config-MALTA.json"), currDir("make-data-config.json"));
    fs.copyFileSync(filesDir("court-code-map-MALTA.json"), currDir("court-code-map.json"));
    fs.copyFileSync(filesDir("court-jurisdiction-code-map-MALTA.json"), currDir("court-jurisdiction-code-map.json"));
    const consoleSpy = jest.spyOn(console, 'log');
    makeDataRun(true);
    var resultJson = fs.readFileSync(currDir("import-me.json"));
    var resultObj = JSON.parse(resultJson);
    expect(consoleSpy).toHaveBeenCalledWith('WARNING: ambiguous date \"01-01-2021\" at MT001');
    expect(resultObj[0].issued).toEqual({"date-parts": [["2021", "1", "1"]]});
});

test('Throws an error on a badly formatted date', () => {
    fileSetup();
    fs.copyFileSync(filesDir("data-malta-bad-text-date.csv"), currDir("data-malta.csv"));
    fs.copyFileSync(filesDir("make-data-config-MALTA.json"), currDir("make-data-config.json"));
    fs.copyFileSync(filesDir("court-code-map-MALTA.json"), currDir("court-code-map.json"));
    fs.copyFileSync(filesDir("court-jurisdiction-code-map-MALTA.json"), currDir("court-jurisdiction-code-map.json"));
    expect(() => {
        makeDataRun(true)
    }).toThrow('invalid');
});



test('Throws an error on an impossible date', () => {
    fileSetup();
    fs.copyFileSync(filesDir("data-malta-impossible-date.csv"), currDir("data-malta.csv"));
    fs.copyFileSync(filesDir("make-data-config-MALTA.json"), currDir("make-data-config.json"));
    fs.copyFileSync(filesDir("court-code-map-MALTA.json"), currDir("court-code-map.json"));
    fs.copyFileSync(filesDir("court-jurisdiction-code-map-MALTA.json"), currDir("court-jurisdiction-code-map.json"));

    expect(() => {
        makeDataRun(true)
    }).toThrow('impossible');
});


test('Sets default national jurisdiction when input jurisdiction is empty', () => {
    fileSetup();
    fs.copyFileSync(filesDir("data-malta-empty-jurisdiction.csv"), currDir("data-malta.csv"));
    fs.copyFileSync(filesDir("make-data-config-MALTA.json"), currDir("make-data-config.json"));
    fs.copyFileSync(filesDir("court-code-map-MALTA.json"), currDir("court-code-map.json"));
    fs.copyFileSync(filesDir("court-jurisdiction-code-map-MALTA.json"), currDir("court-jurisdiction-code-map.json"));
    const consoleSpy = jest.spyOn(console, 'log');
    makeDataRun(true);
    var resultJson = fs.readFileSync(currDir("import-me.json"));
    var resultObj = JSON.parse(resultJson);
    expect(resultObj[0].jurisdiction).toBe("mt");
    expect(consoleSpy).toHaveBeenCalledTimes(0);
});

test('Creates separate items for trial and appellate judgments', () => {
    fileSetup();
    fs.copyFileSync(filesDir("data-malta-appeal.csv"), currDir("data-malta.csv"));
    fs.copyFileSync(filesDir("make-data-config-MALTA.json"), currDir("make-data-config.json"));
    fs.copyFileSync(filesDir("court-code-map-MALTA.json"), currDir("court-code-map.json"));
    fs.copyFileSync(filesDir("court-jurisdiction-code-map-MALTA.json"), currDir("court-jurisdiction-code-map.json"));
    var expectedJson = fs.readFileSync(filesDir("import-me-appeal.json"));
    var expectedObj = JSON.parse(expectedJson);
    const consoleSpy = jest.spyOn(console, 'log');
    makeDataRun(true);
    var resultJson = fs.readFileSync(currDir("import-me.json"));
    var resultObj = JSON.parse(resultJson);

    expect(consoleSpy).toHaveBeenCalledTimes(0);
    expect(resultObj).toEqual(expectedObj);
});

test('Copies empty.pdf placeholder into ./files automatically', () => {
    fileSetup();
    fs.copyFileSync(filesDir("data-malta-appeal.csv"), currDir("data-malta.csv"));
    fs.copyFileSync(filesDir("make-data-config-MALTA.json"), currDir("make-data-config.json"));
    fs.copyFileSync(filesDir("court-code-map-MALTA.json"), currDir("court-code-map.json"));
    fs.copyFileSync(filesDir("court-jurisdiction-code-map-MALTA.json"), currDir("court-jurisdiction-code-map.json"));
    var expectedJson = fs.readFileSync(filesDir("import-me-appeal.json"));
    var expectedObj = JSON.parse(expectedJson);
    const consoleSpy = jest.spyOn(console, 'log');
    makeDataRun(true);
    var resultJson = fs.readFileSync(currDir("import-me.json"));
    var resultObj = JSON.parse(resultJson);

    expect(consoleSpy).toHaveBeenCalledTimes(0);
    expect(resultObj).toEqual(expectedObj);
});
