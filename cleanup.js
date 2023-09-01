#!/usr/bin/env node

/*
 * Checks the files subdirectory of a citeproc-cite-service
 * updates directory for cruft files with ".undefined" as
 * a file extension (written into the directory due to a bug),
 * removing all such files, and removing their key from keyCache.json
 * if they do not match an existing PDF file.
 */

const fs = require("fs");
const path = require("path");

const fileDir = (fn) => {
    var base = "./updates/files"
    if (fn) {
        base = path.join(base, fn);
    }
    return base;
}

var fileList = fs.readdirSync(fileDir());
var keysToRemove = {};
var unlinkCount = 0;

for (var fn of fileList) {
    var key = fn.slice(0, 8);
    if (fn.slice(-10) === ".undefined") {
        if (!fs.existsSync(fileDir(`${key}.pdf`))) {
            keysToRemove[key] = true;
        }
        fs.unlinkSync(fileDir(fn));
        unlinkCount++;
    }
}

var keyCache = JSON.parse(fs.readFileSync("./keyCache.json"));

var keyList = Object.keys(keyCache.attachments);
for (var i=keyList.length-1; i>-1; i--) {
    var key = keyList[i];
    if (keysToRemove[key]) {
        delete keyCache.attachments[key];
    }
}

fs.writeFileSync("./keyCache.json", JSON.stringify(keyCache, null, 2));

console.log(`Deleted ${unlinkCount} files`);
console.log(`Removed ${Object.keys(keysToRemove).length} keys from keyCache`);
