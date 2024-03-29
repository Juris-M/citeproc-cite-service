# Overview

The `zsyncdown` utility provided by this package builds a set of local
files from which a website containing citable documents can be
maintained. The files are constructed from items and attachments
stored in a Zotero group library maintained by Jurism clients, and
item records include a citation generated using the CSL-M extensions
to Jurism. Juris-M/citeproc-cite-service was developed by Frank Bennett and is a primary output of EURO-EXPERT (n.161814) funded by the European Research Council.

# System Requirements

The package should work on any recent-ish version of NodeJS (it was
written against v8.9.4) and the `npm` package manager.

# Setup

## Installation and updates

The tool can be set up by cloning its GitHub repo, or directly via
NPM.  The commands for updating the tool differ depending on which
installation method is used.

### Installing from the GitHub repo

The following commands can be used to install the tool from a clone of
the GitHub repository:

``` bash
    bash> git clone --recursive https://github.com/Juris-M/citeproc-cite-service.git
    bash> cd citeproc-cite-service
    bash> npm install
    bash> npm link
```

Version updates can be pulled in with the following commands, issued within the repo directory:

``` bash
    bash> git pull
    bash> npm update
```

## Configuring callbacks


For initial testing, copy the file `callbacks-sample.js` to `callbacks.js`:

```bash
    bash> cp callbacks-sample.js callbacks.js
```

For purposes of illustration, the sample ``callbacks-sample.js`` file
contains functions that will write the data necessary to sync local
data with a Zotero library into a file hierarchy. The functions *can
and should* be adapted to apply changes directly to the local data
store that is to be synced.


## Initializing the sync directory

Before use, the utility must be initialized in an empty data directory
with the `--init` option. By default, this is the directory in which
the `zsyncdown` command is executed. To specify a different data
directory, use the `--data-dir` option.
```bash
    bash> zsyncdown --data-dir=/my/data/directory --init
```
or
```bash
    bash> zsyncdown --init
```
Initialization will create a template configuration file `config.json`
in the data directory, with content like this:

```javascript
{
    "dataPath": "/option/data-dir/or/cwd",
    "access": {
        "groupID": false,
        "libraryKey": false
    }
}
```
To complete configuration, set the `groupID` and `libraryKey` in the
configuration file. The `groupID` is the string of numbers in a group
URL on `zotero.org`:
```bash
    https://www.zotero.org/groups/123456/some-group-name
```
The `libraryKey` is a private key created in a Zotero user account with
read permissions on the target group:
```bash
    https://www.zotero.org/settings/keys
```
The completed configuration file will look something like this (the comments in
the header can be ignored, they will be stripped before JSON processing):
```javascript
// Configuration file for citeproc-cite-service
// For details, see README.md or https://www.npmjs.com/package/citeproc-cite-service
{
  "dataPath": "/option/data-dir/or/cwd",
  "access": {
    "groupID": 123456,
    "libraryKey": "aBcDeFg7HiJkLmN8oPqRsTu9"
  }
}

## Syncing

```
Once configuration is complete, running the utility will pull all items and their attachments
from the target Zotero group, reporting API calls to  the console.
``` bash
    > zsyncdown
      Running with node version v18.17.1
      zsyncdown: using data directory /media/storage/src/JM/citeproc-cite-service/tmp
      zsyncdown: opening config file at /media/storage/src/JM/citeproc-cite-service/tmp/config.json
      zsyncdown: Using persistent cache file at /media/storage/src/JM/citeproc-cite-service/tmp/keyCache.json
      syncDown: writing sync update into /media/storage/src/JM/citeproc-cite-service/tmp/updates
      Adding and updating item metadata ...
      citation: Helsingin hovioikeus [HO] 4.2019 (Finland)
      citation: Korkein hallinto-oikeus [KHO] 10.2016 KHO:2016:151 (Finland)
      Adding and updating attachment metadata ...
      Adding and updating attachment files ...
      Done!
    >
```
The Zotero library version and the downloaded item keys and versions are 
recorded in the data directory in a file `keyCache.json`. The contents 
of this file are used to limit API calls on subsequent runs
of the utility to items and attachments that have been added or 
modified since the previous run.  The callback functions in the distributed
`callbacks-sample.js` file will write update information into a
subdirectory `updates`, with the following structure:
```text
updates
    items
        <timestamp>
            deletes.txt
            add
                <key>.json
                ...
            mod
                <key>.json
                ...
        ...
    attachments
        <timestamp>
            deletes.txt
            add
                <key>.json
                ...
            mod
                <key>.json
                ...
        ...
    files
        <key>.pdf
        ...
```

The `items` and `attachments` directories contain the data needed for
the updates generated by each run of the utility:

