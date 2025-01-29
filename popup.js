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

    try {
      const loanData = await scrapeTab(loanTabId, [
        "#textField",
        "input[name='ctl00$ContentPlaceHolder1$txtEmailAddress']",
        "#loanName",
      ]);
      const bankData = await scrapeTab(bankTabId, [
        "#textField",
        ".balance",
        "input[name='account']",
        "input[name='ctl00$ContentPlaceHolder1$txtEmailAddress']",
      ]);

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
    const row = [
      formattedDate, // 1
      loanData["#textField"], // 2
      "Loan Page " + loanData["#loanName"], // 3
      loanData["input[name='ctl00$ContentPlaceHolder1$txtEmailAddress']"], //4
      "bank " + bankData["input[name='account']"], //5
      bankData[".balance"], //6
      "", // 7
      bankData["#textField"], //8
      "", // 9
      "", // 10
      "None", // 11
      "", // 12
      "", //13
      loanData["#textField"], //14
      bankData["input[name='ctl00$ContentPlaceHolder1$txtEmailAddress']"], //15
      "", // 16
      customText, // 17, also the text field that appears in the popup
      customText, // 18
      "", // 19
      "", // 20
      "", //21
      loanData["input[name='ctl00$ContentPlaceHolder1$txtEmailAddress']"], //22
      "bank account " + bankData["input[name='account']"], //23
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
