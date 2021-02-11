let extensionHost = "https://webserver.net-ref.com/extension/cloud/update";
let filesHost = "https://files.net-ref.com/screenshot/upload";
let denyHost = "https://webserver.net-ref.com/block?redirected_url=";

let districtName = "Default";
let studentDbId = "-1";

let queryDelay = 5;
let screenshotDelay = 60;
let screenshotQuality = 75;

let sites = [];
let subdomainSites = [];
let monitorOutsideSchoolHours = false;
let allowedToMonitor = false;
let takeScreenshot = false;
let startDateTime = new Date();
let endDateTime = new Date();

let encodedWebSite = "";
let encodedTitle = "";
let screenshot = "";

let blockedSites = new Set();

let loadingSite = "";

let cachedScreenshot = "";
let screenshotSite = "";
let screenshotTime = Date.now();

let studentInactivityTimeout = 24 * 60 * 60 * 1000;

let directoryId = "";
let serialId = "";
let assetId = "";

let stateEnum = Object.freeze({"ALLOW":0, "WHITELIST":1, "BLACKLIST":2, "BLOCK":3});
let state = stateEnum.ALLOW;

let overrideExtensionHost = "";
let overrideFilesHost = "";
let overrideDenyHost = "";
let overrideDomain = "";
let overrideEmail = "";

let siteBytesMap = new Map()

let studentIsInactive = false;

function storeSiteByteMap(details) {
    if(details.fromCache === true) {
        return
    }
    let url = details.initiator.replace(/^(?:https?:\/\/)?(?:www\.)?/i, "")

    for (let i = 0; i < details.responseHeaders.length; i++) {
        if (details.responseHeaders[i].name === "content-length") {
            let bytes = parseInt(details.responseHeaders[i].value)

            if (bytes === 0) {
                return
            }

            if (!siteBytesMap.has(url)) {
                siteBytesMap.set(url, 0);
            }

            let currentBytes = siteBytesMap.get(url);
            currentBytes += bytes;

            siteBytesMap.set(url, currentBytes);
        }
    }
}

chrome.webRequest.onCompleted.addListener(storeSiteByteMap,
    {
        urls: [
            "<all_urls>",
        ]
    },
    ["responseHeaders"]
);

let mouseoverInterval = setInterval(() => { studentIsInactive = true; }, studentInactivityTimeout === 'undefined' || studentInactivityTimeout === null ? 24 * 60 * 60 * 1000 : studentInactivityTimeout)
chrome.runtime.onMessage.addListener(
    function (request) {
        studentIsInactive = false;
        clearInterval(mouseoverInterval)
        mouseoverInterval = setInterval(() => { studentIsInactive = true; }, studentInactivityTimeout === 'undefined' || studentInactivityTimeout === null ? 24 * 60 * 60 * 1000 : studentInactivityTimeout)
        return true
    });

function includes(site) {
    site = site.replace(/^(?:https?:\/\/)?(?:www\.)?/i, "")
    let cleanedSite = site.split('/')[0];

    if (cleanedSite.length === 0) {
        return false;
    }

    for (let i = 0; i < sites.length; i++) {
        /*
        Example:
            Site -> schoology.com/school || school.schoology.com
            Sites -> [schoology.com]
         */

        // This is true for schoology.com/school and schoology.com
        // This is not true for school.schoology.com and schoology.com
        if (cleanedSite.includes(sites[i])) {
            return true;
        }
            // This is not true for schoology.com/school and schoology.com
        // This is true for school.schoology.com and schoology.com
        else if (sites[i].includes(cleanedSite)) {
            return true;
        }
    }

    for (let i = 0; i < subdomainSites.length; i++) {
        if (site.startsWith(subdomainSites[i])) {
            return true
        }
    }

    return false;
}

function b64toBlob(b64Data) {
    let contentType = 'image/jpeg';
    let sliceSize = 512;

    let byteCharacters = atob(b64Data);
    let byteArrays = [];

    for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
        let slice = byteCharacters.slice(offset, offset + sliceSize);

        let byteNumbers = new Array(slice.length);
        for (let i = 0; i < slice.length; i++) {
            byteNumbers[i] = slice.charCodeAt(i);
        }

        let byteArray = new Uint8Array(byteNumbers);

        byteArrays.push(byteArray);
    }

    return new Blob(byteArrays, {type: contentType});
}


