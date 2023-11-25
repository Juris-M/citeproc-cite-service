`make-data` CSV→CSL-JSON conversion script
==========================================

Acknowledgement
---------------
Juris-M/citeproc-cite-service was developed by Frank Bennett and is a
primary output of EURO-EXPERT (n.161814) funded by the European
Research Council.

Introduction
------------

In the CultExp project, the citation details of cases of interest from
each target jurisdiction are written into a spreadsheet, and coded to
one or more documents (judgments, expert reports) as
appropriate. Spreadsheets have between ten and seventeen columns from
a standard schema, with standard headings. [1]

Spreadsheets are then processed using the script documented here, to
build a file in a specific format (CSL-JSON) that can be imported into
a Jurism client and synced to the cloud service at `zotero.org`. Data
is then fetched from the Zotero API and published to a front-end
service for public consumption.

Because the spreadsheet data model does not provide a record of the
version level of individual lines or cells, the entire spreadsheet
(typically containing all records for a single jurisdiction) is
treated as a unit for purposes of adding, and for editing, any content
to be published to the front end.

The following are the steps needed to provide new *or modified*
content to the front-end service:

1.  Prepare (or edit) an Excel spreadsheet with the appropriate
    columns, with an entry for each document or case to be added;
2.  Save the file, and also save it in CSV format;
3.  Prepare a set of files named to correspond to CultExp document
    codes and place them in a ``files`` subdirectory immediately
    below the CSV file to be processed;
4.  Use the `make-data` script documented here to generate a CSL JSON
    file (`import-me.json`), making amendments to the two ``court-*``
    configuration files as necessary to avoid runtime errors;
5.  In the Jurism client library, move all items tagged for the jurisdiction to be
    updated to trash;
6.  Empty the Jurism client library trash;
7.  Import the CSL JSON data into the Jurism client library;
8.  Sync the client library to `zotero.org`;
9.  Run the `zsyncdown` script (documented in the top-level README of
    this repository);
10. Perform whatever incantations are used to move retrieved data to the front-end service.

Note that this full set of operations is required for *any* change
to item content.

Installing `node` and `npm`
---------------------------

The `make-data` conversion tool is a `node` script, so `node` must be installed on the system where CULTEXP spreadsheet data is to be processed. `Node` is available for free installation. Use a recent version.

