Components.utils.import('resource://gre/modules/osfile.jsm');


//TODO switch to object, https://github.com/jlegewie/zotfile/blob/c3951151c93926e600f5fd0d5dbffe3dbbe32721/chrome/content/zotfile/zotfile.js

// Startup -- load Zotero and constants
if (typeof Zotero === 'undefined') {
    Zotero = {};
}
Zotero.ObsCite = {};


async function pick(title, mode, filters, suggestion) {
    /// taken from https://github.com/retorquere/zotero-better-bibtex/blob/fce3078f8c6806d21b95a658527f05e4879d6e7a/content/file-picker.ts
    const fp = Components.classes['@mozilla.org/filepicker;1'].createInstance(Components.interfaces.nsIFilePicker);

    if (suggestion) fp.defaultString = suggestion;

    mode = {
        open: Components.interfaces.nsIFilePicker.modeOpen,
        save: Components.interfaces.nsIFilePicker.modeSave,
        folder: Components.interfaces.nsIFilePicker.modeGetFolder,
    } [mode];

    fp.init(window, title, mode);

    for (const [label, ext] of (filters || [])) {
        fp.appendFilter(label, ext);
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return new Zotero.Promise(resolve => {
        fp.open(userChoice => {
            switch (userChoice) {
                case Components.interfaces.nsIFilePicker.returnOK:
                case Components.interfaces.nsIFilePicker.returnReplace:
                    resolve(fp.file.path);
                    break;

                default: // aka returnCancel
                    resolve('');
                    break;
            }
        });
    });
}

function askToSaveErrors(dialogTitle, message) {
    Components.utils.import('resource://gre/modules/Services.jsm');

    const ps = Services.prompt;
    var buttonFlags = (ps.BUTTON_POS_0) * (ps.BUTTON_TITLE_IS_STRING) + ps.BUTTON_POS_0_DEFAULT +
        (ps.BUTTON_POS_1) * (ps.BUTTON_TITLE_IS_STRING);
    var index = ps.confirmEx(
        null, // parent
        dialogTitle, // dialogTitle
        message, // message
        buttonFlags,
        "Save",
        "Don't Save", null, null, {}
    );
    return index;
}

async function selectValueFolder() {
    const obsVaultFolder = await pick('Select Obsidian Vault Folder with citation notes begining with @', 'folder');
    return obsVaultFolder;
}

async function selectBBTjson() {
    const bbtjson = await pick('Select BBT JSON auto-updating library export', 'file', [
        ['JSON File (*.json)', '*.json']
    ]);
    return bbtjson;
}

async function writeToFile(data, filenamesuggest) {
    const filepath = await pick('Errors', 'save', [
        []
    ], filenamesuggest);
    if (filepath) await Zotero.File.putContentsAsync(filepath, data);
}

function showNotification(header, body, success) {
    const icon = success ? "chrome://zotero/skin/tick.png" : "chrome://zotero/skin/cross.png";
    let progressWindowMulti = new Zotero.ProgressWindow({
        closeOnClick: true
    });
    progressWindowMulti.changeHeadline(header);

    progressWindowMulti.progress = new progressWindowMulti.ItemProgress(icon, body);

    progressWindowMulti.show();
    progressWindowMulti.startCloseTimer(8000);
}

async function scanVault(vaultpath, fetchMetadata) {
    let dbs = [];
    let dbserrs = [];
    const re_title = new RegExp(/^@([^\s]+)/);
    const re_metadata = new RegExp("^" + fetchMetadata + "\: *([^s].+)", 'm');

    if (!await OS.File.exists(vaultpath)) {
        Zotero.debug(`${vaultpath} does not exist`);
        return dbs;
    }
    await Zotero.File.iterateDirectory(vaultpath, async function (entry) {
        if (entry.name.startsWith('@')) {
            let name = entry.name;
            let path = entry.path;
            try {
                if (fetchMetadata && fetchMetadata.length > 0) {
                    /// get citekey from metadata
                    try {
                        let contents = await Zotero.File.getContentsAsync(path);
                        /// get metadata
                        let metadata = contents.split('\n---')[0];
                        if (metadata.startsWith('---')) {
                            let citekey = metadata.match(re_metadata)[1].trim();
                            dbs.push(citekey);
                        } else {
                            let citekey = name.match(re_title)[1].trim();
                            dbs.push(citekey);
                        }
                    } catch (err) {
                        let citekey = name.match(re_title)[1].trim();
                        dbs.push(citekey);
                    }
                } else {
                    /// get citekey from filename
                    let citekey = name.match(re_title)[1].trim();
                    dbs.push(citekey);
                }
            } catch (err) {
                dbserrs.push(name);
            }

        }
    });
    if (dbserrs.length > 0) {
        let nerr = dbserrs.length;
        Zotero.debug(`${nerr} Read ObsVault Read Errors`);
        showNotification("scanValut", "Error: " + nerr.toString() + ".", false);
    }
    return dbs;
}

async function mapCitekeys(bbtjson) {
    let citekeymap = {};
    let citekeymaperr = {};

    if (!await OS.File.exists(bbtjson)) {
        Zotero.debug(`${bbtjson} does not exist`);
        return citekeymap;
    }

    let contents = await Zotero.File.getContentsAsync(bbtjson);
    contents = JSON.parse(contents);
    let items = contents.items;
    items.forEach(function mapper(item) {
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
        let nerr = citekeymaperr.length
        Zotero.debug(`${nerr} Read ObsVault Read Errors`);
        Zotero.debug(`${citekeymaperr[0]}`);
        showNotification("mapCitekeys", "Error: " + nerr.toString() + ".", false);
    }
    return citekeymap;
}

async function sliceObj(obj, keys, promptSaveErrors) {
    let values = [];
    let valueerr = [];

    keys.forEach(function slice(key) {
        if (key in obj) {
            values.push(obj[key]);
        } else {
            valueerr.push(key);
        }
    });

    if (valueerr.length > 0) {
        let nerr = valueerr.length
        Zotero.debug(`${nerr} ObsVault Read Errors`);
        Zotero.debug(`${valueerr[0]}`);

        if (promptSaveErrors) {
            const warningTitle = "Umatched citekeys";
            const message = "There were " + nerr.toString() + " citekeys in your Obsidian Vault that could not be matched to items in your Zotero library. \n\nWould you like to save the names of these citekeys in a text file? \n\n(Matches for " + values.length.toString() + " citekeys were found successfully.)";
            const saveResp = askToSaveErrors(warningTitle, message);
            if (saveResp === 0) {
                const outtxt = "sliceObj Errors (" + nerr.toString() + "):\n\n" + valueerr.join("\n") + "\n\n";
                writeToFile(outtxt, 'sliceObjErr.txt');
            }
        } else {
            showNotification("sliceObj", "Error: " + nerr.toString() + ".", false);
        }

    }
    return values;
}


async function findTaggedItems() {
    let s = new Zotero.Search();
    s.libraryID = Zotero.Libraries.userLibraryID;
    s.addCondition('tag', 'is', 'ObsCite');
    let itemIDs = await s.search();
    let items_preexisting = await Zotero.Items.getAsync(itemIDs);
    return items_preexisting;
}

async function removeAllTags() {
    let items_preexisting = await findTaggedItems();
    /// remove tag
    items_preexisting.forEach(function removeTag(item) {
        item.removeTag('ObsCite');
        item.saveTx();
    });
    return true;
}



async function checkRequirements(vaultpath, bbtjson) {
    let satisfied = true;

    if (vaultpath == '' || !await OS.File.exists(vaultpath)) {
        showNotification("Obsidian Vault Path Not Found", "Set the path to your Obsidian Citations Notes in the ZotObsCite preferences.", false);
        satisfied = false;
        return false;
    }

    if (bbtjson == '' || !await OS.File.exists(bbtjson)) {
        showNotification("BBT JSON Library Export Not Found", "Set the path to your auto-updating BBT JSON export in the ZotObsCite preferences.", false);
        satisfied = false;
        return false;
    }

    return satisfied;
}

async function checkDependencies(vaultpath, bbtjson, metadatakeyword, promptSaveErrors) {

    let success = false;

    /// get cite keys from Obsidian vault ///
    let citekeysObs = await scanVault(vaultpath, metadatakeyword);
    if (citekeysObs.length == 0) {
        showNotification("No citekeys found in Obsidian Vault", "Set the path to your Obsidian Citations Notes in the ZotObsCite preferences.", false);
        success = false;
        return success;
    }

    /// read in BBT json that maps citekeys to Zotero ids ///
    let citekeymap = await mapCitekeys(bbtjson);
    if (Object.keys(citekeymap).length == 0) {
        showNotification("BBT JSON Library Export Not Found", "Set the path to your auto-updating BBT JSON export in the ZotObsCite preferences.", false);
        success = false;
        return success;
    }

    /// slice with obs keys
    let citekeyids = await sliceObj(citekeymap, citekeysObs, promptSaveErrors);
    if (citekeyids.length == 0) {
        showNotification("No Matching Entries", "None of the ObsCite citekeys match entries in the BBT JSON", false);
        success = false;
        return success;
    }

    return citekeyids;
}


async function updateItems(citekeyids) {
    let success = false;

    /// find all item already tagged
    let items_withtags = await findTaggedItems();

    /// find all items that should be tagged
    let items_withnotes = await Zotero.Items.getAsync(citekeyids);

    /// find items to be tagged
    let items_totag = items_withnotes.filter(x => !items_withtags.includes(x));

    /// find items that should not be tagged
    let items_removetag = items_withtags.filter(x => !items_withnotes.includes(x));

    /// find items that cannot be located in library
    const nitems_notlocatable = citekeyids.length - items_withnotes.length;
    if (citekeyids.length != items_withnotes.length) {
        showNotification("BBT JSON mismatch", "" + nitems_notlocatable.toString() + " IDs in the BBT JSON could not be matched to items in the library", false);
    }

    /// remove tag from items that should not be tagged
    items_removetag.forEach(function rmTag(item) {
        item.removeTag('ObsCite');
        item.saveTx();
    });

    ///DEBUG this doesn't run as soon as zotero is started, needs to wait for something to load
    /// add tag to items that should be tagged
    items_totag.forEach(function addTag(item) {
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
    // showNotification("ZoteroObsidianCitations Synced", message, true);

    success = true;
    return message;
}


async function runSyncWithObsidian(promptSaveErrors, syncTags) {
    const vaultpath = getPref('source_dir');
    const bbtjson = getPref('bbtjson');
    const metadatakeyword = getPref('metadatakeyword');

    let notifData = ["ZoteroObsidianCitations Syncing Error", "Some Error Occurred", false];
    if (await checkRequirements(vaultpath, bbtjson)) {
        const citekeyids = await checkDependencies(vaultpath, bbtjson, metadatakeyword, promptSaveErrors);
        if (syncTags && citekeyids.length > 0) {
            let message = await updateItems(citekeyids);
            notifData = ["ZoteroObsidianCitations Synced", message, true];
        } else {
            let message = "Found " + citekeyids.length.toString() + " notes.";
            notifData = ["ZoteroObsidianCitations Synced", message, true];
        }
    }
    return notifData;
}

// Preference managers

function getPref(pref) {
    return Zotero.Prefs.get('extensions.obscite.' + pref, true);
};

function setPref(pref, value) {
    return Zotero.Prefs.set('extensions.obscite.' + pref, value, true);
};

// Startup - initialize plugin

Zotero.ObsCite.init = function () {
    ///DEBUG replace delay with load callback
    ///DEBUG something about addTab() doesn't work right away, needs to wait for something to load
    /// https://github.com/retorquere/zotero-better-bibtex/blob/1010c42e090062f1753bb15ddf6e232bb28dd894/content/better-bibtex.ts#L740
    /// waitingForZotero
    setTimeout(() => {
        Zotero.ObsCite.initialDependencyCheck();
    }, 2000);

    ///DEBUG this needs update
    // Register the callback in Zotero as an item observer
    const notifierID = Zotero.Notifier.registerObserver(
        Zotero.ObsCite.notifierCallback, ['item']);

    ///DEBUG this needs update
    // Unregister callback when the window closes (important to avoid a memory leak)
    window.addEventListener('unload', function (e) {
        Zotero.Notifier.unregisterObserver(notifierID);
    }, false);
};

///DEBUG this needs updated
Zotero.ObsCite.notifierCallback = {
    notify: function (event, type, ids, extraData) {
        if (event == 'add') {
            // const operation = getPref("autoretrieve");
            // Zotero.ObsCite.updateItems(Zotero.Items.get(ids), operation);
        }
    }
};

// Controls for Tools menu

Zotero.ObsCite.initialDependencyCheck = async function initDepCheck() {
    const promptSaveErrors = false;
    ///TODO make this a preference
    const syncTags = true; // syncOnStart
    const notifData = await runSyncWithObsidian(promptSaveErrors, syncTags);
    showNotification(...notifData);
};

Zotero.ObsCite.syncWithObsidian = async function syncWithObsidianWrapper() {
    const promptSaveErrors = true;
    const syncTags = true;
    const notifData = await runSyncWithObsidian(promptSaveErrors, syncTags);
    showNotification(...notifData);
};

Zotero.ObsCite.chooseValueFolder = async function selectValueFolderWrapper() {
    const vaultpath = await selectValueFolder();
    if (vaultpath != '' && vaultpath != undefined && vaultpath != null && await OS.File.exists(vaultpath)) {
        setPref('source_dir', vaultpath);
    }
};

Zotero.ObsCite.chooseBBTjson = async function selectBBTjsonWrapper() {
    const bbtjson = await selectBBTjson();
    if (bbtjson != '' && bbtjson != undefined && bbtjson != null && await OS.File.exists(bbtjson)) {
        setPref('bbtjson', bbtjson);
    }
};

Zotero.ObsCite.checkMetadataFormat = function checkMetadataFormatWrapper() {
    const metadatakeyword = getPref('metadatakeyword');
    let found = [];
    const notallowed = ["'", '"', ":", "\n", "/", "\\", "?", "*", "|", ">", "<", ",", ";", "=", "`", "~", "!", "#", "$", "%", "^", "&", "(", ")", "[", "]", "{", "}", " "];
    notallowed.forEach(function findchar(char) {
        if (metadatakeyword.includes(char)) {
            found.push(char);
        }
    });
    if (found.length > 0) {
        showNotification("Invalid citekey metadata", "metadata id cannot contain: " + found.join(" or ") + ".", false);
        return false;
    } else {
        return true;
    }
};

/**
 * Open obscite preference window
 */
Zotero.ObsCite.openPreferenceWindow = function (paneID, action) {
    const io = {
        pane: paneID,
        action: action
    };
    window.openDialog(
        'chrome://zoteroobscite/content/options.xul',
        'obscite-pref',
        // TODO: This looks wrong; it's always "dialog=no"?
        'chrome,titlebar,toolbar,centerscreen' + Zotero.Prefs.get('browser.preferences.instantApply', true) ? 'dialog=no' : 'modal',
        io
    );
};


if (typeof window !== 'undefined') {
    window.addEventListener('load', function (e) {
        Zotero.ObsCite.init();
    }, false);
}