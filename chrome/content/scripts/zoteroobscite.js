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
    version: '0.0.17',
    folderSep: null,
    cleanrun: true,
    suppressNotifications: false,
    debuglog: {},
    debugSettingsFail: {},
    ////////////
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

            if (!['bbtcitekey', 'zotitemkey'].includes(this.getPref('matchstrategy'))) {
                this.setPref('matchstrategy', 'bbtcitekey');
            }

            // run in future to not burden start-up
            this.futureRun(async function () {
                // determine folder seperator depending on OS
                this.folderSep = Zotero.isWin ? '\\' : '/';

                // if BBT is needed, wait for it to load
                if (this.getPref('matchstrategy') === 'bbtcitekey') {
                    let win = Services.wm.getMostRecentWindow("navigator:browser");
                    win.Zotero.BetterBibTeX.ready.then(async function () {
                        await this.startupDependencyCheck();
                    }.bind(this));
                } else {
                    setTimeout(async function () {
                        await this.startupDependencyCheck();
                    }.bind(this), 2000);
                }

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

    checkTagStr: function () {
        const tagstr = this.getPref('tagstr');
        if (typeof tagstr === 'string' && tagstr.length > 0) {
            let found = [];
            const notallowed = ["'", '"', ":", "\n", "/", "\\", "?", "*", "|", ">", "<", ",", ";", "=", "`", "~", "!", "#", "$", "%", "^", "&", "(", ")", "[", "]", "{", "}", " "];
            notallowed.forEach(char => {
                if (tagstr.includes(char)) {
                    found.push(char);
                }
            });
            if (found.length > 0) {
                this.showNotification("Invalid tag string", "tag cannot contain: " + found.join(" or ") + ".", false);
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

    _getParam_filefilterstrategy: function () {
        const filefilterstrategy = this.getPref('filefilterstrategy');
        if (['default', 'customfileregex'].includes(filefilterstrategy)) {
            return filefilterstrategy;
        } else {
            this.setPref('filefilterstrategy', 'default');
            return 'default';
        }
    },

    _getParam_filepattern: function () {
        let filepatternstr = this.getPref('filepattern');
        if (!(typeof filepatternstr === 'string' && filepatternstr.length > 0)) {
            filepatternstr = "^@.+\\.md$";
            this.setPref('filepattern', filepatternstr);
        }
        try {
            const re_file = new RegExp(filepatternstr, 'i');
            return filepatternstr;
        } catch (e) {
            this.showNotification("File regex is not valid. Was given: >>" + filepatternstr + "<<", false);
            Zotero.debug(`File RegEx Error: ${e}`);
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
            this.showNotification("User Defined RegEx Invalid", "The RegEx you specified in the ZoteroObsidianCitations preferences is invalid: " + e, false);
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

    _getParam_tagstr: function () {
        const tagstr = this.getPref('tagstr');
        if (typeof tagstr === 'string' && tagstr.length > 0) {
            if (this.checkTagStr()) {
                return tagstr;
            } else {
                return null;
                /// checkTagStr() will show a notification
            }
        } else {
            this.setPref('tagstr', 'ObsCite');
            return 'ObsCite';
        }
    },

    _getParam_grouplibraries: function () {
        const grouplibraries = this.getPref('grouplibraries');
        if (['user', 'group'].includes(grouplibraries)) {
            return grouplibraries;
        } else {
            this.setPref('grouplibraries', 'user');
            return 'user';
        }
    },

    _getParam_vaultresolution: function () {
        const vaultresolution = this.getPref('vaultresolution');
        if (['path', 'file'].includes(vaultresolution)) {
            return vaultresolution;
        } else {
            this.setPref('vaultresolution', 'path');
            return 'path';
        }
    },

    _getParam_vaultname: function () {
        const vaultname = this.getPref('vaultname');
        if (typeof vaultname === 'string' && vaultname.length > 0) {
            return vaultname;
        } else {
            this.setPref('vaultname', '');
            return '';
        }
    },

    checkSettings: async function () {
        let checkSettings_trace = {
            _getParam_matchstrategy: 'none',
            _getParam_vaultpath: 'none',
            _getParam_filefilterstrategy: 'none',
            _getParam_filepattern: 'none',
            _checkBBTinstalled: 'none',
            _getParam_metadatakeyword: 'none',
            _getParam_tagstr: 'none',
            _getParam_zotkeyregex: 'none',
            matchstrategy: 'none'
        };
        const matchstrategy = this._getParam_matchstrategy();
        if (matchstrategy == null) {
            checkSettings_trace._getParam_matchstrategy = 'null';
            this.debugSettingsFail = checkSettings_trace;
            return false;
        }
        if (this._getParam_vaultpath() == null) {
            checkSettings_trace._getParam_vaultpath = 'null';
            this.debugSettingsFail = checkSettings_trace;
            return false;
        }

        if (this._getParam_filefilterstrategy() === 'customfileregex') {
            const filepattern = await this._getParam_filepattern();
            if (filepattern == null || !filepattern || filepattern.length === 0) {
                checkSettings_trace._getParam_filefilterstrategy = filepattern;
                this.debugSettingsFail = checkSettings_trace;
                return false;
            }
        }

        const tagstr = this._getParam_tagstr();
        if (tagstr == null) {
            checkSettings_trace._getParam_tagstr = 'null';
            this.debugSettingsFail = checkSettings_trace;
            return false;
        }

        if (matchstrategy === 'bbtcitekey') {
            const bbtactive = await this._checkBBTinstalled();
            if (!bbtactive || !bbtactive[0]) {
                checkSettings_trace._checkBBTinstalled = bbtactive;
                this.debugSettingsFail = checkSettings_trace;
                return false;
            }
            if (this._getParam_metadatakeyword() == null) {
                checkSettings_trace._getParam_metadatakeyword = 'null';
                this.debugSettingsFail = checkSettings_trace;
                return false;
            }
        } else if (matchstrategy === 'zotitemkey') {
            const zotkeyregex = this._getParam_zotkeyregex();
            if (zotkeyregex == null || !zotkeyregex || zotkeyregex.length === 0) {
                checkSettings_trace._getParam_zotkeyregex = zotkeyregex;
                this.debugSettingsFail = checkSettings_trace;
                return false;
            }
        } else {
            this.showNotification("ZotObsCite Error", 'Zotero IDs Source Not Specified: ' + matchstrategy, false);
            checkSettings_trace.matchstrategy = matchstrategy;
            this.debugSettingsFail = checkSettings_trace;
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
        const dialogTitle = 'Select Obsidian Vault Folder containing MD reading notes';
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
        const tagstr = this._getParam_tagstr();
        let s = new Zotero.Search();
        if (this._getParam_grouplibraries() === 'user') {
            s.libraryID = Zotero.Libraries.userLibraryID;
        }
        s.addCondition('tag', 'is', tagstr);
        let itemIDs = await s.search();
        let items_preexisting = await Zotero.Items.getAsync(itemIDs);
        return items_preexisting;
    },

    removeAllTags: async function () {
        const tagstr = this._getParam_tagstr();
        let items_preexisting = await this.findTaggedItems();
        /// remove tag
        items_preexisting.forEach(item => {
            item.removeTag(tagstr);
            item.saveTx();
        });
        return true;
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
        const filefilterstrategy = this._getParam_filefilterstrategy();
        let re_file;
        if (filefilterstrategy === 'default') {
            re_file = new RegExp(/^@.+\.md$/, 'i');
        } else {
            re_file = RegExp(this._getParam_filepattern(), 'i');
        }
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

            if (filefilterstrategy === 'default') {
                /// get citekey from filename
                try {
                    /// pattern to match citekey in MD file name
                    const re_title = new RegExp(/^@([^\s]+)/);
                    entry_res.citekey_title = name.match(re_title)[1].trim();
                } catch (e) {
                    Zotero.debug("Error in scanVault: " + e);
                }
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
                const warningMessage = "There were " + nerr.toString() + " Markdown notes that could not be parsed. \n\nWould you like to save these errors to a json file? \n\n(There were " + (res.length - reserrs.length).toString() + " notes parsed successfully.)";
                const saveDialogTitle = "Save ZoteroObsidianCitations Errors To...";
                const filenamesuggest = 'ZotObsCite-md-parsing-errors.json';
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
        // const metadatakeyword = this._getParam_metadatakeyword();

        /// pattern to match MD files
        const filefilterstrategy = this._getParam_filefilterstrategy();
        let re_file;
        if (filefilterstrategy === 'default') {
            re_file = new RegExp(/^@.+\.md$/, 'i');
        } else {
            re_file = RegExp(this._getParam_filepattern(), 'i');
        }
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
            if (filefilterstrategy === 'default') {
                /// get citekey from filename
                try {
                    /// pattern to match citekey in MD file name
                    const re_title = new RegExp(/^@([^\s]+)/);
                    entry_res.citekey_title = name.match(re_title)[1].trim();
                } catch (e) {
                    Zotero.debug("Error in scanVaultCustomRegex: " + e);
                }
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
                const warningMessage = "There were " + nerr.toString() + " Markdown notes that could not be parsed. \n\nWould you like to save these errors to a json file? \n\n(There were " + (res.length - reserrs.length).toString() + " notes parsed successfully.)";
                const saveDialogTitle = "Save ZoteroObsidianCitations Errors To...";
                const filenamesuggest = 'ZotObsCite-md-parsing-errors.json';
                await this.offerToSaveErrors(dataErrors, warningTitle, warningMessage, saveDialogTitle, filenamesuggest);
            } else {
                this.showNotification("scanVaultCustomRegex", "Unable to parse " + nerr.toString() + " of " + mdFiles.length.toString() + " notes.", false);
            }
        }
        return res;
    },

    mapZoteroIDkeysInternalSearch: async function () {
        /* 
         * make dict of zoteroKey:zoteroID for every item in the library
         */
        let keymap = {};
        let keymaperr = {};

        /// get all items in library
        let s = new Zotero.Search();
        if (this._getParam_grouplibraries() === 'user') {
            s.libraryID = Zotero.Libraries.userLibraryID;
        }
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

    _checkBBTinstalled: async function () {
        let deferred = Zotero.Promise.defer();

        function _checkBTT(addon) {
            let res = [];
            if (addon === null || !addon.isActive) {
                res.push(false);
            } else {
                let win = Services.wm.getMostRecentWindow("navigator:browser");
                win.Zotero.BetterBibTeX.ready.then(() => {
                    res.push(true);
                });
            }
            deferred.resolve(res);
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
        if (this._getParam_grouplibraries() === 'user') {
            s.libraryID = Zotero.Libraries.userLibraryID;
        }
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
                const warningTitle = "ZotObsCite Warning: Unmatched citekeys";
                const warningMessage = "There were " + nerr.toString() + " citekeys in your Markdown notes that could not be matched to items in your Zotero library. \n\nWould you like to save the names of these citekeys in a json file? \n\n(Matches for " + (res.length - reserr.length).toString() + " citekeys were found successfully.)";
                const saveDialogTitle = "Save ZoteroObsidianCitations Errors To...";
                const filenamesuggest = 'ZotObsCite-missing-entries.json';
                await this.offerToSaveErrors(dataErrors, warningTitle, warningMessage, saveDialogTitle, filenamesuggest);
            } else {
                this.showNotification("ZotObsCite Warning", "" + nerr.toString() + " unmatched citekeys. Run Sync from Tools menu to generate report.", false);
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
                const warningTitle = "ZotObsCite Warning: Unmatched zoteroKeys";
                const warningMessage = "There were " + nerr.toString() + " zoteroKeys in your Markdown notes that could not be matched to items in your Zotero library. \n\nWould you like to save the names of these in a json file? \n\n(Matches for " + (res.length - reserr.length).toString() + " zoteroIDs were found successfully.)";
                const saveDialogTitle = "Save ZoteroObsidianCitations Errors To...";
                const filenamesuggest = 'ZotObsCite-missing-entries.json';
                await this.offerToSaveErrors(dataErrors, warningTitle, warningMessage, saveDialogTitle, filenamesuggest);
            } else {
                this.showNotification("ZotObsCite sliceObjCustomRegex Warning", "" + nerr.toString() + " unmatched zoteroKeys. Run Sync from Tools menu to generate report.", false);
            }
        }
        return res;
    },


    processData: async function (promptSaveErrors, debug) {
        debug = debug || false;
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
                if (this._getParam_filefilterstrategy() === 'default') {
                    this.showNotification("No Markdown files found", "Check the path to your Markdown notes in the ZotObsCite preferences.", false);
                } else {
                    this.showNotification("No Markdown files found", "Check the File Filter RegEx and the path to your Markdown notes in the ZotObsCite preferences.", false);
                }
                return;
            }
            if (debug) {
                this.addDebugLog('scanVault', JSON.parse(JSON.stringify(res)));
            }

            /// get zoteroKeys and zoteroIDs for every item in Zotero library
            const citekeymap = await this.mapCitekeysBBTquery(res); /// returns dict mapping citekey => [zoteroID_1, zoteroID_2, ...]
            if (debug) {
                this.addDebugLog('mapCitekeysBBTquery', JSON.parse(JSON.stringify(citekeymap)));
            }

            /// map BBT citekeys from markdown files with zoteroIDs
            res = await this.sliceObj(res, citekeymap, promptSaveErrors);
            if (debug) {
                this.addDebugLog('sliceObj', JSON.parse(JSON.stringify(res)));
            }

        } else if (matchstrategy === 'zotitemkey') {

            /// get zoterokeys from markdown files ///
            res = await this.scanVaultCustomRegex(promptSaveErrors); /// returns data array containing zoteroKeys
            if (res.length === 0) {
                this.showNotification("No Markdown files found", "Set the path to your Markdown notes in the ZotObsCite preferences.", false);
                return;
            }
            if (debug) {
                this.addDebugLog('scanVaultCustomRegex', JSON.parse(JSON.stringify(res)));
            }

            /// get zoteroKeys and zoteroIDs for every item in Zotero library
            const zoterokeymap = await this.mapZoteroIDkeysInternalSearch(); /// returns dict mapping zoteroKey => zoteroID
            if (debug) {
                this.addDebugLog('mapZoteroIDkeysInternalSearch', JSON.parse(JSON.stringify(zoterokeymap)));
            }

            /// map zoteroKeys from markdown files with zoteroIDs
            res = await this.sliceObjCustomRegex(res, zoterokeymap, promptSaveErrors);
            if (debug) {
                this.addDebugLog('sliceObjCustomRegex', JSON.parse(JSON.stringify(res)));
            }

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
        if (debug) {
            this.addDebugLog('data', JSON.parse(JSON.stringify(this.data)));
            this.addDebugLog('dataKeys', JSON.parse(JSON.stringify(this.dataKeys)));
        }

        if (this.dataKeys.length === 0) {
            this.showNotification("No Matching Entries", "None of the " + res.length.toString() + " Markdown notes could be matched to items in the Zotero library.", false);
        }

        if (!this.cleanrun && promptSaveErrors) {
            const dataErrors = JSON.stringify(res, null, 1);
            const warningTitle = "ZotObsCite Warning";
            const warningMessage = "There was an issue matching some of your Markdown notes (" + this.dataKeys.length.toString() + " notes were matched successfully).\n\nWould you like to save the data extracted from the notes to a json file?";
            const saveDialogTitle = "Save ZoteroObsidianCitations Data To...";
            const filenamesuggest = 'ZotObsCite-alldata.json';
            await this.offerToSaveErrors(dataErrors, warningTitle, warningMessage, saveDialogTitle, filenamesuggest);
        }

    },

    /////////

    updateItems: async function (citekeyids) {
        const tagstr = this._getParam_tagstr();

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
            item.removeTag(tagstr);
            item.saveTx();
        });

        ///NB this doesn't run successfully as soon as zotero is started, needs to wait for schema to load
        /// add tag to items that should be tagged
        items_totag.forEach(item => {
            item.addTag(tagstr);
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
        const debug = false;
        let trace = {
            checkSetting: 'unreached',
            processData: 'unreached',
            ndataKeys: 'unreached',
            updateItems: 'unreached'
        };
        let notifData = ["ZotObsCite Syncing Error", "Some Error Occurred", false];
        if (await this.checkSettings()) {
            trace.checkSetting = 'pass';
            await this.processData(promptSaveErrors, debug);
            trace.processData = 'pass';
            trace.ndataKeys = this.dataKeys.length;
            let message;
            if (this.dataKeys.length > 0) {
                if (syncTags) {
                    message = await this.updateItems(this.dataKeys);
                    trace.updateItems = 'pass';
                } else {
                    message = "Found " + this.dataKeys.length.toString() + " notes.";
                    trace.updateItems = 'skipped';
                }
                notifData = ["ZotObsCite Synced", message, true];
            } else {
                message = "Found " + this.dataKeys.length.toString() + " notes.";
                notifData = ["ZotObsCite", message, false];
            }
        } else {
            const failedSetting = JSON.stringify(this.debugSettingsFail);
            trace.checkSetting = 'fail';
            const includeResults = false;
            const debuglog = await this.runDebug(includeResults);
            this.addDebugLog('trace', trace);
            this.addDebugLog('failedSetting', JSON.parse(failedSetting));
        }
        return notifData;
    },

    ////////////

    startupDependencyCheck: async function () {
        const promptSaveErrors = false;
        const syncTags = true; // syncOnStart
        const notifData = await this.runSync(promptSaveErrors, syncTags);
        this.showNotification(...notifData);
    },

    //// Controls for Item Contextual Menu

    buildItemContextMenu: function () {
        let found_single = false;
        let found_multiple = false;
        const pane = Services.wm.getMostRecentWindow("navigator:browser").ZoteroPane;
        const doc = pane.document;
        const items = pane.getSelectedItems();
        for (const item of items) {
            if (this.dataKeys.includes(item.id)) {
                if (this.data[item.id.toString()].length > 1) {
                    found_multiple = true;
                } else {
                    found_single = true;
                }
                /// only process first item if multiple selected
                break;
            }
        }

        if (found_multiple) {
            doc.getElementById("id-obscite-itemmenu-separator-top").hidden = false;
            doc.getElementById("id-obscite-itemmenu-open-obsidian").hidden = true;
            doc.getElementById("id-obscite-itemmenu-show-md").hidden = true;
            doc.getElementById("id-obscite-itemmenu-listobsidian-restrict").hidden = false;
            doc.getElementById("id-obscite-itemmenu-listmd-restrict").hidden = false;
        } else if (found_single) {
            doc.getElementById("id-obscite-itemmenu-separator-top").hidden = false;
            doc.getElementById("id-obscite-itemmenu-open-obsidian").hidden = false;
            doc.getElementById("id-obscite-itemmenu-show-md").hidden = false;
            doc.getElementById("id-obscite-itemmenu-listobsidian-restrict").hidden = true;
            doc.getElementById("id-obscite-itemmenu-listmd-restrict").hidden = true;
        } else {
            doc.getElementById("id-obscite-itemmenu-separator-top").hidden = true;
            doc.getElementById("id-obscite-itemmenu-open-obsidian").hidden = true;
            doc.getElementById("id-obscite-itemmenu-show-md").hidden = true;
            doc.getElementById("id-obscite-itemmenu-listobsidian-restrict").hidden = true;
            doc.getElementById("id-obscite-itemmenu-listmd-restrict").hidden = true;
        }

    },

    buildItemContextMenuListObsidian: function () {
        let win = Services.wm.getMostRecentWindow('navigator:browser');
        let nodes = win.ZoteroPane.document.getElementById('id-obscite-itemmenu-listobsidian-menu').childNodes;
        // hide all items by default
        for (let i = 0; i < nodes.length; i++) nodes[i].setAttribute('hidden', true);

        const items = Services.wm.getMostRecentWindow("navigator:browser").ZoteroPane.getSelectedItems();
        for (const item of items) {
            if (this.dataKeys.includes(item.id)) {
                const entry_res_list = this.data[item.id.toString()];
                let ii = 0;
                for (const entry_res of entry_res_list) {
                    if (ii < entry_res_list.length) {
                        // set attributes of menu item
                        nodes[ii].setAttribute('label', entry_res.name);
                        // nodes[ii].setAttribute('tooltiptext', this.ZFgetString('menu.collection.tooltip', [folder.path]));
                        // show menu item
                        nodes[ii].setAttribute('hidden', false);
                    } else {
                        break;
                    }
                    ii++;
                }
                /// only process first item if multiple selected
                break;
            }
        }
    },

    buildItemContextMenuListMD: function () {
        let win = Services.wm.getMostRecentWindow('navigator:browser');
        let nodes = win.ZoteroPane.document.getElementById('id-obscite-itemmenu-listmd-menu').childNodes;
        // hide all items by default
        for (let i = 0; i < nodes.length; i++) nodes[i].setAttribute('hidden', true);

        const items = Services.wm.getMostRecentWindow("navigator:browser").ZoteroPane.getSelectedItems();
        for (const item of items) {
            if (this.dataKeys.includes(item.id)) {
                const entry_res_list = this.data[item.id.toString()];
                let ii = 0;
                for (const entry_res of entry_res_list) {
                    if (ii < entry_res_list.length) {
                        // set attributes of menu item
                        nodes[ii].setAttribute('label', entry_res.name);
                        // nodes[ii].setAttribute('tooltiptext', this.ZFgetString('menu.collection.tooltip', [folder.path]));
                        // show menu item
                        nodes[ii].setAttribute('hidden', false);
                    } else {
                        break;
                    }
                    ii++;
                }
                /// only process first item if multiple selected
                break;
            }
        }
    },

    openSelectedItemsObsidian: function (idx) {
        idx = idx || 0;
        const items = Services.wm.getMostRecentWindow("navigator:browser").ZoteroPane.getSelectedItems();

        const uri_spec = this._getParam_vaultresolution();
        const vaultName = this._getParam_vaultname();
        const vaultKey = (vaultName.length > 0) ? 'vault=' + vaultName + '&' : '';

        for (const item of items) {
            if (this.dataKeys.includes(item.id)) {
                const entry_res_list = this.data[item.id.toString()];

                idx = (idx < entry_res_list.length && idx >= 0) ? idx : 0;
                const entry_res = entry_res_list[idx];

                const fileKey = (uri_spec === 'file') ? "file=" + encodeURIComponent(entry_res.name) : "path=" + encodeURIComponent(entry_res.path);

                Zotero.launchURL("obsidian://open?" + vaultKey + fileKey);

                // let fileKey;
                // if (uri_spec === 'file') {
                //     const uriEncodedName = encodeURIComponent(entry_res.name);
                //     fileKey = "file=" + uriEncodedName;
                // } else {
                //     const uriEncodedPath = encodeURIComponent(entry_res.path);
                //     fileKey = "path=" + uriEncodedPath;
                // }

                // /// NB skipping the subfolder path and hoping that obsidian can resolve the note based on the file name
                // const uriEncoded = encodeURIComponent(entry_res.name);
                // Zotero.launchURL("obsidian://open?" + vaultKey + "file=" + uriEncoded);

                /// only process first item if multiple selected
                break;
            }
        }
    },

    openSelectedItemsLogseq: function (idx) {
        idx = idx || 0;
        const items = Services.wm.getMostRecentWindow("navigator:browser").ZoteroPane.getSelectedItems();

        for (const item of items) {
            if (this.dataKeys.includes(item.id)) {
                const entry_res_list = this.data[item.id.toString()];

                idx = (idx < entry_res_list.length && idx >= 0) ? idx : 0;
                const entry_res = entry_res_list[idx];

                const fileKey = "page=" + encodeURIComponent(entry_res.name);

                Zotero.launchURL("logseq://graph/knowledge?" + fileKey);

                /// only process first item if multiple selected
                break;
            }
        }
    },

    showSelectedItemMarkdownInFilesystem: function (idx) {
        idx = idx || 0;
        const items = Services.wm.getMostRecentWindow("navigator:browser").ZoteroPane.getSelectedItems();
        for (const item of items) {
            if (this.dataKeys.includes(item.id)) {
                const entry_res_list = this.data[item.id.toString()];

                idx = (idx < entry_res_list.length && idx >= 0) ? idx : 0;
                const entry_res = entry_res_list[idx];

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
                /// only process first item if multiple selected
                break;
            }
        }
    },

    //// Debugging functions

    addDebugLog: function (key, value) {
        this.debuglog[key] = value;
    },

    runDebug: async function (includeResults) {
        ///TODO add 'run debug' button to preference window
        includeResults = includeResults || false;
        const promptSaveErrors = false;
        const debug = true;
        this.debuglog = {};
        this.suppressNotifications = true;

        this.addDebugLog('version', this.version);
        this.addDebugLog('zoteroVersion', Zotero.version);
        this.addDebugLog('isMac', Zotero.isMac);
        this.addDebugLog('isLinux', Zotero.isLinux);
        this.addDebugLog('isWin', Zotero.isWin);

        let prefs = {};
        for (let pref of ['matchstrategy', 'source_dir', 'filefilterstrategy', 'filepattern', 'zotkeyregex', 'metadatakeyword']) {
            try {
                prefs[pref] = this.getPref(pref);
            } catch (e) {
                prefs[pref] = "Error (" + e.name + ") " + e.message;
            }
        }
        this.addDebugLog('prefs', prefs);

        let config = {};
        for (let pref of ['matchstrategy', 'source_dir', 'filefilterstrategy', 'filepattern', 'zotkeyregex', 'metadatakeyword', 'grouplibraries', 'tagstr', 'vaultresolution', 'vaultname']) {
            try {
                switch (pref) {
                    case 'matchstrategy':
                        config[pref] = this._getParam_matchstrategy();
                        break;
                    case 'source_dir':
                        config[pref] = this._getParam_vaultpath();
                        break;
                    case 'filefilterstrategy':
                        config[pref] = this._getParam_filefilterstrategy();
                        break;
                    case 'filepattern':
                        config[pref] = this._getParam_filepattern();
                        break;
                    case 'zotkeyregex':
                        config[pref] = this._getParam_zotkeyregex();
                        break;
                    case 'metadatakeyword':
                        config[pref] = this._getParam_metadatakeyword();
                        break;
                    case 'grouplibraries':
                        config[pref] = this._getParam_grouplibraries();
                        break;
                    case 'tagstr':
                        config[pref] = this._getParam_tagstr();
                        break;
                    case 'vaultresolution':
                        config[pref] = this._getParam_vaultresolution();
                        break;
                    case 'vaultname':
                        config[pref] = this._getParam_vaultname();
                        break;
                }
            } catch (e) {
                config[pref] = "Error (" + e.name + ") " + e.message;
            }
        }
        try {
            config.bbtinstalled = await this._checkBBTinstalled();
        } catch (e) {
            config.bbtinstalled = "Error (" + e.name + ") " + e.message;
        }
        try {
            config.checkSetting = await this.checkSettings();
        } catch (e) {
            config.checkSetting = "Error (" + e.name + ") " + e.message;
        }
        this.addDebugLog('config', config);

        if (includeResults && await this.checkSettings()) {
            let results = {};
            try {
                await this.processData(promptSaveErrors, debug);
            } catch (e) {
                results.processData = "Error (" + e.name + ") " + e.message;
            }
            try {
                results.cleanrun = this.cleanrun;
                results.ndataKeys = this.dataKeys.length;
            } catch (e) {
                results = "Error (" + e.name + ") " + e.message;
            }
            this.addDebugLog('results', results);
        }

        return this.debuglog;
    },

    saveDebug: async function () {
        const dataDebug = JSON.stringify(this.debuglog, null, 1);
        const saveDialogTitle = "Save ZoteroObsidianCitations Debug Log To...";
        const filenamesuggest = 'ZotObsCite-debug.json';
        await this.writeToFile(dataDebug, saveDialogTitle, filenamesuggest);
    },

    runAndSaveDebug: async function (includeResults) {
        includeResults = (typeof includeResults === 'boolean') ? includeResults : true;
        const dataDebug = JSON.stringify(await this.runDebug(includeResults), null, 1);
        const saveDialogTitle = "Save ZoteroObsidianCitations Debug Log To...";
        const filenamesuggest = 'ZotObsCite-debug.json';
        await this.writeToFile(dataDebug, saveDialogTitle, filenamesuggest);
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