#!/usr/bin/env node

var path = require("path");
var fs = require("fs");
const getopts = require("getopts");
const superagent = require('superagent');
const unzipper = require("unzipper");
const tmp = require("tmp");
tmp.setGracefulCleanup();

const CSL = require("citeproc");
const zoteroToCsl = require("zotero-to-csl");
const zoteroToJurism = require("zotero2jurismcsl").convert;

/** @namespace callbacks
 * @description Container carrying functions for performing
 *   a downstream sync into the target system.
 * @prop {} init - async function to set the value of initial parameters
 * @prop {} openTransaction - async function of open a database transaction
 * @prop {} closeTransaction - async function to close a database transaction
 * @prop {} items - async functions to add, delete, or modify item metadata
 * @prop {} attachments - async functions to add, delete, or modify attachment metadata
 * @prop {} files - async functions to add, purge, or check for the existence of files
 */
const callbacks = require('./callbacks').callbacks;

/**
 * @description Write the message of errors with a cause of 1
 *   to console, otherwise write out the full trace of the
 *   error.
 */
function handleError(e) {
    if (e.cause == 1) {
        console.log(`ERROR: ${e.message}`);
    } else {
        console.log(e);
    }
    process.exit();
}

/** @function newUpdateSpec
 * @description Return a unique container for object keys to be called for
 *   downstream sync.
 * @prop {Object} items - parent-item keys
 * @prop {Object} attachments - attachment keys
 * @prop {Object} files - keys of files corresponding to attachment metadata
 * @return {Object}
 */
const newUpdateSpec = () => {
    var template = {
        items: {
            add: [],
            mod: [],
            del: []
        },
        attachments: {
            add: [],
            mod: [],
            del: []
        },
        files: []
    }
    return JSON.parse(JSON.stringify(template))
}

/** @type Object[]
 * @description Array of CSL date variable names. Does not
 *   include date variables added by CSL-M.
 */
const CSL_DATE_VARIABLES = [
    "accessed",
    "available-date",
    "event-date",
    "issued",
    "original-date",
    "submitted"
];

/**
 * 
 */
function Config(opts) {
    console.log(`Running with node version ${process.version}`);
    this.opts = opts;
    
    this.scriptPath = path.dirname(require.main.filename);
    this.dataPath = this.getDataPath();
    this.configPath = path.join(this.dataPath, "config.json");
    this.stylePath = path.join(this.scriptPath, "jm-cultexp.csl");
    this.keyCachePath = path.join(this.dataPath, "keyCache.json");

    this.fileExtFromKey = {};

    this.checkDataDirExists();
    this.checkEmptyDataDir();
    console.log(`Using data directory ${this.dataPath}`);
    
    this.setupConfigFile();
    Object.assign(this, this.readConfigFile());
    this.checkAccessCredentials();

    this.setupKeyCache();
}

Config.prototype.getDataPath = function() {
    var ret;
    if (this.opts.d) {
        ret = this.opts.d;
    } else {
        ret = process.cwd();
    }
    return ret;
}

Config.prototype.checkDataDirExists = function() {
    if (!fs.existsSync(this.dataPath)) {
        var e = new Error("data directory does not exist", {cause:1});
        throw e;
    }
}

Config.prototype.checkEmptyDataDir = function() {
    if (this.opts.i && fs.readdirSync(dataPath).length > 0) {
        var e = new Error("the -i option can only be used in an empty data directory", {cause:1});
        throw e;
    }
}

Config.prototype.setupConfigFile = function() {
    if (!fs.existsSync(this.configPath)) {
        if (this.opts.i) {
            fs.writeFileSync(this.configPath, "// Configuration file for citeproc-cite-service\n// For details, see README.md or https://www.npmjs.com/package/citeproc-cite-service\n" + JSON.stringify({
                dataPath: dataPath,
                access: {
                    groupID: false,
                    libraryKey: false
                }
            }, null, 2));
            process.exit();
        } else {
            var e = new Error("config.json does not exist. To create a template to be edited, use the --init option.", {cause:1});
            throw e;
        }
    }
}

Config.prototype.readConfigFile = function() {
    function nixComments(line) {
        if (line.slice(0,2) === "//") {
            return false
        } else {
            return line
        }
    }
    var json = fs.readFileSync(this.configPath).toString();
    json = json.split("\n")
        .filter(line => nixComments(line))
        .join("\n");
    return JSON.parse(json);
}

