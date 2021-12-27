# Zotero Obsidian Citations

![ZoteroObsidianCitationsScreenshot](https://user-images.githubusercontent.com/12652166/147509331-eee0dad4-8a36-490b-9bb9-f11ca6caa7be.png)

- [GitHub](https://github.com/daeh/zotero-obsidian-citations): Source
  code repository
- Will be archived on Zenodo

This is an add-on for [Zotero](https://www.zotero.org), a research
source management tool. The add-on can auto-fetch citation counts for
journal articles using various APIs, including

This is a companion to the [obsidian-citation-plugin](https://github.com/hans/obsidian-citation-plugin) that tags Zotero items for which you have made external notes.

Please report any bugs, questions, or feature requests in the Github repository.

Code for this extension is based on [Zotero Citationcounts](https://github.com/eschnett/zotero-citationcounts), which is based on [Zotero DOI
Manager](https://github.com/bwiernik/zotero-shortdoi), which is based
in part on [Zotero Google Scholar
Citations](https://github.com/beloglazov/zotero-scholar-citations) by
Anton Beloglazov.

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

If you're already using [obsidian-citation-plugin](https://github.com/hans/obsidian-citation-plugin), you've set up an auto-updating BetterBibTex explort of your library. You'll now need to make another BBT export that link the BBT citekeys to Zotero's item IDs.
- Export your library in the "BetterBibTex JSON" format (not "Better CSL JSON", which does not include the Zotero IDs). 
  - Check the "Keep Updated" box in the export options.
  - You can save this JSON anywhere, but it usually makes sense to save it next to the one that the BBT export that `obsidian-citation-plugin` uses.

- Under the `Tools` menu, open `ZoteroObsidianCitations Preferences...`
- Specify the location of the new "BetterBibTex JSON" file.
- Specify the location of the folder that contains your `obsidian-citation-plugin` reading notes.
  - NB this plugin expects that these notes begin with `@citekey` where `citekey` is the BBT citekey.

- Optionally, you can have this plugin read the metadata of your markdown notes and extract the citekey from one of the fields. To enable this, specify the metadata ID (`citekey` is a common value).
- Run the synchronization function from `Tools` > `ZoteroObsidianCitations Sync Tags`.
- This will add a `ObsCite` tag to every Zotero item for which there exists a markdown reading note in the Obsidian Vault folder you specify.
- In the `Tags` plane of Zotero, right click on the `ObsCite` tag and assign it a color, which will mark the tagged items in the preview plane of Zotero.


## License

Distributed under the Mozilla Public License (MPL) Version 2.0.
