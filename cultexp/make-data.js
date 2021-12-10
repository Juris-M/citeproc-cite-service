const fs = require("fs");
const path = require("path");
const csvparse = require("csv-parse");
const markdown = require('markdown-it')({
    html: true,
    xhtmlOut: true,
    linkify: true,
    typographer: true
});

/*
 Error handling
*/

function handleErrorFatal(err) {
    console.log(err.message);
    process.exit(1);
}

function handleErrorNonFatal(err, key) {
    console.log(key  + ": " + err.message);
}

/*
 Setup config
 */
var configPath = path.join(__dirname, "config.json");
if (!fs.existsSync(configPath)) {
    fs.writeFileSync("./config.json", JSON.stringify({
        "jurisdictionCode": "xx",
        "jurisdictionName": "Laputa",
        "jurisdictionDescPath": "/path/to/legal-resource-registry-repo"
    }, null, 2));
};

// Validate variables in config and set
var configs = JSON.parse(fs.readFileSync(path.join(__dirname, "config.json")));

var defaultJurisdiction = configs.jurisdictionCode;
var fileNameStub = `data-${configs.jurisdictionName.replace(/\s/g, "-").toLowerCase()}`;
jurisdictionDescMapPath = `${configs.jurisdictionDescPath.replace(/\/$/, "")}/juris-${defaultJurisdiction}-desc.json`;

if (!fs.existsSync(jurisdictionDescMapPath)) {
    var err = new Error(`ERROR: path '${jurisdictionDescMapPath}' set from values in config.json does not exist.\n       Edit config.json and try again.`);
    handleErrorFatal(err);
}

console.log(`Running with data file stub: ${fileNameStub}`);


// Static path names
var courtJurisdictionMapFilePath = path.join(__dirname, "court-jurisdiction-code-map.json");
var createCourtJurisdictionMapFile = false;

var courtHintFilePath = path.join(__dirname, "court-code-map.json");
var createCourtHintFile = false;

// Containers for runtime data pools
var unrecognizedJurisdictions = [];
var jurisObj = {};

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

