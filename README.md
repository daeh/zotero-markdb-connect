# Zotero Obsidian Citations

![ZoteroObsidianCitationsScreenshot](https://user-images.githubusercontent.com/12652166/147509331-eee0dad4-8a36-490b-9bb9-f11ca6caa7be.png)

This is an add-on for [Zotero](https://www.zotero.org), a research source management tool. The ZoteroObsidianCitations add-on finds files marked with BibTeX keys in an external folder and adds a colored tag to the corresponding Zotero items.

This is a companion to the [obsidian-citation-plugin](https://github.com/hans/obsidian-citation-plugin), a plugin for [Obsidian](https://obsidian.md) markdown editor, but can work with a variety of databases used to store reading notes outside of Zotero.

Please report any bugs, questions, or feature requests in the Github repository.

Code for this extension is based on [Zotero Citationcounts](https://github.com/eschnett/zotero-citationcounts), which is based on [Zotero DOI Manager](https://github.com/bwiernik/zotero-shortdoi), which is based in part on [Zotero Google Scholar Citations](https://github.com/beloglazov/zotero-scholar-citations) by Anton Beloglazov.

## Plugin Functions

Adds a colored tag to Zotero items for which there are associated reading notes in an external folder. Currently this add-on is primarily a minimal companion to the [obsidian-citation-plugin](https://github.com/hans/obsidian-citation-plugin), but it can be adapted to other workflows.

## Instalation

- Download the add-on (the .xpi file) from the latest release: https://github.com/daeh/zotero-obsidian-citations/releases
- To download the .xpi file, right click it and select 'Save link as'
- Run Zotero (version 5.x)
- Go to `Tools -> Add-ons`
- `Install Add-on From File`
- Choose the file `zotero-obsidian-citations-0.0.1.xpi`
- Restart Zotero

## Setup

If you're already using [obsidian-citation-plugin](https://github.com/hans/obsidian-citation-plugin), you've set up an auto-updating BetterBibTex (BBT) export of your library. You'll now need to make another BBT export that contains both the BBT citekeys and the Zotero item IDs.

- Export your library in the "***BetterBibTex JSON***" format (not "*Better CSL JSON*", which does not include the Zotero IDs).
  - Click `File -> Export library`.
  - Check the "Keep Updated" box in the export options.
  - You can save this JSON anywhere, but it usually makes sense to save it next to the BBT export that `obsidian-citation-plugin` uses.
- In  `ZoteroObsidianCitations Preferences...` (under the `Tools` menu),
  - Specify the location of the "*BetterBibTex JSON*" formatted file you just exported.
  - Specify the location of the folder that contains your `obsidian-citation-plugin` reading notes (e.g. `/Users/me/Documents/ObsVault/ReadingNotes/`).
    - NB this add-on expects that your reading note files begin with `@citekey` (e.g. a reading note might have the file name  `@shepard1987science Toward a universal law of generalization for psychological science.md`, where `shepard1987science` is the BBT citekey).

  - Optionally, you can have ZoteroObsidianCitations read the metadata of your markdown notes and extract the citekey from one of the fields. To enable this, specify the metadata ID (`citekey` is a common value).

- Run the synchronization function from `Tools -> ZoteroObsidianCitations Sync Tags`.
- This will add a tag ( `ObsCite`) to every Zotero item for which there exists a reading note in the external folder you specified.
- In the `Tags` plane of Zotero, right click on the `ObsCite` tag and assign it a color, which will mark the tagged items in the preview plane of Zotero.

## Notes

- [GitHub](https://github.com/daeh/zotero-obsidian-citations): Source code repository
- Will be archived on Zenodo

## License

Distributed under the MIT License.
