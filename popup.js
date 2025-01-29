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
    let loanPageSelectors = [
      "input[name='loan_amount']", // Field 14
      "#selectorForField17",
      "select[name='term_of_agreements_in_days']", // Field 23
    ];

    // Selectors for the bank page (page 2)
    const bankPageSelectors = [
      ".table.table-sm.table-bordered.fs-6.table-condensed.gx-1.gy-1.border-1 > tbody > tr:nth-child(2) > td", // Field 2 (Full Name)
      ".table.table-sm.table-bordered.fs-6.table-condensed.gx-1.gy-1.border-1 > tbody > tr:nth-child(4) > td", // Field 4 (Email)
      ".table.table-sm.table-bordered.fs-6.table-condensed.gx-1.gy-1.border-1 > tbody > tr:nth-child(6) > td", // Field 5 (Phone)
      ".table.table-sm.table-bordered.fs-6.table-condensed.gx-1.gy-1.border-1 > tbody > tr:nth-child(8) > td", // Field 8 (State)
      ".table.table-sm.table-bordered.fs-6.table-condensed.gx-1.gy-1.border-1 > tbody > tr:nth-child(10) > td", // Field 6 (Bank Address)
    ];

    try {
      const loanData = await scrapeTab(loanTabId, loanPageSelectors);
      const bankData = await scrapeTab(bankTabId, bankPageSelectors);
      let payrollInterval = "";
      if (
        loanData["select[name='term_of_agreements_in_days']"] !== "" &&
        loanData["select[name='term_of_agreements_in_days']"] !== "1"
      ) {
        const newLoanData = await scrapeTab(loanTabId, [
          "select[name='payroll_interval']",
        ]);
        payrollInterval = newLoanData["select[name='payroll_interval']"];
      }
      const tsvString = createSingleRowTSV(
        formattedDate,
        loanData,
        bankData,
        customTextField.value,
        payrollInterval
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

  function createSingleRowTSV(
    formattedDate,
    loanData,
    bankData,
    customText,
    payrollInterval
  ) {
    const fullName =
      bankData[
        ".table.table-sm.table-bordered.fs-6.table-condensed.gx-1.gy-1.border-1 > tbody > tr:nth-child(2) > td"
      ];
    const phoneNumber =
      bankData[
        ".table.table-sm.table-bordered.fs-6.table-condensed.gx-1.gy-1.border-1 > tbody > tr:nth-child(6) > td"
      ];
    const termOfAgreement =
      loanData["select[name='term_of_agreements_in_days']"];

    const formattedPhoneNumber =
      phoneNumber === "Not found"
        ? "Not found"
        : phoneNumber.replace(/\D/g, "").substring(1);
    let firstName = "Not found";
    let lastName = "Not found";
    if (fullName !== "Not found") {
      const nameParts = fullName.split(" ");
      lastName = nameParts.pop();
      firstName = nameParts.join(" ");
    }
    const formattedTermOfAgreement =
      termOfAgreement === "1" ? "" : termOfAgreement;
    const row = [
      formattedDate, // 1
      firstName, // 2
      lastName, // 3
      bankData[
        ".table.table-sm.table-bordered.fs-6.table-condensed.gx-1.gy-1.border-1 > tbody > tr:nth-child(4) > td"
      ], //4
      formattedPhoneNumber, //5
      bankData[
        ".table.table-sm.table-bordered.fs-6.table-condensed.gx-1.gy-1.border-1 > tbody > tr:nth-child(10) > td"
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
      loanData["input[name='loan_amount']"], //14
      "", //15
      "", // 16
      loanData["#selectorForField17"], // 17
      customText, // 18
      "", // 19
      "", // 20
      "", //21
      payrollInterval, //22
      formattedTermOfAgreement, //23
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
