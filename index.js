#!/usr/bin/env node

const restify = require('restify');
const zoteroToCsl = require('zotero-to-csl');
const zoteroToJurism = require('zotero2jurismcsl').convert;
const style = require('./style').style;

var server = restify.createServer({
    name: "citeservice"
});

server.use(restify.plugins.bodyParser({
    maxBodySize: 0,
    mapParams: false,
    mapFiles: false,
    overrideParams: false,
    keepExtensions: false,
    multiples: true,
    hash: 'sha1',
    rejectUnknown: true,
    requestBodyOnGet: false,
    reviver: undefined
}));

server.post(
    '/euro-expert',
    function(req, res, next) {
        if (req.body && req.body.data) {
            try {
                delete req.body.data.key;
                delete req.body.data.version;
                delete req.body.data.dateAdded;
                delete req.body.data.dateModified;
                var cslItem = zoteroToCsl(req.body.data);
                req.cItem = zoteroToJurism(req.body, cslItem);
                req.cItem.id = "ITEM-1";
                style.sys.items = {
                    "ITEM-1": req.cItem
                }
                style.updateItems(["ITEM-1"]);
                req.retObj = {
                    key: req.body.key,
                    cite: style.makeCitationCluster([{"id":"ITEM-1"}]),
                    tags: req.body.data.tags,
                    url: req.body.links.self.href
                }
            } catch (err) {
                console.log(err);
            }
        }
        return next();
    },
    function(req, res, next) {
        res.send(req.retObj);
        return next();
    }
);

server.listen(5195, function() {
  console.log('%s listening at %s', server.name, server.url);
});

function stop() {
  server.close();
}

module.exports = {
    server: server
}
