window.onload = function () {
  const input = document.getElementById("file");
  const nameplateDiv = document.getElementById("nameplate");
  const downloadBtn = document.getElementById("download");
  let encodingTypeSelect = document.querySelector(
    'select[name="encoding-type"]'
  );
  let encodingType = "EUC-KR";

  const setStartDiv = (index) => {
    return index % 2 == 0 ? '<div class="print-page">' : "";
  };
  const setEndDiv = (index, fullLength) => {
    return index % 2 == 0 || index != fullLength - 1 ? "" : "</div>";
  };

  encodingTypeSelect.addEventListener("change", function () {
    encodingType = encodingTypeSelect.value;
    input.value = '';
  });
  input.addEventListener("click", function (event) {
    nameplateDiv.innerHTML = "";
  });
  input.addEventListener("change", function (event) {
    const file = event.target.files[0];

    Papa.parse(file, {
      encoding: encodingType,
      header: true,
      complete: function (results) {
        results.data.forEach((data, index) => {
          if (typeof data.Name === "undefined") return;

          const nameplate = `
            <div class="square rotate">
    <div class="part-sub">
      <div class="part-sub-inner color1"></div>
      <div class="part-sub-inner color2"></div>
      <div class="part-sub-inner color3"></div>
      <div class="part-sub-inner color4"></div>
    </div>
    <div class="part-content">
      <div class="part-content-upper">${data.Company}</div>
      <div class="part-content-bottom">
        <div class="part-content-bottom-position">${data.Position}</div>
        <div class="part-content-bottom-name">${data.Name}</div>
      </div>
    </div>
    <div class="part-sub">
      <div class="part-sub-inner color4"></div>
      <div class="part-sub-inner color3"></div>
      <div class="part-sub-inner color2"></div>
      <div class="part-sub-inner color1"></div>
    </div>
  </div>
  <div class="square">
    <div class="part-sub">
      <div class="part-sub-inner color1"></div>
      <div class="part-sub-inner color2"></div>
      <div class="part-sub-inner color3"></div>
      <div class="part-sub-inner color4"></div>
    </div>
    <div class="part-content">
      <div class="part-content-upper">${data.Company}</div>
      <div class="part-content-bottom">
        <div class="part-content-bottom-position">${data.Position}</div>
        <div class="part-content-bottom-name">${data.Name}</div>
      </div>
    </div>
    <div class="part-sub">
      <div class="part-sub-inner color4"></div>
      <div class="part-sub-inner color3"></div>
      <div class="part-sub-inner color2"></div>
      <div class="part-sub-inner color1"></div>
    </div>
  </div>
      `;
          nameplateDiv.innerHTML +=
            setStartDiv(index) +
            nameplate +
            setEndDiv(index, results.data.length);
        });
      },
    });
  });
};
