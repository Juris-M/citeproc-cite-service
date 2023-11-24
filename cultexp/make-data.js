#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const getopts = require("getopts");

// See the csv-parse package for details
var csvparse
try {
    csvparse = require("csv-parse/sync");
} catch(e) {
    csvparse = require("csv-parse/dist/cjs/sync.cjs");
}

// See the markdown-it package for details
const markdown = require('markdown-it')({
    html: true,
    xhtmlOut: true,
    linkify: true,
    typographer: true
});

/** @function handleError
 * @description Report only the human-readable error message
     to console and terminate the script
 * @param {Object} e - Instance of the Error constructor
 * @param {string} e.message - Error message
 */
const handleError = (e) => {
    throw e;
    console.log(`ERROR: ${e.message}`);
    process.exit();
};

/** @function checkCsvFilenameSanity
 * @description Check that there is one and only one
 *   CSV file in the current directory with the form
 *   "data-<country name>.csv".
 * * If more than one such file exists,
 *   throw an appropriate error
 * * If no such file exists, throw a different
 *   appropriate error
 */

const filesPath = (filename) => {
    var pth = path.join(".", "files");
    if (!fs.existsSync(pth)) {
        var err = new Error(`Required subdirectory ./files does not exist. Create subdirectory and populate with attachment PDF files.`);
        throw err;
    }
    if (!fs.existsSync(path.join(pth, "empty.pdf"))) {
        var emptyPath = path.join(__dirname, "test", "test-files", "empty.pdf");
        fs.copyFileSync(emptyPath, path.join(pth, "empty.pdf"));
    }
    if (filename) {
        return path.join(pth, filename);
    } else {
        return pth;
    }
}

/*
 Setup config
 */
function SetupTool(opts) {
    if (opts) {
        this.opts = opts;
    }
    var configPath = path.join(".", "make-data-config.json");
    this.setupConfigFile(configPath);
    this.loadConfigFile(configPath);
    this.loadUseDocsOnItems();
    this.checkDefaultJurisdictionCode();
    this.validateLrrPath();
    this.loadJurisObj();
    this.extractJurisdictionNames();
    this.extractCourtCodes();
    this.extractCourtNameToKeyMap();
    this.setupCourtMap();
    this.loadCourtMap();
}

SetupTool.prototype.setupConfigFile = function(configPath) {
    if (!fs.existsSync(configPath)) {
        fs.writeFileSync(configPath, JSON.stringify({
            "jurisdictionCode": "xx",
            "jurisdictionName": "Laputa",
            "jurisdictionDescPath": "/path/to/legal-resource-registry-repo"
        }, null, 2));
    };
}

SetupTool.prototype.loadConfigFile = function(configPath) {
    var obj = JSON.parse(fs.readFileSync(configPath));
    this.defaultJurisdiction = obj.jurisdictionCode;
    this.fileNameStub = `data-${obj.jurisdictionName.replace(/\s/g, "-").toLowerCase()}`;
    this.jurisdictionDescPath = `${obj.jurisdictionDescPath.replace(/\/$/, "")}/juris-${this.defaultJurisdiction}-desc.json`;
    console.log(`Running with data file stub: ${this.fileNameStub}`);
}

SetupTool.prototype.loadUseDocsOnItems = function() {
    var fpth = path.join(".", "useDocsOnItems.txt")
    if (fs.existsSync(fpth)) {
        console.log("Loading showDocs tag items from useDocsOnItems.txt");
        var str = fs.readFileSync(fpth).toString();    
        var arr = str.trim().split("\n").map(o => o.trim().slice(0, 5));
        // Remove duplicates
        arr.sort();
        for (var i=arr.length-1; i>0; i--) {
            if (arr[i] === arr[i-1]) {
                arr = arr.slice(0, i-1).concat(arr.slice(i));
            }
        }
        this.useDocsOnItems = arr;
    }
}

SetupTool.prototype.checkDefaultJurisdictionCode = function() {
    if (this.jurisdictionCode === "xx") {
        var err = new Error("set appropriate values in make-data-config.json");
        throw err;
    }
}