Config.prototype.checkAccessCredentials = function() {
    if (!this.access || !this.access.groupID || !this.access.libraryKey) {
        var e = new Error("no access credentials found in config. See the README.", {cause:1});
        throw e;
    }
}

Config.prototype.setupKeyCache = function() {
    if (!fs.existsSync(this.keyCachePath)) {
        fs.writeFileSync(this.keyCachePath, JSON.stringify({library:0,items:{},attachments:{}}, null, 2));
    }
}

Config.prototype.getKeyCache = function() {
    return JSON.parse(fs.readFileSync(this.keyCachePath));
}

var Sys = function(cfg){
    this.cfg = cfg;
    this.abbrevs = { "default": new CSL.AbbreviationSegments() };
    this.items = {};
    this.modulesPath = path.join(path.dirname(require.main.filename), "style-modules");
    this.localesPath = require("citeproc-locales");
    this.getAbbrevs = require("citeproc-abbrevs").getAbbrevs;
};

Sys.prototype.retrieveItem = function(id){
    var item = this.items[id];
    if (item.jurisdiction) {
        var countryID = item.jurisdiction.replace(/:.*$/, "");
        if (!this.abbrevs[countryID]) {
            this.abbrevs = Object.assign(this.abbrevs, this.getAbbrevs("auto-" + countryID));
        }
    }
    return this.items[id];
};

Sys.prototype.retrieveLocale = function(lang){
    var ret = null;
    try {
        ret = fs.readFileSync(path.join(this.localesPath, "locales-"+lang+".xml")).toString();
        ret = ret.replace(/\s*<\?[^>]*\?>\s*\n/g, "");
    } catch (e) {
        ret = false;
    }
    return ret;
};

Sys.prototype.retrieveStyleModule = function(jurisdiction, preference) {
    var ret = null;
    var id = [jurisdiction];
    if (preference) {
        id.push(preference);
    }
    id = id.join("-");
    try {
        ret = fs.readFileSync(path.join(this.modulesPath, "juris-" + id + ".csl")).toString();
    } catch (e) {}
    return ret;
};

Sys.prototype.getAbbreviation = function(dummyListNameVar, obj, jurisdiction, category, key){
    if (!this.abbrevs[jurisdiction]) {
        this.abbrevs[jurisdiction] = new CSL.AbbreviationSegments();
    }
    if (!obj[jurisdiction]) {
        obj[jurisdiction] = new CSL.AbbreviationSegments();
    }    
    var jurisdictions = ["default"];
    if (jurisdiction !== "default") {
        jurisdictions.push(jurisdiction);
    }
    jurisdictions.reverse();
    var haveHit = false;
    for (var i = 0, ilen = jurisdictions.length; i < ilen; i += 1) {
        var myjurisdiction = jurisdictions[i];
        if (this.abbrevs[myjurisdiction] && this.abbrevs[myjurisdiction][category] && this.abbrevs[myjurisdiction][category][key]) {
            obj[myjurisdiction][category][key] = this.abbrevs[myjurisdiction][category][key];
            jurisdiction = myjurisdiction;
            haveHit = true;
            break;
        }
    }
    if (!haveHit && category === "place" && (key.length === 2 || key.indexOf(":") > -1)) {
        for (var i = 0, ilen = jurisdictions.length; i < ilen; i += 1) {
            var myjurisdiction = jurisdictions[i];
            var upperKey = key.toUpperCase();
            if (this.abbrevs[myjurisdiction] && this.abbrevs[myjurisdiction][category] && this.abbrevs[myjurisdiction][category][upperKey]) {
                obj[myjurisdiction][category][key] = this.abbrevs[myjurisdiction][category][upperKey];
                jurisdiction = myjurisdiction;
                haveHit = true;
                break;
            }
        }
    }
    return jurisdiction;
};

function ApiFetch(cfg) {
    this.cfg = cfg;
    this.transactionSize = 25;
    this.attachmentNameFromKey = {};
    this.attachmentsDone = {};
    this.newVersions = this.callVersions();
}

