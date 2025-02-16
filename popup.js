// Wait for the popup to load.
document.addEventListener("DOMContentLoaded", () => {
  const loanPageSelect = document.getElementById("loanPageSelect");
  const bankStatementSelect = document.getElementById("bankStatementSelect");
  const scrapeButton = document.getElementById("scrapeButton");
  const monthSelect = document.getElementById("monthSelect");
  const startingRowInput = document.getElementById("startingRowInput");
  const defaultTextField = document.getElementById("defaultTextField");
  const resultsDiv = document.getElementById("results");

  // --- LOCAL STORAGE SETUP ---
  // Load stored values (if any) when the popup loads.
  if (localStorage.getItem("startingRowInput")) {
    startingRowInput.value = localStorage.getItem("startingRowInput");
  }
  if (localStorage.getItem("defaultTextField")) {
    defaultTextField.value = localStorage.getItem("defaultTextField");
  }

  // Save the Starting Row value as soon as it changes.
  startingRowInput.addEventListener("input", () => {
    localStorage.setItem("startingRowInput", startingRowInput.value);
  });

  // Save the User value as soon as it changes.
  defaultTextField.addEventListener("input", () => {
    localStorage.setItem("defaultTextField", defaultTextField.value);
  });

  // Populate the dropdowns with all open tabs.
  browser.tabs
    .query({})
    .then((tabs) => {
      tabs.forEach((tab) => {
        // Option for Loan Page dropdown
        const optionLoan = document.createElement("option");
        optionLoan.value = tab.id;
        optionLoan.text = tab.title;
        loanPageSelect.appendChild(optionLoan);

        // Option for Bank Statement dropdown
        const optionBank = document.createElement("option");
        optionBank.value = tab.id;
        optionBank.text = tab.title;
        bankStatementSelect.appendChild(optionBank);
      });
    })
    .catch((error) => {
      console.error("Error querying tabs:", error);
    });

  // When the Send Data button is clicked.
  scrapeButton.addEventListener("click", async () => {
    const loanTabId = parseInt(loanPageSelect.value, 10);
    const bankTabId = parseInt(bankStatementSelect.value, 10);

    if (isNaN(loanTabId) || isNaN(bankTabId)) {
      resultsDiv.textContent = "Please select valid tabs.";
      return;
    }

    // Execute script in the Loan Page tab to get the value from '#id_expiry_date'
    let value1 = await browser.tabs
      .executeScript(loanTabId, {
        code: `
        (function() {
          var el = document.querySelector('#id_expiry_date');
          if (!el) return 'Element not found';
          return el.value || el.innerText;
        })();
      `,
      })
      .then((results) => results[0])
      .catch((err) => {
        console.error(err);
        return "Error";
      });

    // Execute script in the Bank Statement tab to get the innerText from the target element.
    let value2 = await browser.tabs
      .executeScript(bankTabId, {
        code: `
        (function() {
          var el = document.querySelector('table.table-bordered:nth-child(2) > tbody:nth-child(1) > tr:nth-child(4) > td:nth-child(1)');
          if (!el) return 'Element not found';
          return el.innerText;
        })();
      `,
      })
      .then((results) => results[0])
      .catch((err) => {
        console.error(err);
        return "Error";
      });

    // Create an array with the fetched values.
    const dataArray = [value1, value2];

    // Convert the array into a TSV (tab-separated) string.
    const tsvData = dataArray.join("\t");

    // (Optional) Show the fetched values in the popup.
    resultsDiv.innerHTML = `<strong>Loan Page Value:</strong> ${value1}<br>
                            <strong>Bank Statement Value:</strong> ${value2}<br>
                            <strong>TSV Data:</strong> ${tsvData}`;

    // Now send the TSV data along with the other variables to your Google Apps Script.
    sendToGoogleSheet(tsvData);
  });
});

/**
 * Sends the TSV data and additional variables to the Google Apps Script.
 */
function sendToGoogleSheet(tsvData) {
  const sheetId = "1jOkjsTLP7SZ-6qIfvKtVg5T_e8gEh4jhW5LsCSldUfs"; // Replace with the actual Sheet ID if needed.
  const sheetName = "Client List 2023";
  const startingRow =
    parseInt(document.getElementById("startingRowInput").value, 10) || 2;

  const monthSelect = document.getElementById("monthSelect");
  const selectedOption = monthSelect.options[monthSelect.selectedIndex];
  const reloanStartRow = selectedOption.dataset.startRow || "";
  const reloanMonth = selectedOption.value || "";
  const reloanYear = selectedOption.dataset.year || "";

  // Determine reloanEndRow based on the next month (or set a default).
  let reloanEndRow = "";
  if (reloanStartRow) {
    const nextMonthIndex =
      (monthSelect.selectedIndex % (monthSelect.options.length - 1)) + 1;
    const nextMonthOption = monthSelect.options[nextMonthIndex];
    reloanEndRow = nextMonthOption
      ? nextMonthOption.dataset.startRow || ""
      : "";
    if (reloanEndRow === "") {
      reloanEndRow = 19000;
    }
    reloanEndRow = parseInt(reloanEndRow, 10) - 1;
  }

  const data = {
    sheetId: sheetId,
    sheetName: sheetName,
    tsvData: tsvData,
    startingRow: startingRow,
    reloanStartRow: reloanStartRow,
    reloanMonth: reloanMonth,
    reloanYear: reloanYear,
    reloanEndRow: reloanEndRow,
  };

  fetch(
    "https://script.google.com/macros/s/AKfycbx1ytxi_iFds-zTxj48oTl9Jh0qoxvAj-Sf7eZYlIs2smqPhbpLEK5ORrxJPAp2n5Vy/exec",
    {
      method: "POST",
      mode: "no-cors", // Remove for local testing if needed.
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    }
  )
    .then((response) => {
      console.log("Data sent successfully!");
    })
    .catch((error) => {
      console.error("Error sending data: ", error);
    });
}