- **deletes.txt:** This is a newline-delimited list of item keys that
  should be removed from the local data store.
- **add:** The files under this subdirectory contain the details for
  items to be added to the local data store.
- **mod:** The files here contain the details for items that should
  be modified in the local data store.

The `files` directory will be empty after performing the operations
described above. To populate it with all current attachment files,
run the utility with the `-f` option:
```bash
    bash> zsyncdown -f
```
This operation will take some time to complete.

How this data is merged into the local data store will vary depending
on the local environment. The functions in `callbacks.js`
should be modified to perform direct database update operations.

# Data structures

Data files written under the `add` and `mod` subdirectories by the
distributed `callbacks-sample.js` functions are JSON structures that
show the data available for use in updating a local data store.

An update under `items` has the following top-level elements (see the
bottom of this README for example output):

- **key:** The key used to identify the item in the Zotero API.
- **citation:** A formatted citation for the item, in HTML markup.
  If 
- **country:** The ISO country code of the item, derived from a tag
  prefixed with `cn:` (i.e. `cn:PL`).
- **tags:** Any tags associated with the item.
- **cslItem:** The item metadata in CSL-M JSON format.
- **cslJsonItem:** The item metadata in CSL JSON format, with
  CSL-M extended fields encoded as serialized JSON under
  their Jurism field names in the ``note`` field. This
  data is suitable for import into Zotero or Jurism, and
  if imported with the former, will sync correctly to
  a Jurism client.

An update under `attachments` has the following top-level elements
(see the bottom of this README for example output):

- **key:** The key used to identify the attachment item in the Zotero
  API. This key will match the corresponding file in the `files`
  subdirectory.
- **parentKey:** The key of the item with metadata describing this
  attachment item.
- **language:** The language of this attachment text, derived from a tag
  on the *attachment* item with a prefix of `ln:` (i.e. `ln:PL`).
- **filename:** The filename assigned to this attachment in Zotero.
- **fulltext:** The full plain-text content of the attachment
  document (useful for indexing).


# Limitations

- Only two style variants are available (the CSL and
  CSL-M versions of Chicago Fullnote with Bibliography).
- Only PDF attachments are supported. 
- Modifications to attachment files (PDFs) will not be synced down
  if the key of the attachment item does not change.
- Zotero collections and saved searches are ignored.

# Update objects

## Items

Item update objects have six keys:

* `key`: The identifier key assigned to the item by `zotero.org`.
* `citation`: The formatted citation of the item.
* `country`: The ISO country code of the item, uppercased.
  This value is derived from the first element of the colon-delimited jurisdiction
  ID set on `cslItem.jurisdiction`. The value defaults to an empty string.
* `tags`: An array of objects, each with a single key `tag`, and a single value
  that is the name of the tag.
* `relatedItems`: An array of `key` values.
* `cslItem`: An object with keys and values that follow the
  [CSL Specification](http://docs.citationstyles.org/en/1.0.1/specification.html)
  and [CSL-M: extensions to CSL](https://citeproc-js.readthedocs.io/en/latest/csl-m/index.html).
* `cslJsonItem`: An object with keys and values that follow the
  [CSL Specification](http://docs.citationstyles.org/en/1.0.1/specification.html),
  with fields added by [CSL-M: extensions to CSL](https://citeproc-js.readthedocs.io/en/latest/csl-m/index.html) encoded for Zotero compatibility.

The following is a sample item update object for a legal case:

```javascript
{
  "key": "9V3WFNEG",
  "citation": "Helsingin hovioikeus [HO] 4.2019 (Finland)",
  "country": "FI",
  "tags": [
    {
      "tag": "AL:constitutional law"
    },
    {
      "tag": "KW:Discrimination"
    },
    {
      "tag": "KW:Niqab"
    },
    {
      "tag": "KW:Religious symbols"
    },
    {
      "tag": "cn:FI"
    }
  ],
  "relatedItems": [],
  "cslItem": {
    "type": "legal_case",
    "abstract": "The plaintiff ...",
    "authority": "ho",
    "issued": {
      "date-parts": [
        [
          2019,
          4
        ]
      ]
    },
    "language": "fi",
    "note": "",
    "multi": {
      "main": {},
      "_keys": {}
    },
    "call-number": "FI044A",
    "jurisdiction": "fi:helsinki",
    "id": "9V3WFNEG"
  },
  "cslJsonItem": {
    "type": "legal_case",
    "authority": "ho",
    "issued": {
      "date-parts": [
        [
          2019,
          4
        ]
      ]
    },
    "language": "fi",
    "note": "mlzsync1:0067{\"extrafields\":{\"jurisdiction\":\"011fi:helsinkiFinland|FI|Uusimaa\"}}"
  }
}
```
