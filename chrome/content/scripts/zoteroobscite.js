/**
ZoteroObsidianCitations
Dae Houlihan
*/

Components.utils.import('resource://gre/modules/osfile.jsm');
Components.utils.import('resource://gre/modules/Services.jsm');

// Startup -- load Zotero and constants
if (typeof Zotero === 'undefined') {
    Zotero = {};
}

Zotero.ObsCite = {
    version: '0.0.5',
    folderSep: null,
    // this.messages_warning = [];
    // this.messages_report = [];
    // this.messages_error = [];
    // this.messages_fatalError = [];
    // this.notifierID = null;

    _initialized: false,


    getVersion: function () {
        return this.version;
    },

    init: async function () {
        await Zotero.Schema.schemaUpdatePromise;

        // only do this stuff for the first run
        if (!this._initialized) {

            setTimeout(() => {
                if (!['bbtjson', 'contentregex'].includes(this.getPref('zotidssource'))) {
                    this.setPref('zotidssource', 'bbtjson');
                }
            }, 2000);

            // run in future to not burden start-up
            this.futureRun(function () {
                // determine folder seperator depending on OS
                this.folderSep = Zotero.isWin ? '\\' : '/';

                setTimeout(() => {
                    this.startupDependencyCheck();
                }, 2000);

            }.bind(this));
        }

        this._initialized = true;
    },

    getPref: function (pref) {
        return Zotero.Prefs.get('extensions.obscite.' + pref, true);
    },

    setPref: function (pref, value) {
        Zotero.Prefs.set('extensions.obscite.' + pref, value, true);
    },

    futureRun: function (fn) {
        let tm = Components.classes["@mozilla.org/thread-manager;1"].getService(Components.interfaces.nsIThreadManager);
        tm.mainThread.dispatch({
            run: function () {
                fn();
            }
        }, Components.interfaces.nsIThread.DISPATCH_NORMAL);
    },

    showNotification: function (header, body, success) {
        const icon = success ? "chrome://zotero/skin/tick.png" : "chrome://zotero/skin/cross.png";
        let progressWindowMulti = new Zotero.ProgressWindow({
            closeOnClick: true
        });
        progressWindowMulti.changeHeadline(header);

        progressWindowMulti.progress = new progressWindowMulti.ItemProgress(icon, body);

        progressWindowMulti.show();
        progressWindowMulti.startCloseTimer(8000);
    },

    chooseDirectory: async function (title) {
        let FilePicker = require('zotero/filePicker').default;
        let wm = Services.wm;
        let win = wm.getMostRecentWindow('navigator:browser');
        let ps = Services.prompt;
        let fp = new FilePicker();
        fp.init(win, title, fp.modeGetFolder);
        fp.appendFilters(fp.filterAll);
        if (await fp.show() != fp.returnOK) return '';
        return fp.file;
    },

    chooseFile: async function (title, filters) {
        let FilePicker = require('zotero/filePicker').default;
        let wm = Services.wm;
        let win = wm.getMostRecentWindow('navigator:browser');
        let ps = Services.prompt;
        let fp = new FilePicker();
        fp.init(win, title, fp.modeOpen);
        for (const [label, ext] of (filters || [])) {
            fp.appendFilter(label, ext);
        }
        if (await fp.show() != fp.returnOK) return '';
        return fp.file;
    },

    chooseFileDest: async function (title, suggestion) {
        let FilePicker = require('zotero/filePicker').default;
        let wm = Services.wm;
        let win = wm.getMostRecentWindow('navigator:browser');
        let ps = Services.prompt;
        let fp = new FilePicker();
        fp.init(win, title, fp.modeSave);
        if (suggestion) fp.defaultString = suggestion;
        if (await fp.show() != fp.returnOK) return '';
        return fp.file;
    },

    chooseVaultFolder: async function () {
        const dialogTitle = 'Select Obsidian Vault Folder containing citation notes begining with @';
        const vaultpath = await this.chooseDirectory(dialogTitle);
        const vaultpathObj = new FileUtils.File(OS.Path.normalize(vaultpath));
        if (vaultpath != '' && vaultpath != undefined && vaultpath != null && vaultpathObj.exists() && vaultpathObj.isDirectory()) {
            this.setPref('source_dir', vaultpath);
        }
    },

    chooseBBTjson: async function () {
        const dialogTitle = 'Select BBT JSON auto-updating library export';
        const filter = [
            ['JSON File (*.json)', '*.json']
        ];
        const bbtjson = await this.chooseFile(dialogTitle, filter);
        const bbtjsonObj = new FileUtils.File(OS.Path.normalize(bbtjson));
        if (bbtjson != '' && bbtjson != undefined && bbtjson != null && bbtjsonObj.exists() && bbtjsonObj.isFile()) {
            this.setPref('bbtjson', bbtjson);
        }
    },

    promptSaveErrors: function (dialogTitle, message) {
        const ps = Services.prompt;
        let buttonFlags = (ps.BUTTON_POS_0) * (ps.BUTTON_TITLE_IS_STRING) + ps.BUTTON_POS_0_DEFAULT +
            (ps.BUTTON_POS_1) * (ps.BUTTON_TITLE_IS_STRING);
        let index = ps.confirmEx(
            null, // parent
            dialogTitle, // dialogTitle
            message, // message
            buttonFlags,
            "Save",
            "Don't Save", null, null, {}
        );
        return index;
    },

    writeToFile: async function (data, dialogTitle, filenamesuggest) {
        const filepath = await this.chooseFileDest(dialogTitle, filenamesuggest);
        if (filepath) await Zotero.File.putContentsAsync(filepath, data);
    },

    offerToSaveErrors: async function (data, warningTitle, warningMessage, saveDialogTitle, filenamesuggest) {
        const saveResp = this.promptSaveErrors(warningTitle, warningMessage);
        if (saveResp === 0) {
            await this.writeToFile(data, saveDialogTitle, filenamesuggest);
        }
    },

    ///////////////

    findTaggedItems: async function () {
        let s = new Zotero.Search();
        s.libraryID = Zotero.Libraries.userLibraryID;
        s.addCondition('tag', 'is', 'ObsCite');
        let itemIDs = await s.search();
        let items_preexisting = await Zotero.Items.getAsync(itemIDs);
        return items_preexisting;
    },

    removeAllTags: async function () {
        let items_preexisting = await this.findTaggedItems();
        /// remove tag
        items_preexisting.forEach(item => {
            item.removeTag('ObsCite');
            item.saveTx();
        });
        return true;
    },

    ///////////////

    /*
     * Utility functions
     */


    listDirContents: async function (dirpath) {
        let entries = [];
        await Zotero.File.iterateDirectory(dirpath, async function (entry) {
            if (!entry.name.startsWith('.')) {
                entries.push(entry);
            }
        });
        return entries;
    },

    listFilesRecursively: async function* (dirpath) {
        const entries = await this.listDirContents(dirpath);
        for (let entry of entries) {
            if (entry.isDir) {
                yield* this.listFilesRecursively(entry.path);
            } else if (!entry.isSymLink) {
                yield entry;
            }
        }
    },

    getFilesRecursively: async function (dirpath) {
        let files = [];

        const basedir = new FileUtils.File(OS.Path.normalize(dirpath));
        // let nsIFile = Components.classes["@mozilla.org/file/local;1"].createInstance(Components.interfaces.nsIFile);
        // nsIFile.persistentDescriptor = "/Users/dae/Downloads/bootstrap-stat-master/pytest.ini";
        // nsIFile.path

        if (!basedir.exists() || !basedir.isDirectory()) {
            Zotero.debug(`${basedir} does not exist or is file`);
            return files;
        }

        for await (const filepath of this.listFilesRecursively(basedir.path)) {
            files.push(filepath);
        }
        return files;
    },

    ///////////////

    scanVault: async function () {
        let dbs = [];
        let dbserrs = [];

        const vaultpath = this._getParam_vaultpath();
        const metadatakeyword = this._getParam_metadatakeyword();

        /// pattern to match MD files
        const re_file = new RegExp("^@.+\.md$", 'i');
        /// pattern to match citekey in MD file name
        const re_title = new RegExp("^@([^\\s]+)");
        /// pattern to match citekey in MD file metadata
        const re_metadata = new RegExp("^" + metadatakeyword + "\: *([^s].+)", 'm');


        // const vaultpathObj = new FileUtils.File(OS.Path.normalize(vaultpath));
        // if (!vaultpathObj.exists() || !vaultpathObj.isDirectory()) {
        //     Zotero.debug(`${vaultpath} does not exist or is file`);
        //     return dbs;
        // }

        const allFiles = await this.getFilesRecursively(vaultpath);
        const mdFiles = allFiles.filter(file => re_file.test(file.name));

        await Zotero.Promise.all(mdFiles.map(async (entry) => {
            const name = entry.name.split('.').slice(0, -1).join('.');
            const path = entry.path;

            try {

                if (metadatakeyword.length > 0) {
                    /// get citekey from metadata
                    try {
                        const contents = await Zotero.File.getContentsAsync(path);
                        /// get metadata
                        const metadata = contents.split('\n---')[0];
                        if (metadata.startsWith('---')) {
                            /// get citekey from metadata
                            dbs.push(metadata.match(re_metadata)[1].trim());
                        } else {
                            /// get citekey from filename
                            dbs.push(name.match(re_title)[1].trim());
                        }
                    } catch (err) {
                        /// get citekey from filename
                        dbs.push(name.match(re_title)[1].trim());
                    }
                } else {
                    /// get citekey from filename
                    dbs.push(name.match(re_title)[1].trim());
                }

            } catch (err) {
                dbserrs.push(name);
            }

        }));

        if (dbserrs.length > 0) {
            const nerr = dbserrs.length;
            Zotero.debug(`${nerr} Read ObsVault Read Errors`);
            this.showNotification("scanValut", "Error: " + nerr.toString() + ".", false);
        }
        return dbs;
    },


    scanVaultCustomRegex: async function () {
        let dbs = {};
        let dbserrs = [];

        const vaultpath = this._getParam_vaultpath();
        const zotkeyregex = this._getParam_metadatakeyword();
        const metadatakeyword = this._getParam_zotkeyregex();

        /// pattern to match MD files
        const re_file = new RegExp("^@.+\.md$", 'i');
        /// pattern to match citekey in MD file name
        const re_title = new RegExp("^@([^\\s]+)");
        /// pattern to match citekey in MD file metadata
        const re_metadata = new RegExp("^" + metadatakeyword + "\: *([^s].+)", 'm');
        /// pattern to match ZoteroKey in MD file contents
        const re_contents = new RegExp(zotkeyregex, 'm');

        // const vaultpathObj = new FileUtils.File(OS.Path.normalize(vaultpath));
        // if (!vaultpathObj.exists() || !vaultpathObj.isDirectory()) {
        //     Zotero.debug(`${vaultpath} does not exist or is file`);
        //     return dbs;
        // }

        const allFiles = await this.getFilesRecursively(vaultpath);
        const mdFiles = allFiles.filter(file => re_file.test(file.name));

        await Zotero.Promise.all(mdFiles.map(async (entry) => {
            const name = entry.name.split('.').slice(0, -1).join('.');
            const path = entry.path;

            try {
                const contents = await Zotero.File.getContentsAsync(path);

                /// find the ZoteroKey from the contents
                const zotkey = contents.match(re_contents)[1].trim();

                /// find the citekey from the metadata
                if (metadatakeyword.length > 0) {
                    /// get citekey from metadata
                    try {
                        /// get metadata
                        const metadata = contents.split('\n---')[0];
                        if (metadata.startsWith('---')) {
                            /// get citekey from metadata
                            dbs[metadata.match(re_metadata)[1].trim()] = zotkey;
                        } else {
                            /// get citekey from filename
                            dbs[name.match(re_title)[1].trim()] = zotkey;
                        }
                    } catch (err) {
                        /// get citekey from filename
                        dbs[name.match(re_title)[1].trim()] = zotkey;
                    }
                } else {
                    /// get citekey from filename
                    dbs[name.match(re_title)[1].trim()] = zotkey;
                }

            } catch (err) {
                dbserrs.push(name);
            }

        }));

        if (dbserrs.length > 0) {
            const nerr = dbserrs.length;
            Zotero.debug(`${nerr} Read ObsVault Read Errors`);
            this.showNotification("scanValut", "Error: " + nerr.toString() + ".", false);
        }
        return dbs;
    },


    mapCitekeysBBTJSON: async function () {
        let citekeymap = {};
        let citekeymaperr = {};

        // const bbtjsonObj = new FileUtils.File(OS.Path.normalize(bbtjson));
        // if (!bbtjsonObj.exists() || !bbtjsonObj.isFile()) {
        //     Zotero.debug(`${bbtjson} does not exist or is dir`);
        //     return citekeymap;
        // }

        const bbtjson = this._getParam_bbtjson();

        const contents = JSON.parse(await Zotero.File.getContentsAsync(bbtjson));
        const items = contents.items;
        items.forEach(item => {
            try {
                const citekey = item.citekey;
                const citationKey = item.citationKey;
                const itemID = item.itemID;
                const itemKey = item.itemKey;
                citekeymap[citekey] = itemID;
            } catch (err) {
                citekeymaperr.push(item);
            }
        });

        if (citekeymaperr.length > 0) {
            const nerr = citekeymaperr.length;
            Zotero.debug(`${nerr} Read ObsVault Read Errors`);
            Zotero.debug(`${citekeymaperr[0]}`);
            this.showNotification("mapCitekeysBBTJSON", "Error: " + nerr.toString() + ".", false);
        }
        return citekeymap;
    },


    mapZoteroIDkeysInternalSearch: async function () {

        let keymap = {};
        let keymaperr = {};

        /// get all items in library
        let s = new Zotero.Search();
        s.libraryID = Zotero.Libraries.userLibraryID;
        s.addCondition('deleted', 'false');
        let itemIDs = await s.search();
        let items = await Zotero.Items.getAsync(itemIDs);

        items.forEach(item => {
            try {
                keymap[item.key] = item.id;
            } catch (err) {
                keymaperr.push(item);
            }
        });

        if (keymaperr.length > 0) {
            const nerr = keymaperr.length;
            Zotero.debug(`${nerr} mapZoteroIDkeysInternalSearch Errors`);
            Zotero.debug(`${keymaperr[0]}`);
            this.showNotification("mapZoteroIDkeysInternalSearch", "Error: " + nerr.toString() + ".", false);
        }
        return keymap;
    },


    sliceObj: async function (obj, keys, promptSaveErrors) {
        let values = [];
        let valueerr = [];

        keys.forEach(key => {
            if (key in obj) {
                values.push(obj[key]);
            } else {
                valueerr.push(key);
            }
        });

        if (valueerr.length > 0) {
            const nerr = valueerr.length;
            Zotero.debug(`${nerr} ObsVault Read Errors`);
            Zotero.debug(`${valueerr[0]}`);

            if (promptSaveErrors) {
                const dataErrors = "sliceObj Errors (" + nerr.toString() + "):\n\n" + valueerr.join("\n") + "\n\n";
                const warningTitle = "Umatched citekeys";
                const warningMessage = "There were " + nerr.toString() + " citekeys in your Obsidian Vault that could not be matched to items in your Zotero library. \n\nWould you like to save the names of these citekeys in a text file? \n\n(Matches for " + values.length.toString() + " citekeys were found successfully.)";
                const saveDialogTitle = "Save ZoteroObsidianCitations Errors To...";
                const filenamesuggest = 'ZoteroObsidianCitations-missing-entries.txt';
                await this.offerToSaveErrors(dataErrors, warningTitle, warningMessage, saveDialogTitle, filenamesuggest);
            } else {
                this.showNotification("ZoteroObsidianCitations", "sliceObj Error: " + nerr.toString() + ".", false);
            }
        }
        return values;
    },

    sliceObjCustomRegex: async function (zoterokeymap, citekeysZotidsObs, promptSaveErrors) {
        /// zoterokeymap :: dict of zoteroKeys to zoteroIDs
        /// citekeysZotidsObs :: dict of citekeys to zoteroKeys

        let zotids = [];
        let zotidserr = [];

        for (const [citekey, zotkey] of Object.entries(citekeysZotidsObs)) {
            if (zotkey in zoterokeymap) {
                zotids.push(zoterokeymap[zotkey]);
            } else {
                zotidserr.push(citekey + "\t" + zotkey);
            }
        }

        if (zotidserr.length > 0) {
            const nerr = zotidserr.length;
            Zotero.debug(`${nerr} ObsVault Read Errors`);
            Zotero.debug(`${zotidserr[0]}`);

            if (promptSaveErrors) {
                const dataErrors = "sliceObjCustomRegex Errors (" + nerr.toString() + "):\n\ncitekey\tzoterokey\n\n" + zotidserr.join("\n") + "\n\n";
                const warningTitle = "Umatched citekeys";
                const warningMessage = "There were " + nerr.toString() + " citekeys in your Obsidian Vault that could not be matched to items in your Zotero library. \n\nWould you like to save the names of these citekeys in a text file? \n\n(Matches for " + zotids.length.toString() + " citekeys were found successfully.)";
                const saveDialogTitle = "Save ZoteroObsidianCitations Errors To...";
                const filenamesuggest = 'ZoteroObsidianCitations-missing-entries.txt';
                await this.offerToSaveErrors(dataErrors, warningTitle, warningMessage, saveDialogTitle, filenamesuggest);
            } else {
                this.showNotification("ZoteroObsidianCitations", "sliceObjCustomRegex Error: " + nerr.toString() + ".", false);
            }
        }
        return zotids;
    },

    /////////


    updateItems: async function (citekeyids) {
        let success = false;

        /// find all item already tagged
        let items_withtags = await this.findTaggedItems();

        /// find all items that should be tagged
        let items_withnotes = await Zotero.Items.getAsync(citekeyids);

        /// find items to be tagged
        let items_totag = items_withnotes.filter(x => !items_withtags.includes(x));

        /// find items that should not be tagged
        let items_removetag = items_withtags.filter(x => !items_withnotes.includes(x));

        /// find items that cannot be located in library
        const nitems_notlocatable = citekeyids.length - items_withnotes.length;
        if (citekeyids.length != items_withnotes.length) {
            this.showNotification("BBT JSON mismatch", "" + nitems_notlocatable.toString() + " IDs in the BBT JSON could not be matched to items in the library", false);
        }

        /// remove tag from items that should not be tagged
        items_removetag.forEach(item => {
            item.removeTag('ObsCite');
            item.saveTx();
        });

        ///DEBUG this doesn't run successfully as soon as zotero is started, needs to wait for something to load
        /// add tag to items that should be tagged
        items_totag.forEach(item => {
            item.addTag('ObsCite');
            item.saveTx();
        });
        ///TODO set color :: https://github.com/zotero/zotero/blob/52932b6eb03f72b5fb5591ba52d8e0f4c2ef825f/chrome/content/zotero/tagColorChooser.js

        let message = "Found " + items_withnotes.length.toString() + " notes.";
        if (nitems_notlocatable != 0) {
            message += " " + nitems_notlocatable.toString() + " IDs could not be matched to items in the library.";
        }
        if (items_totag.length > 0) {
            message += " Added " + items_totag.length.toString() + " tags.";
        }
        if (items_removetag.length > 0) {
            message += " Removed " + items_removetag.length.toString() + " tags.";
        }

        success = true;
        return message;
    },

    checkMetadataFormat: function () {
        const metadatakeyword = this.getPref('metadatakeyword');
        if (typeof metadatakeyword === 'string' && metadatakeyword.length > 0) {
            let found = [];
            const notallowed = ["'", '"', ":", "\n", "/", "\\", "?", "*", "|", ">", "<", ",", ";", "=", "`", "~", "!", "#", "$", "%", "^", "&", "(", ")", "[", "]", "{", "}", " "];
            notallowed.forEach(char => {
                if (metadatakeyword.includes(char)) {
                    found.push(char);
                }
            });
            if (found.length > 0) {
                this.showNotification("Invalid citekey metadata", "metadata id cannot contain: " + found.join(" or ") + ".", false);
                return false;
            } else {
                return true;
            }
        } else {
            return true;
        }
    },

    _getParam_zotidssource: function () {
        const zotidssource = this.getPref('zotidssource');
        if (['bbtjson', 'contentregex'].includes(zotidssource)) {
            return zotidssource;
        } else {
            this.setPref('zotidssource', 'bbtjson');
            return 'bbtjson';
        }
    },

    _getParam_vaultpath: function () {
        try {
            const vaultpath = this.getPref('source_dir');
            const vaultpathObj = new FileUtils.File(OS.Path.normalize(vaultpath));
            if (typeof vaultpath === 'string' && vaultpath.length > 0 && vaultpathObj.exists() && vaultpathObj.isDirectory()) {
                return vaultpathObj.path;
            } else {
                throw new Error("vaultpath is not set or does not exist.");
            }
        } catch (e) {
            this.showNotification("Obsidian Vault Path Not Found", "Set the path to your Obsidian Citations Notes in the ZotObsCite preferences.", false);
            Zotero.debug(`ObsVault Error: ${e}`);
            return null;
        }
    },

    _getParam_bbtjson: function () {
        try {
            const bbtjson = this.getPref('bbtjson');
            const bbtjsonObj = new FileUtils.File(OS.Path.normalize(bbtjson));
            if (typeof bbtjson === 'string' && bbtjson.length > 0 && bbtjsonObj.exists() && bbtjsonObj.isFile()) {
                return bbtjsonObj.path;
            } else {
                throw new Error("bbtjson is not set or does not exist.");
            }
        } catch (e) {
            this.showNotification("BBT JSON Library Export Not Found", "Set the path to your auto-updating BBT JSON export in the ZotObsCite preferences.", false);
            Zotero.debug(`ObsVault Error: ${e}`);
            return null;
        }
    },

    _getParam_zotkeyregex: function () {
        try {
            const zotkeyregex = this.getPref('zotkeyregex');
            if (typeof zotkeyregex === 'string' || zotkeyregex.length > 0) {
                new RegExp(zotkeyregex);
                return zotkeyregex;
            } else {
                throw new Error("bbtjson is not set or does not exist.");
            }
        } catch (e) {
            this.showNotification("User Defined RegEx Invalid", "The RegEx you specifed in the ZoteroObsidianCitations preferences is invalid: " + e, false);
            Zotero.debug(`ObsVault Error: ${e}`);
            return null;
        }
    },

    _getParam_metadatakeyword: function () {
        const metadatakeyword = this.getPref('metadatakeyword');
        if (typeof metadatakeyword === 'string' && metadatakeyword.length > 0) {
            if (this.checkMetadataFormat()) {
                return metadatakeyword;
            } else {
                return null;
                /// checkMetadataFormat() will show a notification
            }
        } else {
            this.setPref('metadatakeyword', '');
            return '';
        }
    },

    getParam: async function () {

        let param;
        const zotidssource = this._getParam_zotidssource();

        if (zotidssource === 'bbtjson') {
            param = {
                zotidssource: zotidssource,
                vaultpath: this._getParam_vaultpath(),
                bbtjson: this._getParam_bbtjson(),
                // zotkeyregex: null,
                metadatakeyword: this._getParam_metadatakeyword(),
                satisfied: false,
            };
        } else if (zotidssource === 'contentregex') {
            param = {
                zotidssource: zotidssource,
                vaultpath: this._getParam_vaultpath(),
                // bbtjson: null,
                zotkeyregex: this._getParam_zotkeyregex(),
                metadatakeyword: this._getParam_metadatakeyword(),
                satisfied: false,
            };
        } else {
            this.showNotification("ZoteroObsidianCitations", 'Zotero IDs Source Not Specified: ' + param.zotidssource, false);
            return {
                satisfied: false
            };
        }
        if (!Object.values(param).includes(null)) {
            param.satisfied = true;
        }
        return param;
    },


    processDependencies: async function (promptSaveErrors) {

        const zotidssource = this._getParam_zotidssource();

        if (zotidssource === 'bbtjson') {
            /// if using BBT JSON ///

            /// get cite keys from Obsidian vault ///
            const citekeysObs = await this.scanVault();
            if (citekeysObs.length === 0) {
                this.showNotification("No citekeys found in Obsidian Vault", "Set the path to your Obsidian Citations Notes in the ZotObsCite preferences.", false);
                return [];
            }

            /// read in BBT json that maps citekeys to Zotero ids ///
            const citekeymap = await this.mapCitekeysBBTJSON(); /// returns dict of citekeys to zoteroIDs
            if (Object.keys(citekeymap).length === 0) {
                this.showNotification("BBT JSON Library Export Not Found", "Set the path to your auto-updating BBT JSON export in the ZotObsCite preferences.", false);
                return [];
            }

            /// slice with obs keys
            const citekeyids = await this.sliceObj(citekeymap, citekeysObs, promptSaveErrors);
            if (citekeyids.length === 0) {
                this.showNotification("No Matching Entries", "None of the ObsCite citekeys match entries in the BBT JSON", false);
                return [];
            }
            return citekeyids;

        } else if (zotidssource === 'contentregex') {
            /// if using user-defined regex ///

            const citekeysZotidsObs = await this.scanVaultCustomRegex(); /// returns dict of citekeys to zoteroKeys
            if (Object.keys(citekeysZotidsObs).length == 0) {
                this.showNotification("No citekeys found in Obsidian Vault", "Check the path to your Obsidian Vault and your RegEx.", false);
                return [];
            }
            const zoterokeymap = await this.mapZoteroIDkeysInternalSearch(); /// returns dict of zoteroKeys to zoteroIDs
            const citekeyidsCustomRegex = await this.sliceObjCustomRegex(zoterokeymap, citekeysZotidsObs, promptSaveErrors);
            if (citekeyidsCustomRegex.length === 0) {
                this.showNotification("No Matching Entries", "None of the ObsCite citekeys match entries in the BBT JSON", false);
                return [];
            }
            return citekeyidsCustomRegex;

        } else {
            this.showNotification("ZoteroObsidianCitations", 'Zotero IDs Source Not Specified (' + zotidssource + ').', false);
            return [];
        }
    },

    runSyncWithObsidian: async function (promptSaveErrors, syncTags) {

        let notifData = ["ZoteroObsidianCitations Syncing Error", "Some Error Occurred", false];
        let param = await this.getParam();
        if (param.satisfied) {
            const citekeyids = await this.processDependencies(promptSaveErrors);
            if (syncTags && citekeyids.length > 0) {
                let message = await this.updateItems(citekeyids);
                notifData = ["ZoteroObsidianCitations Synced", message, true];
            } else {
                let message = "Found " + citekeyids.length.toString() + " notes.";
                notifData = ["ZoteroObsidianCitations Synced", message, true];
            }
        }
        return notifData;
    },

    ////////////

    startupDependencyCheck: async function () {
        const promptSaveErrors = false;
        const syncTags = true; // syncOnStart
        const notifData = await this.runSyncWithObsidian(promptSaveErrors, syncTags);
        this.showNotification(...notifData);
    },

    //// Controls for Tools menu

    syncWithObsidian: async function () {
        const promptSaveErrors = true;
        const syncTags = true;
        const notifData = await this.runSyncWithObsidian(promptSaveErrors, syncTags);
        this.showNotification(...notifData);
    },

    openPreferenceWindow: function (paneID, action) {
        let io = {
            pane: paneID,
            action: action
        };
        window.openDialog(
            'chrome://zoteroobscite/content/options.xul',
            'obscite-pref',
            'chrome,titlebar,toolbar,centerscreen' + Zotero.Prefs.get('browser.preferences.instantApply', true) ? 'dialog=no' : 'modal',
            io
        );
    },

};


if (typeof window !== 'undefined') {
    window.addEventListener('load', e => {
        Zotero.ObsCite.init();
    }, false);
}