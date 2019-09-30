const fs = require("fs");
const path = require("path");
const CSL = require("citeproc");
const localesPath = require("citeproc-locales");
const modulesPath = require("citeproc-juris-modules");
const getAbbrevs = require("citeproc-abbrevs").getAbbrevs;

var Sys = function(config){
    this.config = config;
    this.abbrevs = { "default": new CSL.AbbreviationSegments() };
    this.items = {};
};

Sys.prototype.retrieveItem = function(id){
    // We can play it this way if we use synchronous file reads
    var item = this.items[id];
    if (item.jurisdiction) {
        var countryID = item.jurisdiction.replace(/:.*$/, "");
        if (!this.abbrevs[countryID]) {
            this.abbrevs = Object.assign(this.abbrevs, getAbbrevs("auto-" + countryID));
        }
    }
    return this.items[id];
};

Sys.prototype.retrieveLocale = function(lang){
    var ret = null;
    try {
        ret = fs.readFileSync(path.join(localesPath, "locales-"+lang+".xml")).toString();
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
        ret = fs.readFileSync(path.join(modulesPath, "juris-" + id + ".csl")).toString();
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

module.exports = {
    Sys: Sys
}
