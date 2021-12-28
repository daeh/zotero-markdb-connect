# Zotero Obsidian Citations

![ZoteroObsidianCitationsScreenshot](https://user-images.githubusercontent.com/12652166/147509331-eee0dad4-8a36-490b-9bb9-f11ca6caa7be.png)



This is an add-on for [Zotero](https://www.zotero.org), a research source management tool. The add-on finds files marked with citekeys in an external folder and adds a colored tag to the corresponding Zotero items.

This is a companion to the [obsidian-citation-plugin](https://github.com/hans/obsidian-citation-plugin), a plugin for [Obsidian](https://obsidian.md) markdown editor, but can work with a variety of databases used to store reading notes outside of Zotero.

Please report any bugs, questions, or feature requests in the Github repository.

Code for this extension is based on [Zotero Citationcounts](https://github.com/eschnett/zotero-citationcounts), which is based on [Zotero DOI Manager](https://github.com/bwiernik/zotero-shortdoi), which is based in part on [Zotero Google Scholar Citations](https://github.com/beloglazov/zotero-scholar-citations) by Anton Beloglazov.

## Plugin Functions

Find reading notes in your Obsidian Vault and add a colored tag (`ObsCite`) to the corresponding Zotero items.

## Instalation

- Download the add-on (the .xpi file) from the latest release: https://github.com/daeh/zotero-obsidian-citations/releases
- To download the .xpi file, right click it and select 'Save link as'
- Run Zotero (version 5.x)
- Go to `Tools -> Add-ons`
- `Install Add-on From File`
- Choose the file `zotero-obscite-0.1.xpi`
- Restart Zotero

## Setup

If you're already using [obsidian-citation-plugin](https://github.com/hans/obsidian-citation-plugin), you've set up an auto-updating BetterBibTex (BBT) export of your library. You'll now need to make another BBT export that contains both the BBT citekeys and the Zotero item IDs.
- Export your library in the "BetterBibTex JSON" format (not "Better CSL JSON", which does not include the Zotero IDs). 
  - Click `File -> Export library`.
  - Check the "Keep Updated" box in the export options.
  - You can save this JSON anywhere, but it usually makes sense to save it next export that `obsidian-citation-plugin` uses.
  
- Under the `Tools` menu, open `ZoteroObsidianCitations Preferences...`
- Specify the location of the "BetterBibTex JSON" file you just exported.
- Specify the location of the folder that contains your `obsidian-citation-plugin` reading notes (e.g. `/Users/me/Documents/ObsVault/ReadingNotes/`).
  - NB this add-on expects that your reading notes files begin with `@citekey` (where `citekey` is the BBT citekey; e.g. `@shepard1987science Toward a universal law of generalization for psychological science.md`).
- Optionally, you can have this plugin read the metadata of your markdown notes and extract the citekey from one of the fields. To enable this, specify the metadata ID (`citekey` is a common value).
- Run the synchronization function from `Tools -> ZoteroObsidianCitations Sync Tags`.
- This will add a `ObsCite` tag to every Zotero item for which there exists a reading note in the Obsidian Vault folder you specify.
- In the `Tags` plane of Zotero, right click on the `ObsCite` tag and assign it a color, which will mark the tagged items in the preview plane of Zotero.



## Notes

- [GitHub](https://github.com/daeh/zotero-obsidian-citations): Source code repository
- Will be archived on Zenodo

## License

Distributed under the Mozilla Public License (MPL) Version 2.0.
