/**
ZoteroObsidianCitations
Dae Houlihan
*/

Components.utils.import('resource://gre/modules/osfile.jsm');
Components.utils.import('resource://gre/modules/Services.jsm');
Components.utils.import("resource://gre/modules/FileUtils.jsm");

// Startup -- load Zotero and constants
if (typeof Zotero === 'undefined') {
    Zotero = {};
}

Zotero.ObsCite = {
    version: '0.0.11',
    folderSep: null,
    cleanrun: true,
    suppressNotifications: false,
    debuglog: {},
    data: {},
    dataKeys: [],
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
        ///TODO display waiting for schema message https://github.com/retorquere/zotero-better-bibtex/blob/26a48f6a85705eeb18f31d87269d34906b1d1a94/test/fixtures/schema-logger/bootstrapped/bootstrap.js
        await Zotero.Schema.schemaUpdatePromise;

        // only do this stuff for the first run
        if (!this._initialized) {

            setTimeout(() => {
                if (!['bbtcitekey', 'zotitemkey'].includes(this.getPref('matchstrategy'))) {
                    this.setPref('matchstrategy', 'bbtcitekey');
                }
            }, 1000);

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

    _getParam_matchstrategy: function () {
        const matchstrategy = this.getPref('matchstrategy');
        if (['bbtcitekey', 'zotitemkey'].includes(matchstrategy)) {
            return matchstrategy;
        } else {
            this.setPref('matchstrategy', 'bbtcitekey');
            return 'bbtcitekey';
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

    // _getParam_bbtjson: function () {
    //     try {
    //         const bbtjson = this.getPref('bbtjson');
    //         const bbtjsonObj = new FileUtils.File(OS.Path.normalize(bbtjson));
    //         if (typeof bbtjson === 'string' && bbtjson.length > 0 && bbtjsonObj.exists() && bbtjsonObj.isFile()) {
    //             return bbtjsonObj.path;
    //         } else {
    //             throw new Error("bbtjson is not set or does not exist.");
    //         }
    //     } catch (e) {
    //         this.showNotification("BBT JSON Library Export Not Found", "Set the path to your auto-updating BBT JSON export in the ZotObsCite preferences.", false);
    //         Zotero.debug(`ObsVault Error: ${e}`);
    //         return null;
    //     }
    // },

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

    checkSettings: async function () {

        const matchstrategy = this._getParam_matchstrategy();
        if (matchstrategy == null) return false;
        if (this._getParam_vaultpath() == null) return false;

        if (matchstrategy === 'bbtcitekey') {
            const bbtactive = await this._checkBBTinstalled();
            if (!bbtactive) return false;
            if (this._getParam_metadatakeyword() == null) return false;
        } else if (matchstrategy === 'zotitemkey') {
            const zotkeyregex = this._getParam_zotkeyregex();
            if (zotkeyregex == null || !zotkeyregex || zotkeyregex.length === 0) return false;
        } else {
            this.showNotification("ZoteroObsidianCitations", 'Zotero IDs Source Not Specified: ' + matchstrategy, false);
            return false;
        }

        return true;
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


    /*
     * Zotero utility functions
     */

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

    findPinnedCitekeyItems: async function () {
        let s = new Zotero.Search();
        s.libraryID = Zotero.Libraries.userLibraryID;
        s.addCondition('extra', 'contains', 'Citation Key:');
        let itemIDs = await s.search();
        let items_preexisting = await Zotero.Items.getAsync(itemIDs);
        return items_preexisting;
    },

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

    /*
     * Data processing functions
     */

    scanVault: async function (promptSaveErrors) {
        let res = [];
        let reserrs = [];

        const vaultpath = this._getParam_vaultpath();
        const metadatakeyword = this._getParam_metadatakeyword();

        /// pattern to match MD files
        const re_file = new RegExp("^@.+\.md$", 'i');
        /// pattern to trim extension from filename
        const re_suffix = /\.md$/i;

        const allFiles = await this.getFilesRecursively(vaultpath);
        const mdFiles = allFiles.filter(file => re_file.test(file.name));

        await Zotero.Promise.all(mdFiles.map(async (entry) => {
            // const name = entry.name.split('.').slice(0, -1).join('.');
            const name = entry.name.replace(re_suffix, '');
            const path = entry.path;
            let entry_res = {
                citekey: null,
                citekey_metadata: null,
                citekey_title: null,
                zotkeys: [],
                zotids: [],
                name: name,
                path: path
            };

            /// get citekey from filename
            try {
                /// pattern to match citekey in MD file name
                const re_title = new RegExp(/^@([^\s]+)/);
                entry_res.citekey_title = name.match(re_title)[1].trim();
            } catch (e) {
                Zotero.debug("Error in scanVault: " + e);
            }

            /// get citekey from metadata
            try {
                if (metadatakeyword.length > 0) {
                    /// pattern to match citekey in MD file metadata
                    const re_metadata = new RegExp("^" + metadatakeyword + "\: *([^s].+)", 'm');
                    const contents = await Zotero.File.getContentsAsync(path);
                    /// get metadata
                    const contentSections = contents.split('\n---');
                    const metadata = contentSections[0];
                    if (contentSections.length > 1 && metadata.startsWith('---')) {
                        entry_res.citekey_metadata = metadata.match(re_metadata)[1].trim();
                    }
                }
            } catch (e) {
                Zotero.debug("Error in scanVault: " + e);
            }

            entry_res.citekey = entry_res.citekey_metadata || entry_res.citekey_title;
            if (entry_res.citekey == null) {
                reserrs.push(entry_res);
            }
            res.push(entry_res);
        }));

        if (reserrs.length > 0) {
            this.cleanrun = false;
            const nerr = reserrs.length;
            Zotero.debug(`${nerr} Read ObsVault Read Errors`);

            if (promptSaveErrors) {
                const dataErrors = JSON.stringify(reserrs, null, 1);
                const warningTitle = "Markdown Import Error";
                const warningMessage = "There were " + nerr.toString() + " Markdown notes that could note be parsed. \n\nWould you like to save these errors to a json file? \n\n(There were " + (res.length - reserrs.length).toString() + " notes parsed successfully.)";
                const saveDialogTitle = "Save ZoteroObsidianCitations Errors To...";
                const filenamesuggest = 'ZoteroObsidianCitations-md-parsing-errors.json';
                await this.offerToSaveErrors(dataErrors, warningTitle, warningMessage, saveDialogTitle, filenamesuggest);
            } else {
                this.showNotification("scanVault", "Unable to parse " + nerr.toString() + " of " + mdFiles.length.toString() + " notes.", false);
            }
        }
        return res;
    },


    scanVaultCustomRegex: async function (promptSaveErrors) {
        let res = [];
        let reserrs = [];

        const vaultpath = this._getParam_vaultpath();
        const zotkeyregex = this._getParam_zotkeyregex();
        const metadatakeyword = this._getParam_metadatakeyword();

        /// pattern to match MD files
        const re_file = new RegExp("^@.+\.md$", 'i');
        /// pattern to trim extension from filename
        const re_suffix = /\.md$/i;
        /// pattern to match ZoteroKey in MD file contents
        const re_contents = new RegExp(zotkeyregex, 'm');

        const allFiles = await this.getFilesRecursively(vaultpath);
        const mdFiles = allFiles.filter(file => re_file.test(file.name));

        await Zotero.Promise.all(mdFiles.map(async (entry) => {
            // const name = entry.name.split('.').slice(0, -1).join('.');
            const name = entry.name.replace(re_suffix, '');
            const path = entry.path;
            let entry_res = {
                citekey: null,
                citekey_metadata: null,
                citekey_title: null,
                zotkeys: [],
                zotids: [],
                name: name,
                path: path
            };

            /// optional for custom regex
            /// get citekey from filename
            try {
                /// pattern to match citekey in MD file name
                const re_title = new RegExp(/^@([^\s]+)/);
                entry_res.citekey_title = name.match(re_title)[1].trim();
            } catch (e) {
                Zotero.debug("Error in scanVaultCustomRegex: " + e);
            }

            try {
                /// get the ZoteroKey from the contents
                const contents = await Zotero.File.getContentsAsync(path);
                entry_res.zotkeys.push(contents.match(re_contents)[1].trim());

                /// optional for custom regex
                /// get citekey from metadata
                // try {
                //     if (metadatakeyword.length > 0) {
                //         /// pattern to match citekey in MD file metadata
                //         const re_metadata = new RegExp("^" + metadatakeyword + "\: *([^s].+)", 'm');
                //         /// get metadata
                //         const contentSections = contents.split('\n---');
                //         const metadata = contentSections[0];
                //         if (contentSections.length > 1 && metadata.startsWith('---')) {
                //             entry_res.citekey_metadata = metadata.match(re_metadata)[1].trim();
                //         }
                //     }
                // } catch (e) {
                //     Zotero.debug("Error in scanVaultCustomRegex: " + e);
                // }
            } catch (e) {
                Zotero.debug("Error in scanVaultCustomRegex: " + e);
            }

            // entry_res.citekey = entry_res.citekey_metadata || entry_res.citekey_title;
            // if (entry_res.zotkey == null) {
            //     reserrs.push(entry_res);
            // }
            res.push(entry_res);
        }));

        if (reserrs.length > 0) {
            this.cleanrun = false;
            const nerr = reserrs.length;
            Zotero.debug(`${nerr} Read ObsVault Read Errors`);

            if (promptSaveErrors) {
                const dataErrors = JSON.stringify(reserrs, null, 1);
                const warningTitle = "Markdown Import Error";
                const warningMessage = "There were " + nerr.toString() + " Markdown notes that could note be parsed. \n\nWould you like to save these errors to a json file? \n\n(There were " + (res.length - reserrs.length).toString() + " notes parsed successfully.)";
                const saveDialogTitle = "Save ZoteroObsidianCitations Errors To...";
                const filenamesuggest = 'ZoteroObsidianCitations-md-parsing-errors.json';
                await this.offerToSaveErrors(dataErrors, warningTitle, warningMessage, saveDialogTitle, filenamesuggest);
            } else {
                this.showNotification("scanVaultCustomRegex", "Unable to parse " + nerr.toString() + " of " + mdFiles.length.toString() + " notes.", false);
            }
        }
        return res;
    },


    mapCitekeysBBTJSON: async function () {
        /* 
         * make dict of BBTcitekey:zoteroID for every item in the BBTJSON file
         */
        let citekeymap = {};
        let citekeymaperr = {};

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
            } catch (e) {
                citekeymaperr.push(item);
            }
        });

        if (citekeymaperr.length > 0) {
            this.cleanrun = false;
            const nerr = citekeymaperr.length;
            Zotero.debug(`${nerr} Read ObsVault Read Errors`);
            Zotero.debug(`${citekeymaperr[0]}`);
            this.showNotification("mapCitekeysBBTJSON", "Error: " + nerr.toString() + ".", false);
        }
        return citekeymap;
    },

    mapZoteroIDkeysInternalSearch: async function () {
        /* 
         * make dict of zoteroKey:zoteroID for every item in the library
         */
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
            } catch (e) {
                keymaperr.push(item);
            }
        });

        if (keymaperr.length > 0) {
            this.cleanrun = false;
            const nerr = keymaperr.length;
            Zotero.debug(`${nerr} mapZoteroIDkeysInternalSearch Errors`);
            Zotero.debug(`${keymaperr[0]}`);
            this.showNotification("mapZoteroIDkeysInternalSearch", "Error: " + nerr.toString() + ".", false);
        }
        return keymap;
    },

    mapCitekeysInternalSearch: async function () {
        /* 
         * make dict of BBTcitekey:zoteroID for every item where the BBTcitekey in pinned
         */
        let citekeymap = {};
        let citekeymaperr = {};

        const items = await this.findPinnedCitekeyItems();

        const re_extra = new RegExp(/^Citation Key: *(\S+)/m);
        items.forEach(item => {
            try {
                const extra = item.getField('extra');
                const citekey = extra.match(re_extra)[1].trim();
                citekeymap[citekey] = item.itemID;
            } catch (e) {
                citekeymaperr.push(item);
            }
        });

        if (citekeymaperr.length > 0) {
            this.cleanrun = false;
            const nerr = citekeymaperr.length;
            Zotero.debug(`${nerr} Read ObsVault Read Errors`);
            Zotero.debug(`${citekeymaperr[0]}`);
            this.showNotification("mapCitekeysInternalSearch", "Error: " + nerr.toString() + ".", false);
        }
        return citekeymap;
    },

    _checkBBTinstalled: async function () {
        let deferred = Zotero.Promise.defer();

        function _checkBTT(addon) {
            let found = false;
            if (addon === null || !addon.isActive) {
                found = false;
            } else {
                let win = Services.wm.getMostRecentWindow("navigator:browser");
                found = win.Zotero.BetterBibTeX.ready.then(() => {
                    found = true;
                });
            }
            deferred.resolve(found);
        }

        AddonManager.getAddonByID("better-bibtex@iris-advies.com", _checkBTT);
        return deferred.promise;
    },

    _getBBTkeyData: async function () {
        Components.utils.import('resource://gre/modules/AddonManager.jsm');
        return new Promise(function (resolve) {
            AddonManager.getAddonByID("better-bibtex@iris-advies.com", async function (addon) {
                if (addon === null || !addon.isActive) {
                    return;
                }

                let win = Services.wm.getMostRecentWindow("navigator:browser");
                resolve(win.Zotero.BetterBibTeX.ready.then(function () {
                    return win.Zotero.BetterBibTeX.KeyManager.keys.data;
                }));
            });
        });
    },

    mapCitekeysBBTquery: async function () {
        /* 
         * make dict of BBTcitekey:zoteroID for every item
         */
        let citekeymap = {};

        /// get all items in library
        let s = new Zotero.Search();
        s.libraryID = Zotero.Libraries.userLibraryID;
        s.addCondition('deleted', 'false');
        let itemIDs = await s.search();

        const items = await this._getBBTkeyData();

        items.forEach(item => {
            /// check if zotid is in main library
            if (itemIDs.includes(item.itemID)) {
                /// allow for duplicate citekeys; add zotero item id to list if BBT citekey exists
                if (Object.keys(citekeymap).includes(item.citekey)) {
                    citekeymap[item.citekey].push(item.itemID);
                } else { /// otherwise make array with zotero item id
                    citekeymap[item.citekey] = [item.itemID];
                }
            }
        });

        return citekeymap;
    },

    sliceObj: async function (res, citekeymap, promptSaveErrors) {
        /* 
         * res :: array of item data
         * citekeymap :: dict of BBT citekeys to Zotero itemIDs
         * promptSaveErrors
         */
        let reserr = [];

        const citekeys = Object.keys(citekeymap);

        res.forEach(entry_res => {
            if (entry_res.citekey) {
                if (citekeys.includes(entry_res.citekey)) {
                    entry_res.zotids = citekeymap[entry_res.citekey];
                } else if (citekeys.includes(entry_res.citekey_metadata)) {
                    entry_res.zotids = citekeymap[entry_res.citekey_metadata];
                } else if (citekeys.includes(entry_res.citekey_title)) {
                    entry_res.zotids = citekeymap[entry_res.citekey_title];
                } else {
                    reserr.push(entry_res);
                }
            } else {
                reserr.push(entry_res);
            }
        });

        if (reserr.length > 0) {
            this.cleanrun = false;
            const nerr = reserr.length;
            Zotero.debug(`${nerr} ObsVault Read Errors`);

            if (promptSaveErrors) {
                const dataErrors = JSON.stringify(reserr, null, 1);
                const warningTitle = "Umatched citekeys";
                const warningMessage = "There were " + nerr.toString() + " citekeys in your Markdown notes that could not be matched to items in your Zotero library. \n\nWould you like to save the names of these citekeys in a json file? \n\n(Matches for " + (res.length - reserr.length).toString() + " citekeys were found successfully.)";
                const saveDialogTitle = "Save ZoteroObsidianCitations Errors To...";
                const filenamesuggest = 'ZoteroObsidianCitations-missing-entries.json';
                await this.offerToSaveErrors(dataErrors, warningTitle, warningMessage, saveDialogTitle, filenamesuggest);
            } else {
                this.showNotification("ZoteroObsidianCitations", "sliceObj Error: " + nerr.toString() + ".", false);
            }
        }
        return res;
    },


    sliceObjCustomRegex: async function (res, zoterokeymap, promptSaveErrors) {
        /* 
         * res :: array of item data
         * zoterokeymap :: dict of Zotero itemKeys to Zotero itemIDs
         * promptSaveErrors
         */
        let reserr = [];

        const zotkeys = Object.keys(zoterokeymap);

        res.forEach(entry_res => {
            entry_res.zotkeys.forEach(zotkey => {
                if (zotkeys.includes(zotkey)) {
                    entry_res.zotids.push(zoterokeymap[zotkey]);
                } else {
                    reserr.push(entry_res);
                }
            });
        });

        if (reserr.length > 0) {
            this.cleanrun = false;
            const nerr = reserr.length;
            Zotero.debug(`${nerr} ObsVault Read Errors`);

            if (promptSaveErrors) {
                const dataErrors = JSON.stringify(reserr, null, 1);
                const warningTitle = "Umatched zoteroKeys";
                const warningMessage = "There were " + nerr.toString() + " zoteroKeys in your Markdown notes that could not be matched to items in your Zotero library. \n\nWould you like to save the names of these in a json file? \n\n(Matches for " + (res.length - reserr.length).toString() + " zoteroIDs were found successfully.)";
                const saveDialogTitle = "Save ZoteroObsidianCitations Errors To...";
                const filenamesuggest = 'ZoteroObsidianCitations-missing-entries.json';
                await this.offerToSaveErrors(dataErrors, warningTitle, warningMessage, saveDialogTitle, filenamesuggest);
            } else {
                this.showNotification("ZoteroObsidianCitations", "sliceObjCustomRegex Error: " + nerr.toString() + ".", false);
            }
        }
        return res;
    },


    processData: async function (promptSaveErrors) {
        let res;

        const matchstrategy = this._getParam_matchstrategy();

        // const bbtdata = await _getBBTkeyData();

        /*
        1 - match MD notes based on BBT citekey
        /// 1 - bbtcitekey in md note title or body >> use bbtdata

        MD files to Include:
        md notes begin with @mycitekey
        (optional) md notes contain the BBT citekey in the metadata id: 'citekey'

        OR

        2- match MD notes based on zotero item key
        /// 2 - zotkey in md body >> use contentregex

        MD files to Include:
        include notes whose filenames match this regex: '^@.+'
            /// first filter MD files, then filter by user regex
        regex to extract the zotkey: regex
        */

        if (matchstrategy === 'bbtcitekey') {

            /// get BBT citekeys from markdown files ///
            res = await this.scanVault(promptSaveErrors); /// returns data array containing BBT citekeys
            if (res.length === 0) {
                this.showNotification("No Markdown files found", "Set the path to your Markdown notes in the ZotObsCite preferences.", false);
                return;
            }

            /// get zoteroKeys and zoteroIDs for every item in Zotero library
            const citekeymap = await this.mapCitekeysBBTquery(res); /// returns dict mapping citekey => [zoteroID_1, zoteroID_2, ...]
            // const citekeymap = await this.mapCitekeysInternalSearch(); /// returns dict mapping zoteroKeys to zoteroIDs

            /// map BBT citekeys from markdown files with zoteroIDs
            res = await this.sliceObj(res, citekeymap, promptSaveErrors);

        } else if (matchstrategy === 'zotitemkey') {

            /// get zoterokeys from markdown files ///
            res = await this.scanVaultCustomRegex(promptSaveErrors); /// returns data array containing zoteroKeys
            if (res.length === 0) {
                this.showNotification("No Markdown files found", "Set the path to your Markdown notes in the ZotObsCite preferences.", false);
                return;
            }

            /// get zoteroKeys and zoteroIDs for every item in Zotero library
            const zoterokeymap = await this.mapZoteroIDkeysInternalSearch(); /// returns dict mapping zoteroKey => zoteroID

            /// map zoteroKeys from markdown files with zoteroIDs
            res = await this.sliceObjCustomRegex(res, zoterokeymap, promptSaveErrors);

        }

        this.data = {};
        this.dataKeys = [];
        res.forEach(entry_res => {
            entry_res.zotids.forEach(zotid => {
                if (typeof zotid === 'number') {
                    /// filter located zoteroIDs from data array
                    if (Object.keys(this.data).includes(zotid.toString())) {
                        this.data[zotid.toString()].push(entry_res);
                    } else {
                        this.data[zotid.toString()] = [entry_res];
                        this.dataKeys.push(zotid);
                    }
                }
            });
        });

        if (this.dataKeys.length === 0) {
            this.showNotification("No Matching Entries", "None of the " + res.length.toString() + " Markdown notes could be matched to items in the Zotero library.", false);
        }

        if (!this.cleanrun && promptSaveErrors) {
            const dataErrors = JSON.stringify(res, null, 1);
            const warningTitle = "ZoteroObsidianCitations Warning";
            const warningMessage = "There an issue matching some of your Markdown notes (" + this.dataKeys.length.toString() + " notes were matched successfully).\n\nWould you like to save the data extracted from the notes to a json file?";
            const saveDialogTitle = "Save ZoteroObsidianCitations Data To...";
            const filenamesuggest = 'ZoteroObsidianCitations-all-data.json';
            await this.offerToSaveErrors(dataErrors, warningTitle, warningMessage, saveDialogTitle, filenamesuggest);
        }

    },

    /////////

    updateItems: async function (citekeyids) {

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

        ///NB this doesn't run successfully as soon as zotero is started, needs to wait for schema to load
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

        return message;
    },


    runSync: async function (promptSaveErrors, syncTags) {
        /// TODO better error notification handeling. Collect errors and show them at the end.
        /// TODO validate settings on preference window close.
        this.cleanrun = true;
        this.suppressNotifications = false;
        let notifData = ["ZoteroObsidianCitations Syncing Error", "Some Error Occurred", false];
        if (await this.checkSettings()) {
            await this.processData(promptSaveErrors);
            let message;
            if (this.dataKeys.length > 0) {
                if (syncTags) {
                    message = await this.updateItems(this.dataKeys);
                } else {
                    message = "Found " + this.dataKeys.length.toString() + " notes.";
                }
                notifData = ["ZoteroObsidianCitations Synced", message, true];
            } else {
                message = "Found " + this.dataKeys.length.toString() + " notes.";
                notifData = ["ZoteroObsidianCitations", message, false];
            }
        }
        return notifData;
    },

    addDebugLog: function (key, value) {
        this.debuglog[key] = value;
    },

    runDebug: async function () {
        const promptSaveErrors = false;
        this.debuglog = {};
        this.suppressNotifications = true;
        this.addDebugLog('prefs', {
            matchstrategy: this.getPref('matchstrategy'),
            source_dir: this.getPref('source_dir'),
            zotkeyregex: this.getPref('zotkeyregex'),
            metadatakeyword: this.getPref('metadatakeyword'),
        });
        this.addDebugLog('config', {
            matchstrategy: this._getParam_matchstrategy(),
            vaultpath: this._getParam_vaultpath(),
            zotkeyregex: this._getParam_zotkeyregex(),
            metadatakeyword: this._getParam_metadatakeyword(),
            checkSettings: await this.checkSettings(),
        });
    },

    ////////////

    startupDependencyCheck: async function () {
        const promptSaveErrors = false;
        const syncTags = true; // syncOnStart
        const notifData = await this.runSync(promptSaveErrors, syncTags);
        this.showNotification(...notifData);
    },

    //// Controls for Item menu

    buildItemContextMenu: function () {
        let show = false;
        const pane = Services.wm.getMostRecentWindow("navigator:browser").ZoteroPane;
        const doc = pane.document;
        const items = pane.getSelectedItems();
        for (const item of items) {
            if (this.dataKeys.includes(item.id)) {
                show = true;
                break;
            }
        }
        doc.getElementById("id-obscite-itemmenu-open-obsidian").hidden = !show;
        doc.getElementById("id-obscite-itemmenu-show-md").hidden = !show;
    },

    openSelectedItemsObsidian: function () {
        const items = Services.wm.getMostRecentWindow("navigator:browser").ZoteroPane.getSelectedItems();
        const vaultName = ''; ///TODO add preference to specify vault
        const vaultKey = (vaultName.length > 0) ? 'vault=' + vaultName + '&' : '';
        for (const item of items) {
            if (this.dataKeys.includes(item.id)) {
                const entry_res_list = this.data[item.id.toString()];
                /// NB ignore all be first file entry associated with an itemID
                const entry_res = entry_res_list[0];

                const uriEncoded = encodeURIComponent(entry_res.path);
                Zotero.launchURL("obsidian://open?" + vaultKey + "path=" + uriEncoded);

                // /// NB skipping the subfolder path and hoping that obsidian can resolve the note based on the file name
                // const uriEncoded = encodeURIComponent(entry_res.name);
                // Zotero.launchURL("obsidian://open?" + vaultKey + "file=" + uriEncoded);

                /// only open first item note
                break;
            }
        }
    },

    showSelectedItemMarkdownInFilesystem: function () {
        const items = Services.wm.getMostRecentWindow("navigator:browser").ZoteroPane.getSelectedItems();
        for (const item of items) {
            if (this.dataKeys.includes(item.id)) {
                const entry_res_list = this.data[item.id.toString()];
                /// NB ignore all be firs file entry associated with an itemID
                const entry_res = entry_res_list[0];
                let file = new FileUtils.File(OS.Path.normalize(entry_res.path));
                if (file.exists()) {
                    try {
                        Zotero.debug("Revealing " + file.path);
                        file.reveal();
                    } catch (e) {
                        // On platforms that don't support nsIFile.reveal() (e.g. Linux),
                        // launch the parent directory
                        Zotero.launchFile(file.parent);
                    }
                }
                /// only open first item note
                break;
            }
        }
    },

    //// Controls for Tools menu

    syncWithMarkdown: async function () {
        const promptSaveErrors = true;
        const syncTags = true;
        const notifData = await this.runSync(promptSaveErrors, syncTags);
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