SetupTool.prototype.validateLrrPath = function() {
    if (!fs.existsSync(this.jurisdictionDescPath)) {
        var err = new Error(`ERROR: path '${this.jurisdictionDescPath}' set from values in make-data-config.json does not exist.\n       Edit make-data-config.json and try again.`);
        throw err;
    }
}

SetupTool.prototype.loadJurisObj = function() {
    this.jurisObj = {};
    this.jurisObj[this.defaultJurisdiction] = JSON.parse(fs.readFileSync(this.jurisdictionDescPath).toString());
}

SetupTool.prototype.extractJurisdictionNames = function() {
    this.jurisdictionNames = {};
    for (var key in this.jurisObj[this.defaultJurisdiction].jurisdictions) {
        // Split key
        var lst = key.split(":");
        // Look up name of each key element
        // Build an array
        // Join with |
        var accKey = [];
        var accName = [];
        for (var i=0,ilen=lst.length;i<ilen;i++) {
            elem = lst[i];
            accKey.push(elem);
            var subkey = accKey.join(":");
            var name = this.jurisObj[this.defaultJurisdiction].jurisdictions[subkey].name;
            accName.push(name);
            if (i === 0) {
                accName.push(elem.toUpperCase());
            }
        }
        if (accName.length === 2) {
            this.jurisdictionNames[accName[0]] = subkey;
        }
        this.jurisdictionNames[accName.join("|")] = subkey;
    }
}

/** Attempt to read human-readable form of Jurism court entries
 * Map is generated from Jurism juris-desc file.
 * Base map is supplemented by a custom file containing match hints
 */
SetupTool.prototype.extractCourtCodes = function() {
    this.courtCodes = {};
    for (var key in this.jurisObj[this.defaultJurisdiction].courts) {
        this.courtCodes[this.jurisObj[this.defaultJurisdiction].courts[key].name] = key;
    }
}

SetupTool.prototype.extractCourtNameToKeyMap = function() {
    this.courtNameMap = {};
    for (var key in this.jurisObj[this.defaultJurisdiction].courts) {
        this.courtNameMap[this.jurisObj[this.defaultJurisdiction].courts[key].name] = key;
    }
}

SetupTool.prototype.setupCourtMap = function() {
    this.courtMapPath = path.join(".", "court-code-map.json");
    if (!fs.existsSync(this.courtMapPath)) {
        fs.writeFileSync(this.courtMapPath, "[]");
        this.hasCourtMapFile = false;
    } else {
        this.hasCourtMapFile = true;
    }
}

SetupTool.prototype.loadCourtMap = function() {
    this.courtMap = JSON.parse(fs.readFileSync(this.courtMapPath).toString());
    // Sort, putting longest matches first to avoid false positives
    this.courtMap.sort((a,b) => {
        if (a[0].length < b[0].length) {
            return 1;
        } else if (a[0].length > b[0].length) {
            return -1;
        } else {
            if (a[0] < b[0]) {
                return 1;
            } else if (a[0] > b[0]) {
                return -1;
            } else {
                return 0;
            }
        }
    });
}

SetupTool.prototype.addCourtMapEntry = function(line) {
    if (!this.jurisObj[this.defaultJurisdiction].courts[line.court]) {
        if (this.courtMap.map(o => o[0]).indexOf(line.court) === -1) {
            this.courtMap.push([line.court, ""]);
        }
    }
}

SetupTool.prototype.checkCourtMap = function() {
    var missingCodes = [], badCodes = [];
    for (var info of this.courtMap) {
        if (info[1] === "") {
            missingCodes.push(info[0]);
        } else if (!this.jurisObj[this.defaultJurisdiction].courts[info[1]]) {
            badCodes.push(`${info[1]} (${info[0]})`);
        }
    }
    if (missingCodes.length > 0) {
        var err = new Error(`the following courts are unmapped in court-code-map.json:\n  ${missingCodes.join("\n  ")}`);
        throw err;
    }
    if (badCodes.length > 0) {
        console.log(`WARNING: the following courts have unrecognized identifiers in court-code-map.json:\n  ${badCodes.join("\n  ")}`);
    }
}