ApiFetch.prototype.callAPI = async function(uriStub, isAttachment, fin) {
    var ret = null;
    var itemsUrl = `https://api.zotero.org/groups/${this.cfg.access.groupID}${uriStub}`;
    if (isAttachment) {
        ret = await superagent.get(itemsUrl)
            .buffer(true)
            .parse(superagent.parse.image)
            .set("Authorization", `Bearer ${this.cfg.access.libraryKey}`);
    } else {
        ret = await superagent
            .get(itemsUrl)
            .set("content-type", "application/json")
            .set("Authorization", `Bearer ${this.cfg.access.libraryKey}`);
    }
    if (ret.header["retry-after"]) {
        if (fin) {
            var e = new Error(`API call failed after retry: ${uriStub}`, {cause:1});
            throw e;
        } else {
            var retryAfter = parseInt(ret.header["retry-after"]);
            await sleep(retryAfter);
            ret = await this.callApi(uriStub, isAttachment, true);
        }
    }
    return ret;
}

ApiFetch.prototype.getVersions = async function(uriStub) {
    var ret = null;
    var ret = await this.callAPI(uriStub);
    var libraryVersion = ret.header["last-modified-version"];
    var keyVersions = JSON.parse(ret.text);
    return {
        library: libraryVersion,
        keys: keyVersions
    };
};

ApiFetch.prototype.callVersions = async function() {
    var ret = {
        library: null,
        items: null,
        attachments: null
    };
    var versions = await this.getVersions("/items/top?itemType=-note&format=versions");
    ret.library = versions.library;
    ret.items = versions.keys;
    versions = await this.getVersions("/items?itemType=attachment&format=versions");
    ret.attachments = versions.keys;
    return ret;
};

ApiFetch.prototype.doDeletes = async function(updateSpec) {
    await callbacks.attachments.del.call(this.cfg, updateSpec.attachments.del);
    for (var attachmentKey of updateSpec.attachments.del) {
        delete this.cacheVersions.attachments[attachmentKey];
    }
    await callbacks.items.del.call(this.cfg, updateSpec.items.del);
    for (var itemKey of updateSpec.items.del) {
        delete this.cacheVersions.items[itemKey];
    }
}

ApiFetch.prototype.addItems = async function(updateSpec) {
    var addSublists = [];
    while (updateSpec.items.add.length) {
        addSublists.push(updateSpec.items.add.slice(0, this.transactionSize));
        updateSpec.items.add = updateSpec.items.add.slice(this.transactionSize);
    }
    for (var sublist of addSublists) {
        var items = await this.getObjectsByKey(sublist);
        for (var item of items) {
            var siteItem = this.buildSiteItem(item);
            await callbacks.items.add.call(this.cfg, siteItem);
        }
    }
}

ApiFetch.prototype.modItems = async function(updateSpec) {
    var modSublists = [];
    while (updateSpec.items.mod.length) {
        modSublists.push(updateSpec.items.mod.slice(0, this.transactionSize));
        updateSpec.items.mod = updateSpec.items.mod.slice(this.transactionSize);
    }
    for (var sublist of modSublists) {
        var items = await this.getObjectsByKey(sublist);
        for (var item of items) {
            var siteItem = this.buildSiteItem(item);
            await callbacks.items.mod.call(this.cfg, siteItem);
        }
    }
}

ApiFetch.prototype.doAddUpdateItems = async function(updateSpec) {
    console.log(`Adding and updating item metadata ...`);
    await this.addItems(updateSpec);
    await this.modItems(updateSpec);
}

ApiFetch.prototype.addAttachments = async function(updateSpec) {
    var addSublists = [];
    while (updateSpec.attachments.add.length) {
        addSublists.push(updateSpec.attachments.add.slice(0, transactionSize));
        updateSpec.attachments.add = updateSpec.attachments.add.slice(transactionSize);
    }
    for (var sublist of addSublists) {
        var attachments = await this.getObjectsByKey(sublist);
        for (var attachment of attachments) {
            var siteAttachment = await this.buildSiteAttachment(attachment);
		    this.attachmentNameFromKey[siteAttachment.key] = siteAttachment.filename;
            await callbacks.attachments.add.call(this.cfg, siteAttachment);
        }
    }
}

