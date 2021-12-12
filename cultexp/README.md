`make-data` CSV→CSL-JSON conversion script
==========================================

Introduction
------------

In the CULTEXP project, the citation details of cases of interest from each target jurisdiction are written into a spreadsheet, and coded to one or more documents (judgments, expert reports) as appropriate. Spreadsheets have between ten and seventeen columns from a standard schema, with standard headings. [1]

Spreadsheets are then processed using the script documented here, to build a file in a specific format (CSL-JSON) that can be imported into a Jurism client and synced to the cloud service at `zotero.org`. Data is then fetched from the Zotero API and published to a front-end service for public consumption.

The workflow for adding records to the CULTEXP database thus involves four steps for each jurisdiction:

1.  Preparation of a spreadsheet with entries for each document or case to be added to the database;
2.  Generation of a well-structured CSL-JSON file for Jurism/Zotero import based on the spreadsheet entries;
3.  Import of the CSL-JSON data into a Jurism client, and syncing of the data to the `zotero.org` cloud server;
4.  Pulling of data to the CULTEXP front-end server via the `zotero.org` API.

Steps (2) and (3) are explained below.

Installing `node` and `npm`
---------------------------

The `make-data` conversion tool is a `node` script, so `node` must be installed on the system where CULTEXP spreadsheet data is to be processed. `Node` is available for free installation:

[<https://nodejs.org/en/>](https://nodejs.org/en/)
==================================================

Installing the `make-data` script
---------------------------------

To install the `make-data` script, using the command line clone this repository to the target system. Then enter its `cultexp` subdirectory, install the script's dependencies, and link the script to your profile:

``` example
$> git clone https://github.com/Juris-M/citeproc-cite-service.git
$> cd citeproc-cite-service/cultexp
$> npm install
$> npm link
```

Setting up a jurisdiction
-------------------------

Preparing a court map
---------------------

Preparing a court-jurisdiction map
----------------------------------

Uploading data for a jurisdiction
---------------------------------

Making changes to jurisdiction data
-----------------------------------

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