function isIgnoredSite(fullUrl) {
    if (fullUrl.length === 0) {
        return true;
    }
    if (fullUrl.startsWith("chrome://")) {
        return true;
    }
    if (fullUrl.startsWith("chrome-extension://")) {
        return true;
    }
    if (fullUrl.includes("screenshare.net-ref.com")) {
        return false;
    }

    let noHttps = fullUrl.replace('http://', '').replace('https://', '');
    let baseUrl = noHttps.split(/[/?#:]/)[0];
    return baseUrl.includes("net-ref.com");
}

function redirect(fullUrl) {
    if (isIgnoredSite(fullUrl)) {
        return false;
    }

    switch (state) {
        case stateEnum.ALLOW:
            return false;
        case stateEnum.WHITELIST:
            return !includes(fullUrl);
        case stateEnum.BLACKLIST:
            return includes(fullUrl);
        case stateEnum.BLOCK:
            return true;
    }
}

function navigateToBlockPage(tab) {
    let url = tab.url;

    if (isIgnoredSite(url)) {
        return;
    }

    let redirectUrl = denyHost + window.btoa(url);

    chrome.tabs.update(tab.id, {url:redirectUrl});
}

function redirectBlockedSites() {
    chrome.windows.getAll({populate: true}, function (windows) {
        windows.forEach(function (window) {
            window.tabs.forEach(function (tab) {
                if (redirect(tab.url)) {
                    console.log(tab.status);

                    let url = new URL(tab.url);
                    blockedSites.add(url.host);

                    navigateToBlockPage(tab);
                }
            });
        });
    });

    setTimeout(redirectBlockedSites,  500)
}


function parseRuleString(appliedRules) {
    let splitResponse = appliedRules.split('|');

    switch (splitResponse[0]) {
        case "ALLOW":
            state = stateEnum.ALLOW;
            sites = [];

            break;
        case "WHITELIST":
            state = stateEnum.WHITELIST;
            sites = [];
            subdomainSites = [];

            for (let i = 0; i < splitResponse.length - 1; i++) {
                let site = splitResponse[i + 1];

                let dotCount = site.split(".").length - 1;
                let hasPath = site.split("/").length > 1;

                if (dotCount <= 1 && !hasPath) {
                    sites.push(site)
                } else {
                    subdomainSites.push(site)
                }
            }

            break;
        case "BLACKLIST":
            state = stateEnum.BLACKLIST;
            sites = [];
            subdomainSites = [];

            for (let i = 0; i < splitResponse.length - 1; i++) {
                let site = splitResponse[i + 1];

                let dotCount = site.split(".").length - 1;
                let hasPath = site.split("/").length > 1;

                if (dotCount <= 1 && !hasPath) {
                    sites.push(site)
                } else {
                    subdomainSites.push(site)
                }
            }

            break;
        case "BLOCK":
            state = stateEnum.BLOCK;
            sites = [];

            break;
    }
}

function pushNotification(senderName, messageText) {
    let opt = {
        type: "basic",
        title: "Message from your teacher (" + senderName + ")",
        message: messageText,
        iconUrl: "img/icon.png"
    };

    chrome.notifications.create(opt)
}

function openTab(site) {
    if (site.length === 0) {
        return
    }

    chrome.tabs.query({}, function (tabs) {
        let tabId = -1;

        for (let i = 0; i < tabs.length; i++) {
            let url = tabs[i].url.toLowerCase();

            if (url.includes(site)) {
                tabId = tabs[i].id;
                break;
            }
        }

        if (tabId === -1) {
            chrome.tabs.create({ url: "https://" + site });
        }
        else {
            chrome.tabs.update(tabId, {"active": true});
        }
    });
}

function closeTab(sites) {
    if (sites.length === 0) {
        return
    }

    chrome.tabs.query({ url: sites}, function (tabs) {
        let tabIds = tabs.map(function (tab) {
            return tab.id
        });
        chrome.tabs.remove(tabIds)
    })
}

function parseUpdatesConfiguration(xhr) {
    if (xhr.readyState === 4 && xhr.status === 200) {
        try {
            let configuration = JSON.parse(xhr.responseText);
            console.log(configuration);

            extensionHost = overrideExtensionHost.length === 0 ? configuration.extensionHost : overrideExtensionHost;
            filesHost = overrideFilesHost.length === 0 ? configuration.filesHost : overrideFilesHost;
            denyHost = overrideDenyHost.length === 0 ? configuration.denyHost : overrideDenyHost;
        } catch (e) {
            state = stateEnum.ALLOW;
            sites = [];
        }
    }
    else {
        state = stateEnum.ALLOW;
        sites = [];

        extensionHost = overrideExtensionHost.length === 0 ? extensionHost : overrideExtensionHost;
        filesHost = overrideFilesHost.length === 0 ? filesHost : overrideFilesHost;
        denyHost = overrideDenyHost.length === 0 ? denyHost : overrideDenyHost;
    }
}

function getUpdateUrl() {
    let xhr = new XMLHttpRequest();
    xhr.open("GET", "http://localhost:5555/config", true);
    xhr.onreadystatechange = function () {
        parseUpdatesConfiguration(xhr)
    };
    xhr.onerror = function () {
        chrome.identity.getProfileUserInfo(function(info) {
            let emailDomain = overrideDomain.length === 0 ? encodeURIComponent(info.email.substring(info.email.lastIndexOf('@') + 1)) : encodeURIComponent(overrideDomain);

            let xhr = new XMLHttpRequest();
            xhr.open("GET", "https://webserver.net-ref.com/extension/config?domain=" + emailDomain, true);
            xhr.setRequestHeader('Content-Type', 'application/json; charset=UTF-8');
            xhr.onreadystatechange = function () {
                parseUpdatesConfiguration(xhr)
            };
            xhr.onerror = function () {
                state = stateEnum.ALLOW;
                sites = [];
            };
            xhr.ontimeout = function () {
                state = stateEnum.ALLOW;
                sites = [];
            };

            xhr.send();
        });
    };
    xhr.send();

    setTimeout(getUpdateUrl, 30 * 1000)
}

function updateServer() {
    chrome.identity.getProfileUserInfo(function(info) {
        let emailDomain = "";

        if (info.email.length !== 0) {
            emailDomain = overrideDomain.length === 0 ? encodeURIComponent(info.email.substring(info.email.lastIndexOf('@') + 1)) : encodeURIComponent(overrideDomain);
        }

        let formData = new FormData()


        let extensionUpdate = {};

        if (studentInactivityTimeout === 'undefined' || studentInactivityTimeout === null || studentInactivityTimeout === 24 * 60 * 60 * 1000) {
            studentIsInactive = false
        }

        // extensionUpdate.version = 202055
        extensionUpdate.uuid = overrideEmail.length === 0 ? info.email : overrideEmail;

        extensionUpdate.encodedWebSite = allowedToMonitor && !studentIsInactive ? encodedWebSite : "";
        extensionUpdate.encodedTitle = allowedToMonitor && !studentIsInactive ? encodedTitle : "";
        extensionUpdate.blockedSites = allowedToMonitor ? Array.from(blockedSites) : [];

        console.log("Is Student Inactive? " + studentIsInactive);

        extensionUpdate.siteBytesMap = allowedToMonitor ? Object.fromEntries(siteBytesMap) : Object.fromEntries(new Map());

        extensionUpdate.screenshotFileName = ""

        extensionUpdate.directoryId = directoryId;
        extensionUpdate.serialId = serialId;
        extensionUpdate.assetId = assetId;

        let updateXhr = new XMLHttpRequest();
        updateXhr.open("POST", extensionHost + "?type=chrome&domain=" + emailDomain, true);
        updateXhr.setRequestHeader('Content-Type', 'application/json; charset=UTF-8');
        updateXhr.onreadystatechange = function () {
            if (updateXhr.readyState === 4 && updateXhr.status === 200) {
                try {
                    // let decompressedResponse = LZString.decompressFromUTF16(updateXhr.responseText)

                    let configuration = JSON.parse(updateXhr.responseText);
                    console.log(configuration);

                    districtName = configuration.districtName;
                    studentDbId = configuration.studentDbId;

                    monitorOutsideSchoolHours = configuration.monitorOutsideSchoolHours;
                    takeScreenshot = configuration.takeScreenshot;

                    openTab(configuration.newTabSite);
                    closeTab(configuration.closeTabSites);

                    let today = new Date();
                    startDateTime = new Date(today.getMonth() + 1 + "/" + today.getDate() + "/" + today.getFullYear() + " " + configuration.startTime);
                    endDateTime = new Date(today.getMonth() + 1 + "/" + today.getDate() + "/" + today.getFullYear() + " " + configuration.endTime);

                    allowedToMonitor = monitorOutsideSchoolHours ? true : startDateTime <= today && endDateTime >= today;

                    if (allowedToMonitor) {
                        parseRuleString(configuration.appliedRules);
                    }
                    else {
                        state = stateEnum.ALLOW;
                        sites = [];
                    }

                    let messageSender = configuration.messageSender;
                    let messageText = configuration.messageText;
                    if (messageSender !== "" && messageText !== "") {
                        pushNotification(messageSender, messageText)
                    }

                    if (configuration.hasOwnProperty('studentInactivityTimeout')) {
                        studentInactivityTimeout = configuration.studentInactivityTimeout;
                        if (studentInactivityTimeout === 0) {
                            studentInactivityTimeout = 24 * 60 * 60 * 1000;
                        }
                    } else {
                        studentInactivityTimeout = 24 * 60 * 60 * 1000;
                    }

                    if (configuration.hasOwnProperty('queryDelay')) {
                        queryDelay = configuration.queryDelay
                    }

                    if (configuration.hasOwnProperty('screenshotDelay')) {
                        screenshotDelay = configuration.screenshotDelay
                    }

                    if (configuration.hasOwnProperty('screenshotQuality')) {
                        screenshotQuality = configuration.screenshotQuality;
                    }

                } catch (e) {
                    console.log(e)

                    state = stateEnum.ALLOW;
                    sites = [];
                }
            }
            else {
                state = stateEnum.ALLOW;
                sites = [];
            }
        };
        updateXhr.onerror = function () {
            state = stateEnum.ALLOW;
            sites = [];
        };
        updateXhr.ontimeout = function () {
            state = stateEnum.ALLOW;
            sites = [];
        };

        if (allowedToMonitor && takeScreenshot && screenshot.length !== 0) {
            let fileName = districtName + "/" + studentDbId + "/" + moment().format("YYYYMMDD[/]H[/]m[_]s") + ".jpg"

            extensionUpdate.screenshotFileName = fileName
            formData.append("name", fileName)

            // Convert it to a blob to upload
            let blob = b64toBlob(screenshot.split(",")[1],);
            formData.append("screenshot", blob)


            let screenshotXhr = new XMLHttpRequest();
            screenshotXhr.open("POST", filesHost, true);
            screenshotXhr.onreadystatechange = function () {
                if (screenshotXhr.readyState === 4 && screenshotXhr.status === 200) {
                    let updateString = JSON.stringify(extensionUpdate);
                    updateXhr.send(updateString);
                    console.log(updateString);
                }
            }
            screenshotXhr.onerror = function () {
                console.log("Failed to upload screenshot")
            };
            screenshotXhr.ontimeout = function () {
                console.log("Failed to upload screenshot")
            };

            screenshotXhr.send(formData)
        } else {
            let updateString = JSON.stringify(extensionUpdate);
            updateXhr.send(updateString);
            console.log(updateString);
        }

        screenshot = "";
        blockedSites = new Set();
        siteBytesMap = new Map();
    });

    setTimeout(updateServer, 5 * 1000)
}

function getCurrentSite() {
    chrome.tabs.query({ active: true, lastFocusedWindow: true}, function (tabs) {
        if (tabs.length > 0) {
            let url = tabs[0].url;
            let title = tabs[0].title;

            if (tabs[0].status === "loading") {
                if (loadingSite !== url) {
                    console.log("Site " + url + " is loading");

                    loadingSite = url;

                    return;
                }
            }
            else {
                loadingSite = "";
            }

            if (loadingSite !== url) {
                loadingSite = "";
            }
            else {
                console.log("Site " + url + " took too long to load");
            }

            if (isIgnoredSite(url)) {
                encodedWebSite = "";
                encodedTitle = "";

                screenshotSite = "";
                return
            }

            if (screenshotSite !== url) {
                chrome.tabs.captureVisibleTab(null, {format: "jpeg", quality: screenshotQuality}, function (img) {
                    console.log("Taking Screenshot");
                    screenshot = img;
                    cachedScreenshot = img;
                    screenshotSite = url;
                    screenshotTime = Date.now();
                });
            } else if ((Date.now() - screenshotTime) / 1000 > screenshotDelay) {
                console.log("Site is the same. Taking Screenshot");
                chrome.tabs.captureVisibleTab(null, {format: "jpeg", quality: screenshotQuality}, function (img) {
                    if (cachedScreenshot !== img) {
                        console.log("Screenshot is not the same. Saving Screenshot");
                        screenshot = img;
                        cachedScreenshot = img;
                        screenshotSite = url;
                        screenshotTime = Date.now();
                    } else {
                        console.log("Screenshot is the same. Not saving Screenshot")
                    }
                });
            } else {
                console.log("Site is same but only " + (Date.now() - screenshotTime) / 1000 + " seconds have passed. Not Taking Screenshot")
            }

            encodedWebSite = btoa(url);
            encodedTitle = btoa(title);
        }
    });

    setTimeout(getCurrentSite, queryDelay * 1000);
}

function getDirectoryId() {
    chrome.enterprise.deviceAttributes.getDirectoryDeviceId(function (id) {
        directoryId = id
    });

    setTimeout(getDirectoryId, queryDelay * 2 * 1000)
}

function getSerialNumber() {
    chrome.enterprise.deviceAttributes.getDeviceSerialNumber(function (id) {
        serialId = id
    });

    setTimeout(getSerialNumber, queryDelay * 2 * 1000)
}

function getAssetId() {
    chrome.enterprise.deviceAttributes.getDeviceAssetId(function (id) {
        assetId = id
    });

    setTimeout(getAssetId, queryDelay * 2 * 1000)
}

getUpdateUrl();
updateServer();
redirectBlockedSites();
getCurrentSite();

getDirectoryId();
getSerialNumber();
getAssetId();
