document.addEventListener("DOMContentLoaded", function () {
  chrome.tabs.query({}, function (tabs) {
    const tabList = document.getElementById("tabList");
    tabs.forEach((tab) => {
      const listItem = document.createElement("li");
      const link = document.createElement("a");
      link.href = tab.url;
      link.textContent = tab.title || tab.url; // Display title or URL
      link.target = "_blank";
      listItem.appendChild(link);
      tabList.appendChild(listItem);
    });
  });
});
