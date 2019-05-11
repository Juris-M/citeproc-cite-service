# Overview

Items in Zotero libraries are stored as fine-grained metadata
following a well defined schema, and can be retrieved via the Zotero
API. Jurism extends the Zotero schema with additional fields and
multilingual variants that are not directly compatible with the Zotero
schema. These additional fields are specially encoded, and crammed
into the Extra (aka note) field when Jurism syncs items to the Zotero
servers. In order to make use of the extended fields in Jurism items
retrieved from the Zotero API, they must be unpacked. This tool serves
that purpose.

# System Requirements

`citeproc-cite-service` should run on any recent-ish version of NodeJS
(it was written against v8.9.4) and the `npm` package manager. Mocha
is required to run the tests.

Information on retrieving item data, with links to implementations in
various languages, is available in the [Zotero Web API v3
documentation](https://www.zotero.org/support/dev/web_api/v3/start).
Note that an API key is required to access private groups and
libraries.

# Setup

Install globally with the usual `npm` incantation:
``` bash
    bash> npm i -g citeproc-cite-service
```

Run the server from the command line as `citeservice`:
``` bash
    bash> citeservice
    citeservice listening at http://[::]:5195
```

Interact with the service from any local application via the 5195
port, sending it individual raw Zotero API items as `application/json`
in a POST call:
```bash
    curl --data @sample.json \
      -H "Content-Type: application/json"\
      http://localhost:8080/euro-expert \
      | jq .
```

With the Austrian case data used for testing, this returns the following:
```bash
  % Total    % Received % Xferd  Average Speed   Time    Time     Time  Current
                                 Dload  Upload   Total   Spent    Left  Speed
100  1971  100   146  100  1825   2273  28417 --:--:-- --:--:-- --:--:-- 28515
{
  "key": "K9KDF6PK",
  "cite": "OGH 1.12.2004, 13Os127/04",
  "tags": [
    {
      "tag": "Criminal law"
    }
  ],
  "url": "https://api.zotero.org/groups/2318535/items/K9KDF6PK"
}
```

# Configuration


By default, the server listens for connections on port 5195. [1]

By default, the style applied is JM Chicago Fullnote with
Bibliography, from the Jurism project.

By default, abbreviations of the EURO-EXPERT project (supporting basic case
cites from 15 European jurisdictions) are applied when rendering citations.

----------------------

[1] In Japanese numbers, "itsutsu-ichi-ku-itsutsu", or
*itsu-iku-itsu?* for short ("when do we go, when do we go?").