ApiFetch.prototype.modAttachments = async function(updateSpec) {
    var modSublists = [];
    while (updateSpec.attachments.mod.length) {
        modSublists.push(updateSpec.attachments.mod.slice(0, transactionSize));
        updateSpec.attachments.mod = updateSpec.attachments.mod.slice(transactionSize);
    }
    for (var sublist of modSublists) {
        var attachments = await this.getObjectsByKey(sublist);
        for (var attachment of attachments) {
            var siteAttachment = await this.buildSiteAttachment(attachment);
		    this.attachmentNameFromKey[siteAttachment.key] = siteAttachment.filename;
            await callbacks.attachments.mod.call(this.cfg, siteAttachment);
        }
    }
}

ApiFetch.prototype.addFiles = async function(updateSpec) {
    for (var attachmentID of updateSpec.attachments.mod) {
        if (this.newVersions[attachmentID] > this.cacheVersions[attachmentID]) {
            // true as second argument expects attachment file content
            var response = await this.callAPI("/items/" + attachmentID + "/file", true);
	        var info = await this.getRealBufferAndExt(response.body);
            await callbacks.files.add.call(this.cfg, attachmentID, info.buf, info.fileInfo.ext);
            attachmentsDone[attachmentID] = true;
        }
    };
}

ApiFetch.prototype.addMoreFiles = async function() {
    for (var attachmentID in this.newVersions.attachments) {
        if (attachmentsDone[attachmentID]) continue;
        var attachmentExists = await callbacks.files.exists.call(this.cfg, attachmentID);
        if (attachmentExists === false) {
            // true as second argument expects attachment file content
            var response = await this.callAPI("/items/" + attachmentID + "/file", true);
	        var info = await this.getRealBufferAndExt(response.body);
            await callbacks.files.add.call(this.cfg, attachmentID, info.buf, info.fileInfo.ext);
        };
    }
}

ApiFetch.prototype.doAddUpdateAttachments = async function(updateSpec) {
    console.log(`Adding and updating attachment metadata ...`);
    var filesDir = path.join(this.cfg.dirs.topDir, "files");
    console.log(`Adding and updating attachment files ...`);
    await this.addAttachments(updateSpec);
    await this.modAttachments(updateSpec);
    await this.addFiles(updateSpec)
    await this.addMoreFiles(updateSpec);
    await callbacks.files.purge.call(this.cfg, updateSpec.attachments.del);
}

var Runner = function(opts) {
    this.cfg = new Config(opts);
    this.cacheVersions = this.cfg.getKeyCache();

    this.emptyPdfInfo = [];
};

Runner.prototype.getStyle = function() {
    var sys = new Sys();
    var styleXml = fs.readFileSync(this.cfg.stylePath).toString();
    var style = new CSL.Engine(sys, styleXml);
    style.setSuppressTrailingPunctuation(true);
    return style;
}

Runner.prototype.getRealBufferAndExt = async function(buf) {
    var tmpInfo = tmp.dirSync();
    var filePath = path.join(tmpInfo.name, "myfile");
    await fs.writeFileSync(filePath, buf)
    var fileInfo = await this.fileTyper.fileTypeFromFile(filePath);
	if (fileInfo.mime == "application/zip") {
        await this.unzip(filePath, tmpInfo.name);
        for (var fn of fs.readdirSync(tmpInfo.name)) {
            if (fn === "myfile") continue;
            var newFilePath = path.join(tmpInfo.name, fn);
            fileInfo = await this.fileTyper.fileTypeFromFile(newFilePath);
            if (!fileInfo) {
                fileInfo = this.fixFileTypeTxtFail(fileInfo, fn);
            }
            buf = fs.readFileSync(newFilePath);
            break;
        }
    }
    return {
        fileInfo: fileInfo,
        buf: buf
    }
}

Runner.prototype.fixFileTypeTxtFail = function(fileInfo, fn) {
    if (!fileInfo) {
        fileInfo = {
            ext: "pdf",
            mime: "application/pdf"
        }
        if (fn.slice(-4) === ".txt") {
            fileInfo.ext = "txt",
            fileInfo.mime = "text/plain"
        }
    }
    return fileInfo;
}

Runner.prototype.unzip = async function(filePath, outputPath) {
    const zip = fs.createReadStream(filePath).pipe(unzipper.Parse({forceStream: true}));
    for await (const entry of zip) {
        var done = false;
        const fileName = entry.path;
        const type = entry.type; // 'Directory' or 'File'
        const size = entry.vars.uncompressedSize; // There is also compressedSize;
        if (!done) {
            entry.pipe(fs.createWriteStream(path.join(outputPath, fileName)));
        } else {
            entry.autodrain();
        }
    }
}

