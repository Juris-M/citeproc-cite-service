#!/usr/bin/env node

var path = require("path");
var fs = require("fs");
const getopts = require("getopts");
const superagent = require('superagent');
const zoteroToCsl = require('zotero-to-csl');
const zoteroToJurism = require('zotero2jurismcsl').convert;
const getStyle = require('./style').getStyle;
const callbacks = require('./callbacks').callbacks;

function getConfig(opts, keyCacheJson) {
    if (opts.d) {
        var dataPath = opts.d;
    } else {
        var dataPath = process.cwd();
    }
    console.log("zsyncdown: using data directory " + dataPath);
    if (opts.i && fs.readdirSync(dataPath).length > 0) {
        abort("the -i option can only be used in an empty data directory");
    }
    var configFilePath = path.join(dataPath, "config.json");
    console.log("zsyncdown: opening config file at " + configFilePath);
    if (!fs.existsSync(configFilePath)) {
        if (opts.i) {
            fs.writeFileSync(configFilePath, "// Configuration file for citeproc-cite-service\n// For details, see README.md or https://www.npmjs.com/package/citeproc-cite-service\n" + JSON.stringify({
                dataPath: dataPath,
                dataMode: "CSL-M",
                access: {
                    groupID: false,
                    libraryKey: false
                }
            }, null, 2));
        } else {
            abort("config.json does not exist. Use the --init option.");
        }
    }
    var cfg = JSON.parse(fs.readFileSync(configFilePath)
                         .toString()
                         .split("\n").filter(function(line){if(line.slice(0,2)==="//"){return false}else{return line}})
                         .join("\n"));
    if (!cfg.dataMode || ["CSL", "CSL-M"].indexOf(cfg.dataMode) === -1) {
        abort("dataMode must be set to \"CSL\" or \"CSL-M\" in " + configFilePath);
    }
    if (cfg.dataMode === "CSL") {
        cfg.styleName = "chicago-fullnote-bibliography.csl";
    } else {
        cfg.styleName = "jm-chicago-fullnote-bibliography.csl";
    }
    if (!fs.existsSync(cfg.dataPath)) {
        abort("data directory does not exist");
    }
    var styleCslTargetPath = path.join(dataPath, cfg.styleName);
    if (!fs.existsSync(styleCslTargetPath)) {
        var styleCslSourcePath = path.join(__dirname, cfg.styleName);
        fs.copyFileSync(styleCslSourcePath, styleCslTargetPath);
    }
    var keyCacheFile = path.join(cfg.dataPath, keyCacheJson);
    if (!keyCacheFile || !fs.existsSync(keyCacheFile)) {
        fs.writeFileSync(keyCacheFile, JSON.stringify({library:0,items:{},attachments:{}}, null, 2));
    }
    console.log("zsyncdown: Using persistent cache file at " + keyCacheFile);
    
    return cfg;
}

function handleError(e) {
    console.log(e);
    process.exit();
}

function abort(msg) {
    console.log("zsyncdown ERROR: " + msg);
    process.exit();
}

var Runner = function(opts, callbacks) {
    this.keyCacheJson = "keyCache.json";
    this.cfg = getConfig(opts, this.keyCacheJson);
    this.cfg.opts = opts;
    if (!this.cfg.access || !this.cfg.access.groupID || !this.cfg.access.libraryKey) {
        abort("no access credentials found in config. See the README.");
    }
    this.callbacks = callbacks;
    this.oldVersions = JSON.parse(fs.readFileSync(path.join(this.cfg.dataPath, this.keyCacheJson)));
    this.style = getStyle(this.cfg);
};

Runner.prototype.callAPI = async function(uriStub, isFile, final) {
    var ret = null;
    var itemsUrl = "https://api.zotero.org/groups/" + this.cfg.access.groupID + uriStub;
    console.log("+ CALL " + itemsUrl);
    if (isFile) {
        ret = await superagent.get(itemsUrl)
            .buffer(true)
            .parse(superagent.parse.image)
            .set("content-type", "application/pdf")
            .set("Authorization", "Bearer " + this.cfg.access.libraryKey);
    } else {
        ret = await superagent.get(itemsUrl).set("content-type", "application/json").set("Authorization", "Bearer " + this.cfg.access.libraryKey);
    }
    if (ret.header["retry-after"]) {
        if (final) {
            throw "API call failed after retry: " + uriStub;
        } else {
            var retryAfter = parseInt(ret.header["retry-after"]);
            await sleep(retryAfter);
            ret = await this.callApi(uriStub, isFile, true);
        }
    }
    return ret;
}

Runner.prototype.getVersions = async function(uriStub) {
    var ret = null;
    try {
        var ret = await this.callAPI(uriStub);
        var libraryVersion = ret.header["last-modified-version"];
        var keyVersions = JSON.parse(ret.text);
    } catch (e) {
        handleError(e);
    }
    return {
        library: libraryVersion,
        keys: keyVersions
    }
};

