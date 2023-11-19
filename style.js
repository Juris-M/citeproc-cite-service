const fs = require("fs");
const path = require("path");
const CSL = require("citeproc");
const Sys = require("./sys").Sys;

function getStyle(cfg) {
    var sys = new Sys();
    var stylePath = path.join(path.dirname(require.main.filename), cfg.styleName);
    var styleXml = fs.readFileSync(stylePath).toString();
    
    var style = new CSL.Engine(sys, styleXml);
    style.setSuppressTrailingPunctuation(true);
    return style;
}

module.exports = {
    getStyle: getStyle
}
