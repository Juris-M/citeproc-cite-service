var fs = require("fs");
var path = require("path");

// Functions here are called with <func>.call(cfg, arg, arg ...)

var callbacks = {
    init: async function(){
        // Create file structure for demo
        var baseDir = this.dataPath;
        var syncResultsDir = "updates";
        var now = new Date();
        var timestamp = now.toISOString().replace(/\..*/, "").replace(/:/g, "-");
        this.dirs = {};
        this.dirs.topDir = path.join(baseDir, syncResultsDir);
        console.log("syncDown: writing sync update into " + this.dirs.topDir);
        this.dirs.itemsTopDir = path.join(this.dirs.topDir, "items");
        this.dirs.itemsDir = path.join(this.dirs.itemsTopDir, timestamp);
        this.dirs.itemsAdd = path.join(this.dirs.itemsDir, "add");
        this.dirs.itemsMod = path.join(this.dirs.itemsDir, "mod");
        
        this.dirs.attachmentsTopDir = path.join(this.dirs.topDir, "attachments");
        this.dirs.attachmentsDir = path.join(this.dirs.attachmentsTopDir, timestamp);
        this.dirs.attachmentsAdd = path.join(this.dirs.attachmentsDir, "add");
        this.dirs.attachmentsMod = path.join(this.dirs.attachmentsDir, "mod");
        this.dirs.files = path.join(this.dirs.topDir, "files");
        for (var dir in this.dirs) {
            if (!fs.existsSync(this.dirs[dir])) {
                fs.mkdirSync(this.dirs[dir], {recursive: true});
            }
        }
    },
    openTransaction: async function(){
        // A noop in the demo, use this to open a database transaction if
        // performing direct updates to a DB.
    },
    closeTransaction: async function(){
        // A noop in the demo, use this to close the database transaction if
        // performing direct updates to a DB.
    },
    items: {
        del: async function(keys){
            fs.writeFileSync(path.join(this.dirs.itemsDir, "deletes.txt"), keys.join("\n"))
        },
        add: async function(siteItem){
            fs.writeFileSync(path.join(this.dirs.itemsAdd, siteItem.key + ".json"), JSON.stringify(siteItem, null, 2));
        },
        mod: async function(siteItem){
            fs.writeFileSync(path.join(this.dirs.itemsMod, siteItem.key + ".json"), JSON.stringify(siteItem, null, 2));
        }
    },
    attachments: {
        del: async function(keys){
            fs.writeFileSync(path.join(this.dirs.attachmentsDir, "deletes.txt"), keys.join("\n"));
        },
        add: async function(siteAttachment){
            fs.writeFileSync(path.join(this.dirs.attachmentsAdd, siteAttachment.key + ".json"), JSON.stringify(siteAttachment, null, 2));
        },
        mod: async function(siteAttachment){
            fs.writeFileSync(path.join(this.dirs.attachmentsMod, siteAttachment.key + ".json"), JSON.stringify(siteAttachment, null, 2));
        }
    },
    files: {
        purge: async function(attachmentsDel){
            for (var fn of fs.readdirSync(this.dirs.files)) {
                var key = fn.slice(0,8);
                if (attachmentsDel.indexOf(key) > -1) {
                    var filePath = path.join(this.dirs.files, fn);
                    if (fs.existsSync(filePath)) {
                        fs.unlinkSync(filePath);
                    };
                }
            }
        },
        add: async function(key){
            // true as second argument expects attachment file content
            var response = await this.callAPI("/items/" + key + "/file", true);
	        var info = await this.getRealBufferAndExt(response.body);
            var filePath = path.join(this.cfg.dirs.files, `${key}.${info.fileInfo.ext}`)
            fs.writeFileSync(filePath, info.buf);
        }
    }
}

module.exports = {
    callbacks: callbacks
}