Runner.prototype.callVersions = async function() {
    var ret = {
        library: null,
        items: null,
        attachments: null
    };
    try {
        var versions = await this.getVersions("/items/top?itemType=-note&format=versions");
        ret.library = versions.library;
        ret.items = versions.keys;
        versions = await this.getVersions("/items?itemType=attachment&format=versions");
        ret.attachments = versions.keys;
    } catch (e) {
        handleError(e);
    }
    return ret;
};

Runner.prototype.updateVersionCache = function(libraryVersion) {
    this.oldVersions.library = libraryVersion;
    fs.writeFileSync(path.join(this.cfg.dataPath, this.keyCacheJson), JSON.stringify(this.oldVersions, null, 2));
};

Runner.prototype.getItems = async function(sublist) {
    var ret = null;
    try {
        var keys = sublist.join(",");
        var uriStub = "/items?itemKey=" + keys;
        ret = await this.callAPI(uriStub);
        ret = JSON.parse(ret.text);
        ret = ret.map(o => o.data);
    } catch (e) {
        handleError(e);
    }
    return ret;
}

Runner.prototype.versionDeltas = function(ret, oldVersions, newVersions) {
    for (var key in oldVersions) {
        if (!newVersions[key]) {
            ret.del.push(key);
        } else if (newVersions[key] > oldVersions[key]) {
            ret.mod.push(key);
        }
    }
    for (var key in newVersions) {
        if (!oldVersions[key]) {
            ret.add.push(key);
        }
    }
    return ret;
}

Runner.prototype.attachmentDelta = async function() {
    var ret = null;
    var keyVersions = null;
    try {
        var uriStub = "/fulltext?since=" + this.oldVersions.library;
        ret = await this.callAPI(uriStub);
        var keyVersions = JSON.parse(ret.text);
    } catch (e) {
        handleError(e);
    }
    return keyVersions;
}

Runner.prototype.getUpdateSpec = function(newVersions) {
    var ret = {
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
    };
    try {
        ret.items = this.versionDeltas(ret.items, this.oldVersions.items, newVersions.items);
        ret.attachments = this.versionDeltas(ret.attachments, this.oldVersions.attachments, newVersions.attachments);
        ret.files = this.attachmentDelta();
    } catch (e) {
        handleError(e);
    }
    return ret;
}

Runner.prototype.extractTag = function(arr, prefix) {
    var ret = 'UNKNOWN';
    try {
        if (prefix.slice(-1) !== ":") {
            throw new Error("Invalid prefix spec: must end in a colon (:)");
        }
        var offset = prefix.length;
        for (var i=arr.length-1;i>-1;i--) {
            var tag = arr[i].tag ? arr[i].tag : arr[i];
            if (tag.slice(0, offset) === prefix) {
                ret = tag.slice(offset); 
            }
            arr = arr.slice(0, i).concat(arr.slice(i+1));
        }
    } catch (e) {
        handleError(e);
    }
    return ret;
}

Runner.prototype.buildSiteItem = function(item) {
    try {
        var itemKey = item.key;
        var itemVersion = item.version;
        this.oldVersions.items[itemKey] = itemVersion;
        delete item.key;
        delete item.version;
        delete item.dateAdded;
        delete item.dateModified;
        var cslItem = zoteroToCsl(item);
        if (this.cfg.dataMode === "CSL-M") {
            cslItem = zoteroToJurism({data:item}, cslItem);
        }
        cslItem.id = itemKey;
        this.style.sys.items = JSON.parse("{\"" + itemKey + "\": " + JSON.stringify(cslItem) + "}");
        this.style.updateItems([itemKey]);
        var country = this.extractTag(item.tags, "cn:")
    } catch (e) {
        handleError(e);
    }
    return {
        key: itemKey,
        citation: this.style.makeCitationCluster([{"id":itemKey}]),
        country: country,
        tags: item.tags,
        cslItem: cslItem
    }
}

Runner.prototype.buildSiteAttachment = function(attachment, fulltext){
    var language = this.extractTag(attachment.tags, "ln:").toLowerCase();
    this.oldVersions.attachments[attachment.key] = attachment.version;
    return {
        key: attachment.key,
        parentKey: attachment.parentItem,
        language: language,
        filename: attachment.filename,
        fulltext: fulltext
    }
}

Runner.prototype.getFulltext = async function(itemKey) {
    var uriStub = "/items/" + itemKey +"/fulltext";
    try {
        res = await this.callAPI(uriStub);
        res = res.text;
        res = JSON.parse(res).content;
    } catch (e) {
        if (e.status == 404) {
            res = false;
        } else {
            handleError(e, itemKey);
        }
    }
    return res;
}

Runner.prototype.doDeletes = async function(updateSpec) {
    try {
        await this.callbacks.attachments.del.call(this.cfg, updateSpec.attachments.del);
        for (var attachmentKey of updateSpec.attachments.del) {
            delete this.oldVersions.attachments[attachmentKey];
        }
        await this.callbacks.items.del.call(this.cfg, updateSpec.items.del);
        for (var itemKey of updateSpec.items.del) {
            delete this.oldVersions.items[itemKey];
        }
    } catch (e) {
        handleError(e);
    }
}

