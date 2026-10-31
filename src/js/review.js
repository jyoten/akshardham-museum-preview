(function () {
  document.querySelectorAll(".sheet-block").forEach(function (block) {
    var buttons = block.querySelectorAll(".filter");
    var rows = block.querySelectorAll("tbody tr");
    var shown = block.querySelector(".shown");
    var none = block.querySelector(".none");
    var noun = block.getAttribute("data-noun") || "item";
    var total = rows.length;

    function label(n, ofTotal) {
      var word = n === 1 ? noun : noun + "s";
      return ofTotal ? "Showing " + n + " of " + total : n + " " + word;
    }

    function apply(status) {
      var n = 0;
      rows.forEach(function (row) {
        var on = status === "all" || row.getAttribute("data-status") === status;
        row.classList.toggle("is-hidden", !on);
        if (on) n += 1;
      });
      buttons.forEach(function (btn) {
        btn.setAttribute("aria-pressed", btn.getAttribute("data-filter") === status ? "true" : "false");
      });
      if (shown) shown.textContent = label(n, status !== "all");
      if (none) none.hidden = n !== 0;
    }

    buttons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        apply(btn.getAttribute("data-filter"));
      });
    });
  });
})();