SetupTool.prototype.setupCourtJurisdictionMap = function() {
    this.courtJurisdictionMapPath = path.join(".", "court-jurisdiction-code-map.json");
    if (!fs.existsSync(this.courtJurisdictionMapPath)) {
        fs.writeFileSync(this.courtJurisdictionMapPath, "{}");
        this.hasCourtJurisdictionMapFile = false;
    } else {
        this.hasCourtJurisdictionMapFile = true;
    }
}

SetupTool.prototype.loadCourtJurisdictionMap = function() {
    this.courtJurisdictionMap = JSON.parse(fs.readFileSync(this.courtJurisdictionMapPath).toString());

    // This map needs to be reflected in the entries to
    // which it applies. Currently it's just a free-standing
    // map lurking in memory.
}

SetupTool.prototype.validateJurisdictionCode = function(jurisdiction) {
    var ret = false;
    var m = jurisdiction.match(/^([.a-z]+)(:[.a-z]+)*$/);
    if (m) {
        if (this.jurisObj[m[1]] && this.jurisObj[m[1]].jurisdictions[jurisdiction]) {
            ret = true;
        }
    }
    return ret;
}


SetupTool.prototype.getCurrentJurisdictionCode = function(jurisdiction) {
    var currentJurisdictionCode = this.defaultJurisdiction;
    var m = jurisdiction.match(/^([.a-z]+)(:[.a-z]+)*$/);
    if (m) {
        currentJurisdictionCode = m[1];
    }
    return currentJurisdictionCode;
}

SetupTool.prototype.loadDataForCurrentJurisdiction = function(line) {
    if (!line.jurisdiction) {
        line.jurisdiction = this.defaultJurisdiction;
    }
    var currentJurisdictionCode = this.getCurrentJurisdictionCode(line.jurisdiction);
    if (!this.jurisObj[currentJurisdictionCode]) {
        var currentJurisdictionDescPath = this.jurisdictionDescPath.replace(`juris-${this.defaultJurisdiction}-desc.json`, `juris-${currentJurisdictionCode}-desc.json`);
        if (fs.existsSync(currentJurisdictionDescPath)) {
            this.jurisObj[currentJurisdictionCode] = JSON.parse(fs.readFileSync(currentJurisdictionDescPath).toString());
        }
    }
    return currentJurisdictionCode;
}

SetupTool.prototype.extractJurisdiction = function(line, currentJurisdictionCode) {
    if (!currentJurisdictionCode) {
        currentJurisdictionCode = this.defaultJurisdiction;
    }
    var jurisdiction = line.jurisdiction;
    if (!this.jurisObj[currentJurisdictionCode].jurisdictions[jurisdiction]) {
        if (this.jurisdictionNames[jurisdiction]) {
            jurisdiction = this.jurisdictionNames[jurisdiction];
        }
    }
    line.jurisdiction = jurisdiction;
}

SetupTool.prototype.resetCourtDetails = function(line) {
    var str = line.court.trim();
    if (this.courtNameMap[str]) {
        line.court = this.courtNameMap[str];
    } else {
        for (var elem of this.courtMap) {
            if (str.toLowerCase().indexOf(elem[0].toLowerCase()) > -1) {
                line.court = elem[1];
                if (elem[2]) {
                    line.division = elem[2];
                }
                if (elem[3]) {
                    line.type = elem[3];
                }
                if (elem[4]) {
                    line.jurisdiction = elem[4];
                }
                break;
            }
        }
    }
}

SetupTool.prototype.resetCourtJurisdictionDetails = function(line) {
    for (var key in this.courtJurisdictionMap) {
        var lineKey = `${line.court}::${line.jurisdiction}`;
        if (key === lineKey) {
            var info = this.courtJurisdictionMap[lineKey];
            line.court = info.court;
            line.jurisdiction = info.jurisdiction;
        }
    }
}

