document.addEventListener("DOMContentLoaded", () => {
  const daElement = document.getElementById("da");
  const paElement = document.getElementById("pa");
  const mozTrustElement = document.getElementById("mozTrust");
  const spamScoreElement = document.getElementById("spamScore");
  const domainAgeElement = document.getElementById("domainAge");
  const cacheDateElement = document.getElementById("cacheDate");
  const refreshStatus = document.getElementById("refreshStatus");

  function formatNumber(value) {
    return typeof value === "number" && !isNaN(value) ? value.toLocaleString() : "N/A";
  }

  function setLoadingState() {
    daElement.textContent = "Loading...";
    paElement.textContent = "Loading...";
    mozTrustElement.textContent = "Loading...";
    spamScoreElement.textContent = "Loading...";
    domainAgeElement.textContent = "Loading...";
    cacheDateElement.textContent = "";
  }

  function extractRootDomain(domain) {
    const parts = domain.split('.');
    if (parts.length > 2) return parts.slice(-2).join('.');
    return domain;
  }

  function getReadableDomainAge(createdDate) {
    const created = new Date(createdDate);
    const now = new Date();
    let years = now.getFullYear() - created.getFullYear();
    let months = now.getMonth() - created.getMonth();
    let days = now.getDate() - created.getDate();

    if (days < 0) {
      months--;
      days += new Date(now.getFullYear(), now.getMonth(), 0).getDate();
    }
    if (months < 0) {
      years--;
      months += 12;
    }

    let parts = [];
    if (years > 0) parts.push(`${years} year${years > 1 ? 's' : ''}`);
    if (months > 0) parts.push(`${months} month${months > 1 ? 's' : ''}`);
    if (years === 0 && months === 0 && days > 0) parts.push(`${days} day${days > 1 ? 's' : ''}`);
    return parts.join(', ');
  }

  // Load DA/PA/etc from your background
  chrome.runtime.sendMessage({ message: "getData" }, (response) => {
    if (chrome.runtime.lastError || response.error) {
      daElement.textContent = "N/A";
      paElement.textContent = "N/A";
      mozTrustElement.textContent = "N/A";
      spamScoreElement.textContent = "N/A";
      domainAgeElement.textContent = "N/A";
      cacheDateElement.textContent = "";
    } else {
      daElement.textContent = response.da || "N/A";
      paElement.textContent = response.pa || "N/A";
      mozTrustElement.textContent = response.mozTrust || "N/A";
      spamScoreElement.textContent = response.spamScore || "N/A";
      if (response.lastUpdated) {
        const lastUpdatedDate = new Date(response.lastUpdated).toLocaleString('en-US', {
          month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
        });
        cacheDateElement.textContent = `Metrics updated on ${lastUpdatedDate}`;
      }
    }
  });

  // WHOIS domain age using api.whois.vu
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0] && tabs[0].url) {
      const hostname = new URL(tabs[0].url).hostname;
      const domain = extractRootDomain(hostname);

      fetch(`https://api.whois.vu/?q=${domain}`)
        .then(res => res.json())
        .then(data => {
          console.log("WHOIS API result:", data);
          if (data && data.created) {
            const createdDate = new Date(data.created * 1000); // from UNIX timestamp
            domainAgeElement.textContent = getReadableDomainAge(createdDate);
          } else {
            domainAgeElement.textContent = "N/A";
          }
        })
        .catch(err => {
          console.error("WHOIS API failed:", err);
          domainAgeElement.textContent = "N/A";
        });
    } else {
      domainAgeElement.textContent = "N/A";
    }
  });

  // Refresh metrics
  document.getElementById("forceRefresh").addEventListener("click", () => {
    refreshStatus.style.display = "none";
    setLoadingState();
    chrome.runtime.sendMessage({ message: "forceRefresh" }, (response) => {
      if (chrome.runtime.lastError || response.error) {
        daElement.textContent = "N/A";
        paElement.textContent = "N/A";
        mozTrustElement.textContent = "N/A";
        spamScoreElement.textContent = "N/A";
        domainAgeElement.textContent = "N/A";
        cacheDateElement.textContent = "";
      } else {
        daElement.textContent = response.da || "N/A";
        paElement.textContent = response.pa || "N/A";
        mozTrustElement.textContent = response.mozTrust || "N/A";
        spamScoreElement.textContent = response.spamScore || "N/A";
        const now = new Date().toLocaleString();
        cacheDateElement.textContent = `Metrics last updated: ${now}`;
        refreshStatus.textContent = "Data refreshed!";
        refreshStatus.style.display = "block";
      }
    });
  });
});
