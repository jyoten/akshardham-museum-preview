(function () {
  var buttons = document.querySelectorAll(".filter");
  var rows = document.querySelectorAll("tbody tr");
  var shown = document.getElementById("shown");
  var none = document.getElementById("none");
  var total = rows.length;

  function label(n, ofTotal) {
    var comments = n === 1 ? " comment" : " comments";
    return ofTotal ? "Showing " + n + " of " + total : n + comments;
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
})();
