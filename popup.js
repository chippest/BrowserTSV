document.addEventListener("DOMContentLoaded", () => {
  const loanPageSelect = document.getElementById("loanPageSelect");
  const bankStatementSelect = document.getElementById("bankStatementSelect");
  const scrapeButton = document.getElementById("scrapeButton");
  const monthSelect = document.getElementById("monthSelect");
  const startingRowInput = document.getElementById("startingRowInput");
  const defaultTextField = document.getElementById("defaultTextField");
  const resultsDiv = document.getElementById("results");

  // --- LOCAL STORAGE SETUP ---
  // Load stored values when the popup loads.
  if (localStorage.getItem("startingRowInput")) {
    startingRowInput.value = localStorage.getItem("startingRowInput");
  }
  if (localStorage.getItem("defaultTextField")) {
    defaultTextField.value = localStorage.getItem("defaultTextField");
  }
  startingRowInput.addEventListener("input", () => {
    localStorage.setItem("startingRowInput", startingRowInput.value);
  });
  defaultTextField.addEventListener("input", () => {
    localStorage.setItem("defaultTextField", defaultTextField.value);
  });

  // Populate the dropdowns with all open tabs.
  browser.tabs
    .query({})
    .then((tabs) => {
      tabs.forEach((tab) => {
        // Loan Page dropdown.
        const optionLoan = document.createElement("option");
        optionLoan.value = tab.id;
        optionLoan.text = tab.title;
        loanPageSelect.appendChild(optionLoan);

        // Bank Statement dropdown.
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

    // --- Fetch data from Loan Page (Page 1) ---
    let loanData = await browser.tabs
      .executeScript(loanTabId, {
        code: `(${function () {
          function getVal(selector) {
            var el = document.querySelector(selector);
            return el ? (el.value || el.innerText || "").trim() : "";
          }
          return {
            loan_amount: getVal("#loan_amount"),
            loan_interest: getVal("#loan_interest"),
            payment_date_1: getVal("#payment_date_1"),
            amount_should_pay: getVal("#amount_should_pay"),
            payroll_interval: getVal("#payroll_interval"),
            term_of_agreements_in_days: getVal("#term_of_agreements_in_days"),
            installment_loan: getVal("#installment_loan"),
            payment_date_2: getVal("#payment_date_2"),
            payment_date_3: getVal("#payment_date_3"),
          };
        }}())`,
      })
      .then((results) => results[0])
      .catch((err) => {
        console.error(err);
        return {};
      });

    // --- Fetch data from Bank Statement (Page 2) ---
    let bankData = await browser.tabs
      .executeScript(bankTabId, {
        code: `(${function () {
          function getVal(selector) {
            var el = document.querySelector(selector);
            return el ? (el.value || el.innerText || "").trim() : "";
          }
          return {
            cell4: getVal(
              "table.table-bordered:nth-child(2) > tbody:nth-child(1) > tr:nth-child(4) > td:nth-child(1)"
            ),
            phone_raw: getVal(
              "table.table-bordered:nth-child(2) > tbody:nth-child(1) > tr:nth-child(6) > td:nth-child(1)"
            ),
            cell6: getVal(
              "table.table-bordered:nth-child(2) > tbody:nth-child(1) > tr:nth-child(10) > td:nth-child(1)"
            ),
            cell8: getVal(
              "table.table-bordered:nth-child(2) > tbody:nth-child(1) > tr:nth-child(8) > td:nth-child(1)"
            ),
            full_name: getVal(
              "table.table-bordered:nth-child(2) > tbody:nth-child(1) > tr:nth-child(2) > th:nth-child(1)"
            ),
          };
        }}())`,
      })
      .then((results) => results[0])
      .catch((err) => {
        console.error(err);
        return {};
      });

    // --- Process and build the TSV row ---
    // 1. Today's date (yyyy-mm-dd)
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    const todayStr = `${yyyy}-${mm}-${dd}`;

    // 2. Process full name into first and last names.
    let firstName = "";
    let lastName = "";
    if (bankData.full_name) {
      const nameParts = bankData.full_name.split(" ");
      lastName = nameParts.pop();
      firstName = nameParts.join(" ");
    }

    // 3. Format phone number (cell 5).
    let phoneDigits = "";
    if (bankData.phone_raw) {
      phoneDigits = bankData.phone_raw.replace(/\D/g, "");
      if (phoneDigits.length === 11 && phoneDigits.startsWith("1")) {
        phoneDigits = phoneDigits.substring(1);
      }
    }

    // Build the base row of 23 cells.
    // Cells not explicitly set remain empty.
    let baseRow = [];
    baseRow[0] = todayStr; // Cell 1: Today's date.
    baseRow[1] = firstName; // Cell 2: First name.
    baseRow[2] = lastName; // Cell 3: Last name.
    baseRow[3] = bankData.cell4 || ""; // Cell 4: Bank Statement value.
    baseRow[4] = phoneDigits; // Cell 5: Formatted phone number.
    baseRow[5] = bankData.cell6 || ""; // Cell 6: Bank Statement value.
    baseRow[6] = ""; // Cell 7: Empty.
    baseRow[7] = bankData.cell8 || ""; // Cell 8: Bank Statement value.
    baseRow[8] = ""; // Cell 9: Empty.
    baseRow[9] = ""; // Cell 10: Empty.
    baseRow[10] = "None"; // Cell 11: "None".
    baseRow[11] = ""; // Cell 12: Empty.
    baseRow[12] = ""; // Cell 13: Empty.
    baseRow[13] = loanData.loan_amount || ""; // Cell 14: Loan Amount.
    baseRow[14] = loanData.loan_interest || ""; // Cell 15: Loan Interest.
    baseRow[15] = ""; // Cell 16: Empty.
    baseRow[16] = ""; // Cell 17: Empty.
    baseRow[17] = ""; // Cell 18: Empty.
    baseRow[18] = ""; // Cell 19: Empty.
    baseRow[19] = loanData.payment_date_1 || ""; // Cell 20: Payment Date 1.
    baseRow[20] = loanData.amount_should_pay || ""; // Cell 21: Amount Should Pay.

    // For Cells 22 and 23, send values only if term_of_agreements_in_days is "2" or "3".
    let termVal = (loanData.term_of_agreements_in_days || "").trim();
    if (termVal === "2" || termVal === "3") {
      baseRow[21] = loanData.payroll_interval || ""; // Cell 22.
      baseRow[22] = termVal; // Cell 23.
    } else {
      baseRow[21] = "";
      baseRow[22] = "";
    }

    // --- Build additional cells (from Loan Page) based on termVal ---
    let additional = [];
    if (termVal === "2") {
      // Only add the first 4 additional cells.
      additional = [
        loanData.installment_loan || "", // ad-cell 1.
        loanData.payment_date_1 || "", // ad-cell 2.
        loanData.installment_loan || "", // ad-cell 3 (same as ad-cell 1).
        loanData.payment_date_2 || "", // ad-cell 4.
      ];
    } else if (termVal === "3") {
      // Add all 6 additional cells.
      additional = [
        loanData.installment_loan || "", // ad-cell 1.
        loanData.payment_date_1 || "", // ad-cell 2.
        loanData.installment_loan || "", // ad-cell 3.
        loanData.payment_date_2 || "", // ad-cell 4.
        loanData.installment_loan || "", // ad-cell 5.
        loanData.payment_date_3 || "", // ad-cell 6.
      ];
    }
    // Final TSV row = base row concatenated with any additional cells.
    const finalRow = baseRow.concat(additional);
    const tsvData = finalRow.join("\t");

    // (Optional) Display the TSV data in the popup (cells separated by " | " for readability).
    resultsDiv.innerHTML = `<strong>TSV Data:</strong><br>${tsvData.replace(
      /\t/g,
      " | "
    )}`;

    // Send the TSV data (along with other popup fields) to the Google Apps Script.
    sendToGoogleSheet(tsvData);
  });
});

/**
 * Sends the TSV data and additional variables to the Google Apps Script.
 */
function sendToGoogleSheet(tsvData) {
  const sheetId = "1Qxyw_Cuq67eGzJzCDSlp6sBYRSWu1wVz4Ju_1pLhQFw"; // Replace with the actual Sheet ID
  const sheetName = "Client List 2023";
  const startingRow =
    parseInt(document.getElementById("startingRowInput").value, 10) || 2;

  const monthSelect = document.getElementById("monthSelect");
  const selectedOption = monthSelect.options[monthSelect.selectedIndex];
  const reloanStartRow = selectedOption.dataset.startRow || "";
  const reloanMonth = selectedOption.value || "";
  const reloanYear = selectedOption.dataset.year || "";

  // Determine reloanEndRow based on the next month (or use a default).
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
    "https://script.google.com/macros/s/AKfycbxcbKT1TQrEqQNoVxj90dhaBakX1rJeYZxvDwIkuRwpyKh6GHUV2eNc02WJAzkk4_JwXg/exec",
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
