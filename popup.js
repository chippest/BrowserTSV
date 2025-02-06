document.addEventListener("DOMContentLoaded", function () {
  const loanPageSelect = document.getElementById("loanPageSelect");
  const bankStatementSelect = document.getElementById("bankStatementSelect");
  const scrapeButton = document.getElementById("scrapeButton");
  const resultsDiv = document.getElementById("results");
  const customTextField = document.getElementById("customTextField");
  const defaultTextField = document.getElementById("defaultTextField");
  const saveDefaultButton = document.getElementById("saveDefaultButton");

  // Load the saved default value on popup open
  chrome.storage.sync.get(["defaultText"], function (result) {
    if (result.defaultText) {
      customTextField.value = result.defaultText;
      defaultTextField.value = result.defaultText;
    }
  });

  saveDefaultButton.addEventListener("click", function () {
    const defaultText = defaultTextField.value;
    chrome.storage.sync.set({ defaultText: defaultText }, function () {
      customTextField.value = defaultText;
      console.log("Default text saved: " + defaultText);
    });
  });

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
      "input[name='loan_amount']",
      "select[name='term_of_agreements_in_days']", // Field 23
      "input[name='payment_date_1']", //Field 17
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

      // Call function to send TSV data to Google Sheet
      sendToGoogleSheet(tsvString);
      resultsDiv.textContent = "Data sent to Google Sheet!";
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
    const paymentDate = loanData["input[name='payment_date_1']"];

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

    let daysUntilPayment = "Not found";
    if (paymentDate !== "Not found") {
      const paymentDateObject = new Date(paymentDate);
      const currentDate = new Date();
      const timeDiff = paymentDateObject.getTime() - currentDate.getTime();
      daysUntilPayment = Math.ceil(timeDiff / (1000 * 3600 * 24));
    }
    const formattedTermOfAgreement =
      termOfAgreement === "1" ? "" : termOfAgreement;

    let additionalCells = [];
    if (formattedTermOfAgreement === "2") {
      additionalCells = [
        '=ARRAY_CONSTRAIN(ARRAYFORMULA(IFS(INDIRECT("W"&ROW())=1,INDIRECT("U"&ROW()),INDIRECT("W"&ROW())=2,INDIRECT("U"&ROW())/2,INDIRECT("W"&ROW())=3,INDIRECT("U"&ROW())/3,INDIRECT("W"&ROW())<=2,"--")), 1, 1)',
        '=IF(INDIRECT("W"&ROW())<>0,INDIRECT("T"&ROW()),"--")',
        '=ARRAY_CONSTRAIN(ARRAYFORMULA(IFS(INDIRECT("W"&ROW())=2,INDIRECT("U"&ROW())/2,INDIRECT("W"&ROW())=3,INDIRECT("U"&ROW())/3,INDIRECT("W"&ROW())<=2,"--")), 1, 1)',
        '=ARRAY_CONSTRAIN(ARRAYFORMULA(IFS(AND(INDIRECT("W"&ROW())>1,INDIRECT("V"&ROW())=0),"Payroll intervals?",INDIRECT("W"&ROW())=0,"--",INDIRECT("W"&ROW())=1,"--",AND(INDIRECT("W"&ROW())=2,INDIRECT("V"&ROW())="weekly"),INDIRECT("T"&ROW())+7,AND(INDIRECT("W"&ROW())=2,INDIRECT("V"&ROW())="bi-weekly"),INDIRECT("T"&ROW())+14,AND(INDIRECT("W"&ROW())=2,INDIRECT("V"&ROW())="monthly"),EDATE(INDIRECT("T"&ROW()),1),AND(INDIRECT("W"&ROW())=3,INDIRECT("V"&ROW())="weekly"),INDIRECT("T"&ROW())+7,AND(INDIRECT("W"&ROW())=3,INDIRECT("V"&ROW())="bi-weekly"),INDIRECT("T"&ROW())+14,AND(INDIRECT("W"&ROW())=3,INDIRECT("V"&ROW())="monthly"),EDATE(INDIRECT("T"&ROW()),1))), 1, 1)',
      ];
    } else if (formattedTermOfAgreement === "3") {
      additionalCells = [
        '=ARRAY_CONSTRAIN(ARRAYFORMULA(IFS(INDIRECT("W"&ROW())=1,INDIRECT("U"&ROW()),INDIRECT("W"&ROW())=2,INDIRECT("U"&ROW())/2,INDIRECT("W"&ROW())=3,INDIRECT("U"&ROW())/3,INDIRECT("W"&ROW())<=2,"--")), 1, 1)',
        '=IF(INDIRECT("W"&ROW())<>0,INDIRECT("T"&ROW()),"--")',
        '=ARRAY_CONSTRAIN(ARRAYFORMULA(IFS(INDIRECT("W"&ROW())=2,INDIRECT("U"&ROW())/2,INDIRECT("W"&ROW())=3,INDIRECT("U"&ROW())/3,INDIRECT("W"&ROW())<=2,"--")), 1, 1)',
        '=ARRAY_CONSTRAIN(ARRAYFORMULA(IFS(AND(INDIRECT("W"&ROW())=3,INDIRECT("V"&ROW())=0),"Payroll intervals?",INDIRECT("W"&ROW())=0,"--",INDIRECT("W"&ROW())=1,"--",AND(INDIRECT("W"&ROW())=2,INDIRECT("V"&ROW())="weekly"),INDIRECT("T"&ROW())+7,AND(INDIRECT("W"&ROW())=2,INDIRECT("V"&ROW())="bi-weekly"),INDIRECT("T"&ROW())+14,AND(INDIRECT("W"&ROW())=2,INDIRECT("V"&ROW())="monthly"),EDATE(INDIRECT("T"&ROW()),1),AND(INDIRECT("W"&ROW())=3,INDIRECT("V"&ROW())="weekly"),INDIRECT("T"&ROW())+7,AND(INDIRECT("W"&ROW())=3,INDIRECT("V"&ROW())="bi-weekly"),INDIRECT("T"&ROW())+14,AND(INDIRECT("W"&ROW())=3,INDIRECT("V"&ROW())="monthly"),EDATE(INDIRECT("T"&ROW()),1))), 1, 1)',
        '=IF(INDIRECT("W"&ROW())=3,INDIRECT("U"&ROW())/3,"--")',
        '=ARRAY_CONSTRAIN(ARRAYFORMULA(IFS(AND(INDIRECT("W"&ROW())=3,INDIRECT("V"&ROW())=0),"Payroll intervals?",INDIRECT("W"&ROW())<3,"--",AND(INDIRECT("W"&ROW())=3,INDIRECT("V"&ROW())="weekly"),INDIRECT("T"&ROW())+14,AND(INDIRECT("W"&ROW())=3,INDIRECT("V"&ROW())="bi-weekly"),INDIRECT("T"&ROW())+28,AND(INDIRECT("W"&ROW())=3,INDIRECT("V"&ROW())="monthly"),EDATE(INDIRECT("T"&ROW()),2))), 1, 1)',
      ];
    }
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
      ], //6 // 7
      ,
      bankData[
        ".table.table-sm.table-bordered.fs-6.table-condensed.gx-1.gy-1.border-1 > tbody > tr:nth-child(8) > td"
      ], //8 // 9 // 10
      ,
      ,
      "None", // 11 // 12 //13
      ,
      ,
      loanData["input[name='loan_amount']"], //14 // 15 // 16
      '=IF(INDIRECT("N"&ROW())=0,"",IF(INDIRECT("H"&ROW())="MB",INDIRECT("N"&ROW())*17%,INDIRECT("N"&ROW())*15%))',
      ,
      daysUntilPayment, // 17
      customText, // 18 // 19 // 20 //21
      ,
      '=IF(INDIRECT("A"&ROW())<>0, INDIRECT("A"&ROW())+INDIRECT("Q"&ROW()), " ")',
      '=IF(INDIRECT("N"&ROW())="","",INDIRECT("N"&ROW())+INDIRECT("O"&ROW())-INDIRECT("P"&ROW()))',
      payrollInterval, // 22
      formattedTermOfAgreement, // 23
      ...additionalCells, //24, 25, 26, 27, 28, 29
    ];
    const filteredRow = row
      .map((cell) => (cell === "" ? undefined : cell))
      .join("\t");
    return filteredRow;
  }

  function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(
      function () {},
      function (err) {
        console.error("Could not copy text: ", err);
      }
    );
  }

  function sendToGoogleSheet(tsvData) {
    const sheetId = "1Qxyw_Cuq67eGzJzCDSlp6sBYRSWu1wVz4Ju_1pLhQFw"; // Replace with the actual Sheet ID

    const data = {
      sheetId: sheetId,
      tsvData: tsvData,
    };
    fetch(
      "https://script.google.com/macros/s/AKfycbxcbKT1TQrEqQNoVxj90dhaBakX1rJeYZxvDwIkuRwpyKh6GHUV2eNc02WJAzkk4_JwXg/exec",
      {
        // Replace with your Apps Script Web App URL
        method: "POST",
        mode: "no-cors", //remove for local testing
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
});