[<https://nodejs.org/en/>](https://nodejs.org/en/)
==================================================

Installing the `make-data` script
---------------------------------

To install the `make-data` script using the command line clone this repository to the target system. Then enter its `cultexp` subdirectory, install the script's dependencies, and link the script to your profile:

``` example
$> git clone https://github.com/Juris-M/citeproc-cite-service.git
$> cd citeproc-cite-service/cultexp
$> npm install
$> npm link
```

Installing the Legal Resource Registry
--------------------------------------

The `make-data` conversion script relies on the Legal Resource Registry (LRR) to obtain court and jurisdiction codes. We will clone the LRR into a sibling directory to `citeproc-cite-service` above:

``` example
$> cd ../..
$> git clone https://github.com/Juris-M/legal-resource-registry.git
```

Setting up a jurisdiction
-------------------------

To process a jurisdiction, create an empty directory and place the spreadsheet in it, saving the case listing in CSV format. Also (important!) copy all of the PDF attachment files for the jurisdiction into a single subdirectory named `files`.

**A note on dates:** When saving from Excel in CSV format, dates should be set to a numeric form, as "YYYY-MM-DD." With other date formats, the `make-data` script will almost certainly throw errors.

Enter the directory and run the command `make-data`:

``` example
$> cd malta
$> ls
data-malta.csv  data-malta.xlsx  files
$> make-data
```

This will throw an error and create a configuration file `make-data-config.json` with the following content:

``` example
{
  "jurisdictionCode": "xx",
  "jurisdictionName": "Laputa",
  "jurisdictionDescPath": "/path/to/legal-resource-registry-repo"
}
```

Edit the configuration file to reflect the target jurisdiction and the absolute path to the `src` subdirectory of the LRR. In this case, we are working on Malta:

``` example
{
  "jurisdictionCode": "mt",
  "jurisdictionName": "Malta",
  "jurisdictionDescPath": "/my/path/to/legal-resource-registry/src"
}
```

Preparing a court map
---------------------

With the configuration file in place, run `make-data` again. The script will issue a string of warnings and generate a file `court-code-map.json`. This file will be read by `make-data` to map court names written into the spreadsheet to their respective court codes, optionally also setting a court division and case type, where that information is expressed in the spreadsheet entries. The file is formatted as a series of lists, ordered as follows:

1.  Court description (from the spreadsheet)
2.  Court code (intially set to the court description)
3.  Court division (optional)
4.  Case type (optional)

Open the relevant jurisdiction file in the LRR for reference (in this case, the file for Malta is `juris-mt-desc.json`). The `courts` section of the file contains the court codes recognized for the jurisdiction.

Edit each entry in `court-code-map.json`, replacing the second element is each list with the appropriate court code. For example...

``` example
  [
    "Qorti Civili Prim Awla",
    "Qorti Civili Prim Awla"
  ]
```

...becomes...

``` example
  [
    "Qorti Civili Prim Awla",
    "qcpa"
  ]
```

Where the court description includes a court division, add a third element to the list. For example...

``` example
  [
    "Qorti Civili (Sezzjoni tal-Familja)",
    "Qorti Civili (Sezzjoni tal-Familja)"
  ]
```

...becomes...

``` example
  [
    "Qorti Civili (Sezzjoni tal-Familja)",
    "qc",
    "Sezzjoni tal-Familja"
  ]
```

Where the court description contains a note of the case type, add that as a fourth element in the list. In this case, if no court division is indicated, set `null` in the third position. This the following example...

``` example
  [
    "Qorti Civili Prim Áwla (Gurisdizzjoni Kostituzzjonali)",
    "Qorti Civili Prim Áwla (Gurisdizzjoni Kostituzzjonali)"
  ]
```

...becomes...

``` example
  [
      "Qorti Civili Prim Áwla (Gurisdizzjoni Kostituzzjonali)",
      "qcpa",
      null,
      "Gurisdizzjoni Kostituzzjonali"
  ]
```

If courts are described in the spreadsheet that cannot be found in the LRR record of the jurisdiction, contact the Jurism data manager (Frank Bennett) to request an extension to the jurisdiction data.

Preparing a court jurisdiction map
----------------------------------

In addition to the `court-code-map.json` file, the `make-data` script generates a file `court-jurisdiction-code.json`. Both files are used by the script to generate the final data for import into Jurism, and court codes set in the latter depend on the (edited) mapping lists in the former. It is therefore necessary to regenerate `court-jurisdiction-map.json` after completing edits to `court-code-map.json`. To regenerate the file, remove it from the directory and rerun `make-data`.

``` example
$> rm court-jurisdiction-map.json
$> make-data
```

The script will again issue warnings, due to mismatches between court codes and their associated jurisdictions. Open the regenerated file to make any necessary edits.

In the case of Malta, there is only one warning, and one entry in `court-jurisdiction-code-map.json`, due to an unrecognized jurisdiction "Gozo":

``` example
{
  "qc::Gozo": {
    "court": "qc",
    "jurisdiction": "Gozo"
  }
}
```

Leaving the `qc:Gozo` key untouched, and referring to the LRR, we enter the correct jurisdiction code for this island of Malta:

``` example
{
  "qc::Gozo": {
    "court": "qc",
    "jurisdiction": "mt:gozo"
  }
}
```

Note that the court code and jurisdiction code must be valid partners: in the LRR, the court code must appear in the `courts` array under the given jurisdiction code. For example:

``` example
"mt:gozo": {
    "name": "Gozo",
    "courts": {
        "qc": {}
    }
}
```

If a valid jurisdiction for the given court cannot be found in the LRR, or if the jurisdiction itself cannot be found there, contact the Jurism data manager (Frank Bennett) to have the necessary changes made to the LRR jurisdiction records.

Uploading data for a jurisdiction
---------------------------------

Once the above steps have been completed, the `make-data` script will run without warnings. It will generate a file `import-me.json`, which is a valid CSL-JSON import object reflecting all of the entries in the spreadsheet.

To upload data for the jurisdiction, import this file into a Jurism client in the usual way, and sync the library to the Zotero servers.

Final preparation
-----------------

Before data for a jurisdiction is pulled to the front end for the first time, check with the Jurism data manager (Frank Bennett) to be sure that the citation format for the target jurisdiction has been defined.

Footnotes
=========

[1] Spreadsheets have the following column headings (those set in *italics* are optional):

|                  |                      |             |
|------------------|----------------------|-------------|
| Doc ID           | *Year as Volume*     | Link        |
| Date             | *Volume*             | Keywords    |
| *Court Division* | *Reporter*           | Area of Law |
| *Case Type*      | *Page*               | Summary     |
| Docket Number    | Expert Presence      | Language    |
| *Case Name*      | Expert Instructed By |             |


