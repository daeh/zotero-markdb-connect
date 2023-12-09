[![GitHub release (latest by date)](https://img.shields.io/github/v/release/daeh/zotero-markdb-connect?style=for-the-badge)](https://github.com/daeh/zotero-markdb-connect/releases/latest) ![GitHub all releases](https://img.shields.io/github/downloads/daeh/zotero-markdb-connect/total?style=for-the-badge)

# MarkDB-Connect (Zotero Markdown DataBase Connect)

- **_Scans your Markdown database and adds a colored tag to associated Zotero items._**
- **_Jump to Markdown notes from the contextual menu of Zotero items._**
- **_Supports various Markdown databases, including [Obsidian](https://obsidian.md), [logseq](https://logseq.com), and [Zettlr](https://www.zettlr.com)_**

![MarkDBConnectScreenshot](MarkDBConnectScreenshot.png)

This is a plugin for [Zotero](https://www.zotero.org), a research source management tool. The _MarkDB-Connect_ plugin searches a user-defined folder for markdown files that include a [Better BibTeX](https://retorque.re/zotero-better-bibtex/) citekey or Zotero-Item-Key, and adds a colored tag to the corresponding Zotero items.

This plugin was initially designed with the [Obsidian](https://obsidian.md) markdown editor in mind, and was inspired by the [obsidian-citation-plugin](https://github.com/hans/obsidian-citation-plugin) workflow. It offers preliminary support for [logseq](https://logseq.com) and [Zettlr](https://www.zettlr.com). It can be adapted to other databases that store markdown files outside of Zotero, and to other workflows that generate markdown reading notes linked to Zotero items (such as Zotero's `Export Note` feature).

Please post any bugs, questions, or feature requests in the Github repository.

## Plugin Functions

Adds a colored tag to Zotero items for which there are associated reading notes in an external folder.

Supports multiple markdown files for a single Zotero item.

Opens an existing markdown note in [Obsidian](https://obsidian.md), [logseq](https://logseq.com), or the system's default markdown note editor (e.g. [Zettlr](https://www.zettlr.com), [Typora](https://typora.io)) from the contextual menu of a Zotero item.

## Instalation

- Download the plugin (the .xpi file) from the latest release: https://github.com/daeh/zotero-markdb-connect/releases
- To download the .xpi file, right click it and select 'Save link as'
- Open Zotero (version 6.x)
- Go to `Tools -> Add-ons`
- `Install Add-on From File`
- Choose the file `MarkDBConnect-0.0.25.xpi`
- Restart Zotero

## Setup

A markdown file can specify which Zotero item it's linked to using either a [Better BibTeX](https://retorque.re/zotero-better-bibtex/) citekey or a Zotero-Item-Key. I recommend using Better BibTeX citekeys when possible.

1. Using **Better BibTeX citekeys** to link markdown files to Zotero items.

   - This is recommended if you created the markdown notes with [obsidian-citation-plugin](https://github.com/hans/obsidian-citation-plugin), [BibNotes Formatter](https://github.com/stefanopagliari/bibnotes), or [Obsidian Zotero Integration](https://github.com/mgmeyers/obsidian-zotero-integration).

   - The BetterBibTeX citekey needs to appear in the filename or the metadata of the markdown note.

   - FYI There's a nice [configuration tutorial](https://publish.obsidian.md/history-notes/Option+-+Link+from+a+Zotero+item+back+to+related+notes+in+Obsidian) detailing a common use case (thanks to Prof. Elena Razlogova).

2. Using **Zotero Item Keys** to link markdown files to Zotero items.

   - This is recommended if you created the markdown notes with the `Export Note` feature of Zotero.
   - The markdown note contents should include the Zotero-Item-Key in a consistent format.

NOTE: multiple markdown files can point to the same Zotero item. But a given markdown file should only be linked to a single Zotero item. A markdown reading note can reference multiple Zotero items throughout the file, but _MarkDB-Connect_ will only link the markdown note to one BetterBibTeX-citekey / Zotero-Item-Key.

---

### Option 1: Using BetterBibTeX citekeys

_MarkDB-Connect_ can extract the BetterBibTeX citekey that specifies which Zotero Item a markdown note corresponds to. The BetterBibTeX citekey can be taken from the markdown filename or [yaml metadata](https://help.obsidian.md/Advanced+topics/YAML+front+matter).

- In `MarkDBConnect Preferences...` (under the `Tools` menu),

  - Specify the location of the folder that contains your markdown reading notes (e.g. `/Users/me/Documents/ObsVault/ReadingNotes/`). The _MarkDB-Connect_ plugin will recursively search this path for markdown files.

  - Select the `Match notes based on BetterBibTeX citekey` option.

  - Specify how the plugin should identify the desired markdown reading notes and extract the BetterBibTeX citekeys.

    - By default, _MarkDB-Connect_ expects that the filenames of your markdown reading note files begin with `@mycitekey` but can include extra information after it (e.g. a reading note with the BetterBibTeX citekey `shepard1987science` could have the filename `@shepard1987science.md` or `@shepard1987science Toward a universal law of generalization for psychological science.md`).

    - If your reading notes use a different filenaming convention, you can specify a RegEx pattern to match the files.

      - You can include a capturing group in this RegEx pattern to extract the BetterBibTeX citekey from the filename.

  - Optionally, _MarkDB-Connect_ can extract the citekey from the metadata (aka front matter) of your markdown notes. To enable this, specify the metadata ID (`citekey` is a common value).

    - This is necessary if the filenames do not contain the citekeys, or if citekeys in the filenames are incorrect, which can happen if citekeys include special characters. (E.g. if citekeys contain `:`, they will probably need to be taken from the yaml metadata rather than the filenames.)
    - For info on metadata syntax, see [YAML front matter](https://help.obsidian.md/Advanced+topics/YAML+front+matter).

- Run the synchronization function from `Tools -> MarkDBConnect Sync Tags`.

  - This will add a tag (`ObsCite`) to every Zotero item for which there exists a reading note in the external folder you specified.

- In the `Tags` plane of Zotero, right-click on the `ObsCite` tag and assign it a color, which will mark the tagged items in the preview plane of Zotero. (In the screenshot above, Zotero items associated with reading notes are marked with a blue tag.)

---

### Option 2: Using Zotero Item Keys

_MarkDB-Connect_ can extract the Zotero-Item-Key that specifies which Zotero Item a markdown note corresponds to. The Zotero-Item-Key is taken from the markdown file contents using a custom RegEx pattern.

Zotero automatically generates Item Keys, they take the form of `ABCD1234`, as in `zotero://select/library/items/ABCD1234`. NB this is not the same as the BetterBibTeX citekey you assigned an item (e.g. `mycitekey` in `zotero://select/items/@mycitekey`).

- In `MarkDBConnect Preferences...` (under the `Tools` menu),

  - Specify the location of the folder that contains your markdown reading notes (e.g. `/Users/me/Documents/ObsVault/ReadingNotes/`). The _MarkDB-Connect_ plugin will recursively search this path for markdown files.

    - The default behavior is to search for markdown files beginning with `@`.

    - Alternatively, you can specify a RegEx pattern to match your reading note files.

  - Select the `Match notes based on Zotero-Item-Key` option.

  - Specify a RegEx pattern to extract the Zotero-Item-Key from the markdown contents.

    E.g. if your note has the line

    `- local:: [local zotero](zotero://select/library/items/GZ9DQ2AM)`

    you could extract the Zotero key (`GZ9DQ2AM`) using this RegEx pattern:

    `^- local::.+\/items\/(\w+)\)`

- Run the synchronization function from `Tools -> MarkDBConnect Sync Tags`.

  - This will add a tag (`ObsCite`) to every Zotero item for which there exists a reading note in the external folder you specified.

- In the `Tags` plane of Zotero, right-click on the `ObsCite` tag and assign it a color, which will mark the tagged items in the preview plane of Zotero. (In the screenshot above, Zotero items associated with reading notes are marked with a blue tag.)

---

## Example Markdown Note

In this example markdown note (`@saxe2017emobtom.md`), the _MarkDB-Connect_ will use the [yaml metadata](https://help.obsidian.md/Advanced+topics/YAML+front+matter) keyword `citekey` to find the BetterBibTeX citekey (`saxe2017emobtom`) that determines which Zotero item to associate with the markdown file. Notice that the markdown file can include other BetterBibTeX citekeys and Zotero-Item-Keys, which are ignored by the plugin.

```markdown
---
citekey: saxe2017emobtom
zoterouri: zotero://select/library/items/IACZMXU4
bbturi: zotero://select/items/@saxe2017emobtom
doi: 10.1016/j.copsyc.2017.04.019
---

# Formalizing emotion concepts within a Bayesian model of theory of mind

The body of notes can include references to other Zotero items. The _MarkDB-Connect_ plugin
will only link this file to one Zotero item.

Here are links to other papers.

This one uses [a Zotero URI](zotero://select/library/items/4RJ97IFL)

This one uses [a BetterBibTeX URI](zotero://select/items/@anzellotti2021opaque)

This one uses an Obsidian wiki link: [[@cusimano2018cogsci]]
```

## Related Projects

- [obsidian-citation-plugin](https://github.com/hans/obsidian-citation-plugin) by hans
  - Obsidian plugin that integrates your Zotero database with Obsidian.
- [BibNotes Formatter](https://github.com/stefanopagliari/bibnotes) by stefanopagliari
  - Obsidian plugin to facilitate exporting annotations from Zotero into Obsidian.
- [Obsidian Zotero Integration](https://github.com/mgmeyers/obsidian-zotero-integration) by mgmeyers
  - Obsidian plugin to facilitate exporting annotations from Zotero into Obsidian.
- [Zotero 6 'Export Notes' feature](https://forums.zotero.org/discussion/93521/available-for-beta-testing-markdown-export-of-notes/p1) by Zotero
  - Zotero 6 beta feature to export notes and annotations from Zotero items as markdown files.
- [Zotero-mdnotes](https://argentinaos.com/zotero-mdnotes/) by argenos
  - Zotero plugin to export metadata and notes from Zotero items as markdown files.
- [Zotero to Markdown](https://github.com/e-alizadeh/Zotero2md) by e-alizadeh
  - Python library to export annotations and notes from Zotero items as markdown files.
- [Zotero Better Notes](https://github.com/windingwind/zotero-better-notes) by windingwind
  - A Zotero plugin for note management.
- [Logseq Citations Plugin](https://github.com/sawhney17/logseq-citation-manager) by sawhney17
  - Logseq plugin that integrates your Zotero database with Logseq.

## Notes

[GitHub](https://github.com/daeh/zotero-markdb-connect): Source code repository

Code for this extension is based on [ZotFile](https://github.com/jlegewie/zotfile) and [Zotero Citationcounts](https://github.com/eschnett/zotero-citationcounts) (which is based on [Zotero DOI Manager](https://github.com/bwiernik/zotero-shortdoi), which is based in part on [Zotero Google Scholar Citations](https://github.com/beloglazov/zotero-scholar-citations)).

## License

Distributed under the MIT License.

## Author

[![Personal Website](https://img.shields.io/badge/personal%20website-daeh.info-orange?style=for-the-badge)](https://daeh.info) [![Mastodon](https://img.shields.io/badge/mastodon-@dae@mastodon.online-purple?style=for-the-badge&logo=mastodon)](https://mastodon.online/@dae) [![Twitter](https://img.shields.io/badge/twitter-@DaeHoulihan-blue?style=for-the-badge&logo=twitter)](https://twitter.com/DaeHoulihan)