SetupTool.prototype.addCourtJurisdictionMapEntry = function(line) {
    var jurisdictionIsValid = this.validateJurisdictionCode(line.jurisdiction);
    console.log(`Adding entry to this.courtJurisdictionMap!`);
    if (!jurisdictionIsValid) {
        var key = `${line.court}::${line.jurisdiction}`;
        if (!this.courtJurisdictionMap[key]) {
            this.courtJurisdictionMap[key] = {
                court: line.court,
                jurisdiction: line.jurisdiction
            };
        }
    }
}

SetupTool.prototype.checkCourtJurisdictionMap = function() {
    var errors = [], warnings = [];
    for (var key in this.courtJurisdictionMap) {
        var info = this.courtJurisdictionMap[key];
        var jurisdictionIsValid = this.validateJurisdictionCode(info.jurisdiction);
        if (!jurisdictionIsValid) {
            errors.push(`${info.jurisdiction}`);
        }
    }
    if (errors.length > 0) {
        var err = new Error(`the following jurisdiction codes in court-jurisdiction-code-map.json\nare invalid:\n  ${errors.join("\n  ")}`);
        throw err;
    }
}

// Containers for runtime data pools
var unrecognizedJurisdictions = [];

/*
 Data and functions for sniffing and setting column positions
*/
function ColumnTool(opts) {
    this.opts = opts;
    this.colMap = [];
}

ColumnTool.prototype.checkCsvFilenameSanity = () => {
    var filenames = fs.readdirSync(".");
    var csvOK = false;
    for (var fn of filenames) {
        if (fn.match(/^data-[-a-zA-Z]+\.csv$/)) {
            if (!csvOK) {
                csvOK = true;
            } else {
                var err = new Error("Multiple data files with name 'data-<country_name>.csv' found in this directory. Aborting.");
                throw err;
            }
        }
    }
    if (!csvOK) {
        var err = new Error("No data file with name 'data-<country_name>.csv' found. Aborting.");
        throw err;
    }
}

ColumnTool.prototype.colMapHints = {
    "id": {
        str: "doc"
    },
    "date": {
        str: "date"
    },
    "jurisdiction": {
        str: "jurisdiction"
    },
    "court": {
        str: "court"
    },
    "division": {
        str: "division"
    },
    "type": {
        str: "type"
    },
    "docketno": {
        str: "number"
    },
    "name": {
        str: "name"
        
    },
    "year-as-volume": {
        str: "year"
    },
    "volume": {
        str: "volume"
    },
    "reporter": {
        str: "reporter"
    },
    "page": {
        str: "page"
    },
    "expert-presence": {
        str: "presence"
    },
    "instructedby": {
        str: "instructed"
    },
    "link": {
        str: "link"
    },
    "keywords": {
        str: "keywords"
    },
    "area": {
        str: "area"
    },
    "summary": {
        str: "summary"
    },
    "lang": {
        str: "language"
    }
}

ColumnTool.prototype.setColMap = function(record) {
    for (var i=0,ilen=record.length;i<ilen;i++) {
        var val = record[i] ? record[i].toLowerCase() : "";
        var foundIt = false;
        for (var key in this.colMapHints) {
            var srch = this.colMapHints[key].str;
            if (val.indexOf(srch) > -1) {
                this.colMap.push(key);
                delete this.colMapHints[key];
                foundIt = true;
                break;
            }
        }
        if (!foundIt) {
            this.colMap.push(null);
        }
    }
}

ColumnTool.prototype.checkColMap = function() {
    if (!this.opts.quiet && !this.opts.Quiet) {
        for (var key in this.colMapHints) {
            if (this.colMap.indexOf(key) === -1) {
                var err = new Error(`No column found for: ${key}`);
                throw err;
            }
        }
    }
};

ColumnTool.prototype.loadLine = function(record) {
    var ret = {};
    for (var i=0,ilen=this.colMap.length; i<ilen; i++) {
        var key = this.colMap[i];
        if (!key) continue;
        if (record[i]) {
            ret[key] = record[i].trim();
        } else {
            ret[key] = record[i].trim();
        }
    }
    return ret;
}

