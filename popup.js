document.addEventListener("DOMContentLoaded", () => {
  const tab1Select = document.getElementById("tab1Select");
  const tab2Select = document.getElementById("tab2Select");
  const fetchButton = document.getElementById("fetchButton");
  const resultDiv = document.getElementById("result");

  // Populate the dropdown menus with all open tabs.
  browser.tabs
    .query({})
    .then((tabs) => {
      tabs.forEach((tab) => {
        // Create option for the first dropdown
        const option1 = document.createElement("option");
        option1.value = tab.id;
        option1.text = tab.title;
        tab1Select.appendChild(option1);

        // Create option for the second dropdown
        const option2 = document.createElement("option");
        option2.value = tab.id;
        option2.text = tab.title;
        tab2Select.appendChild(option2);
      });
    })
    .catch((error) => {
      console.error(`Error querying tabs: ${error}`);
    });

  // When the button is clicked, fetch the required values from the selected tabs.
  fetchButton.addEventListener("click", async () => {
    const tab1Id = parseInt(tab1Select.value, 10);
    const tab2Id = parseInt(tab2Select.value, 10);

    if (isNaN(tab1Id) || isNaN(tab2Id)) {
      resultDiv.textContent = "Please select valid tabs.";
      return;
    }

    // Execute script in the first tab to get the value of '#id_expiry_date'
    let value1 = await browser.tabs
      .executeScript(tab1Id, {
        code: `
          (function() {
            var el = document.querySelector('#id_expiry_date');
            if (!el) return 'Element not found';
            // If the element is an input, return its value; otherwise, return innerText.
            return el.value || el.innerText;
          })();
        `,
      })
      .then((results) => results[0])
      .catch((err) => `Error: ${err}`);

    // Execute script in the second tab to get the innerText of the target element.
    let value2 = await browser.tabs
      .executeScript(tab2Id, {
        code: `
          (function() {
            var el = document.querySelector('table.table-bordered:nth-child(2) > tbody:nth-child(1) > tr:nth-child(4) > td:nth-child(1)');
            if (!el) return 'Element not found';
            return el.innerText;
          })();
        `,
      })
      .then((results) => results[0])
      .catch((err) => `Error: ${err}`);

    // Display both fetched values in the result div.
    resultDiv.innerHTML =
      "<strong>Tab 1 Value:</strong> " +
      value1 +
      "<br>" +
      "<strong>Tab 2 Value:</strong> " +
      value2;
  });
});
