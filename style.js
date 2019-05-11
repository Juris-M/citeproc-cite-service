const fs = require("fs");
const path = require("path");
const CSL = require("citeproc");
const Sys = require("./sys").Sys;

var sys = new Sys();
var styleXml = fs.readFileSync(path.join(__dirname, "jm-chicago-fullnote-bibliography.csl")).toString();

var style = new CSL.Engine(sys, styleXml);
style.setSuppressTrailingPunctuation(true);

module.exports = {
    style: style
}
