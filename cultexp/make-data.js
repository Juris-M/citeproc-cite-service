#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const getopts = require("getopts");

/*
 * GOOD MORNING!
 * Currently setting up to feed callNumber IDs in as comma-delimited
 * option. It should use a file with a list of IDs instead. Reconfigure
 * option as a boolean that prompts loading of a config file with a
 * standard name, and complains if it doesn't exist.
 */

var csvparse
try {
    csvparse = require("csv-parse/sync");
} catch(e) {
    csvparse = require("csv-parse/dist/cjs/sync.cjs");
}

const markdown = require('markdown-it')({
    html: true,
    xhtmlOut: true,
    linkify: true,
    typographer: true
});

/*
 Error handling
*/

function handleError(err) {
    console.log(err);
    process.exit(1);
}

/*
 Initial validation
 */
const validateDataFile = () => {
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
    
/*
 Setup config
 */
const setupConfig = (opts) => {
    var config = {
        opts: {}
    };
    if (opts) {
        config.opts = opts;
    }
    var configPath = path.join(".", "make-data-config.json");
    if (!fs.existsSync(configPath)) {
        fs.writeFileSync(configPath, JSON.stringify({
            "jurisdictionCode": "xx",
            "jurisdictionName": "Laputa",
            "jurisdictionDescPath": "/path/to/legal-resource-registry-repo"
        }, null, 2));
    };

    // Validate variables in config and set
    var configSource = JSON.parse(fs.readFileSync(configPath));

    config.defaultJurisdiction = configSource.jurisdictionCode;
    config.fileNameStub = `data-${configSource.jurisdictionName.replace(/\s/g, "-").toLowerCase()}`;
    config.jurisdictionDescMapPath = `${configSource.jurisdictionDescPath.replace(/\/$/, "")}/juris-${config.defaultJurisdiction}-desc.json`;

    if (!fs.existsSync(config.jurisdictionDescMapPath)) {
        var err = new Error(`ERROR: path '${config.jurisdictionDescMapPath}' set from values in make-data-config.json does not exist.\n       Edit make-data-config.json and try again.`);
        throw err;
    }

    // Static path names
    config.courtJurisdictionMapFilePath = path.join(".", "court-jurisdiction-code-map.json");
    config.createCourtJurisdictionMapFile = false;
    
    config.courtHintFilePath = path.join(".", "court-code-map.json");
    config.createCourtHintFile = false;

    if (config.opts.u) {
        var fpth = path.join(".", "useDocsOnItems.txt")
        // Check for existence of useDocsOnItems.txt file.
        if (!fs.existsSync(fpth)) {
            handleError("File ./useDocsOnItems.txt does not exist");
        }
        // Load file
        var str = fs.readFileSync(fpth).toString();    
        // Split on newline to form an array
        // Stash array on config.useDocsOnItems
        // Truncate to base callNumber ID
        var arr = str.trim().split("\n").map(o => o.trim().slice(0, 5));
        // Remove duplicates
        arr.sort();
        for (var i=arr.length-1; i>0; i--) {
            if (arr[i] === arr[i-1]) {
                arr = arr.slice(0, i-1).concat(arr.slice(i));
            }
        }
        config.useDocsOnItems = arr;
        console.log(JSON.stringify(arr, null, 2));
    }

    console.log(`Running with data file stub: ${config.fileNameStub}`);
    return config;
}


// Containers for runtime data pools
var unrecognizedJurisdictions = [];

/*
 Data and functions for sniffing and setting column positions
*/
var colMap = [];

const colMapHints = {
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

function setColMap(record) {
    for (var i=0,ilen=record.length;i<ilen;i++) {
        var val = record[i] ? record[i].toLowerCase() : "";
        var foundIt = false;
        for (var key in colMapHints) {
            var srch = colMapHints[key].str;
            if (val.indexOf(srch) > -1) {
                colMap.push(key);
                delete colMapHints[key];
                foundIt = true;
                break;
            }
        }
        if (!foundIt) {
            colMap.push(null);
        }
    }
}

function checkColMap(config) {
    if (!config.opts.quiet && !config.opts.Quiet) {
        for (var key in colMapHints) {
            if (colMap.indexOf(key) === -1) {
                console.log(`No column found for: ${key}`);
            }
        }
    }
};

/*
 Data and functions for extracting tags
*/

var tagsMap = [
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

function getTags(line, extraTags) {
    var ret = [];
    if (extraTags) {
        ret = extraTags;
    }
    for (var info of tagsMap) {
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


/*
function checkJurisdictions() {
    if (unrecognizedJurisdictions.length > 0) {
        unrecognizedJurisdictions.sort();
        console.log(`Unrecognized jurisdictions:`);
        for (var line of unrecognizedJurisdictions) {
            console.log(`   ${line}`);
        }
    }
}
*/

function loadLine(record) {
    var ret = {};
    for (var i=0,ilen=colMap.length; i<ilen; i++) {
        var key = colMap[i];
        if (!key) continue;
        if (record[i]) {
            ret[key] = record[i].trim();
        } else {
            ret[key] = record[i].trim();
        }
    }
    return ret;
}

const setJurisObj = (config) => {
    // console.log(`Reading jurisdictionDescMapPath: ${config.jurisdictionDescMapPath}`);
    config.jurisObj = {};
    config.jurisObj[config.defaultJurisdiction] = JSON.parse(fs.readFileSync(config.jurisdictionDescMapPath).toString());
}

/*
var parser;
if (csvparse.parse) {
    parser = csvparse.parse();
} else {
    parser = csvparse();
}
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

// Attempt to read human-readable form of Jurism jurisdiction entries
// Map is generated from Jurism juris-desc file.
// No custom map is used by this function
const setJurisdictionNameMap = (config) => {
    config.jurisdictionNameMap = {};
    for (var key in config.jurisObj[config.defaultJurisdiction].jurisdictions) {
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
            var name = config.jurisObj[config.defaultJurisdiction].jurisdictions[subkey].name;
            accName.push(name);
            if (i === 0) {
                accName.push(elem.toUpperCase());
            }
        }
        if (accName.length === 2) {
            config.jurisdictionNameMap[accName[0]] = subkey;
        }
        config.jurisdictionNameMap[accName.join("|")] = subkey;
    }
}
const getJurisdiction = (config, jurisdiction) => {
    if (!config.jurisObj[config.defaultJurisdiction].jurisdictions[jurisdiction]) {
        if (config.jurisdictionNameMap[jurisdiction]) {
            jurisdiction = config.jurisdictionNameMap[jurisdiction];
        } else {
            // Reporting out of this list has been removed, but we still collect the data just in case it might be useful to restore reporting in future.
            if (unrecognizedJurisdictions.indexOf(jurisdiction) === -1) {
                unrecognizedJurisdictions.push(jurisdiction);
            }
        }
    }
    return jurisdiction;
}

// Attempt to read human-readable form of Jurism court entries
// Map is generated from Jurism juris-desc file.
// Base map is supplemented by a custom file containing match hints
const setCourtCodeMap = (config) => {
    config.courtCodeMap = {};
    for (var key in config.jurisObj[config.defaultJurisdiction].courts) {
        config.courtCodeMap[config.jurisObj[config.defaultJurisdiction].courts[key].name] = key;
    }
}

const setCourtHintMap = (config) => {
    if (!fs.existsSync(config.courtHintFilePath)) {
        fs.writeFileSync(config.courtHintFilePath, "[]");
        config.createCourtHintFile = true;
    }
    // console.log(`Reading courtHintFilePath: ${courtHintFilePath}`);
    config.courtHintMap = JSON.parse(fs.readFileSync(config.courtHintFilePath).toString());
    // Put longest matches first, to avoid false positives
    config.courtHintMap.sort((a,b) => {
        if (a[0].length < b[0].length) {
            return 1;
        } else if (a[0].length > b[0].length) {
            return -1;
        } else {
            return 0;
        }
    });
    if (config.courtHintMap.length === 0) {
        config.courtHintMapEmpty = true;
    } else {
        config.courtHintMapEmpty = false;
    }
}

const setCourtNameMap = (config) => {
    config.courtNameMap = {};
    for (var key in config.jurisObj[config.defaultJurisdiction].courts) {
        config.courtNameMap[config.jurisObj[config.defaultJurisdiction].courts[key].name] = key;
    }
}

const setCourt = (config, line) => {
    var str = line.court.trim();
    if (config.courtNameMap[str]) {
        line.court = config.courtNameMap[str];
    } else {
        // Okay, format of courtHintFilePath file is an issue. We'll want to
        // step through in sequence, so maybe an array of two-element arrays
        // is best.
        for (var elem of config.courtHintMap) {
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
    if (config.courtHintMapEmpty && !config.jurisObj[config.defaultJurisdiction].courts[line.court]) {
        if (config.courtHintMap.map(o => o[0]).indexOf(str) === -1) {
            config.courtHintMap.push([str, str]);
        }
    }
}

const setCourtJurisdictionCodeMap = (config) => {
    if (!fs.existsSync(config.courtJurisdictionMapFilePath)) {
        fs.writeFileSync(config.courtJurisdictionMapFilePath, "{}");
        config.createCourtJurisdictionMapFile = true;
    }
    // console.log(`Reading jurisdictionMapFilePath: ${config.courtJurisdictionMapFilePath}`);
    config.courtJurisdictionCodeMap = JSON.parse(fs.readFileSync(config.courtJurisdictionMapFilePath).toString());
}

function getDate(item, str) {
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

function getAbstract(str) {
    var ret = str.trim();
    return ret;
}

function getRootID(str) {
    str = str.trim();
    var root = str.slice(0, 5);
    var suffix = str.slice(5);
    if (["A", "B", "C", "D"].indexOf(suffix) > -1) {
        root = `${root}${suffix}`;
    }
    return root;
}

function addAttachment(config, line) {
    var fileCode = line.id;
    var note = getAbstract(line.summary);
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
                    tags: [`LN:${config.defaultJurisdiction}`, "TY:judgment"]
                });
            } else {
                console.log(`  Oops on suffix="${suffix}" from line.id="${line.id}"`);
                process.exit();
            }
        }
        if (reportflag.slice(0, 2) === "ER") {
            attachments.push({
                path: filesPath(fn),
                title: fn,
                note: note,
                tags: [`LN:${config.defaultJurisdiction}`, "TY:report"]
            });
        }
    }
    return {
        attachments: attachments,
        tags: []
    };
}

function composeItem(config, line, suppressAbstract) {
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
        if (config.opts.lstripto) {
            var str = config.opts.lstripto;
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
    var date = getDate(item, line.date);
    if (date) {
        item["issued"] = date;
    }
    if (line.court) {
        item["authority"] = line.court;
    }
    if (line.jurisdiction) {
        item["jurisdiction"] = line.jurisdiction;
    } else {
        item["jurisdiction"] = config.defaultJurisdiction;
    }
    if (!suppressAbstract) {
        item["abstract"] = getAbstract(line.summary);
    }
    // item.references = `appeal from ${record[6]}`;
    item["language"] = `${config.defaultJurisdiction}`;
    // item["number"] = number;
    var info = addAttachment(config, line);
    info.tags.push(`cn:${config.defaultJurisdiction.toUpperCase()}`);
    if (config.opts.u) {
        if (config.useDocsOnItems.indexOf(item["call-number"]) > -1) {
            info.tags.push("showDocs");
        }
    }
    item["attachments"] = info.attachments;
    item["tags"] = getTags(line, info.tags);
    return item;
}

function getSpreadsheetArrays(path_to_csv) {
    var ret = [];
    var firstRecord = true;
    var txt = fs.readFileSync(path_to_csv).toString();
    txt = txt.split(/[\n\r]+/).filter(line => line.trim() ? line : false).join("\n");
    var arr = csvparse.parse(txt);
    for (var record of arr) {
        if (firstRecord) {
            if (record[0] || record[1]) {
                setColMap(record);
                firstRecord = false;
            }
        } else {
            ret.push(record);
        }
    }
    return ret;
}

var deletes = [];

function run(opts) {
    validateDataFile();
    var config = setupConfig(opts);
    setJurisObj(config);
    setJurisdictionNameMap(config);
    setCourtCodeMap(config);
    setCourtHintMap(config);
    setCourtNameMap(config);
    setCourtJurisdictionCodeMap(config);
    var court;
    try {
        var acc = {};
        var ret = [];
        var jurisdictions = {};
        var arrays = getSpreadsheetArrays(config.fileNameStub + ".csv");
        //arrays = arrays.slice(1);
        //var arrays = arrays.slice(1);
        for (var record of arrays) {
            
            var line = loadLine(record);
            var rootID = getRootID(line.id);

            // Attempt to normalize jurisdiction code
            line.jurisdiction = getJurisdiction(config, line.jurisdiction);
            
            if (!acc[rootID]) {
                
                // Attempt to normalize court code
                setCourt(config, line);

                var info = config.courtJurisdictionCodeMap[`${line.court}::${line.jurisdiction}`];
                if (info) {
                    line.court = info.court;
                    line.jurisdiction = info.jurisdiction;
                }
                
                // Validate court in jurisdiction
                if (!line.jurisdiction) {
                    line.jurisdiction = config.defaultJurisdiction;
                    if (config.opts.N) {
                        line.court = null;
                    }
                }

                var valid = false;
                // Extend jurisdiction descriptions if necessary and if possible
                var topJurisdiction = line.jurisdiction.split(":")[0];
                
                if (!config.jurisObj[topJurisdiction]) {
                    var pth = config.jurisdictionDescMapPath.replace(`juris-${config.defaultJurisdiction}`, `juris-${topJurisdiction}`);
                    if (fs.existsSync(pth)) {
                        // console.log(`Reading pth: ${pth}`);
                        config.jurisObj[topJurisdiction] = JSON.parse(fs.readFileSync(pth).toString());
                    } else {
                        topJurisdiction = config.defaultJurisdiction;
                    }
                }
                var jurisdictionInfo = config.jurisObj[topJurisdiction].jurisdictions[line.jurisdiction];
                if (jurisdictionInfo) {
                    if (jurisdictionInfo.courts[line.court]) {
                        valid = true;
                    }
                }
                if (!valid) {
                    
                    // If this is reached, errors issue unconditionally, and
                    // warnings issue if --quiet is not set.
                    
                    // Logic and logging are separated since the output of
                    // the latter is dependent on the final outcome of the
                    // former
                    
                    var countryName, countryCode;
                    if (jurisdictionInfo) {
                        var countryCode = line.jurisdiction.split(":")[0];
                    } else {
                        var countryCode = topJurisdiction;
                    };

                    var countryName = config.jurisObj[countryCode].jurisdictions[countryCode].name;

                    var errAcc = {
                        trigger: false,
                        errors: {
                            jurisdictionInfo: null,
                            invalidMapping: null
                        },
                        warnings: {
                            courtNotValid: null,
                            unknownCourt: null,
                            emptyCourt: null
                        }
                    };
                    if (!jurisdictionInfo || (line.court && !config.jurisObj[countryCode].courts[line.court])) {
                        var info = {
                            court: line.court,
                            jurisdiction: line.jurisdiction
                        };
                        config.courtJurisdictionCodeMap[`${line.court}::${line.jurisdiction}`] = info;
                        errAcc.trigger = true;
                        errAcc.errors.jurisdictionInfo = true;
                    }
                    if (!config.jurisObj[countryCode].courts[line.court]) {
                        errAcc.trigger = true;
                        if (line.court) {
                            errAcc.warnings.courtNotValid = true;
                        } else {
                            errAcc.warnings.emptyCourt = true;
                        }
                    } else if (!config.courtJurisdictionCodeMap[`${line.court}::${line.jurisdiction}`]) {
                        var info = {
                            court: line.court,
                            jurisdiction: line.jurisdiction
                        };
                        config.courtJurisdictionCodeMap[`${line.court}::${line.jurisdiction}`] = info;
                        errAcc.trigger = true;
                        if (line.court) {
                            errAcc.warnings.unknownCourt = true;
                        } else {
                            errAcc.warnings.emptyCourt = true;
                        }
                    } else {
                        errAcc.trigger = true;
                        errAcc.errors.invalidMapping = true;
                    }
                    if (errAcc.trigger) {
                        if (errAcc.errors.jurisdictionInfo && !errAcc.warnings.courtNotValid

                            || errAcc.errors.invalidMapping
                            || (!config.opts.Q && !config.opts.q)
                            || (
                                config.opts.q && (errAcc.warnings.unknownCourt || errAcc.warnings.courtNotValid)
                            )
                           ) {
                            console.log(line.id);
                        }
                        if (errAcc.errors.jurisdictionInfo && !errAcc.warnings.courtNotValid) {
                            console.log(`    ERROR: mapping required for "${line.jurisdiction}" in court-jurisdiction-code-map.json`);
                        }
                        if (errAcc.errors.invalidMapping) {
                            console.log(`    ERROR: Invalid mapping ${line.court}::${line.jurisdiction} in court-jurisdiction-code-map.json`);
                        }
                        if (!config.opts.Quiet) {
                            if (errAcc.warnings.courtNotValid) {
                                console.log(`    WARNING: "${line.court}" is not a valid court code in LRR country ${countryName} (${countryCode}).`);
                                console.log(`    * If the court is listed in the LRR, set a correct code mapping in ${config.courtJurisdictionMapFilePath}`);
                                console.log(`    * If the court is not listed in the LRR, you may leave the entry as it stands.`);
                            }
                            if (errAcc.warnings.unknownCourt) {
                                console.log(`    WARNING: court code ${line.court} does not exist in LRR jurisdiction ${line.jurisdiction}`);
                                console.log(`    * Check the LRR and adjust the mapping in ${config.courtJurisdictionMapFilePath}, or request an amendment to the LRR`);
                            }
                        }
                        if (!config.opts.quiet && !config.opts.Quiet) {
                            if (errAcc.warnings.emptyCourt) {
                                console.log(`    WARNING: court code is empty in spreadsheet`);
                                console.log(`    * Provide a value if necessary.`);
                                console.log(`    * To suppress this message, run make-data with the -Q option.`);
                            }
                        }
                    }

                }
            }
            try {
                if (line.court === "Court" && line.jurisdiction === "Jurisdiction") {
                    continue;
                }
                
                // Okay. Here we create the CSL import object
		// Actually, this line is unused.
                // var filePath = filesPath(`${line.id}.pdf`);

                if (acc[rootID]) {
                    // console.log(`  Adding attachment for ${line.id} on ${rootID}`);
                    // XXX The note on attachments that represent case reports (as shown
                    // XXX in their CULTEXP ID) is automatically suppressed.
                    var newAttachments = addAttachment(config, line).attachments;
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
                    var item = composeItem(config, line, suppressAbstract);
                    acc[rootID] = item;
                    //console.log(`   len: ${acc[rootID].attachments.length}`);
                }
            } catch (e) {
                throw e;
            }
        }
        for (var id in acc) {
            ret.push(acc[id]);
        }

        if (config.createCourtJurisdictionMapFile) {
            fs.writeFileSync(config.courtJurisdictionMapFilePath, JSON.stringify(config.courtJurisdictionCodeMap, null, 2));
        }
        if (config.createCourtHintFile) {
            fs.writeFileSync(config.courtHintFilePath, JSON.stringify(config.courtHintMap, null, 2));
        }
        fs.writeFileSync(path.join(".", "import-me.json"), JSON.stringify(ret, null, 2));
        
        checkColMap(config);

        /*
        checkJurisdictions();
         */
        
    } catch (e) {
        throw e;
    }
};

if (require.main === module) {
    
    const optParams = {
        alias: {
            L : "lstripto",
            N : "no-jurisdiction-no-court",
            u : "use-docs-on-items",
            q : "quiet",
            Q : "Quiet",
            v : "version",
            h: "help"
        },
        string: ["L"],
        boolean: ["N", "u", "q", "Q", "h"],
        unknown: option => {
            console.log("make-data error: unknown option \"" +option + "\"");
            process.exit();
        }
    };

    const usage = "Usage: " + path.basename(process.argv[1]) + " [options]\n"
      + "  -L, --lstripto STR\n"
      + "    Remove text from left of number field to designated string.\n"
      + "  -N, --no-jurisdiction-no-court\n"
      + "    If jurisdiction field is empty, set court field to empty also.\n"
      + "  -u, --use-docs-on-items\n"
      + "    Load callNumber values for items that should\n"
      + "    receive a showDocs tag from a file useDocsOnItems.txt,\n"
      + "    which must exist.\n"
      + "  -q, --quiet\n"
      + "    Suppress only empty-court warnings.\n"
      + "  -Q, --Quiet\n"
      + "    Suppress all warnings, show only errors.\n"
      + "  -v, --version\n"
      + "    Show script version..\n"
      + "  -h, --help\n"
      + "    This help.\n";

    const opts = getopts(process.argv.slice(2), optParams);

    if (opts.v) {
        var package = JSON.parse(fs.readFileSync(path.join(__dirname, "package.json")).toString());
        console.log(package.version);
        process.exit();
    }

    if (opts.h) {
        console.log(usage);
        process.exit();
    }
    
    run(opts);
} else {
    module.exports = run;
}