ColumnTool.prototype.getSpreadsheetArrays = function(csvFilePath) {
    var ret = [];
    var firstRecord = true;
    var txt = fs.readFileSync(csvFilePath).toString();
    txt = txt.split(/[\n\r]+/).filter(line => line.trim() ? line : false).join("\n");
    var arr = csvparse.parse(txt);
    for (var record of arr) {
        if (firstRecord) {
            if (record[0] || record[1]) {
                this.setColMap(record);
                this.checkColMap();
                firstRecord = false;
            }
        } else {
            ret.push(record);
        }
    }
    return ret;
}

function Compositor(opts, defaultJurisdiction, useDocsOnItems) {
    this.opts = opts;
    this.defaultJurisdiction = defaultJurisdiction;
    this.useDocsOnItems = useDocsOnItems;
}
    
Compositor.prototype.tagsMap = [
    {
        prefix: "EP",
        nickname: "expert-presence"
    },
    {
        prefix: "IB",
        nickname: "instructedby"
    },
    {
        prefix: "KW",
        nickname: "keywords"
    },
    {
        prefix: "AL",
        nickname: "area"
    }
];

Compositor.prototype.getTags = function(line, extraTags) {
    var ret = [];
    if (extraTags) {
        ret = extraTags;
    }
    for (var info of this.tagsMap) {
        var str = line[info.nickname];
        if (str) {
            str = str.trim();
        }
        if (str) {
            var lst = str.split(/\s*[,;]\s*/);
            for (var tag of lst) {
                ret.push(info.prefix + ":" + tag);
            }
        }
    }
    return ret.filter(o => o).join(",");
}

Compositor.prototype.getDate = function(item, str) {
    if (!str || ["undated", "no date"].indexOf(str.toString().toLowerCase()) > -1) {
        return null;
    }
    var ret = [];

    var lst = str.toString().split(/[-\/\.\,]/);
    var validDate = true;
    if (lst.length > 3) {
        validDate = false;
    }
    for (var i=0,ilen=lst.length;i<ilen;i++) {
        var elem = lst[i];
        if (!elem.match(/[0-9]+/)) {
            validDate = false;
        }
    }
    if (!validDate) {
        var err = new Error(`invalid date "${str}" at ${item["call-number"]}`);
        throw err;
    }
    // Sniff pattern
    var dateType;
    for (var i=0,ilen=2;i<ilen;i++) {
        if (i === 1) {
            lst.reverse();
        }
        dateType = i;
        if (lst[0].match(/[0-9]{4}/)) {
            break;
        }
    }
    if (lst[0].length !== 4 || parseInt(lst[1], 10) > 12 || parseInt(lst[2], 10) > 31) {
        var err = new Error(`impossible date "${str}" at ${item["call-number"]}`);
        throw err;
    }
    if (dateType === 1) {
        if (parseInt(lst[2]) < 13) {
            console.log(`    ERROR: ambiguous date "${str}" at ${item["call-number"]}`);
        }
    }
    ret.push(lst[0].replace(/^0+/, ""));
    if (lst[1]) {
        ret.push(lst[1].replace(/^0+/, ""));
    }
    if (lst[2]) {
        ret.push(lst[2].replace(/^0+/, ""));
    }
    return {
        "date-parts": [ret]
    };
}

Compositor.prototype.getAbstract = function(str) {
    var ret = str.trim();
    return ret;
}

Compositor.prototype.getRootID = function(str) {
    str = str.trim();
    var root = str.slice(0, 5);
    var suffix = str.slice(5);
    if (["A", "B", "C", "D"].indexOf(suffix) > -1) {
        root = `${root}${suffix}`;
    }
    return root;
}

