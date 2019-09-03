# Overview

The `zsyncdown` utility provided by this package builds a set of local
files from which a website containing citable documents can be
maintained. The files are constructed from items and attachments
stored in a Zotero group library maintained by Jurism clients, and
item records include a citation generated using the CSL-M extensions
to Jurism.

# System Requirements

The package should work on any recent-ish version of NodeJS (it was
written against v8.9.4) and the `npm` package manager.

# Setup

## Installation and updates

The tool can be set up by cloning its GitHub repo, or directly via
NPM.  The commands for updating the tool differ depending on which
installation method is used.

### Installing from NPM

To install directly from NPM, use the following command:

``` bash
    bash> npm install --global citeproc-cite-service
```

In this case, the tool can be updated with the following
command:

``` bash
    bash> npm update citeproc-cite-service
```

### Installing from the GitHub repo

The following commands can be used to install the tool from a clone of
the GitHub repository:

``` bash
    bash> git clone https://github.com/Juris-M/citeproc-cite-service.git
    bash> cd citeproc-cite-service
    bash> npm install
    bash> npm link
```

If tool is installed in this way, version updates can be pulled in with
the following commands, issued within the repo directory:

``` bash
    bash> git pull
    bash> npm update
```

## Configuring callbacks


For initial testing, copy the file `callbacks-sample.js` to `callbacks.js`:

```bash
    bash> cp callbacks-sample.js callbacks.js
```

The sample callbacks file contains functions that will write synced data
into a file hierarchy. The functions can be adapted, for example to
write sync updates directly into a local database.


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
    "dataMode": "CSL-M",
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
  "dataMode": "CSL-M",
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
    bash> zsyncdown
    zsyncdown: using data directory /option/data-dir/or/cwd
    zsyncdown: opening config file at /option/data-dir/or/cwd/config.json
    zsyncdown: Using persistent cache file at /option/data-dir/or/cwd/keyCache.json
    syncDown: writing sync update into /option/data-dir/or/cwd/tmp/updates
    + CALL https://api.zotero.org/groups/123456/items/top?itemType=-note&format=versions
    + CALL https://api.zotero.org/groups/123456/items?itemType=attachment&format=versions
    + CALL https://api.zotero.org/groups/123456/fulltext?since=0
    + CALL https://api.zotero.org/groups/123456/items?itemKey=PHRY5VHZ,7D9KFCZU,Y4LHY5LW,JH29MAW8
    + CALL https://api.zotero.org/groups/123456/items?itemKey=E88RYTR6,Q7WIUBSI,ZP96EPPB,AJW7NHLQ
    + CALL https://api.zotero.org/groups/123456/items/E88RYTR6/fulltext
    + CALL https://api.zotero.org/groups/123456/items/Q7WIUBSI/fulltext
    + CALL https://api.zotero.org/groups/123456/items/ZP96EPPB/fulltext
    + CALL https://api.zotero.org/groups/123456/items/AJW7NHLQ/fulltext
    Done!
```
The Zotero library version and the downloaded item keys and versions
are recorded in the data directory in a file `keyCache.json`. The
contents of this file are used to limit API calls on subsequent runs
of the utility.  The callback functions in the distributed
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
on the local environment. If desired, the functions in `callbacks.js`
can be modified to perform direct database update operations.

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
- **cslItem:** The item metadata in CSL JSON format. If the `dataMode`
  is set to `CSL-M` in `config.json` (the default), the data will
  include multilingual and extended fields. If set to `CSL`, any
  such fields will remain encoded in the `note` field.

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

# Update object examples

## Items

The following is a sample item update object for a legal case:

```javascript
{
  "key": "JH29MAW8",
  "citation": "Uzasadnienie, SR dla Warszawy-Mokotowa w Warszawie, October 19, 2016, III K 1053/14",
  "country": "PL",
  "tags": [
    {
      "tag": "Criminal"
    }
  ],
  "cslItem": {
    "type": "legal_case",
    "abstract": "Description of content",
    "authority": "sr",
    "number": "III K 1053/14",
    "issued": {
      "date-parts": [
        [
          2016,
          10,
          19
        ]
      ]
    },
    "language": "pl",
    "note": "",
    "multi": {
      "main": {},
      "_keys": {}
    },
    "call-number": "PL351",
    "jurisdiction": "pl:warsaw:warsaw:mokotow",
    "genre": "Uzasadnienie",
    "id": "JH29MAW8"
  }
}
```

## Attachments

The following is a sample update object for an attachment to the sample item above:

```javascript
{
  "key": "AJW7NHLQ",
  "parentKey": "JH29MAW8",
  "language": "pl",
  "filename": "PL351.pdf",
  "fulltext": "III K 1053/14 - uzasadnienie Sąd Rejonowy ... Polityka cookiesIndeksyKanały RSS\n\n"
}
```
