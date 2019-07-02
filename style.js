const fs = require("fs");
const path = require("path");
const CSL = require("citeproc");
const Sys = require("./sys").Sys;

function getStyle(cfg) {
    var sys = new Sys();
    var styleXml = fs.readFileSync(path.join(cfg.dataPath, cfg.styleName)).toString();
    
    var style = new CSL.Engine(sys, styleXml);
    style.setSuppressTrailingPunctuation(true);
    return style;
}

module.exports = {
    getStyle: getStyle
}
