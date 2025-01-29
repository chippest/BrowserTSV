document.addEventListener("DOMContentLoaded", function () {
  const loanPageSelect = document.getElementById("loanPageSelect");
  const bankStatementSelect = document.getElementById("bankStatementSelect");
  const scrapeButton = document.getElementById("scrapeButton");
  const resultsDiv = document.getElementById("results");

  // Function to populate the select dropdowns
  function populateTabDropdowns() {
    chrome.tabs.query({}, function (tabs) {
      tabs.forEach((tab) => {
        const option = document.createElement("option");
        option.value = tab.id;
        option.text = tab.title || tab.url;
        loanPageSelect.add(option.cloneNode(true));
        bankStatementSelect.add(option);
      });
    });
  }

  populateTabDropdowns();

  scrapeButton.addEventListener("click", function () {
    const loanTabId = parseInt(loanPageSelect.value, 10);
    const bankTabId = parseInt(bankStatementSelect.value, 10);
    if (!loanTabId || !bankTabId) {
      resultsDiv.textContent = "Please select both tabs.";
      return;
    }
    scrapeData(loanTabId, bankTabId);
  });

  async function scrapeData(loanTabId, bankTabId) {
    resultsDiv.textContent = "Scraping...";

    try {
      const loanData = await scrapeTab(loanTabId, [
        "#textField",
        "#loanName",
        "input[name='ctl00$ContentPlaceHolder1$txtEmailAddress']",
      ]);
      const bankData = await scrapeTab(bankTabId, [
        "#textField",
        ".balance",
        "input[name='account']",
        "input[name='ctl00$ContentPlaceHolder1$txtEmailAddress']",
      ]);

      const tsvString = convertToTSV(loanData, bankData);
      copyToClipboard(tsvString);
      resultsDiv.textContent = "Data copied to clipboard as TSV!";
    } catch (error) {
      resultsDiv.textContent = "Error during scraping:" + error.message;
    }
  }

  async function scrapeTab(tabId, selectors) {
    return new Promise((resolve, reject) => {
      chrome.scripting.executeScript(
        {
          target: { tabId: tabId },
          function: (selectors) => {
            const scrapedData = {};
            selectors.forEach((selector) => {
              const el = document.querySelector(selector);
              scrapedData[selector] = el
                ? (el.value || el.innerText).trim()
                : "Not found";
            });
            return scrapedData;
          },
          args: [selectors],
        },
        function (injectionResults) {
          if (chrome.runtime.lastError) {
            return reject(chrome.runtime.lastError);
          }

          if (
            injectionResults &&
            injectionResults.length > 0 &&
            injectionResults[0].result
          ) {
            return resolve(injectionResults[0].result);
          }

          reject(new Error("No result found"));
        }
      );
    });
  }

  function convertToTSV(loanData, bankData) {
    const header = [
      "Tab",
      "Text Field",
      "Loan Name",
      "Email Address",
      "Balance",
      "Account Name",
    ].join("\t");
    const loanRow = [
      "Loan Page",
      loanData["#textField"],
      loanData["#loanName"],
      loanData["input[name='ctl00$ContentPlaceHolder1$txtEmailAddress']"],
      " ",
      " ",
    ].join("\t");
    const bankRow = [
      "Bank Statement",
      bankData["#textField"],
      " ",
      bankData["input[name='ctl00$ContentPlaceHolder1$txtEmailAddress']"],
      bankData[".balance"],
      bankData["input[name='account']"],
    ].join("\t");
    return header + "\n" + loanRow + "\n" + bankRow;
  }

  function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(
      function () {},
      function (err) {
        console.error("Could not copy text: ", err);
      }
    );
  }
});
