`make-data` CSV→CSL-JSON conversion script
==========================================

Introduction
------------

The workflow for adding records to the CULTEXP database involves three steps for each jurisdiction:

1.  Preparation of a spreadsheet with entries for each document or case to be added to the database;
2.  Generation of a well-structured CSL-JSON file for Jurism/Zotero import based on the spreadsheet entries;
3.  Import of the CSL-JSON data into a Jurism client, and syncing of the data to the `zotero.org` cloud server;
4.  Pulling of data to the CULTEXP front-end server via the `zotero.org` API.

Steps (2) and (3) are explained below. [1]

Installing `node` and `npm`
---------------------------

Installing the `make-data` script
---------------------------------

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

[1] Note with respect to step (1) that the prepared spreadsheet should have the following column headings (those set in *italics* are optional):

|                  |                      |             |
|------------------|----------------------|-------------|
| Doc ID           | *Year as Volume*     | Link        |
| Date             | *Volume*             | Keywords    |
| *Court Division* | *Reporter*           | Area of Law |
| *Case Type*      | *Page*               | Summary     |
| Docket Number    | Expert Presence      | Language    |
| *Case Name*      | Expert Instructed By |             |