Runner.prototype.doAddUpdateItems = async function(updateSpec) {
    var transactionSize = 50;
    try {
        var addSublists = [];
        while (updateSpec.items.add.length) {
            addSublists.push(updateSpec.items.add.slice(0, transactionSize));
            updateSpec.items.add = updateSpec.items.add.slice(transactionSize);
        }
        for (var sublist of addSublists) {
            var items = await this.getItems(sublist);
            for (var item of items) {
                var siteItem = this.buildSiteItem(item);
                await this.callbacks.items.add.call(this.cfg, siteItem);
            }
        }
        var modSublists = [];
        while (updateSpec.items.mod.length) {
            modSublists.push(updateSpec.items.mod.slice(0, transactionSize));
            updateSpec.items.mod = updateSpec.items.mod.slice(transactionSize);
        }
        for (var sublist of modSublists) {
            var items = await this.getItems(sublist);
            for (var item of items) {
                var siteItem = this.buildSiteItem(item);
                await this.callbacks.items.mod.call(this.cfg, siteItem);
            }
        }
    } catch (e) {
        handleError(e);
    }
}

Runner.prototype.doAddUpdateAttachments = async function(updateSpec) {
    var transactionSize = 25;
    try {
        var addSublists = [];
        while (updateSpec.attachments.add.length) {
            addSublists.push(updateSpec.attachments.add.slice(0, transactionSize));
            updateSpec.attachments.add = updateSpec.attachments.add.slice(transactionSize);
        }
        for (var sublist of addSublists) {
            var attachments = await this.getItems(sublist);
            for (var attachment of attachments) {
                var fulltext = await this.getFulltext(attachment.key);
                if (!fulltext) {
                    // Triggers mod on next update if item still exists
                    this.oldVersions.attachments[attachment.key] = 0;
                }
                var siteAttachment = this.buildSiteAttachment(attachment, fulltext);
                await this.callbacks.attachments.add.call(this.cfg, siteAttachment);
            }
        }
        var modSublists = [];
        while (updateSpec.attachments.mod.length) {
            addSublists.push(updateSpec.attachments.mod.slice(0, transactionSize));
            updateSpec.attachments.mod = updateSpec.attachments.mod.slice(transactionSize);
        }
        for (var sublist of modSublists) {
            var attachments = await this.getItems(sublist);
            for (var attachment of attachments) {
                var fulltext = await this.getFulltext(attachment.key);
                if (!fulltext) {
                    // Triggers mod on next update if item still exists
                    this.oldVersions.attachments[attachment.key] = 0;
                }
                var siteAttachment = await this.buildSiteAttachment(attachment, fulltext);
                await this.callbacks.attachments.mod.call(this.cfg, siteAttachment);
            }
        }
    } catch (e) {
        handleError(e);
    }
}

Runner.prototype.run = async function() {
    try {
        await this.callbacks.init.call(this.cfg);
        var newVersions = await this.callVersions();
        var updateSpec = await this.getUpdateSpec(newVersions);
        
        // Open a DB transaction if required
        await this.callbacks.openTransaction.call(this.cfg);
        
        // Delete things for deletion, beginning with attachments
        await this.doDeletes(updateSpec);
        
        // Works in sets of 50
        await this.doAddUpdateItems(updateSpec);

        // Works in sets of 25
        await this.doAddUpdateAttachments(updateSpec);
        
        if (this.cfg.opts.f) {
            await this.callbacks.files.purge.call(this.cfg, this.oldVersions.attachments);
            for (var key in this.oldVersions.attachments) {
                var attachmentExists = await this.callbacks.files.exists.call(this.cfg, key);
                if (!attachmentExists) {
                    // get file data
                    var response = await this.callAPI("/items/" + key + "/file", true);
                    await this.callbacks.files.add.call(this.cfg, key, response.body);
                }
            }
        }

        // Close a DB transaction if required
        await this.callbacks.closeTransaction.call(this.cfg);

        // Memo current library and item versions
        this.updateVersionCache(newVersions.library);
        console.log("Done!");
    } catch (e) {
        handleError(e);
    }
}

const optParams = {
    alias: {
        i : "init",
        f: "files-update",
        d: "data-dir",
        h: "help"
    },
    string: ["d"],
    boolean: ["f", "h", "i"],
    unknown: option => {
        abort("unknown option \"" +option + "\"");
    }
};

const usage = "Usage: " + path.basename(process.argv[1]) + " [options]\n"
      + "  -i, --init\n"
      + "    Initialize the current directory or --data-dir.\n"
      + "  -f, --files-update\n"
      + "    Update attachment files in addition to data.\n"
      + "  -d, --data-dir <dataDirPath>\n"
      + "    Absolute path to a citeproc-cite-service data directory.\n";

const opts = getopts(process.argv.slice(2), optParams);

if (opts.h) {
    console.log(usage);
    process.exit();
}

function isDir(pth) {
    var s = fs.statSync(opts.d);
    return s.isDirectory();
}
if (opts.d && (!path.isAbsolute(opts.d) || !fs.existsSync(opts.d) || !isDir(opts.d))) {
    abort("when used, option -d must be set to an existing absolute directory path");
}

var runner = new Runner(opts, callbacks);
runner.run();
