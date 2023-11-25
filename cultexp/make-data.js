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

var configPath = path.join(".", "make-data-config.json");

/** @function handleError
 * @description Report only the human-readable error message
     to console and terminate the script
 * @param {Object} e - instance of the Error constructor
 * @param {string} e.message - error message
 */
const handleError = (e) => {
    throw e;
    console.log(`ERROR: ${e.message}`);
    process.exit();
};

/** @class SetupTool
 * @description Methods to configure
 *   the script and emit and read mapping files for
 *   conversion of human-readable court and jurisdiction
 *   descriptions into valid machine-readable data conformant
 *   to the Legal Resource Registry.
 * @param {Object} opts - command-line options set by the `getopts` package
 */
function SetupTool(opts) {
    this.configPath = configPath;
    if (opts) {
        this.opts = opts;
    }
    this.setupConfigFile();
    this.loadConfigFile();
    this.loadUseDocsOnItems();
    this.checkDefaultJurisdictionCode();
    this.validateLrrPath();
    this.loadJurisObj();
    this.extractJurisdictionNames();
    this.extractCourtNameToKeyMap();
    this.setupCourtMap();
    this.loadCourtMap();
}

/**
 * @description Write a sample config file to disk if no config file exists.
 */
SetupTool.prototype.setupConfigFile = function() {
    if (!fs.existsSync(this.configPath)) {
        fs.writeFileSync(this.configPath, JSON.stringify({
            "jurisdictionCode": "xx",
            "jurisdictionName": "Laputa",
            "jurisdictionDescPath": "/path/to/legal-resource-registry-repo"
        }, null, 2));
    };
}

/**
 * @description Load the configuration file to set values need to run
 *   the script.
 * @param {string} obj.jurisdictionCode - the short-code of the default jurisdiction
 * @param {string} obj.jurisdictionName - the long-form name of the jurisdiction
 * @param {string} obj.jurisdictionDescPath - the path to the Legal Resource Registry files on this system
 * @prop {string} defaultJurisdiction - the default jurisdiction (the short-code)
 * @prop {string} inputFileName - the input file name (derived from the long-form jurisdiction name)
 * @prop {string} defaultJurisdictionPath - the path to the default jurisdiction in the LRR (derived from the short-code)
 */
SetupTool.prototype.loadConfigFile = function() {
    var obj = JSON.parse(fs.readFileSync(this.configPath));
    this.defaultJurisdiction = obj.jurisdictionCode;
    this.inputFileName = `data-${obj.jurisdictionName.replace(/\s/g, "-").toLowerCase()}.csv`;
    this.defaultJurisdictionPath = `${obj.jurisdictionDescPath.replace(/\/$/, "")}/juris-${this.defaultJurisdiction}-desc.json`;
    console.log(`Using input data file: ${this.inputFileName}`);
}

/**
 * @description If a file ``useDocsOnItems.txt`` exists
 *   in the data directory, read it as a newline-delimited
 *   list of CultExp IDs and set their values in an
 *   array on this class instance.
 * @prop {Object[]} useDocsOnItems - a resulting array of CultExp IDs
 */
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

/**
 * @description Check that the ``jurisdictionCode`` value read
 *   from ``make-data-config.json`` has been changed from the
 *   sample value of "xx".
 * @throws a helpful error
 */
SetupTool.prototype.checkDefaultJurisdictionCode = function() {
    if (this.jurisdictionCode === "xx") {
        var err = new Error("set appropriate values in make-data-config.json");
        throw err;
    }
}

/**
 * @description If the data file of the default jurisdiction does
 *   not exist in the Legal Resource Registry, throw an error.
 *   This is limited to path validation, and does
 *   not extend to validation of the LRR itself.
 */
SetupTool.prototype.validateLrrPath = function() {
    if (!fs.existsSync(this.defaultJurisdictionPath)) {
        var err = new Error(`path '${this.defaultJurisdictionPath}' set from values in make-data-config.json does not exist.\n       Edit make-data-config.json and try again.`);
        throw err;
    }
}

/**
 * @description Load the default jurisdiction data.
 * @prop {Object} jurisObj - the runtime container for LRR data
 */
SetupTool.prototype.loadJurisObj = function() {
    this.jurisObj = {};
    this.jurisObj[this.defaultJurisdiction] = JSON.parse(fs.readFileSync(this.defaultJurisdictionPath).toString());
}