Runner.prototype.updateVersionCache = function(libraryVersion) {
    this.cacheVersions.library = libraryVersion;
    fs.writeFileSync(this.cfg.keyCachePath, JSON.stringify(this.cacheVersions, null, 2));
};

Runner.prototype.getObjectsByKey = async function(sublist) {
    var ret = null;
    var keys = sublist.join(",");
    var uriStub = `/items?itemKey=${keys}`;
    ret = await this.callAPI(uriStub);
    ret = JSON.parse(ret.text);
    ret = ret.map(o => o.data);
    return ret;
}

Runner.prototype.versionDeltas = function(ret, cacheVersions, newVersions) {
    for (var key in cacheVersions) {
        if (!newVersions[key]) {
            ret.del.push(key);
        } else if (this.newVersions[key] > cacheVersions[key]) {
            ret.mod.push(key);
        }
    }
    for (var key in newVersions) {
        if (!cacheVersions[key]) {
            ret.add.push(key);
        }
    }
    return ret;
}

Runner.prototype.getUpdateSpec = async function(newVersions) {
    var ret = newUpdateSpec();
    ret.items = this.versionDeltas(ret.items, this.cacheVersions.items, newVersions.items);
    ret.attachments = this.versionDeltas(ret.attachments, this.cacheVersions.attachments, newVersions.attachments);
    return ret;
}

Runner.prototype.extractTag = function(arr, prefix, defaultValue) {
    var ret = defaultValue;
    if (prefix.slice(-1) !== ":") {
        var e = new Error("Invalid prefix spec: must end in a colon (:)", {cause:1});
        throw e;
    }
    var offset = prefix.length;
    for (var i=arr.length-1;i>-1;i--) {
        var tag = arr[i].tag ? arr[i].tag : arr[i];
        if (tag.slice(0, offset) === prefix) {
            ret = tag.slice(offset); 
        }
        arr = arr.slice(0, i).concat(arr.slice(i+1));
    }
    return ret;
}

Runner.prototype.extractCountry = function(jurisdiction) {
    var ret = "";
    if (jurisdiction) {
        ret = jurisdiction.split(":")[0].toUpperCase();
    }
    return ret;
}

    // Okay. This is ugly. zoteroToCsl straight off npm doesn't
    // convert string dates to the CSL array form, so we hack in
    // a fix for those entries here.

    
    // Okay. This is also ugly. zoteroToJurism() modifies the
    // object in place, as well as returning it as result.
    // If it is not recomposed here, cslItemZotero will be
    // unencoded as a side effect.
