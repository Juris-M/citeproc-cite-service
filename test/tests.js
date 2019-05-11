const fs = require("fs");
const path = require("path");
const chai = require("chai");
const chaiHttp = require("chai-http");
const assert = require("chai").assert;
chai.use(chaiHttp);


describe("citeproc-cite-server", function () {

    var server;
    
    before(() => {
        server = require('./../index').server;
    });
    
    after(() => {
        server.close();
    });

    describe('/POST euro-expert', () => {
        it('it should return an Austrian case cite and info', (done) => {
            var zApiItem = JSON.parse(fs.readFileSync(path.join(__dirname, "data", "sample-austria-case-in.json")).toString());
            var citeItem = JSON.parse(fs.readFileSync(path.join(__dirname, "data", "sample-austria-case-out.json")).toString());
            chai.request(server)
                .post('/euro-expert')
                .set('content-type', 'application/json')
                .send(zApiItem)
                .end(function(error, res, body) {
                    if (error) {
                        done(error);
                    } else {
                        assert.equal(res.status, 200);
                        assert.deepEqual(res.body, citeItem);
                        done();
                    }
                });
        });
        
        it('it should return a journal article cite and info', (done) => {
            var zApiItem = JSON.parse(fs.readFileSync(path.join(__dirname, "data", "sample-journal-article-in.json")).toString());
            var citeItem = JSON.parse(fs.readFileSync(path.join(__dirname, "data", "sample-journal-article-out.json")).toString());
            chai.request(server)
                .post('/euro-expert')
                .set('content-type', 'application/json')
                .send(zApiItem)
                .end(function(error, res, body) {
                    if (error) {
                        done(error);
                    } else {
                        assert.equal(res.status, 200);
                        assert.deepEqual(res.body, citeItem);
                        done();
                    }
                });
        });
    });
});