/**
 * @description Compose human-readable descriptive names
 *   for all subjurisdictions of the default jurisdiction,
 *   and set them as keys mapped to their machine-readable
 *   LRR codes.
 * @prop {Object} jurisdictionNames - a map of jurisdiction names to machine-readable codes
 */
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

/**
 * @description Build a one-to-one map of human-readable court names
 *   to machine-readable LRR court codes.
 * @prop {Object} courtNameMap - container for the name-to-code mapping
 */
SetupTool.prototype.extractCourtNameToKeyMap = function() {
    this.courtNameMap = {};
    for (var key in this.jurisObj[this.defaultJurisdiction].courts) {
        this.courtNameMap[this.jurisObj[this.defaultJurisdiction].courts[key].name] = key;
    }
}

/**
 * @description Create an empty court code map file if none is found.
 * @prop (string} courtMapPath - path to the court map file to be edited
 * @prop {boolean} hasCourtMapFile - flag indicating whether file has been freshly created.
 */
SetupTool.prototype.setupCourtMap = function() {
    this.courtMapPath = path.join(".", "court-code-map.json");
    if (!fs.existsSync(this.courtMapPath)) {
        fs.writeFileSync(this.courtMapPath, "[]");
        this.hasCourtMapFile = false;
    } else {
        this.hasCourtMapFile = true;
    }
}

/**
 * @description Read the array of name-to-code pairs
 *   for courts in the default jurisdiction, sorting
 *   first by the length of the name to avoid false positives,
 *   then alphabetically just as a flourish.
 * @prop {Object} courtMap - container for operator-edited
 *   court name-to-code pairings
 */
