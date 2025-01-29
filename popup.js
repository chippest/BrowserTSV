document.addEventListener("DOMContentLoaded", function () {
  const loanPageSelect = document.getElementById("loanPageSelect");
  const bankStatementSelect = document.getElementById("bankStatementSelect");
  const scrapeButton = document.getElementById("scrapeButton");
  const resultsDiv = document.getElementById("results");
  const customTextField = document.createElement("input");
  customTextField.type = "text";
  customTextField.placeholder = "Enter text for field 18";
  resultsDiv.parentNode.insertBefore(customTextField, resultsDiv);

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

    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    const formattedDate = `${year}-${month}-${day}`;

    // Selectors for the loan page (page 1)
    const loanPageSelectors = [
      "#selectorForField14",
      "#selectorForField17",
      "#selectorForField22",
    ];

    // Selectors for the bank page (page 2)
    const bankPageSelectors = [
      ".table.table-sm.table-bordered.fs-6.table-condensed.gx-1.gy-1.border-1 > tbody > tr:nth-child(2) > td", // Field 2 (Full Name)
      ".table.table-sm.table-bordered.fs-6.table-condensed.gx-1.gy-1.border-1 > tbody > tr:nth-child(4) > td", // Field 4 (Email)
      ".table.table-sm.table-bordered.fs-6.table-condensed.gx-1.gy-1.border-1 > tbody > tr:nth-child(6) > td", // Field 5 (Phone)
      ".table.table-sm.table-bordered.fs-6.table-condensed.gx-1.gy-1.border-1 > tbody > tr:nth-child(8) > td", // Field 8 (State)
      ".table.table-sm.table-bordered.fs-6.table-condensed.gx-1.gy-1.border-1 > tbody > tr:nth-child(12) > td", // Field 6 (Bank Address)
      "#selectorForField15",
      "#selectorForField23",
    ];

    try {
      const loanData = await scrapeTab(loanTabId, loanPageSelectors);
      const bankData = await scrapeTab(bankTabId, bankPageSelectors);

      const tsvString = createSingleRowTSV(
        formattedDate,
        loanData,
        bankData,
        customTextField.value
      );

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

  function createSingleRowTSV(formattedDate, loanData, bankData, customText) {
    const phoneNumber =
      bankData[
        ".table.table-sm.table-bordered.fs-6.table-condensed.gx-1.gy-1.border-1 > tbody > tr:nth-child(6) > td"
      ];

    const formattedPhoneNumber =
      phoneNumber === "Not found"
        ? "Not found"
        : phoneNumber.replace(/\D/g, "").substring(1);

    const row = [
      formattedDate, // 1
      bankData[
        ".table.table-sm.table-bordered.fs-6.table-condensed.gx-1.gy-1.border-1 > tbody > tr:nth-child(2) > td"
      ], // 2
      loanData["#selectorForField3"], // 3
      bankData[
        ".table.table-sm.table-bordered.fs-6.table-condensed.gx-1.gy-1.border-1 > tbody > tr:nth-child(4) > td"
      ], //4
      formattedPhoneNumber, //5
      bankData[
        ".table.table-sm.table-bordered.fs-6.table-condensed.gx-1.gy-1.border-1 > tbody > tr:nth-child(12) > td"
      ], //6
      "", // 7
      bankData[
        ".table.table-sm.table-bordered.fs-6.table-condensed.gx-1.gy-1.border-1 > tbody > tr:nth-child(8) > td"
      ], //8
      "", // 9
      "", // 10
      "None", // 11
      "", // 12
      "", //13
      loanData["#selectorForField14"], //14
      bankData["#selectorForField15"], //15
      "", // 16
      loanData["#selectorForField17"], // 17, also a scraped field.
      customText, // 18
      "", // 19
      "", // 20
      "", //21
      loanData["#selectorForField22"], //22
      bankData["#selectorForField23"], //23
    ].join("\t");
    return row;
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