function checkColMap() {
    for (var key in colMapHints) {
        if (colMap.indexOf(key) === -1) {
            console.log(`No column found for: ${key}`);
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
        ret[key] = record[i];
    }
    return ret;
}

// console.log(`Reading jurisdictionDescMapPath: ${jurisdictionDescMapPath}`);
jurisObj[defaultJurisdiction] = JSON.parse(fs.readFileSync(jurisdictionDescMapPath).toString());

console.log(csvparse);

var parser;
if (csvparse.parse) {
    parser = csvparse.parse();
} else {
    parser = csvparse();
}

const filesPath = (filename) => {
    var pth = path.join(__dirname, "files");
    if (filename) {
        return path.join(pth, filename);
    } else {
        return pth;
    }
}

// Attempt to read human-readable form of Jurism jurisdiction entries
// Map is generated from Jurism juris-desc file.
// No custom map is used by this function
var jurisdictionNameMap = {}
for (var key in jurisObj[defaultJurisdiction].jurisdictions) {
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
        var name = jurisObj[defaultJurisdiction].jurisdictions[subkey].name;
        accName.push(name);
        if (i === 0) {
            accName.push(elem.toUpperCase());
        }
    }
    if (accName.length === 2) {
        jurisdictionNameMap[accName[0]] = subkey;
    }
    jurisdictionNameMap[accName.join("|")] = subkey;
}
const getJurisdiction = (jurisdiction) => {
    if (!jurisObj[defaultJurisdiction].jurisdictions[jurisdiction]) {
        if (jurisdictionNameMap[jurisdiction]) {
            jurisdiction = jurisdictionNameMap[jurisdiction];
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

var courtCodeMap = {};
for (var key in jurisObj[defaultJurisdiction].courts) {
    courtCodeMap[jurisObj[defaultJurisdiction].courts[key].name] = key;
}

if (!fs.existsSync(courtHintFilePath)) {
    fs.writeFileSync(courtHintFilePath, "[]");
    createCourtHintFile = true;
}

// console.log(`Reading courtHintFilePath: ${courtHintFilePath}`);
var courtHintMap = JSON.parse(fs.readFileSync(courtHintFilePath).toString());
// Put longest matches first, to avoid false positives
courtHintMap.sort((a,b) => {
    if (a[0].length < b[0].length) {
        return 1;
    } else if (a[0].length > b[0].length) {
        return -1;
    } else {
        return 0;
    }
});
if (courtHintMap.length === 0) {
    var courtHintMapEmpty = true;
} else {
    var courtHintMapEmpty = false;
}
var courtNameMap = {};
for (var key in jurisObj[defaultJurisdiction].courts) {
    courtNameMap[jurisObj[defaultJurisdiction].courts[key].name] = key;
}

const setCourt = (line) => {
    var str = line.court;
    if (courtNameMap[str]) {
        line.court = courtNameMap[str];
    } else {
        // Okay, format of courtHintFilePath file is an issue. We'll want to
        // step through in sequence, so maybe an array of two-element arrays
        // is best.
        for (var elem of courtHintMap) {
            if (str.toLowerCase().indexOf(elem[0].toLowerCase()) > -1) {
                line.court = elem[1];
                if (elem[2]) {
                    line.division = elem[2];
                }
                if (elem[3]) {
                    line.type = elem[3];
                }
                break;
            }
        }
    }
    if (courtHintMapEmpty && !jurisObj[defaultJurisdiction].courts[line.court]) {
        if (courtHintMap.map(o => o[0]).indexOf(str) === -1) {
            courtHintMap.push([str, "[COURT CODE]"]);
        }
    }
}

if (!fs.existsSync(courtJurisdictionMapFilePath)) {
    fs.writeFileSync(courtJurisdictionMapFilePath, "{}");
    createCourtJurisdictionMapFile = true;
}
// console.log(`Reading jurisdictionMapFilePath: ${courtJurisdictionMapFilePath}`);
var courtJurisdictionCodeMap = JSON.parse(fs.readFileSync(courtJurisdictionMapFilePath).toString());

function getDate(str) {
    if (str.trim() === "undated") {
        str = "";
    }
    if (!str) {
        return null;
    }
    var ret = [];
    var lst = str.split(/[-\/\.]/);
    lst.reverse();
    
    var day = lst[2];
    if (day) {
        day = parseInt(day, 10);
    }
    var month = lst[1];
    if (month) {
        month = parseInt(month, 10);
    }
    if (month > 12) {
        var oldday = day;
        day = month;
        month = oldday;
    }
    var year = lst[0];
    if (year) {
        ret.push(year);
        if (month) {
            ret.push(month);
            if (day) {
                ret.push(day);
            }
        }
    } else {
        throw new Error("Missing year in date element in " + str);
    }
    return {
        "date-parts": [ret]
    }
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

function addAttachment(line) {
    var fileCode = line.id;
    var note = getAbstract(line.summary);
    if (note) {
        note = markdown.render(note);
    }
    var attachments = [];
    var fn = `${fileCode}.pdf`;
    if (!fs.existsSync(filesPath(fn))) {
        fn = "empty.pdf";
    }
    var suffix = fileCode.slice(5);
    // Root filename suffixes in this jurisdiction:
    // A
    // B
    // C
    // D
    // ER
    // ERa
    // ERb
    if (!suffix | ["A", "B", "C", "D"].indexOf(suffix) > -1) {
        attachments.push({
            path: filesPath(fn),
            title: fn,
            note: note,
            tags: [`LN:${defaultJurisdiction}`, "TY:judgment"]
        });
    } else if (suffix.slice(0, 2) === "ER") {
        attachments.push({
            path: filesPath(fn),
            title: fn,
            note: note,
            tags: [`LN:${defaultJurisdiction}`, "TY:report"]
        });
    } else {
        console.log(`  Oops ${suffix}`);
        process.exit();
    }
    return {
        attachments: attachments,
        tags: []
    };
}

function composeItem(line) {
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
        item["number"] = line.docketno;
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
    var date = getDate(line.date);
    if (date) {
        item["issued"] = date;
    }
    if (line.court) {
        item["authority"] = line.court;
    }
    if (line.jurisdiction) {
        item["jurisdiction"] = line.jurisdiction;
    } else {
        item["jurisdiction"] = defaultJurisdiction;
    }
    item["abstract"] = getAbstract(line.summary);
    // item.references = `appeal from ${record[6]}`;
    item["language"] = `${defaultJurisdiction}`;
    // item["number"] = number;
    var info = addAttachment(line);
    info.tags.push(`cn:${defaultJurisdiction.toUpperCase()}`);
    item["attachments"] = info.attachments;
    item["tags"] = getTags(line, info.tags);
    return item;
}

function getSpreadsheetArrays(path_to_csv) {
    var firstRecord = true;
    var ret = [];
    var spreadsheetArraysPromise = new Promise((resolve, reject) => {
        parser.on("readable", function(){
            let record
            while (record = parser.read()) {
                if (firstRecord) {
                    if (record[0] || record[1]) {
                        setColMap(record);
                        firstRecord = false;
                    }
                } else {
                    ret.push(record);
                }
            }
        });
        parser.on('error', function(err){
            reject(err);
        });
        parser.on('end', function(){
            resolve(ret);
        });
        // console.log(`Reading path_to_csv: ${path_to_csv}`);
        var txt = fs.readFileSync(path_to_csv);
        parser.write(txt);
        parser.end();
    });
    return spreadsheetArraysPromise;
}

var deletes = [];

(async function() {
    var court;
    try {
        var acc = {};
        var ret = [];
        var jurisdictions = {};
        var arrays = await getSpreadsheetArrays(fileNameStub + ".csv");
        //arrays = arrays.slice(1);
        //var arrays = arrays.slice(1);
        for (var record of arrays) {
            
            var line = loadLine(record);
            // Attempt to normalize jurisdiction code
            line.jurisdiction = getJurisdiction(line.jurisdiction);

            // Attempt to normalize court code
            setCourt(line);

            var info = courtJurisdictionCodeMap[`${line.court}::${line.jurisdiction}`];
            if (info) {
                line.court = info.court;
                line.jurisdiction = info.jurisdiction;
            }
            
            // Validate court in jurisdiction
            var valid = false;
            // Extend jurisdiction descriptions if necessary and if possible
            var topJurisdiction = line.jurisdiction.split(":")[0];
                
            if (!jurisObj[topJurisdiction]) {
                var pth = jurisdictionDescMapPath.replace(`juris-${defaultJurisdiction}`, `juris-${topJurisdiction}`);
                if (fs.existsSync(pth)) {
                    // console.log(`Reading pth: ${pth}`);
                    jurisObj[topJurisdiction] = JSON.parse(fs.readFileSync(pth).toString());
                } else {
                    topJurisdiction = defaultJurisdiction;
                }
            }
            var jurisdictionInfo = jurisObj[topJurisdiction].jurisdictions[line.jurisdiction];
            if (jurisdictionInfo) {
                if (jurisdictionInfo.courts[line.court]) {
                    valid = true;
                }
            }
            if (!valid) {
                if (!courtJurisdictionCodeMap[`${line.court}::${line.jurisdiction}`]) {
                    var info = {
                        court: line.court,
                        jurisdiction: line.jurisdiction
                    };
                    courtJurisdictionCodeMap[`${line.court}::${line.jurisdiction}`] = info;
                    console.log(`ADDING TO CODE MAP: [${line.court}::${line.jurisdiction}]`);
                    console.log(`    Adjust jurisdiction and court code values in ${courtJurisdictionMapFilePath}`);
                } else {
                    console.log(`WARNING: Invalid entry at ${line.court}::${line.jurisdiction}`);
                    console.log(`    Check jurisdiction and court codes against data in ${jurisdictionDescMapPath}`);
                }
            }
            
            try {
                console.log(line.id);
                if (line.court === "Court" && line.jurisdiction === "Jurisdiction") {
                    continue;
                }
                
                // Okay. Here we create the CSL import object
                var filePath = filesPath(`${line.id}.pdf`);

                var rootID = getRootID(line.id);
                if (acc[rootID]) {
                    // console.log(`  Adding attachment for ${line.id} on ${rootID}`);
                    var newAttachments = addAttachment(line).attachments;
                    acc[rootID].attachments = acc[rootID].attachments.concat(newAttachments);
                    // console.log(`   len: ${acc[rootID].attachments.length}`);
                } else {
                    var item = composeItem(line);
                    acc[rootID] = item;
                    //console.log(`   len: ${acc[rootID].attachments.length}`);
                }
            } catch (e) {
                handleErrorFatal(e, line.id);
            }
        }
        for (var id in acc) {
            ret.push(acc[id]);
        }

        if (createCourtJurisdictionMapFile) {
            fs.writeFileSync(courtJurisdictionMapFilePath, JSON.stringify(courtJurisdictionCodeMap, null, 2));
        }
        if (createCourtHintFile) {
            fs.writeFileSync(courtHintFilePath, JSON.stringify(courtHintMap, null, 2));
        }
        fs.writeFileSync(path.join(__dirname, "import-me.json"), JSON.stringify(ret, null, 2));
        
        checkColMap();

        /*
        checkJurisdictions();
         */
        
    } catch (e) {
        handleErrorFatal(e);
    }
})();