Runner.prototype.buildSiteItem = function(item) {
    var itemKey = item.key;
    var itemVersion = item.version;
    this.cacheVersions.items[itemKey] = itemVersion;
    delete item.key;
    delete item.version;
    delete item.dateAdded;
    delete item.dateModified;
    var cslItemZotero = zoteroToCsl(item);
    for (var fieldName of CSL_DATE_VARIABLES) {
        if ("string" === typeof cslItemZotero[fieldName]) {
            cslItemZotero[fieldName] = CSL.DateParser.parseDateToArray(cslItemZotero[fieldName]);
        }
    }
    var cslItemJurism = zoteroToJurism({data:item}, JSON.parse(JSON.stringify(cslItemZotero)));
    var cslItem = cslItemJurism;
    var cslJsonItem = cslItemZotero;
    var relatedItems = [];
    if (item.relations["dc:relation"]) {
        relations = item.relations["dc:relation"];
        if (typeof relations === "string") {
            relations = [relations];
        }
        relatedItems = relations.map(s => s.replace(/^.*\//, ""));
    }
    cslItemZotero.id = itemKey;
    cslItemJurism.id = itemKey;
    cslItem.id = itemKey;
    this.style.sys.items = JSON.parse("{\"" + itemKey + "\": " + JSON.stringify(cslItemJurism) + "}");
    this.style.updateItems([itemKey]);
    var country = this.extractCountry(cslItemJurism.jurisdiction);

    var citation = this.style.makeCitationCluster([{"id":itemKey}]);
    console.log(`citation: ${citation}`);
    if (relatedItems.length === 0) {
        delete cslJsonItem.id;
    }
    delete cslJsonItem["abstract"];
    if (cslJsonItem.note.match(/^mlzsync1:[0-9]{4}/)) {
        var extraDataStrLen = parseInt(cslJsonItem.note.slice(9, 13), 10);
        var extraDataStr = cslJsonItem.note.slice(13, 13 + extraDataStrLen);
        cslJsonItem.note = cslJsonItem.note.slice(13 + extraDataStrLen);
        var extraData = JSON.parse(extraDataStr);
        delete extraData.extrafields.callNumber;
        extraDataStr = JSON.stringify(extraData);
        extraDataStrLen = extraDataStr.length + "";
        while (extraDataStrLen.length < 4) {
            extraDataStrLen = "0" + extraDataStrLen;
        }
        cslJsonItem.note = `mlzsync1:${extraDataStrLen}${extraDataStr}${cslJsonItem.note}`;
    }
    return {
        key: itemKey,
        citation: citation,
        country: country,
        tags: item.tags,
        relatedItems: relatedItems,
        cslItem: cslItem,
        cslJsonItem: cslJsonItem
    }
}

Runner.prototype.buildSiteAttachment = function(attachment){
    var language = this.extractTag(attachment.tags, "LN:", "en");
    var type = this.extractTag(attachment.tags, "TY:", false);
    var ocr = this.extractTag(attachment.tags, "OCR:", false);

    this.cacheVersions.attachments[attachment.key] = attachment.version;
    if (this.cfg.opts.y) {
        if (attachment.filename === "empty.pdf") {
            this.emptyPdfInfo.push(attachment);
        }
    }
    var ret = {
        key: attachment.key,
        parentKey: attachment.parentItem,
        language: language,
        filename: attachment.title,
        note: attachment.note
    };
    if (type) {
        ret.type = type;
    }
    if (ocr) {
        ret.ocr = ocr;
    }
    return ret;

}

Runner.prototype.yeetPlaceholderPdfFiles = function() {
    var filesDir = path.join(this.cfg.dirs.topDir, "files");
    for (var info of this.emptyPdfInfo) {
        var filePath = path.join(filesDir, `${info.key}.pdf`);
        if (fs.existsSync(filePath)) {
            console.log(`removing empty placeholder PDF file: ${info.title} [${info.key}]`);
            fs.unlinkSync(filePath);
        }
    }
}

Runner.prototype.run = async function() {
    this.fileTyper = await import("file-type");
    apiFetch = new ApiFetch(this.cfg);
    
    var updateSpec = await this.getUpdateSpec(apiFetch.newVersions);

    await callbacks.init.call(this.cfg);
    await callbacks.openTransaction.call(this.cfg);
    await apiFetch.doDeletes(updateSpec);
    await apiFetch.doAddUpdateItems(updateSpec);
    await apiFetch.doAddUpdateAttachments(updateSpec);
    await callbacks.closeTransaction.call(this.cfg);

    this.updateVersionCache(apiFetch.newVersions.library);

    if (this.cfg.opts.y) {
        this.yeetPlaceholderPdfFiles();
    }
    console.log("Done!");
}

const optParams = {
    alias: {
        i: "init",
        d: "data-dir",
        y: "yeet-placeholder-pdfs",
        v: "version",
        h: "help"
    },
    string: ["d"],
    boolean: ["h", "i", "y", "v"],
    unknown: option => {
        var e = new Error("unknown option \"" +option + "\"", {cause:1});
        handleError(e);
    }
};

const usage = "Usage: " + path.basename(process.argv[1]) + " [options]\n"
      + "  -i, --init\n"
      + "    Initialize the current directory or --data-dir.\n"
      + "  -d, --data-dir <dataDirPath>\n"
      + "    Absolute path to a citeproc-cite-service data directory.\n"
      + "  -y, --yeet-placeholder-pdfs\n"
      + "    Skip placeholder PDF files included in the download\n"
      + "  -v, --version\n"
      + "    Write version number to terminal and exit\n";

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

function isDir(pth) {
    var s = fs.statSync(pth);
    return s.isDirectory();
}
if (opts.d && (!path.isAbsolute(opts.d) || !fs.existsSync(opts.d) || !isDir(opts.d))) {
    var e = new Error("when used, option -d must be set to an existing absolute directory path", {cause:1});
    handleError(e);
}
try {
    var runner = new Runner(opts);
} catch (e) {
    handleError(e);
}
runner.run().catch( e => handleError(e) );
