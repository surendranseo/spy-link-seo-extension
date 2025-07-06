// In-memory cache to store DA metrics by URL, loaded from storage
let metricsCache = {};

// Load existing cache from storage when the service worker starts
chrome.storage.local.get("metricsCache", (result) => {
  if (result.metricsCache) {
    metricsCache = result.metricsCache;
    console.log("Loaded metricsCache from storage:", metricsCache);
  }

  // Register event listeners only after cache is loaded
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url) {
      const url = new URL(tab.url).origin;
      const metrics = metricsCache[url];
      if (metrics && isDataFresh(metrics.lastUpdated)) {
        updateBadgeForURL(url, metrics.da, getBadgeText(metrics), getBadgeColor(metrics.lastUpdated));
      } else if (!metrics || isAutoRefreshNeeded(metrics?.lastUpdated)) {
        // Always fetch if there's no metrics yet, or auto-refresh is needed
        const domain = url.replace(/^https?:\/\//, '');
        fetchAndCacheDAData(domain, url, null, () => {
          console.log(`Auto-fetched fresh data for: ${url}`);
        });
      } else {
        chrome.action.setBadgeText({ text: "n/a", tabId: tabId });
        chrome.action.setBadgeBackgroundColor({ color: "#808080", tabId: tabId }); 
        chrome.action.setBadgeTextColor({ color: "#FFFFFF", tabId: tabId });
      }
    }
  });

  chrome.tabs.onActivated.addListener((activeInfo) => {
    chrome.tabs.get(activeInfo.tabId, (tab) => {
      if (tab.url) {
        const url = new URL(tab.url).origin;
        const metrics = metricsCache[url];
        if (metrics && isDataFresh(metrics.lastUpdated)) {
          updateBadgeForURL(url, metrics.da, getBadgeText(metrics), getBadgeColor(metrics.lastUpdated));
        } else if (!metrics || isAutoRefreshNeeded(metrics?.lastUpdated)) {
          const domain = url.replace(/^https?:\/\//, '');
          fetchAndCacheDAData(domain, url, null, () => {
            console.log(`Auto-fetched fresh data for: ${url}`);
          });
        } else {
          chrome.action.setBadgeText({ text: "n/a", tabId: activeInfo.tabId });
          chrome.action.setBadgeBackgroundColor({ color: "#808080", tabId: activeInfo.tabId }); 
          chrome.action.setBadgeTextColor({ color: "#FFFFFF", tabId: activeInfo.tabId });
        }
      }
    });
  });
});

// Function to save the in-memory cache to storage
function saveCacheToStorage() {
  chrome.storage.local.set({ metricsCache }, () => {
    console.log("metricsCache saved to storage:", metricsCache);
  });
}

function fetchAndCacheDAData(domain, url, tabId, sendResponse) {
  const proxyURL = `https://netbase.media/websiteseochecker-pro-api/fetch-da.php?domain=${domain}`;

  fetch(proxyURL)
    .then(response => {
      if (!response.ok) {
        throw new Error(`Network response was not ok: ${response.statusText}`);
      }
      return response.json();
    })
    .then(data => {
      if (data && data[0] && data[0]["Domain Authority"] !== undefined) {
        const newDA = data[0]["Domain Authority"];
        const oldMetrics = metricsCache[url] || {};

        // Preserve existing metrics if they are not included in the response
        const metrics = {
          da: newDA,
          pa: data[0]["Page Authority"] || oldMetrics.pa || "n/a",
          mozTrust: data[0]["MozTrust"] || oldMetrics.mozTrust || "n/a",
          spamScore: data[0]["Spam Score"] || oldMetrics.spamScore || "n/a",
          totalBacklinks: data[0]["Total backlinks"] || oldMetrics.totalBacklinks || "n/a",
          qualityBacklinks: data[0]["Quality backlinks"] || oldMetrics.qualityBacklinks || "n/a",
          qualityBacklinksPercentage: data[0]["quality backlinks percentage"] || oldMetrics.qualityBacklinksPercentage || "n/a",
          change: newDA - (oldMetrics.da || newDA),
          lastUpdated: Date.now()
        };

        metricsCache[url] = metrics;
        saveCacheToStorage();
        updateBadgeForURL(url, metrics.da, getBadgeText(metrics), getBadgeColor(metrics.lastUpdated));

        if (sendResponse) sendResponse({ ...metrics, error: null });
      } else {
        updateBadgeForURL(url, "n/a", "", "#FF0000");
        if (sendResponse) sendResponse({ error: "Data structure unexpected or incomplete" });
      }
    })
    .catch(error => {
      console.error("Error fetching DA data:", error);
      updateBadgeForURL(url, "Err", "", "#FF0000");
      if (sendResponse) sendResponse({ error: `Error fetching data: ${error.message}` });
    });
}

function updateBadgeForURL(url, da, textSuffix, backgroundColor) {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
      if (tab.url && tab.url.includes(url)) {
        chrome.action.setBadgeText({ text: `${da}${textSuffix}`, tabId: tab.id });
        chrome.action.setBadgeBackgroundColor({ color: backgroundColor, tabId: tab.id });
        chrome.action.setBadgeTextColor({ color: "#FFFFFF", tabId: tab.id });
      }
    });
  });
}

function isDataFresh(lastUpdated) {
  const maxLifetime = 3 * 24 * 60 * 60 * 1000;
  return Date.now() - lastUpdated < maxLifetime;
}

function isAutoRefreshNeeded(lastUpdated) {
  const maxAutoRefreshTime = 30 * 24 * 60 * 60 * 1000;
  return lastUpdated && Date.now() - lastUpdated > maxAutoRefreshTime;
}

function getBadgeColor(lastUpdated) {
  const age = Date.now() - lastUpdated;
  const grayThreshold = 3 * 24 * 60 * 60 * 1000;
  return age >= grayThreshold ? "#808080" : "#006400";
}

function getBadgeText(metrics) {
  const { change, lastUpdated } = metrics;
  const arrowDuration = 7 * 24 * 60 * 60 * 1000;
  if (Date.now() - lastUpdated > arrowDuration) {
    return "";
  }
  if (change > 0) return " ▲ ";
  if (change < 0) return " ▼ ";
  return "";
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.message === "getData") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].url) {
        const url = new URL(tabs[0].url).origin;
        const domain = url.replace(/^https?:\/\//, '');
        const metrics = metricsCache[url];
        if (metrics && isDataFresh(metrics.lastUpdated)) {
          updateBadgeForURL(url, metrics.da, getBadgeText(metrics), getBadgeColor(metrics.lastUpdated));
          sendResponse({ ...metrics, error: null });
        } else {
          fetchAndCacheDAData(domain, url, tabs[0].id, sendResponse);
        }
      } else {
        sendResponse({ error: "Invalid tab URL" });
      }
    });
    return true;
  } else if (request.message === "forceRefresh") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].url) {
        const url = new URL(tabs[0].url).origin;
        const domain = url.replace(/^https?:\/\//, '');
        fetchAndCacheDAData(domain, url, tabs[0].id, sendResponse);
      }
    });
    return true;
  }
});