Compositor.prototype.addAttachment = function(line) {
    var fileCode = line.id;
    var note = this.getAbstract(line.summary);
    if (note) {
        note = markdown.render(note);
    }
    var attachments = [];
    var fn = `${fileCode}.pdf`;
    var fns = [fn];
    if (!fs.existsSync(filesPath(fn))) {
        // fns = ["empty.pdf"];
        fns = [];
    }
    // Extended on 2023-11-05 to include RTF and TXT files
    // with the same file code.
    for (var ext of ["rtf", "txt"]) {
	    fn = `${fileCode}.${ext}`;
        if (fs.existsSync(filesPath(fn))) {
	        fns.push(fn);
	    }
    }
    for (var fn of fns) {
        var suffix = fileCode.slice(5).replace(/ER[a-z]?$/, "");
        var reportflag = fileCode.slice(5).replace(/.*(ER[a-z]?)$/, "$1");
        // Root filename suffixes in this jurisdiction:
        // A
        // B
        // C
        // D
        // ER
        // ERa
        // ERb
        if (!reportflag) {
            if (!suffix | ["A", "B", "C", "D"].indexOf(suffix) > -1) {
                attachments.push({
                    path: filesPath(fn),
                    title: fn,
                    tags: [`LN:${line.lang}`, "TY:judgment"]
                });
            } else {
                var err = new Error(`Oops on suffix="${suffix}" from line.id="${line.id}"`);
                throw err;
            }
        }
        if (reportflag.slice(0, 2) === "ER") {
            attachments.push({
                path: filesPath(fn),
                title: fn,
                note: note,
                tags: [`LN:${line.lang}`, "TY:report"]
            });
        }
    }
    return {
        attachments: attachments,
        tags: []
    };
}



Compositor.prototype.composeItem = function(line, suppressAbstract) {
    var item = {
		type: "legal_case",
		multi: {
			main: {},
			_keys: {}
		}
    };
    item["id"] = line.id.trim().slice(0, 5);
    item["call-number"] = line.id.trim();
    if (line.docketno) {
        var offset = -1;
        if (this.opts.lstripto) {
            var str = setupTool.opts.lstripto;
            var offset = line.docketno.indexOf(str);
        }
        if (offset > -1) {
            offset = offset + str.length;
            item["number"] = line.docketno.slice(offset);
        } else {
            item["number"] = line.docketno;
        }
    }
    if (line.type) {
        item["genre"] = line.type;
    }
    if (line.division) {
        item["division"] = line.division;
    }
    if (line["year-as-volume"]) {
        item["collection-number"] = line["year-as-volume"];
    }
    if (line.volume) {
        item.volume = line.volume;
    }
    if (line["reporter"]) {
        item["container-title"] = line["reporter"];
    }
    if (line.page) {
        item.page = line.page;
    }
    var date = this.getDate(item, line.date);
    if (date) {
        item["issued"] = date;
    }
    if (line.court) {
        item["authority"] = line.court;
    }
    if (line.jurisdiction) {
        item["jurisdiction"] = line.jurisdiction;
    }
    if (!suppressAbstract) {
        item["abstract"] = this.getAbstract(line.summary);
    }
    // item.references = `appeal from ${record[6]}`;
    item["language"] = line.lang;
    // item["number"] = number;
    var info = this.addAttachment(line);
    info.tags.push(`cn:${this.defaultJurisdiction.toUpperCase()}`);
    if (this.useDocsOnItems) {
        if (this.useDocsOnItems.indexOf(item["call-number"]) > -1) {
            info.tags.push("showDocs");
        }
    }
    item["attachments"] = info.attachments;
    item["tags"] = this.getTags(line, info.tags);
    return item;
}

var deletes = [];