SetupTool.prototype.loadCourtMap = function() {
    this.courtMap = JSON.parse(fs.readFileSync(this.courtMapPath).toString());
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

/**
 * @description Attempt to match the (possibly reprocessed)
 *   spreadsheet court value to a court registered in the
 *   LRR, and add those that fail to an array for reference.
 * @param {Object} line - the content of a spreadsheet line, keyed to
 *   column nicknames
 * @prop {Object} courtMap - container for court name-to-code pairings
 *   to be edited by the operator
 */
SetupTool.prototype.addCourtMapEntry = function(line) {
    if (!this.jurisObj[this.defaultJurisdiction].courts[line.court]) {
        if (this.courtMap.map(o => o[0]).indexOf(line.court) === -1) {
            this.courtMap.push([line.court, ""]);
        }
    }
}

/**
 * @description Check that the code element of each name-to-code pair
 *   in ``courtMap`` satifies two conditions:
 * - the code is not empty; and
 * - the code is registered in the ``courts`` segment of the default
 *   jurisdiction in the LRR
 *
 * Collect failures in two lists corresponding to the type
 * of failure, and issue a helpful warning for the latter and
 * throw a helpful error for the former.
 */
SetupTool.prototype.checkCourtMap = function() {
    var missingCodes = [], badCodes = [];
    for (var info of this.courtMap) {
        if (info[1] === "") {
            missingCodes.push(info[0]);
        } else if (!this.jurisObj[this.defaultJurisdiction].courts[info[1]]) {
            badCodes.push(`${info[1]} (${info[0]})`);
        }
    }
    if (badCodes.length > 0) {
        console.log(`WARNING: the following courts have unrecognized identifiers in court-code-map.json:\n  ${badCodes.join("\n  ")}`);
    }
    if (missingCodes.length > 0) {
        var err = new Error(`the following courts are unmapped in court-code-map.json:\n  ${missingCodes.join("\n  ")}`);
        throw err;
    }
}

/**
 * @description Create an empty court-in-jurisdiction code map file if none is found.
 * @prop (string} courtJurisdictionMapPath - path to the court-in-jurisdiction map file to be edited
 * @prop {boolean} hasCourtJurisdictionMapFile - flag indicating whether file has been freshly created.
 */
SetupTool.prototype.setupCourtJurisdictionMap = function() {
    this.courtJurisdictionMapPath = path.join(".", "court-jurisdiction-code-map.json");
    if (!fs.existsSync(this.courtJurisdictionMapPath)) {
        fs.writeFileSync(this.courtJurisdictionMapPath, "{}");
        this.hasCourtJurisdictionMapFile = false;
    } else {
        this.hasCourtJurisdictionMapFile = true;
    }
}

/**
 * @description Read the operator-edited jurisdiction
 *   map file for reference. 
 * @prop {Object} courtJurisdictionMap - court and jurisdiction codes, keyed
 *   to the known (but invalid) values of court and jurisdiction derived from
 *   the spreadsheet
 */
SetupTool.prototype.loadCourtJurisdictionMap = function() {
    this.courtJurisdictionMap = JSON.parse(fs.readFileSync(this.courtJurisdictionMapPath).toString());
}

/**
 * @description Attempt to match the (possibly reprocessed) spreadsheet court
 *   and jurisdiction values in the ``jurisdictions`` segment of the
 *   default jurisdiction in the LRR, and add those that fail to an
 *   object for reference.
 * @prop {Object} courtJurisdictionMap - court and jurisdiction codes, keyed
 *   to the known (but invalid) values of court and jurisdiction derived from
 *   the spreadsheet
 * @see {@link SetupTool#validateJurisdictionCode}
 */
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

/**
 * @description Check that a string conforms to the syntax of
 *   a jurisdiction code, and matches a jurisdiction code
 *   in the ``jurisdictions`` segment of the LRR. Return ``true``
 *   if a match is found, otherwise ``false``.
 * @returns {boolean}
 */
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

/**
 * @description A spreadsheet entry may declare a jurisdiction other
 *   than the default. Extract the top-level jurisdiction from a
 *   jurisdiction code and return its value.
 * @returns {string}
 */
SetupTool.prototype.getCurrentJurisdictionCode = function(jurisdiction) {
    var currentJurisdictionCode = this.defaultJurisdiction;
    var m = jurisdiction.match(/^([.a-z]+)(:[.a-z]+)*$/);
    if (m) {
        currentJurisdictionCode = m[1];
    }
    return currentJurisdictionCode;
}

/**
 * @description Read the data file for the current jurisdiction
 *   if it is not already set on the ``jurisObj`` object containing
 *   LRR data.
 * @param {Object} line - the content of a spreadsheet line, keyed to
 *   column nicknames
 */
SetupTool.prototype.loadDataForCurrentJurisdiction = function(line) {
    if (!line.jurisdiction) {
        line.jurisdiction = this.defaultJurisdiction;
    }
    var currentJurisdictionCode = this.getCurrentJurisdictionCode(line.jurisdiction);
    if (!this.jurisObj[currentJurisdictionCode]) {
        var currentJurisdictionDescPath = this.defaultJurisdictionPath.replace(`juris-${this.defaultJurisdiction}-desc.json`, `juris-${currentJurisdictionCode}-desc.json`);
        if (fs.existsSync(currentJurisdictionDescPath)) {
            this.jurisObj[currentJurisdictionCode] = JSON.parse(fs.readFileSync(currentJurisdictionDescPath).toString());
        }
    }
}

/**
 * @description Attempt to match the spreadsheet ``jurisdiction`` value
 *   with a jurisdiction name. If a match is found, replace the spreadsheet
 *   value with the corresponding LRR machine-readable code. (This match
 *   attempt will succeed only in the rare event that the data collector
 *   has provided Jurism-style jurisdiction values in the Jurisdiction column
 *   of the spreadsheet.)
 * @param {Object} line - the content of a spreadsheet line, keyed to 
 *   column nicknames
 * @param {string=} currentJurisdictionCode - jurisdiction code to use
 *   for the match attempt
 */
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

/**
 * @description Replace spreadsheet values for court, and optionally
 *   division, type, and human-readable jurisdiction with values
 *   from the operator-edited map file.
 * @param {Object} line - the content of a spreadsheet line, keyed to 
 *   column nicknames
 * @see {@link https://github.com/Juris-M/citeproc-cite-service/tree/master/cultexp#preparing-a-court-map}
 */
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

/**
 * @description Replace spreadsheet court and jurisdiction values
 *   with value from the operator-edited map file.
 * @param {Object} line - the content of a spreadsheet line, keyed to 
 *   column nicknames
 * @see {@link https://github.com/Juris-M/citeproc-cite-service/tree/master/cultexp#preparing-a-court-jurisdiction-map}
 */
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

/**
 * @description Check the jurisdiction values in ``courtJurisdictionMap``
 *   for validity of syntax and presence in the LRR. The court value
 *   is not tested, as invalid court values are covered by a warning,
 *   and will not block processing.
 * @throws an error listing invalid jurisdictions
 * @see {@link SetupTool#validateJurisdictionCode}
 */
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

/** @class ColumnTool
 * @description Methods for sniffing column positions
 *   and for accessing column content by column nickname, while
 *   recognizing columns in arbitrary sequence within the spreadsheet.
 * @params {Object} opts - command-line options set by the `getopts` package
 */
function ColumnTool(opts) {
    this.opts = opts;
    this.colMap = [];
}

/** @instance checkCsvFilenameSanity
 * @description Check that there is one and only one
 *   CSV file in the current directory with the form
 *   "data-\<country name\>.csv".
 * * If more than one such file exists,
 *   throw an appropriate error
 * * If no such file exists, throw a different
 *   appropriate error
 */
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

/**
 * @description A mapping of column nicknames to strings
 *   likely to be found in the header of each.
 */
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

/**
 * @description For each column label in the spreadsheet
 *   headline, check for its match string among those corresponding
 *   to column nicknames. If found, add its nickname to an array
 *   of column nicknames. Otherwise add null to the array to flag
 *   it as irrelevant.
 * @param {Object[]} headline - an array representing one spreadsheet line
 * @prop {Object[]} colMap - an array of column nicknames, in the
 *   order of the corresponding columns in the spreadsheet
 */
ColumnTool.prototype.setColMap = function(headline) {
    for (var i=0,ilen=headline.length;i<ilen;i++) {
        var val = headline[i] ? headline[i].toLowerCase() : "";
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

/**
 * @description Check that all expected columns are present
 *   in the spreadsheet, and throw an error if they are not.
 * @throws a helpful error on the first column identified as missing
 */
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

/**
 * @description Copy each labeled cell of a spreadsheet line
 *   to an object with the column nickname as its key,
 *   and return the object.
 * @param {Object[]} record - an array representing one spreadsheet line
 * @returns {Object}
 */
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

/**
 * @description Read the spreadsheet file, normalize its line endings,
 *   and parse the content to an array of arrays. Analyze the first
 *   line to match columns to nicknames, and discard the headline.
 * @param {str} csvFilePath - path to CSV file to use as input
 * @see {@link ColumnTool#setColMap}
 * @see {@link ColumnTool#checkColMap}
 */
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

/** @class Compositor
 * @description Methods for composing CSL-M JSON items
 *   based on spreadsheet content.
 * @param {Object} opts - command-line options set by the `getopts` package
 * @param {string} defaultJurisdiction - short-code of the default jurisdiction
 * @param {Object[]} useDocsOnItems - CultExp IDs of items to be tagged with ``showDocs``
 * @prop {Object} opts - command-line options set by the `getopts` package
 * @prop {string} defaultJurisdiction - short-code of the default jurisdiction
 * @prop {Object[]} useDocsOnItems - CultExp IDs of items to be tagged with ``showDocs``
 */
function Compositor(opts, defaultJurisdiction, useDocsOnItems) {
    this.opts = opts;
    this.defaultJurisdiction = defaultJurisdiction;
    this.useDocsOnItems = useDocsOnItems;
}
    
/**
 * @description Combines several actions:
 * - Check for existence of a ``files`` subdirectory containing
 *   attachment files, and throw an error if it does not exist
 * - Copy an ``empty.pdf`` file into the ``files`` subdirectory
 *   for possible use as a placeholder
 * - Finally, return the path to the ``files`` subdirectory,
 *   or to a file it contains, if specified.
 * @param {string=} filename - name of a specific attachment file
 */
Compositor.prototype.filesPath = function(filename) {
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

/**
 * @description A list of tag prefixes to be set on
 *   tags drawn from designated columns identified
 *   by column nickname.
 */
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

/**
 * @description Compose tags as a comma-delimited list,
 *   setting the appropriate prefix on tags drawn from
 *   spreadsheet columns. Columns containing a comma-
 *   or semicolon-delimited list of tags are split
 *   before processing, so that prefixes are applied
 *   to all such tags.
 * @param {Object} line - the content of a spreadsheet line, keyed to 
 *   column nicknames
 * @param {Object[]=!} extraTags - additional tags not included in the spreadsheet
 * @returns {string}
 */
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

/**
 * @description Attempt to convert the content of the spreadsheet "date" column
 *   to a valid date in CSL JSON array format. Spreadsheet dates should be set in
 *   YYYY-MM-DD format to avoid ambiguity. Where dates not in this format are
 *   invalid, impossible, or ambiguous, an error is thrown.
 * @param {string} docID - the "id" value from the spreadsheet
 * @param {string} str - a string to parse as a date
 * @returns {Object}
 */
Compositor.prototype.getDate = function(docID, str) {
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
        var err = new Error(`invalid date "${str}" at ${docID}`);
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
        var err = new Error(`impossible date "${str}" at ${docID}`);
        throw err;
    }
    if (dateType === 1) {
        if (parseInt(lst[2]) < 13) {
            var err = new Error(`ambiguous date "${str}" at ${docID}`);
            throw err;
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

/**
 * @description Trim leading a trailing space from string
 *   and return.
 * @param {string} str - abstract value from spreadsheet
 * @returns {string}
 */
Compositor.prototype.getAbstract = function(str) {
    var ret = str.trim();
    return ret;
}

/**
 * @description Return the first five characters of
 *   a docID as the item identifier. (The code to append
 *   the suffix value of an ID coded as an appellate
 *   judgment has been commented out, because in
 *   practice it appears that documents with these
 *   suffixed IDs appear in the spreadsheets only
 *   as child attachments of an item without suffix
 *   representing a trial judgment. If that is not
 *   always the case, adjustments of some sort
 *   might be required.)
 * @param {string} str - a CultExp docID
 */
Compositor.prototype.getRootID = function(str) {
    str = str.trim();
    var root = str.slice(0, 5);
    var suffix = str.slice(5);
    //if (["A", "B", "C", "D"].indexOf(suffix) > -1) {
    //    root = `${root}${suffix}`;
    //}
    return root;
}

/**
 * @description Monolithic method to compose CSL JSON
 *   attachment metadata for insertion into an item object.
 *   A few highlights:
 * - the ``empty.pdf`` placeholder is not added
 * - root CultExp ID extensions of A-D to indicate levels of appeal,
 *   ER to indicate an expert report, and a-z to disambiguate
 *   multiple expert reports, and be used solo or in combination
 * - expert reports and judgments are tagged as such
 * @param {Object} line - the content of a spreadsheet line, keyed to 
 *   column nicknames
 * @see {@link Compositor#getAbstract}
 * @see {@link Compositor#filesPath}
 */
Compositor.prototype.composeAttachment = function(line) {
    var fileCode = line.id;
    var note = this.getAbstract(line.summary);
    if (note) {
        note = markdown.render(note);
    }
    var attachments = [];
    var fn = `${fileCode}.pdf`;
    var fns = [fn];
    if (!fs.existsSync(this.filesPath(fn))) {
        // fns = ["empty.pdf"];
        fns = [];
    }
    for (var ext of ["rtf", "txt"]) {
	    fn = `${fileCode}.${ext}`;
        if (fs.existsSync(this.filesPath(fn))) {
	        fns.push(fn);
	    }
    }
    for (var fn of fns) {
        var suffix = fileCode.slice(5).replace(/ER[a-z]?$/, "");
        var reportflag = fileCode.slice(5).replace(/.*(ER[a-z]?)$/, "$1");
        if (!reportflag) {
            if (!suffix | ["A", "B", "C", "D"].indexOf(suffix) > -1) {
                attachments.push({
                    path: this.filesPath(fn),
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
                path: this.filesPath(fn),
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

/**
 * @description Compose a CSL-M JSON item.
 * @param {Object} line - the content of a spreadsheet line, keyed to 
 *   column nicknames
 * @param {boolean} suppressAbstract - omit the Abstract value from the composed item
 * @see {@link https://docs.citationstyles.org/en/stable/specification.html}
 * @see {@link https://citeproc-js.readthedocs.io/en/latest/csl-m/index.html}
 */
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
    var date = this.getDate(item["call-number"], line.date);
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
    item["language"] = line.lang;
    var info = this.composeAttachment(line);
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

/**
 * @description Monolithic script runner to transform
 *   spreadsheet content in to well structured CSL-M JSON
 *   for import into Jurism.
 * @param {Object} opts - command-line options set by the `getopts` package
 * @see {@link SetupTool}
 * @see {@link ColumnTool}
 * @see {@link Compositor}
 */
function run(opts) {
    var setupTool = new SetupTool(opts);
    var columnTool = new ColumnTool(opts);
    var compositor = new Compositor(opts, setupTool.defaultJurisdiction, setupTool.useDocsOnItems);
    var acc = {};
    var ret = [];
    columnTool.checkCsvFilenameSanity();
    
    var csvFilePath = `${setupTool.inputFileName}`;
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
            var newAttachments = compositor.composeAttachment(line).attachments;
            acc[rootID].attachments = acc[rootID].attachments.concat(newAttachments);
        } else {
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