function run(opts) {
    var setupTool = new SetupTool(opts);
    var columnTool = new ColumnTool(opts);
    var compositor = new Compositor(opts, setupTool.defaultJurisdiction, setupTool.useDocsOnItems);
    var acc = {};
    var ret = [];
    columnTool.checkCsvFilenameSanity();
    
    var csvFilePath = `${setupTool.fileNameStub}.csv`;
    var arrays = columnTool.getSpreadsheetArrays(csvFilePath);
    var lines = [];
    for (var record of arrays) {
        lines.push(columnTool.loadLine(record));
    }
    for (var line of lines) {
        if (!setupTool.hasCourtMapFile) {
            setupTool.addCourtMapEntry(line);
        }
    }
    if (!setupTool.hasCourtMapFile) {
        fs.writeFileSync(setupTool.courtMapPath, JSON.stringify(setupTool.courtMap, null, 2));
    }
    setupTool.checkCourtMap();
    
    setupTool.setupCourtJurisdictionMap();
    setupTool.loadCourtJurisdictionMap(line);
    for (var line of lines) {
        setupTool.resetCourtDetails(line);
        setupTool.resetCourtJurisdictionDetails(line);
        setupTool.extractJurisdiction(line);
        setupTool.loadDataForCurrentJurisdiction(line);
        setupTool.extractJurisdiction(line);
        if (!setupTool.hasCourtJurisdictionMapFile) {
            setupTool.addCourtJurisdictionMapEntry(line);
        }
    }
    if (!setupTool.hasCourtJurisdictionMapFile) {
        fs.writeFileSync(setupTool.courtJurisdictionMapPath, JSON.stringify(setupTool.courtJurisdictionMap, null, 2));
    }
    setupTool.checkCourtJurisdictionMap();
        
    for (var line of lines) {
        var rootID = compositor.getRootID(line.id);
        if (line.court === "Court" && line.jurisdiction === "Jurisdiction") {
            continue;
        }
        // Compose the item and add attachments
        if (acc[rootID]) {
            // console.log(`  Adding attachment for ${line.id} on ${rootID}`);
            // XXX The note on attachments that represent case reports (as shown
            // XXX in their CULTEXP ID) is automatically suppressed.
            var newAttachments = compositor.addAttachment(line).attachments;
            acc[rootID].attachments = acc[rootID].attachments.concat(newAttachments);
            // console.log(`   len: ${acc[rootID].attachments.length}`);
        } else {
            // XXX Some items have only an expert report. In these cases,
            // XXX we go ahead and treat the metadata of the expert report as
            // XXX the core metadata of the case, but suppress the abstract.
            var suppressAbstract = false;
            var suffix = line.id.slice(5);
            if (suffix && suffix.slice(0, 2) === "ER") {
                suppressAbstract = true;
            }
            var item = compositor.composeItem(line, suppressAbstract);
            acc[rootID] = item;
        }
    }
    for (var id in acc) {
        ret.push(acc[id]);
    }
    fs.writeFileSync(path.join(".", "import-me.json"), JSON.stringify(ret, null, 2));
    console.log("END");
};

if (require.main === module) {
    
    const optParams = {
        alias: {
            L : "lstripto",
            q : "quiet",
            Q : "Quiet",
            v : "version",
            h: "help"
        },
        string: ["L"],
        boolean: ["q", "Q", "h"],
        unknown: option => {
            console.log("unknown option \"" +option + "\"");
            process.exit();
        }
    };

    const usage = "Usage: " + path.basename(process.argv[1]) + " [options]\n"
      + "  -L, --lstripto STR\n"
      + "    Remove text from left of number field to designated string.\n"
      + "  -N, --no-jurisdiction-no-court\n"
      + "    If jurisdiction field is empty, set court field to empty also.\n"
      + "  -q, --quiet\n"
      + "    Suppress only empty-court warnings.\n"
      + "  -Q, --Quiet\n"
      + "    Suppress all warnings, show only errors.\n"
      + "  -v, --version\n"
      + "    Show script version..\n"
      + "  -h, --help\n"
      + "    This help.\n"
      + "To add a \"showDocs\" tag to selected items, place a file\n"
      + "\"useDocsOnItems.txt\" file in the directory with the spreadsheet\n"
      + "for this jurisdiction. The file should contain a newline-delimited\n"
      + "list of CultExp document codes. The tag will be applied to the\n"
      + "parent item of the relevant document attachments.\n"

    const opts = getopts(process.argv.slice(2), optParams);

    if (opts.v) {
        var pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "package.json")).toString());
        console.log(pkg.version);
        process.exit();
    }

    if (opts.h) {
        console.log(usage);
        process.exit();
    }
    try {
        run(opts);
    } catch (e) {
        handleError(e);
    }
} else {
    module.exports = run;
}
